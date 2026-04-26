import { arcClient } from "../chains.js";
import { config } from "../config.js";
import { PokerOrchestratorAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

const PHASE_LABELS = ["Draft", "Registering", "Running", "Finalized", "Cancelled"] as const;

export async function pokerTournamentStateHandler(args: {
  tournamentId: string;
}) {
  const tournamentId = args.tournamentId as `0x${string}`;
  if (!tournamentId || tournamentId.length !== 66) {
    return errorResult(err("E_INVALID_TOURNAMENT_ID", "tournamentId must be 32-byte hex"));
  }

  const [tournRaw, roster] = await Promise.all([
    arcClient.readContract({
      address: config.pokerOrchestrator,
      abi: PokerOrchestratorAbi,
      functionName: "tournamentOf",
      args: [tournamentId],
    }) as Promise<readonly [
      `0x${string}`,
      `0x${string}`,
      bigint,
      number,
      number,
      number,
      number,
    ]>,
    arcClient.readContract({
      address: config.pokerOrchestrator,
      abi: PokerOrchestratorAbi,
      functionName: "rosterOf",
      args: [tournamentId],
    }) as Promise<readonly bigint[]>,
  ]);

  const [admin, token, entryFee, minPlayers, maxPlayers, registered, phase] = tournRaw;
  if (admin === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_TOURNAMENT_NOT_FOUND", "tournamentId not found"));
  }

  return okResult({
    tournamentId,
    admin,
    token,
    entryFeeRaw: entryFee.toString(),
    minPlayers,
    maxPlayers,
    registered,
    phase: PHASE_LABELS[phase] ?? `Unknown(${phase})`,
    phaseEnum: phase,
    roster: roster.map((id) => id.toString()),
  });
}
