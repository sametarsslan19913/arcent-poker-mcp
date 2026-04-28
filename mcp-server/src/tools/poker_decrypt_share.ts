// poker_decrypt_share — agent's per-card partial decryption share + ZK proof.
//
// Real mental poker: every encrypted card (c1, c2) is decrypted by collecting
// d_i = sk_i · c1 from each agent who participated in the joint pk = Σ pk_i.
// Plaintext recovers as m = c2 − Σ d_i.
//
// This tool, run by an agent who holds sk_i for the current hand:
//   1. Reads (c1, c2) from DealSystem.cardCiphertext(tableId, cardIdx).
//   2. Re-derives (sk_i, pk_i) from the agent-supplied seed (same one passed
//      to poker_publish_session_pk earlier this hand).
//   3. Computes d = sk_i · c1 on BabyJubJub off-chain.
//   4. Generates a Groth16 proof over elgamal_decrypt.circom binding (pk_i,
//      c1, d) — proves "d is the honest partial decryption under the same sk
//      that produced the published pk_i." (Chaum–Pedersen DLEQ over BN254.)
//   5. Encodes DecryptSystem.submitPartialDecryptShare(...) calldata and
//      returns it as an unsignedTx. Orchestrator broadcasts.
//
// Pre-checks the contract enforces too — but worth signalling early:
//   - cardRoleOf must not be Burn / Unused (threshold 0 → contract reverts).
//   - For hole cards, msg.sender must NOT be holeOwnerOf — owners reconstruct
//     the plaintext privately by combining the N-1 published shares with
//     their own (never-published) sk_owner · c1 share.

import { encodeFunctionData } from "viem";
import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerDealAbi, PokerDecryptAbi, CardRole } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";
import {
  deriveSessionKeypair,
  mulPointBabyJub,
  type Point,
} from "../zk/shuffle-input.js";
import { makeDecryptProver, proofToSolidityCalldata } from "../zk/prover.js";

export async function pokerDecryptShareHandler(args: {
  tableId: string;
  cardIdx: number;
  /** Same 256-bit hex seed the agent used in poker_publish_session_pk. */
  seed: string;
  /** Optional override — agent's wallet address (for off-chain hole-owner check). */
  agentAddress?: string;
}) {
  const tableId = args.tableId as `0x${string}`;
  if (!tableId || tableId.length !== 66 || !tableId.startsWith("0x")) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }
  if (args.cardIdx == null || args.cardIdx < 0 || args.cardIdx > 51) {
    return errorResult(err("E_INVALID_CARD_IDX", "cardIdx must be in 0..51"));
  }
  if (!args.seed) {
    return errorResult(err("E_INVALID_SEED", "seed is required (256-bit hex)"));
  }

  const cardIdx = args.cardIdx;

  // 0. Quick pre-check — surfaces "not initialized / wrong card role" early so
  //    we don't burn ~3 s on a proof the contract will refuse anyway.
  let role: number;
  try {
    role = (await arcClient.readContract({
      address: config.pokerDecrypt as `0x${string}`,
      abi: PokerDecryptAbi,
      functionName: "cardRoleOf",
      args: [tableId, cardIdx],
    })) as number;
  } catch (e) {
    return errorResult(
      err("E_DECRYPT_READ", `cardRoleOf failed (table not initialized?): ${(e as Error).message}`),
    );
  }
  if (role === CardRole.Burn || role === CardRole.Unused) {
    return errorResult(
      err(
        "E_NON_DECRYPTABLE",
        `cardIdx ${cardIdx} role=${role} (Burn/Unused) — DecryptSystem rejects shares for these slots`,
      ),
    );
  }

  // 0b. Hole-owner block. Surfaced early when the caller passes their address;
  //     otherwise we rely on the contract revert.
  if (args.agentAddress && role === CardRole.Hole) {
    try {
      const owner = (await arcClient.readContract({
        address: config.pokerDecrypt as `0x${string}`,
        abi: PokerDecryptAbi,
        functionName: "holeOwnerOf",
        args: [tableId, cardIdx],
      })) as `0x${string}`;
      if (owner.toLowerCase() === args.agentAddress.toLowerCase()) {
        return errorResult(
          err(
            "E_HOLE_OWNER",
            `agent ${args.agentAddress} owns hole card ${cardIdx} — recover plaintext locally instead of submitting`,
          ),
        );
      }
    } catch {
      // Non-fatal: fall through and let the contract enforce.
    }
  }

  // 1. Derive sk_i, pk_i from the seed.
  let seedBig: bigint;
  try {
    const hex = args.seed.startsWith("0x") ? args.seed : `0x${args.seed}`;
    seedBig = BigInt(hex);
  } catch {
    return errorResult(err("E_INVALID_SEED", "seed must be hex-encoded 256-bit number"));
  }
  if (seedBig <= 0n) {
    return errorResult(err("E_INVALID_SEED", "seed must be positive"));
  }
  let sk: bigint;
  let pk: Point;
  try {
    const kp = await deriveSessionKeypair(seedBig);
    sk = kp.sk;
    pk = kp.pk;
  } catch (e) {
    return errorResult(err("E_DERIVE_FAILED", `keypair derivation failed: ${(e as Error).message}`));
  }

  // 2. Read on-chain ciphertext for the card.
  let c1: Point;
  let c2: Point;
  try {
    const ct = (await arcClient.readContract({
      address: config.pokerDeal as `0x${string}`,
      abi: PokerDealAbi,
      functionName: "cardCiphertext",
      args: [tableId, cardIdx],
    })) as readonly [bigint, bigint, bigint, bigint];
    c1 = [ct[0], ct[1]];
    c2 = [ct[2], ct[3]];
  } catch (e) {
    return errorResult(
      err("E_DEAL_READ", `cardCiphertext read failed: ${(e as Error).message}`),
    );
  }
  if (c1[0] === 0n && c1[1] === 0n) {
    return errorResult(
      err("E_EMPTY_CIPHERTEXT", `cardCiphertext for cardIdx ${cardIdx} is zero — deck not initialized?`),
    );
  }

  // 3. Compute d = sk · c1 on BabyJub.
  let d: Point;
  try {
    d = await mulPointBabyJub(c1, sk);
  } catch (e) {
    return errorResult(err("E_SHARE_COMPUTE", `partial share computation failed: ${(e as Error).message}`));
  }

  // 4. Groth16 proof over elgamal_decrypt.circom.
  //    Witness shape matches gen-decrypt-input.js: pk[2], c1[2], d[2], sk.
  const witness = {
    pk: [pk[0].toString(), pk[1].toString()],
    c1: [c1[0].toString(), c1[1].toString()],
    d:  [d[0].toString(),  d[1].toString()],
    sk: sk.toString(),
  };
  let proof;
  try {
    const prover = makeDecryptProver();
    proof = await prover.prove(witness);
  } catch (e) {
    return errorResult(err("E_PROVE_FAILED", `Groth16 prove failed: ${(e as Error).message}`));
  }

  const calldata = proofToSolidityCalldata(proof.proof);

  // 5. Encode submitPartialDecryptShare unsignedTx.
  const data = encodeFunctionData({
    abi: PokerDecryptAbi,
    functionName: "submitPartialDecryptShare",
    args: [
      tableId,
      cardIdx,
      [pk[0], pk[1]],
      [d[0], d[1]],
      calldata.pA,
      calldata.pB,
      calldata.pC,
    ],
  });

  return okResult({
    unsignedTx: {
      to: config.pokerDecrypt,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    tableId,
    cardIdx,
    role, // 1=Hole, 3=Community
    pkX: pk[0].toString(),
    pkY: pk[1].toString(),
    dX:  d[0].toString(),
    dY:  d[1].toString(),
    backend: config.zkProverBackend,
    proveMs: Math.round(proof.timings.proveMs),
    totalMs: Math.round(proof.timings.totalMs),
    note:
      "Partial decrypt share + DLEQ proof ready. Broadcast the tx; once " +
      "shareCount reaches the per-card threshold (N-1 hole / N community) " +
      "DecryptSystem fires RevealReady. Use poker_recover_card to assemble " +
      "the plaintext off-chain.",
  });
}
