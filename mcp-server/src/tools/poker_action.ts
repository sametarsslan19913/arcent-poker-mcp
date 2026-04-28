import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { PokerBetAbi, PokerActionEnum, type PokerActionLabel } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

export async function pokerActionHandler(args: {
  player: string;
  tableId: string;
  action: string;        // fold | check | call | raise | allin
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

  const label = args.action.toLowerCase() as PokerActionLabel;
  const enumValue = PokerActionEnum[label];
  if (enumValue === undefined) {
    return errorResult(err("E_INVALID_ACTION", `action must be one of: fold, check, call, raise, allin (got '${args.action}')`));
  }

  let amount: bigint;
  try {
    amount = BigInt(args.amount ?? "0");
  } catch {
    return errorResult(err("E_INVALID_AMOUNT", "amount must be a numeric string"));
  }
  if (amount < 0n) return errorResult(err("E_NEGATIVE_AMOUNT", "amount cannot be negative"));

  // BetSystem.act semantics (BetSystem.sol):
  //   fold/check/call/allin: amount IGNORED on-chain. We require 0 in the
  //     unsigned tx so a misleading non-zero is never broadcast. Call need is
  //     computed by the contract from RoundState.currentBet - seat.currentBet.
  //   raise: amount is the new ABSOLUTE round-level high bet target (the new
  //     RoundState.currentBet). Contract derives `paid = amount - seat.currentBet`
  //     and enforces `amount - r.currentBet >= r.minRaise`.
  if ((label === "fold" || label === "check" || label === "call" || label === "allin") && amount !== 0n) {
    return errorResult(err("E_AMOUNT_NOT_ALLOWED", `${label} requires amount=0 (BetSystem ignores it on-chain)`));
  }
  if (label === "raise" && amount === 0n) {
    return errorResult(err("E_ZERO_AMOUNT", "raise requires amount > 0 (absolute new high-bet target)"));
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
