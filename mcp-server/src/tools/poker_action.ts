import { encodeFunctionData } from "viem";
import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerBetAbi, PokerActionEnum, type PokerActionLabel } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

type RoundState = {
  handNumber: bigint;
  currentBet: bigint;
  minRaise: bigint;
  lastAggressor: number;
  actedBitmap: number;
  roundComplete: boolean;
};

export async function pokerActionHandler(args: {
  player: string;
  tableId: string;
  action: string;        // fold | check | call | raise (allin implicit via partial-call)
  amount?: string;       // chips amount for raise/call (default "0")
}) {
  const player = args.player as `0x${string}`;
  const tableId = args.tableId as `0x${string}`;

  if (!player || player === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_INVALID_PLAYER", "player address cannot be zero"));
  }
  if (!tableId || tableId.length !== 66) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }

  const rawLabel = args.action.toLowerCase();
  // 2026-05-10 — `allin` removed (BetSystem.Action enum is {Fold,Check,Call,Raise};
  // all-in is implicit via partial-call). Reject with a helpful redirect.
  if (rawLabel === "allin") {
    return errorResult(
      err(
        "E_ACTION_REMOVED",
        "AllIn is implicit, not a distinct action — use 'call' (BetSystem auto-handles partial-call → seat.allIn=true) or 'raise' with amount=your stack target.",
      ),
    );
  }
  const label = rawLabel as PokerActionLabel;
  const enumValue = PokerActionEnum[label];
  if (enumValue === undefined) {
    return errorResult(err("E_INVALID_ACTION", `action must be one of: fold, check, call, raise (got '${args.action}')`));
  }

  let amount: bigint;
  try {
    amount = BigInt(args.amount ?? "0");
  } catch {
    return errorResult(err("E_INVALID_AMOUNT", "amount must be a numeric string"));
  }
  if (amount < 0n) return errorResult(err("E_NEGATIVE_AMOUNT", "amount cannot be negative"));

  // BetSystem.act semantics (BetSystem.sol):
  //   fold/check/call: amount IGNORED on-chain. We require 0 in the unsigned
  //     tx so a misleading non-zero is never broadcast. Call need is computed
  //     by the contract from RoundState.currentBet - seat.currentBet.
  //     Partial-call (player stack < call need) automatically sets seat.allIn.
  //   raise: amount is the new ABSOLUTE round-level high bet target (the new
  //     RoundState.currentBet). Contract derives `paid = amount - seat.currentBet`
  //     and enforces `amount - r.currentBet >= r.minRaise`.
  if ((label === "fold" || label === "check" || label === "call") && amount !== 0n) {
    return errorResult(err("E_AMOUNT_NOT_ALLOWED", `${label} requires amount=0 (BetSystem ignores it on-chain)`));
  }
  if (label === "raise" && amount === 0n) {
    return errorResult(err("E_ZERO_AMOUNT", "raise requires amount > 0 (absolute new high-bet target)"));
  }

  // 2026-05-10 — Raise pre-validation. BetSystem.sol enforces
  // `amount - r.currentBet >= r.minRaise` (RaiseTooSmall revert). Brain LLMs
  // frequently emit raise(currentBet) or raise(currentBet + small) because the
  // absolute vs. delta semantics is subtle. Pre-check here surfaces a helpful
  // error so the brain can retry with a valid amount instead of paying gas to
  // see RaiseTooSmall on-chain.
  if (label === "raise") {
    try {
      const round = (await arcClient.readContract({
        address: config.pokerBet as `0x${string}`,
        abi: PokerBetAbi,
        functionName: "getRound",
        args: [tableId],
      })) as RoundState;
      const minAcceptable = round.currentBet + round.minRaise;
      if (amount < minAcceptable) {
        return errorResult(
          err(
            "E_RAISE_TOO_SMALL",
            `raise amount ${amount} < currentBet(${round.currentBet}) + minRaise(${round.minRaise}) = ${minAcceptable}. Use amount >= ${minAcceptable}, or pick 'call' to match currentBet, or 'fold'.`,
          ),
        );
      }
    } catch (e) {
      // Read failure shouldn't block — let on-chain validate.
      const msg = (e as Error).message || String(e);
      // Silently skip pre-check; on-chain still enforces. Logging through
      // errorResult would be too noisy for transient RPC blips.
      void msg;
    }
  }

  const data = encodeFunctionData({
    abi: PokerBetAbi,
    functionName: "act",
    args: [tableId, enumValue, amount],
  });

  return okResult({
    unsignedTx: {
      to: config.pokerBet,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    player,
    tableId,
    action: label,
    actionEnum: enumValue,
    amount: amount.toString(),
    note: "Player signs. BetSystem validates the action against the current round + seat. For raise, amount is the new absolute round-level high bet target.",
  });
}
