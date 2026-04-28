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
import { PokerDealAbi } from "../poker-abis.js";
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

/**
 * Self-verify: independently sum the session pks the contract has on file
 * for this table and assert it equals the deck's stored joint pk. If not,
 * the coordinator (or contract) is lying about which pk the deck was sealed
 * under, and the agent's shuffle proof would re-encrypt under a pk no one
 * actually controls — bricking the hand and possibly leaking plaintext.
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

  const recomputed = await sumBabyJubPoints(
    entries.map((e) => [e.pkX, e.pkY] as Point),
  );
  if (recomputed[0] !== storedPk[0] || recomputed[1] !== storedPk[1]) {
    return (
      `joint pk mismatch — chain says (${storedPk[0]}, ${storedPk[1]}) but Σ ` +
      `${entries.length} published pk_i = (${recomputed[0]}, ${recomputed[1]}). ` +
      `Refusing to shuffle under an unattested pk.`
    );
  }
  return null;
}

async function readDeckFromChain(
  tableId: `0x${string}`,
): Promise<{ pk: Point; c1: Point[]; c2: Point[] }> {
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
  // small RPC tends to throttle. If this becomes a bottleneck we batch later.
  const c1: Point[] = [];
  const c2: Point[] = [];
  for (let i = 0; i < DECK_SIZE; i++) {
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
