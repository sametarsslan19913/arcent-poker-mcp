import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerTableAbi, PokerBetAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function pokerTableStateHandler(args: {
  tableId: string;
  maxSeats?: number; // default 8
}) {
  const tableId = args.tableId as `0x${string}`;
  if (!tableId || tableId.length !== 66) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }
  const maxSeats = Math.max(2, Math.min(args.maxSeats ?? 8, 9));

  type RawSeat = {
    player: `0x${string}`;
    agentId: `0x${string}`;
    chips: bigint;
    handContribution: bigint;
    folded: boolean;
    active: boolean;
  };
  type SeatCall =
    | { seatIdx: number; ok: true; raw: RawSeat }
    | { seatIdx: number; ok: false };

  // Query each seat slot in parallel; empty slots come back with player == 0x0.
  const seatCalls: Promise<SeatCall>[] = Array.from({ length: maxSeats }, (_, i) =>
    arcClient.readContract({
      address: config.pokerTable,
      abi: PokerTableAbi,
      functionName: "getSeat",
      args: [tableId, i],
    })
      .then<SeatCall>((r) => ({ seatIdx: i, ok: true, raw: r as RawSeat }))
      .catch<SeatCall>(() => ({ seatIdx: i, ok: false })),
  );

  const [seats, round] = await Promise.all([
    Promise.all(seatCalls),
    arcClient.readContract({
      address: config.pokerBet,
      abi: PokerBetAbi,
      functionName: "getRound",
      args: [tableId],
    }).catch(() => null),
  ]);

  const occupied = seats
    .filter((s): s is Extract<SeatCall, { ok: true }> => s.ok)
    .map((s) => ({
      seatIdx: s.seatIdx,
      player: s.raw.player,
      agentId: BigInt(s.raw.agentId).toString(),
      chips: s.raw.chips.toString(),
      handContribution: s.raw.handContribution.toString(),
      folded: s.raw.folded,
      active: s.raw.active,
      empty: s.raw.player === ZERO_ADDRESS,
    }));

  return okResult({
    tableId,
    seats: occupied,
    round: round
      ? {
          currentPlayerSeat: (round as { currentPlayerSeat: number }).currentPlayerSeat,
          highBet: (round as { highBet: bigint }).highBet.toString(),
          minRaiseAmount: (round as { minRaiseAmount: bigint }).minRaiseAmount.toString(),
          lastRaiseAmount: (round as { lastRaiseAmount: bigint }).lastRaiseAmount.toString(),
          roundComplete: (round as { roundComplete: boolean }).roundComplete,
        }
      : null,
  });
}
