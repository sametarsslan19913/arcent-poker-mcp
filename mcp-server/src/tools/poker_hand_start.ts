// poker_hand_start — coordinator-side hand bootstrap.
//
// Called once per hand AFTER every seated agent has run
// poker_publish_session_pk. The coordinator (table admin or any agent)
// invokes this to:
//   1. Read all published session pks for the table.
//   2. Sum them on BabyJubJub off-chain → joint pk.
//   3. Build the initial deck — 52 ciphertexts encoding m_i = (i+1)·G
//      under joint pk with weak deterministic randomness (the first agent's
//      shuffle round will inject fresh entropy and re-encrypt every card,
//      so initial r needn't be cryptographically secret — only the
//      plaintext mapping m_i ↔ card i must be canonical).
//   4. Encode `DealSystem.initDeal(tableId, jointPk, c1, c2)` as the first
//      unsignedTx.
//   5. (Optional, if `withStartHand`) Encode `TableSystem.startHand(tableId)`
//      as a second unsignedTx. The coordinator must be authorized on
//      TableSystem (admin or `authorizeSystem`'d) for that to land.
//
// Trust property: this tool's output is *only as honest as its caller*. Other
// agents independently re-sum the published pks (poker_shuffle_prove will
// soon enforce this) and abort if the coordinator's joint pk doesn't match.

import { encodeFunctionData, parseAbi } from "viem";
import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerDealAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";
import { sumBabyJubPoints, type Point } from "../zk/shuffle-input.js";
import { buildBabyjub } from "circomlibjs";

const DECK_SIZE = 52;

// TableSystem.startHand ABI fragment — kept inline so this tool doesn't
// require pulling the full PokerTableAbi (slim dependency).
const TABLE_START_HAND_ABI = parseAbi([
  "function startHand(bytes32) returns (uint64,uint8,uint8,uint8,uint8)",
]);

/**
 * Build the canonical initial deck under `jointPk`.
 *   c1[i] = r_i · G
 *   c2[i] = (i+1) · G + r_i · jointPk
 * with deterministic but distinct r_i so each ciphertext is fresh (otherwise
 * c1[i] would collide and the shuffle witness would have a degenerate input).
 */
async function buildInitialDeck(jointPk: Point): Promise<{ c1: Point[]; c2: Point[] }> {
  const bj = await buildBabyjub();
  const G = bj.Base8;
  const pkF: [Uint8Array, Uint8Array] = [bj.F.e(jointPk[0]), bj.F.e(jointPk[1])];

  // Same baseR pattern as smoke-shuffle-prove.ts buildInitialDeck — these
  // values are public and the first agent's shuffle re-encrypts everything,
  // so cryptographic strength here is irrelevant; only distinctness matters.
  const baseR = 11111111111111111111111111111111111111111111111n;

  const c1Raw: [Uint8Array, Uint8Array][] = [];
  const c2Raw: [Uint8Array, Uint8Array][] = [];
  for (let i = 0; i < DECK_SIZE; i++) {
    const r = (baseR + BigInt(i) * 17n) % bj.subOrder;
    const m = bj.mulPointEscalar(G, BigInt(i + 1));
    const rG = bj.mulPointEscalar(G, r);
    const rPk = bj.mulPointEscalar(pkF, r);
    c1Raw.push(rG as [Uint8Array, Uint8Array]);
    c2Raw.push(bj.addPoint(m, rPk) as [Uint8Array, Uint8Array]);
  }
  const toBig = (p: [Uint8Array, Uint8Array]): Point => [
    BigInt(bj.F.toString(p[0])),
    BigInt(bj.F.toString(p[1])),
  ];
  return { c1: c1Raw.map(toBig), c2: c2Raw.map(toBig) };
}

export async function pokerHandStartHandler(args: {
  tableId: string;
  /** When true, also returns a TableSystem.startHand unsignedTx as `unsignedTxStartHand`. */
  withStartHand?: boolean;
  /** Minimum number of session pks expected before assembling joint pk (defaults to 2). */
  minPks?: number;
}) {
  const tableId = args.tableId as `0x${string}`;
  if (!tableId || tableId.length !== 66 || !tableId.startsWith("0x")) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }
  const minPks = Math.max(1, args.minPks ?? 2);

  // 1. Read published session pks.
  let entries: readonly { agent: `0x${string}`; pkX: bigint; pkY: bigint }[];
  try {
    entries = (await arcClient.readContract({
      address: config.pokerDeal as `0x${string}`,
      abi: PokerDealAbi,
      functionName: "getSessionPks",
      args: [tableId],
    })) as readonly { agent: `0x${string}`; pkX: bigint; pkY: bigint }[];
  } catch (e) {
    return errorResult(
      err("E_DEAL_READ", `failed to read session pks: ${(e as Error).message}`),
    );
  }
  if (entries.length < minPks) {
    return errorResult(
      err(
        "E_NOT_ENOUGH_PKS",
        `only ${entries.length} session pk(s) published — need ≥ ${minPks}. Each seated agent must call poker_publish_session_pk first.`,
      ),
    );
  }

  // 2. Joint pk = Σ pk_i (off-chain BabyJub sum).
  let jointPk: Point;
  try {
    jointPk = await sumBabyJubPoints(entries.map((e) => [e.pkX, e.pkY] as Point));
  } catch (e) {
    return errorResult(
      err("E_AGGREGATE_FAILED", `joint pk aggregation failed: ${(e as Error).message}`),
    );
  }
  if (jointPk[0] === 0n && jointPk[1] === 1n) {
    // Identity element — published pks summed to identity (suspicious / cheating).
    return errorResult(
      err("E_IDENTITY_PK", "joint pk reduced to identity — published pks may be malformed"),
    );
  }

  // 3. Initial deck under joint pk.
  let deck: { c1: Point[]; c2: Point[] };
  try {
    deck = await buildInitialDeck(jointPk);
  } catch (e) {
    return errorResult(
      err("E_DECK_BUILD", `initial deck build failed: ${(e as Error).message}`),
    );
  }

  // 4. Encode initDeal calldata.
  const c1Args = deck.c1.map((p) => [p[0], p[1]] as const);
  const c2Args = deck.c2.map((p) => [p[0], p[1]] as const);
  const initDealData = encodeFunctionData({
    abi: PokerDealAbi,
    functionName: "initDeal",
    args: [tableId, [jointPk[0], jointPk[1]], c1Args, c2Args] as never,
  });

  const result: Record<string, unknown> = {
    unsignedTx: {
      to: config.pokerDeal,
      data: initDealData,
      value: "0",
      chainId: config.arcChainId,
    },
    tableId,
    jointPkX: jointPk[0].toString(),
    jointPkY: jointPk[1].toString(),
    sessionPkCount: entries.length,
    contributors: entries.map((e) => e.agent),
    note:
      "initDeal unsignedTx ready. Other agents should re-sum getSessionPks " +
      "(BabyJub) and assert it equals (jointPkX, jointPkY) before submitting " +
      "their shuffle round. After this tx lands, agents call poker_shuffle_prove " +
      "in seating order.",
  };

  // 5. Optional startHand tx.
  if (args.withStartHand) {
    const startHandData = encodeFunctionData({
      abi: TABLE_START_HAND_ABI,
      functionName: "startHand",
      args: [tableId],
    });
    result.unsignedTxStartHand = {
      to: config.pokerTable,
      data: startHandData,
      value: "0",
      chainId: config.arcChainId,
    };
    result.startHandNote =
      "TableSystem.startHand caller must be admin or an authorized system on the table.";
  }

  return okResult(result);
}
