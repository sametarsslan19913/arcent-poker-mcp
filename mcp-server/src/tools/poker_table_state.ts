import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerTableAbi, PokerBetAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PHASE_NAMES = [
  "WaitingForPlayers",
  "Preflop",
  "Flop",
  "Turn",
  "River",
  "Showdown",
  "Complete",
] as const;

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
    occupied: boolean;
    inHand: boolean;
    folded: boolean;
    allIn: boolean;
    currentBet: bigint;
    handContribution: bigint;
  };
  type RawTable = {
    admin: `0x${string}`;
    maxSeats: number;
    occupiedCount: number;
    smallBlind: bigint;
    bigBlind: bigint;
    minBuyIn: bigint;
    maxBuyIn: bigint;
    dealerButton: number;
    currentActor: number;
    handNumber: bigint;
    phase: number;
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

  const [seats, round, table, activeSeatList] = await Promise.all([
    Promise.all(seatCalls),
    arcClient.readContract({
      address: config.pokerBet,
      abi: PokerBetAbi,
      functionName: "getRound",
      args: [tableId],
    }).catch(() => null),
    arcClient.readContract({
      address: config.pokerTable,
      abi: PokerTableAbi,
      functionName: "getTable",
      args: [tableId],
    }).catch(() => null),
    // Canonical "still in the hand" set from the contract: occupied + inHand
    // + !folded. Cheaper + safer than recomputing from seat snapshots, since
    // the agent runner uses this to drive its action loop.
    arcClient.readContract({
      address: config.pokerTable,
      abi: PokerTableAbi,
      functionName: "activeSeats",
      args: [tableId],
    }).catch(() => [] as readonly number[]) as Promise<readonly number[]>,
  ]);

  const occupied = seats
    .filter((s): s is Extract<SeatCall, { ok: true }> => s.ok)
    .map((s) => ({
      seatIdx: s.seatIdx,
      player: s.raw.player,
      agentId: BigInt(s.raw.agentId).toString(),
      chips: s.raw.chips.toString(),
      occupied: s.raw.occupied,
      inHand: s.raw.inHand,
      folded: s.raw.folded,
      allIn: s.raw.allIn,
      currentBet: s.raw.currentBet.toString(),
      handContribution: s.raw.handContribution.toString(),
      empty: s.raw.player === ZERO_ADDRESS,
    }));

  // Computed pot: sum of all seats' handContribution. Cheaper than calling
  // BetSystem (and works even before BetSystem state is initialised).
  const potTotal = occupied
    .filter((s) => !s.empty)
    .reduce((acc, s) => acc + BigInt(s.handContribution), 0n)
    .toString();

  const t = table as RawTable | null;
  return okResult({
    tableId,
    table: t
      ? {
          admin: t.admin,
          maxSeats: t.maxSeats,
          occupiedCount: t.occupiedCount,
          smallBlind: t.smallBlind.toString(),
          bigBlind: t.bigBlind.toString(),
          minBuyIn: t.minBuyIn.toString(),
          maxBuyIn: t.maxBuyIn.toString(),
          dealerButton: t.dealerButton,
          currentActor: t.currentActor,
          handNumber: Number(t.handNumber),
          phase: t.phase,
          phaseName: PHASE_NAMES[t.phase] ?? "Unknown",
        }
      : null,
    seats: occupied,
    activeSeats: (activeSeatList ?? []).map((idx) => Number(idx)),
    pot: potTotal,
    // BetSystem.RoundState does not track currentPlayerSeat — that lives on
    // TableSystem.Table.currentActor (sole source of truth used by BetSystem.act
    // for seat dispatch). We surface it here under the name the agent runner
    // already reads to keep the orchestrator API stable.
    round: round
      ? {
          currentPlayerSeat: t?.currentActor ?? 0xff,
          handNumber: Number((round as { handNumber: bigint }).handNumber),
          highBet: (round as { currentBet: bigint }).currentBet.toString(),
          minRaiseAmount: (round as { minRaise: bigint }).minRaise.toString(),
          lastAggressor: (round as { lastAggressor: number }).lastAggressor,
          actedBitmap: (round as { actedBitmap: number }).actedBitmap,
          roundComplete: (round as { roundComplete: boolean }).roundComplete,
        }
      : null,
  });
}
