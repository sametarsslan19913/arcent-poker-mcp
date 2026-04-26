import { encodeFunctionData, parseUnits } from "viem";
import { config } from "../config.js";
import { PokerOrchestratorAbi } from "../poker-abis.js";
import { ERC20Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

export async function pokerRegisterForTournamentHandler(args: {
  player: string;
  tournamentId: string;
  agentId: string;
  entryFeeUsdc?: string;
}) {
  const player = args.player as `0x${string}`;
  const tournamentId = args.tournamentId as `0x${string}`;

  if (!player || player === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_INVALID_PLAYER", "player address cannot be zero"));
  }
  if (!tournamentId || !tournamentId.startsWith("0x") || tournamentId.length !== 66) {
    return errorResult(err("E_INVALID_TOURNAMENT_ID", "tournamentId must be a 0x-prefixed 32-byte hex string"));
  }

  let agentId: bigint;
  try {
    agentId = BigInt(args.agentId);
  } catch {
    return errorResult(err("E_INVALID_AGENT_ID", "agentId must be a numeric string"));
  }
  if (agentId <= 0n) {
    return errorResult(err("E_INVALID_AGENT_ID", "agentId must be positive"));
  }

  const entryFee = parseUnits(args.entryFeeUsdc ?? "1.00", 6);

  const approveData = encodeFunctionData({
    abi: ERC20Abi,
    functionName: "approve",
    args: [config.pokerOrchestrator, entryFee],
  });

  const registerData = encodeFunctionData({
    abi: PokerOrchestratorAbi,
    functionName: "register",
    args: [tournamentId, agentId],
  });

  return okResult({
    unsignedTxs: [
      {
        step: 1,
        purpose: "USDC approve",
        to: config.usdc,
        data: approveData,
        value: "0",
        chainId: config.arcChainId,
      },
      {
        step: 2,
        purpose: "Tournament register",
        to: config.pokerOrchestrator,
        data: registerData,
        value: "0",
        chainId: config.arcChainId,
      },
    ],
    player,
    tournamentId,
    agentId: agentId.toString(),
    entryFeeUsdc: args.entryFeeUsdc ?? "1.00",
    entryFeeRaw: entryFee.toString(),
    note: "Sign step 1 then step 2 in order. Both must succeed for registration to land.",
  });
}
