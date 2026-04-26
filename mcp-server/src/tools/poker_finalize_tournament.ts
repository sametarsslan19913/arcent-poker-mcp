import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { PokerOrchestratorAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

export async function pokerFinalizeTournamentHandler(args: {
  admin: string;
  tournamentId: string;
  ranking: string[]; // agentIds in finishing order, length = payoutBps.length
}) {
  const admin = args.admin as `0x${string}`;
  const tournamentId = args.tournamentId as `0x${string}`;

  if (!admin || admin === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_INVALID_ADMIN", "admin address cannot be zero"));
  }
  if (!tournamentId || tournamentId.length !== 66) {
    return errorResult(err("E_INVALID_TOURNAMENT_ID", "tournamentId must be 32-byte hex"));
  }
  if (!Array.isArray(args.ranking) || args.ranking.length === 0) {
    return errorResult(err("E_EMPTY_RANKING", "ranking array required"));
  }

  let rankingBig: bigint[];
  try {
    rankingBig = args.ranking.map((id) => BigInt(id));
  } catch {
    return errorResult(err("E_INVALID_AGENT_ID", "ranking must contain numeric strings"));
  }

  const data = encodeFunctionData({
    abi: PokerOrchestratorAbi,
    functionName: "finalize",
    args: [tournamentId, rankingBig],
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
    ranking: args.ranking,
    note: "Admin signs. Pot distributed by payoutBps; ReputationDelta events emitted.",
  });
}
