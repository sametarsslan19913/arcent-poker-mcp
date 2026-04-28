// poker_publish_session_pk — agent's per-hand session public-key publish.
//
// Real mental poker requires the joint encryption pk = Σ pk_i where each agent
// holds their own sk_i. This tool:
//   1. Derives (sk_i, pk_i) from a 256-bit `seed` the agent supplies.
//      `sk_i = seed mod subOrder`, `pk_i = sk_i · Base8` on BabyJubJub.
//   2. Encodes a `DealSystem.publishSessionPk(tableId, pk_x, pk_y)` tx.
//   3. Returns the unsignedTx + the derived pk so the orchestrator can
//      broadcast and the agent can later use sk_i for decrypt shares.
//
// The seed is the agent's secret. MCP NEVER persists it — agents must
// regenerate the same seed (deterministically from wallet sk + tableId, or
// kept in their own session memory) when later calling poker_decrypt_share
// for this hand. Lose the seed → can't compute decrypt share → can't see
// own hole cards. Keep it bound to (tableId, handNumber) so it doesn't leak
// across hands.

import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { PokerDealAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";
import { deriveSessionKeypair } from "../zk/shuffle-input.js";

export async function pokerPublishSessionPkHandler(args: {
  tableId: string;
  /** 256-bit hex seed (with or without 0x prefix). Becomes sk after mod subOrder. */
  seed: string;
}) {
  const tableId = args.tableId as `0x${string}`;
  if (!tableId || tableId.length !== 66 || !tableId.startsWith("0x")) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex (0x + 64 chars)"));
  }
  if (!args.seed) {
    return errorResult(err("E_INVALID_SEED", "seed is required (256-bit hex)"));
  }

  let seedBig: bigint;
  try {
    const hex = args.seed.startsWith("0x") ? args.seed : `0x${args.seed}`;
    seedBig = BigInt(hex);
  } catch {
    return errorResult(err("E_INVALID_SEED", "seed must be a hex-encoded 256-bit number"));
  }
  if (seedBig <= 0n) {
    return errorResult(err("E_INVALID_SEED", "seed must be positive (and non-zero mod subOrder)"));
  }

  let pk: [bigint, bigint];
  let sk: bigint;
  try {
    const kp = await deriveSessionKeypair(seedBig);
    pk = kp.pk;
    sk = kp.sk;
  } catch (e) {
    return errorResult(err("E_DERIVE_FAILED", `keypair derivation failed: ${(e as Error).message}`));
  }

  const data = encodeFunctionData({
    abi: PokerDealAbi,
    functionName: "publishSessionPk",
    args: [tableId, pk[0], pk[1]],
  });

  return okResult({
    unsignedTx: {
      to: config.pokerDeal,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    tableId,
    // Returned for orchestrator UI / smoke logging — NOT to expose privately.
    // sk is the agent's secret; we surface it here only because the MCP+agent
    // run in the same trust boundary (single user's machine in production).
    pkX: pk[0].toString(),
    pkY: pk[1].toString(),
    sk: sk.toString(),
    note:
      "Each seated agent must call this once per hand BEFORE initDeal. After all " +
      "agents have published, the coordinator (poker_hand_start) sums the pks " +
      "and feeds the joint pk into initDeal. Keep the seed — you'll need the " +
      "same sk to compute decrypt shares for community cards and your own hole cards.",
  });
}
