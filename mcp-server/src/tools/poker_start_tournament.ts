import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { PokerOrchestratorAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

export async function pokerStartTournamentHandler(args: {
  admin: string;
  tournamentId: string;
}) {
  const admin = args.admin as `0x${string}`;
  const tournamentId = args.tournamentId as `0x${string}`;

  if (!admin || admin === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_INVALID_ADMIN", "admin address cannot be zero"));
  }
  if (!tournamentId || tournamentId.length !== 66) {
    return errorResult(err("E_INVALID_TOURNAMENT_ID", "tournamentId must be 32-byte hex"));
  }

  const data = encodeFunctionData({
    abi: PokerOrchestratorAbi,
    functionName: "start",
    args: [tournamentId],
  });

  return okResult({
    unsignedTx: {
      to: config.pokerOrchestrator,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    admin,
    tournamentId,
    note: "Admin signs. Phase transitions Registering → Running. minPlayers must be met.",
  });
}
