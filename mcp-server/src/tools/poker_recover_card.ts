// poker_recover_card — assemble plaintext from collected partial shares.
//
// On-chain DecryptSystem stores every published share d_i and fires
// RevealReady once threshold is met. To turn shares back into a card identity
// we need the BabyJub sum (which the contract deliberately keeps off-chain
// to save gas).
//
// Two modes:
//   - Community / flop / turn / river — every seated agent publishes; the
//     plaintext m = c2 - Σ d_i is fully reconstructable from chain state alone.
//   - Hole — only N-1 agents publish on-chain. The owner combines those N-1
//     shares with their own privately-computed d_owner = sk_owner · c1.
//     `ownerSeed` (the same seed they passed to publishSessionPk +
//     decrypt_share earlier this hand) lets this tool derive sk_owner locally
//     without ever transmitting it. Run on the OWNER'S machine only.
//
// Output: card identity 1..52 + decoded suit/rank label + raw plaintext point.
// Returns identity 0 (with a warning) when the recovered point doesn't match
// any canonical m_k = k·G — usually a sign of a wrong joint pk or missing /
// duplicated shares.

import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerDealAbi, PokerDecryptAbi, CardRole } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";
import {
  cardIdentityFromPlaintext,
  decodeCardIdentity,
  deriveSessionKeypair,
  mulPointBabyJub,
  recoverPlaintext,
  type Point,
} from "../zk/shuffle-input.js";

function isZero(p: Point): boolean {
  return p[0] === 0n && p[1] === 0n;
}

export async function pokerRecoverCardHandler(args: {
  tableId: string;
  cardIdx: number;
  /**
   * Hole-card owner's seed (256-bit hex). Required ONLY when the card is a
   * hole card and the caller is the owner — the owner's share is never on
   * chain. Omit for community cards.
   */
  ownerSeed?: string;
}) {
  const tableId = args.tableId as `0x${string}`;
  if (!tableId || tableId.length !== 66 || !tableId.startsWith("0x")) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }
  if (args.cardIdx == null || args.cardIdx < 0 || args.cardIdx > 51) {
    return errorResult(err("E_INVALID_CARD_IDX", "cardIdx must be in 0..51"));
  }
  const cardIdx = args.cardIdx;

  // 1. Determine threshold + role + (for hole) owner address.
  let role: number;
  let threshold: number;
  let owner: `0x${string}` = "0x0000000000000000000000000000000000000000";
  try {
    role = (await arcClient.readContract({
      address: config.pokerDecrypt as `0x${string}`,
      abi: PokerDecryptAbi,
      functionName: "cardRoleOf",
      args: [tableId, cardIdx],
    })) as number;
    threshold = (await arcClient.readContract({
      address: config.pokerDecrypt as `0x${string}`,
      abi: PokerDecryptAbi,
      functionName: "requiredSharesFor",
      args: [tableId, cardIdx],
    })) as number;
    if (role === CardRole.Hole) {
      owner = (await arcClient.readContract({
        address: config.pokerDecrypt as `0x${string}`,
        abi: PokerDecryptAbi,
        functionName: "holeOwnerOf",
        args: [tableId, cardIdx],
      })) as `0x${string}`;
    }
  } catch (e) {
    return errorResult(
      err("E_DECRYPT_READ", `decrypt-system view failed: ${(e as Error).message}`),
    );
  }
  if (role === CardRole.Burn || role === CardRole.Unused) {
    return errorResult(
      err("E_NON_DECRYPTABLE", `cardIdx ${cardIdx} role=${role} (Burn/Unused) — no decryption defined`),
    );
  }

  // 2. Read ciphertext (need c2 for c2 - Σ d_i).
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
    return errorResult(err("E_DEAL_READ", `cardCiphertext read failed: ${(e as Error).message}`));
  }

  // 3. Pull the agent set (= session pk publishers) and their shares.
  type Entry = { agent: `0x${string}`; pkX: bigint; pkY: bigint };
  let entries: readonly Entry[];
  try {
    entries = (await arcClient.readContract({
      address: config.pokerDeal as `0x${string}`,
      abi: PokerDealAbi,
      functionName: "getSessionPks",
      args: [tableId],
    })) as readonly Entry[];
  } catch (e) {
    return errorResult(err("E_DEAL_READ", `getSessionPks failed: ${(e as Error).message}`));
  }
  if (entries.length === 0) {
    return errorResult(err("E_NO_PKS", "no session pks published — joint pk not assembled"));
  }

  const submitted: { agent: `0x${string}`; share: Point }[] = [];
  for (const e of entries) {
    let s: readonly [bigint, bigint];
    try {
      s = (await arcClient.readContract({
        address: config.pokerDecrypt as `0x${string}`,
        abi: PokerDecryptAbi,
        functionName: "getShare",
        args: [tableId, cardIdx, e.agent],
      })) as readonly [bigint, bigint];
    } catch {
      // Skip agents whose share read fails — treat as un-submitted.
      continue;
    }
    const pt: Point = [s[0], s[1]];
    if (!isZero(pt)) submitted.push({ agent: e.agent, share: pt });
  }

  // 4. For hole cards, supplement with owner's locally-computed share.
  let ownerShare: Point | null = null;
  if (role === CardRole.Hole) {
    if (!args.ownerSeed) {
      return errorResult(
        err(
          "E_OWNER_SEED_REQUIRED",
          `cardIdx ${cardIdx} is a hole card owned by ${owner} — pass ownerSeed (the seed the owner used in poker_publish_session_pk) to recover plaintext locally`,
        ),
      );
    }
    let seedBig: bigint;
    try {
      const hex = args.ownerSeed.startsWith("0x") ? args.ownerSeed : `0x${args.ownerSeed}`;
      seedBig = BigInt(hex);
    } catch {
      return errorResult(err("E_INVALID_SEED", "ownerSeed must be hex-encoded 256-bit number"));
    }
    if (seedBig <= 0n) {
      return errorResult(err("E_INVALID_SEED", "ownerSeed must be positive"));
    }
    try {
      const kp = await deriveSessionKeypair(seedBig);
      ownerShare = await mulPointBabyJub(c1, kp.sk);
    } catch (e) {
      return errorResult(
        err("E_OWNER_SHARE", `owner share derivation failed: ${(e as Error).message}`),
      );
    }
  }

  const totalShares =
    submitted.length + (ownerShare ? 1 : 0);
  if (totalShares < threshold + (role === CardRole.Hole ? 1 : 0)) {
    // Hole effective threshold for recovery = N (N-1 published + 1 owner).
    // Community effective threshold = N (= contract threshold).
    return errorResult(
      err(
        "E_NOT_ENOUGH_SHARES",
        `have ${totalShares} share(s), need ${role === CardRole.Hole ? threshold + 1 : threshold} for recovery`,
      ),
    );
  }

  const allShares = submitted.map((s) => s.share);
  if (ownerShare) allShares.push(ownerShare);

  // 5. Recover m = c2 - Σ shares; map to canonical card identity.
  let m: Point;
  try {
    m = await recoverPlaintext(c2, allShares);
  } catch (e) {
    return errorResult(err("E_RECOVER_FAILED", `BabyJub recovery failed: ${(e as Error).message}`));
  }

  const identity = await cardIdentityFromPlaintext(m);
  const label = identity > 0 ? decodeCardIdentity(identity) : null;

  return okResult({
    tableId,
    cardIdx,
    role,
    threshold,
    sharesUsed: allShares.length,
    onChainSharesUsed: submitted.length,
    contributors: submitted.map((s) => s.agent),
    ownerCombined: ownerShare !== null,
    plaintext: { x: m[0].toString(), y: m[1].toString() },
    cardIdentity: identity,
    card: label,
    note:
      identity === 0
        ? "Recovered plaintext does not match any canonical m_k = k·G. Likely cause: missing/duplicate shares, wrong joint pk, or replay against stale ciphertext."
        : `Decoded card: ${label?.short ?? identity} (identity ${identity}/52).`,
  });
}
