// poker_shuffle_prove — agent's per-hand encrypted shuffle round.
//
// Flow (called once per hand by each agent in turn):
//   1. Read current deck state from DealSystem (pk + 52 ciphertexts).
//   2. Pick a fresh permutation σ + per-card randomness r[] (CSPRNG).
//   3. Compute output ciphertexts: outputC1[i] = inputC1[σ(i)] + r[i]·G,
//                                  outputC2[i] = inputC2[σ(i)] + r[i]·pk.
//   4. Generate Groth16 proof (snarkjs, ~20 s on this VPS) over the
//      ShuffleEncrypt52 circuit binding (pk, inputC*, outputC*).
//   5. Encode submitShuffle(tableId, outputC1, outputC2, pA, pB, pC) calldata.
//   6. Return unsignedTx — orchestrator signs + broadcasts.
//
// The chain verifies proof on-chain via DealSystem.verifier.verifyProof. On
// success the contract advances the deck so the next agent's input is this
// agent's output. Proof time is the dominant cost (~20 s vs ~3.9M gas verify).

import { encodeFunctionData } from "viem";
import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerDealAbi, PokerTableAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";
import {
  buildShuffleWitness,
  csprngRng,
  seededRng,
  sumBabyJubPoints,
  type Point,
} from "../zk/shuffle-input.js";
import { makeShuffleProver, proofToSolidityCalldata } from "../zk/prover.js";

const DECK_SIZE = 52;
type ChainPoint = readonly [bigint, bigint];
type DeckSnapshot = readonly [
  ChainPoint,
  readonly ChainPoint[],
  readonly ChainPoint[],
  boolean,
  number,
];

// 2026-05-16 — Codex burst rate root-cause handoff. cardCiphertext × 52
// loop'unun sub-second burst atmasını engelle (saniyenin altında ~200 read
// pattern direkt RPC provider'a burst rate-limit 429 yedirir, 2026-05-16
// 17:19+17:47 koşumları). Env-configurable pacing: default 50ms × 52 ≈ 2.6 s
// ek (toplam shuffle phase ~50s → ~53s, negligible). 0 set ise eski davranış.
const READ_PACING_MS = Number(process.env.ARC_MCP_READ_PACING_MS ?? 50);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function mapChainDeckPoints(raw: readonly ChainPoint[], field: string): Point[] {
  if (raw.length !== DECK_SIZE) {
    throw new Error(`DealSystem.deckSnapshot returned ${raw.length} ${field} entries; expected ${DECK_SIZE}`);
  }
  return raw.map((p) => [p[0], p[1]] as Point);
}

/**
 * Self-verify: independently sum the session pks the contract has on file
 * for this table and assert it equals the deck's stored joint pk. If not,
 * the coordinator (or contract) is lying about which pk the deck was sealed
 * under, and the agent's shuffle proof would re-encrypt under a pk no one
 * actually controls — bricking the hand and possibly leaking plaintext.
 *
 * G14 (2026-05-06) — `deckPk` on-chain is now Σ pk_i over only the *active
 * hand roster* (DealSystem._handRoster snapshot taken at initDeal). After
 * any elimination, sessionPks still contains keys for eliminated agents,
 * but they are not part of deckPk. We must filter sessionPks by the active
 * roster before summing — otherwise this self-check would always fail in
 * any post-elimination hand and stall the shuffle.
 *
 * Returns null on success; non-null reason string on mismatch.
 */
async function verifyJointPkAgainstSessionPks(
  tableId: `0x${string}`,
  storedPk: Point,
): Promise<string | null> {
  const entries = (await arcClient.readContract({
    address: config.pokerDeal as `0x${string}`,
    abi: PokerDealAbi,
    functionName: "getSessionPks",
    args: [tableId],
  })) as readonly { agent: `0x${string}`; pkX: bigint; pkY: bigint }[];

  if (entries.length === 0) {
    // No session pks published — caller is in a B3.6-era pattern where the
    // joint pk is set directly by initDeal without per-agent attestation.
    // Treat this as a *hard* trust failure under B3.7+ semantics; smoke tests
    // that genuinely need single-admin pk should pass `verifyJointPk: false`.
    return "no session pks published — joint pk has no agent-side attestation";
  }

  // G14 active-roster filter. Read DealSystem.handRoster (snapshot at initDeal,
  // chips>0 occupied seats only), then resolve each seat → player address via
  // TableSystem.getSeat. Only sessionPk entries whose agent is in this set
  // are part of the deckPk on chain.
  const roster = (await arcClient.readContract({
    address: config.pokerDeal as `0x${string}`,
    abi: PokerDealAbi,
    functionName: "handRoster",
    args: [tableId],
  })) as readonly number[];

  if (roster.length === 0) {
    // initDeal not yet called → handRoster empty. We should not be in
    // shuffle-prove without an initialized deck (readDeckFromChain enforces
    // isInitialized), but be explicit about the contract-state ordering.
    return "handRoster empty — DealSystem.initDeal must precede shuffle prove";
  }

  const seatPlayers = await Promise.all(
    roster.map((seat) =>
      arcClient.readContract({
        address: config.pokerTable as `0x${string}`,
        abi: PokerTableAbi,
        functionName: "getSeat",
        args: [tableId, seat],
      }) as Promise<{ player: `0x${string}` }>,
    ),
  );
  const activeSet = new Set(
    seatPlayers.map((s) => s.player.toLowerCase() as `0x${string}`),
  );

  const activeEntries = entries.filter((e) =>
    activeSet.has(e.agent.toLowerCase() as `0x${string}`),
  );

  if (activeEntries.length === 0) {
    return (
      `no session pk found for any of ${roster.length} active hand-roster ` +
      `seat(s) — coordinator may not have aggregated keys for the current hand`
    );
  }
  if (activeEntries.length !== roster.length) {
    return (
      `incomplete session pks — ${activeEntries.length} of ${roster.length} ` +
      `active hand-roster seats have published a key; cannot shuffle under ` +
      `partial joint pk`
    );
  }

  const recomputed = await sumBabyJubPoints(
    activeEntries.map((e) => [e.pkX, e.pkY] as Point),
  );
  if (recomputed[0] !== storedPk[0] || recomputed[1] !== storedPk[1]) {
    return (
      `joint pk mismatch — chain says (${storedPk[0]}, ${storedPk[1]}) but Σ ` +
      `${activeEntries.length} active-roster pk_i = (${recomputed[0]}, ${recomputed[1]}). ` +
      `Refusing to shuffle under an unattested pk.`
    );
  }
  return null;
}

async function readDeckFromChain(
  tableId: `0x${string}`,
): Promise<{ pk: Point; c1: Point[]; c2: Point[] }> {
  try {
    const snapshot = (await arcClient.readContract({
      address: config.pokerDeal as `0x${string}`,
      abi: PokerDealAbi,
      functionName: "deckSnapshot",
      args: [tableId],
    })) as DeckSnapshot;

    const [pkRaw, c1Raw, c2Raw, isInit] = snapshot;
    if (!isInit) {
      throw new Error(
        "DealSystem not initialized for this tableId — call DealSystem.initDeal first (admin or first agent).",
      );
    }
    return {
      pk: [pkRaw[0], pkRaw[1]],
      c1: mapChainDeckPoints(c1Raw, "c1"),
      c2: mapChainDeckPoints(c2Raw, "c2"),
    };
  } catch (snapshotErr) {
    const msg = snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr);
    if (!/function selector|unknown function|not found|execution reverted|returned no data|zero data/i.test(msg)) {
      throw snapshotErr;
    }
    // Older DealSystem deployments do not expose deckSnapshot yet. Keep the
    // legacy paced read path so this MCP remains backward-compatible while new
    // deployments collapse 54 read RPCs into one eth_call.
  }

  const isInit = (await arcClient.readContract({
    address: config.pokerDeal as `0x${string}`,
    abi: PokerDealAbi,
    functionName: "isInitialized",
    args: [tableId],
  })) as boolean;
  if (!isInit) {
    throw new Error(
      "DealSystem not initialized for this tableId — call DealSystem.initDeal first (admin or first agent).",
    );
  }

  const pkRaw = (await arcClient.readContract({
    address: config.pokerDeal as `0x${string}`,
    abi: PokerDealAbi,
    functionName: "deckPk",
    args: [tableId],
  })) as readonly [bigint, bigint];

  // 52 sequential calls; not parallelised because Promise.all of 52 RPCs to a
  // small RPC tends to throttle. 2026-05-16: even sequential without pacing
  // bursts ~200 reads/sec → provider rate-limit 429. Inter-call sleep above.
  const c1: Point[] = [];
  const c2: Point[] = [];
  for (let i = 0; i < DECK_SIZE; i++) {
    if (i > 0 && READ_PACING_MS > 0) await sleep(READ_PACING_MS);
    const r = (await arcClient.readContract({
      address: config.pokerDeal as `0x${string}`,
      abi: PokerDealAbi,
      functionName: "cardCiphertext",
      args: [tableId, i],
    })) as readonly [bigint, bigint, bigint, bigint];
    c1.push([r[0], r[1]]);
    c2.push([r[2], r[3]]);
  }

  return { pk: [pkRaw[0], pkRaw[1]], c1, c2 };
}

export async function pokerShuffleProveHandler(args: {
  tableId: string;
  /** Optional 256-bit hex seed to make the permutation deterministic (smoke tests). */
  seed?: string;
  /** Default true. Set false only for legacy/B3.6 single-admin smoke tests. */
  verifyJointPk?: boolean;
}) {
  const tableId = args.tableId as `0x${string}`;
  if (!tableId || tableId.length !== 66) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }

  // 1. Read on-chain deck state.
  let deck: { pk: Point; c1: Point[]; c2: Point[] };
  try {
    deck = await readDeckFromChain(tableId);
  } catch (e) {
    return errorResult(
      err("E_DEAL_READ", `failed to read DealSystem state: ${(e as Error).message}`),
    );
  }

  // 1a. Self-verify joint pk (B3.7.B-4 — trust-but-verify).
  const verify = args.verifyJointPk ?? true;
  if (verify) {
    try {
      const reason = await verifyJointPkAgainstSessionPks(tableId, deck.pk);
      if (reason) {
        return errorResult(err("E_JOINT_PK_UNATTESTED", reason));
      }
    } catch (e) {
      return errorResult(
        err("E_JOINT_PK_CHECK", `joint pk verification failed: ${(e as Error).message}`),
      );
    }
  }

  // 2-3. Pick randomness, build witness + output ciphertexts.
  const rng = args.seed ? seededRng(BigInt(args.seed)) : csprngRng();
  const witnessInput = await buildShuffleWitness(
    { pk: deck.pk, inputC1: deck.c1, inputC2: deck.c2 },
    rng,
  );

  // 4. Groth16 prove via configured backend.
  let proof;
  try {
    const prover = makeShuffleProver();
    proof = await prover.prove(witnessInput.witness);
  } catch (e) {
    return errorResult(
      err("E_PROVE_FAILED", `Groth16 prove failed: ${(e as Error).message}`),
    );
  }

  const calldata = proofToSolidityCalldata(proof.proof);

  // 5. Encode submitShuffle tx. ABI types match the on-chain
  //    DealSystem.submitShuffle exactly (verified above in PokerDealAbi). viem
  //    infers the args as 52-tuple literals; runtime accepts a 52-length array
  //    fine, but TS rejects without a tuple cast — keep the fix narrow.
  const outC1 = witnessInput.outputC1.map((p) => [p[0], p[1]] as const);
  const outC2 = witnessInput.outputC2.map((p) => [p[0], p[1]] as const);
  const data = encodeFunctionData({
    abi: PokerDealAbi,
    functionName: "submitShuffle",
    args: [tableId, outC1, outC2, calldata.pA, calldata.pB, calldata.pC] as never,
  });

  return okResult({
    unsignedTx: {
      to: config.pokerDeal,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    tableId,
    backend: config.zkProverBackend,
    proveMs: Math.round(proof.timings.proveMs),
    totalMs: Math.round(proof.timings.totalMs),
    note:
      `Shuffle proof generated via ${config.zkProverBackend} backend. ` +
      `On-chain verify cost ~3.9M gas; orchestrator should broadcast this tx and wait for ShuffleAccepted event before next action.`,
  });
}
