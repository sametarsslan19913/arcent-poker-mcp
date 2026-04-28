// poker_advance_phase — coordinator-side phase transition.
//
// Call after BetSystem.RoundState.roundComplete=true (and the relevant community
// cards have been fully decrypted, if any). This tool returns one or two
// unsignedTxs the coordinator broadcasts in order:
//
//   Preflop → Flop  : [TableSystem.advancePhase, BetSystem.initRound]
//   Flop    → Turn  : [TableSystem.advancePhase, BetSystem.initRound]
//   Turn    → River : [TableSystem.advancePhase, BetSystem.initRound]
//   River   → Showdown: [TableSystem.advancePhase]   (no betting round init —
//                                                     ShowdownSystem takes over)
//
// Both contracts enforce `onlyAuthorizedSystem(tableId)` — the broadcaster must
// be the table admin or have been authorizeSystem'd. Showdown / Complete →
// rejected (E_PHASE_TERMINAL); the showdown invoker (B3.7.E) handles those.
//
// The tool defaults to *strict* mode: it refuses to emit txs unless
//   (a) round.roundComplete = true, AND
//   (b) every community card belonging to the next phase is on-chain revealed.
// `force=true` skips both checks — useful for diagnostic broadcasts but
// dangerous in normal operation.

import { encodeFunctionData } from "viem";
import { arcClient } from "../chains.js";
import { config } from "../config.js";
import {
  PokerTableAbi,
  PokerBetAbi,
  PokerDecryptAbi,
  TablePhase,
  TablePhaseLabel,
  communityCardIdxsForNextPhase,
  nextPhaseAfter,
} from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

type TableTuple = {
  occupiedCount: number;
  phase: number;
  handNumber: bigint;
};

type RoundTuple = {
  roundComplete: boolean;
};

export async function pokerAdvancePhaseHandler(args: {
  tableId: string;
  /** Skip roundComplete + revealed checks. Default false. */
  force?: boolean;
}) {
  const tableId = args.tableId as `0x${string}`;
  if (!tableId || tableId.length !== 66 || !tableId.startsWith("0x")) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }
  const force = args.force === true;

  // 1. Read current phase + roster size + round state in parallel.
  let table: TableTuple;
  let round: RoundTuple;
  let roster: readonly number[];
  try {
    const [t, r, occ] = await Promise.all([
      arcClient.readContract({
        address: config.pokerTable as `0x${string}`,
        abi: PokerTableAbi,
        functionName: "getTable",
        args: [tableId],
      }) as Promise<TableTuple>,
      arcClient.readContract({
        address: config.pokerBet as `0x${string}`,
        abi: PokerBetAbi,
        functionName: "getRound",
        args: [tableId],
      }) as Promise<RoundTuple>,
      arcClient.readContract({
        address: config.pokerTable as `0x${string}`,
        abi: PokerTableAbi,
        functionName: "occupiedSeats",
        args: [tableId],
      }) as Promise<readonly number[]>,
    ]);
    table = t;
    round = r;
    roster = occ;
  } catch (e) {
    return errorResult(err("E_READ_FAILED", `state reads failed: ${(e as Error).message}`));
  }

  const phase = table.phase;
  const N = roster.length;

  // 2. Reject terminal/illegal phases. Showdown invocation is B3.7.E's job;
  //    auto-advancing River → Showdown is fine, but Showdown → Complete should
  //    flow through ShowdownSystem.endHand callback, not advancePhase.
  if (phase === TablePhase.WaitingForPlayers) {
    return errorResult(
      err(
        "E_PHASE_INVALID",
        "Phase=WaitingForPlayers — startHand must run first; advancePhase has nothing to advance.",
      ),
    );
  }
  if (phase === TablePhase.Showdown || phase === TablePhase.Complete) {
    return errorResult(
      err(
        "E_PHASE_TERMINAL",
        `Phase=${TablePhaseLabel[phase]} — showdown invoker (B3.7.E) and endHand handle this transition, not poker_advance_phase.`,
      ),
    );
  }

  const nextPhase = nextPhaseAfter(phase);
  const communityCardIdxs = communityCardIdxsForNextPhase(phase, N);

  // 3. Strict checks (skip if force=true).
  if (!force) {
    if (!round.roundComplete) {
      return errorResult(
        err(
          "E_ROUND_NOT_COMPLETE",
          `BetSystem.RoundState.roundComplete=false for handNumber ${table.handNumber}. Wait for the betting round to finish before advancing.`,
        ),
      );
    }
    if (communityCardIdxs.length > 0) {
      try {
        const revealedFlags = await Promise.all(
          communityCardIdxs.map(
            (idx) =>
              arcClient.readContract({
                address: config.pokerDecrypt as `0x${string}`,
                abi: PokerDecryptAbi,
                functionName: "revealed",
                args: [tableId, idx],
              }) as Promise<boolean>,
          ),
        );
        const pending = communityCardIdxs.filter((_, i) => !revealedFlags[i]);
        if (pending.length > 0) {
          return errorResult(
            err(
              "E_REVEAL_PENDING",
              `Community card(s) ${pending.join(", ")} not yet revealed (threshold not met). Each agent must run poker_decrypt_share for these cardIdxs before advancing.`,
            ),
          );
        }
      } catch (e) {
        return errorResult(
          err("E_DECRYPT_READ", `revealed[] read failed: ${(e as Error).message}`),
        );
      }
    }
  }

  // 4. Build txs.
  const advanceData = encodeFunctionData({
    abi: PokerTableAbi,
    functionName: "advancePhase",
    args: [tableId],
  });
  const txs: Array<{
    to: string;
    data: `0x${string}`;
    value: string;
    chainId: number;
    label: string;
  }> = [
    {
      to: config.pokerTable,
      data: advanceData,
      value: "0",
      chainId: config.arcChainId,
      label: `TableSystem.advancePhase (${TablePhaseLabel[phase]} → ${TablePhaseLabel[nextPhase]})`,
    },
  ];

  // initRound only when transitioning into a betting round (Flop/Turn/River).
  // River → Showdown is a non-betting transition; ShowdownSystem takes over.
  const isBettingRoundNext =
    nextPhase === TablePhase.Flop ||
    nextPhase === TablePhase.Turn ||
    nextPhase === TablePhase.River;
  if (isBettingRoundNext) {
    const initRoundData = encodeFunctionData({
      abi: PokerBetAbi,
      functionName: "initRound",
      args: [tableId],
    });
    txs.push({
      to: config.pokerBet,
      data: initRoundData,
      value: "0",
      chainId: config.arcChainId,
      label: `BetSystem.initRound (${TablePhaseLabel[nextPhase]})`,
    });
  }

  return okResult({
    tableId,
    fromPhase: phase,
    fromPhaseLabel: TablePhaseLabel[phase],
    toPhase: nextPhase,
    toPhaseLabel: TablePhaseLabel[nextPhase],
    handNumber: table.handNumber.toString(),
    occupiedCount: N,
    communityCardIdxs,
    isBettingRoundNext,
    txCount: txs.length,
    unsignedTxs: txs,
    note: isBettingRoundNext
      ? `Broadcast txs in order. After both land, ${TablePhaseLabel[nextPhase]} betting round is open and currentActor is set to the first post-flop actor.`
      : `Broadcast the advancePhase tx. ${TablePhaseLabel[nextPhase]} requires the showdown invoker (B3.7.E) — currentActor is cleared (0xFF).`,
  });
}
