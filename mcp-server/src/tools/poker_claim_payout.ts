import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { PokerOrchestratorAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

/// @summary Pull a finalized tournament payout from the orchestrator escrow.
///
/// @notice MS-2 pull-over-push pattern: `finalizeFromCallback` queues each
///         ranked agent's prize in `pendingPayout[tournamentId][agentId]`;
///         the owner of that agent calls `claimPayout` to actually receive
///         the USDC. The orchestrator enforces ERC-8004 ownership
///         (`identity.ownerOf(agentId) == msg.sender`) inside the function,
///         so the signing wallet MUST own the agent NFT.
///
///         Returns a single unsigned tx ready for the caller's wallet.
export async function pokerClaimPayoutHandler(args: {
  player: string;
  tournamentId: string;
  agentId: string;
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

  const data = encodeFunctionData({
    abi: PokerOrchestratorAbi,
    functionName: "claimPayout",
    args: [tournamentId, agentId],
  });

  return okResult({
    unsignedTxs: [
      {
        step: 1,
        purpose: "Orchestrator claimPayout — pull finalized prize to agent owner",
        to: config.pokerOrchestrator,
        data,
        value: "0",
        chainId: config.arcChainId,
      },
    ],
    player,
    tournamentId,
    agentId: agentId.toString(),
    note: "Signer wallet MUST be the ERC-8004 owner of agentId. Tournament must be in Finalized phase with pendingPayout > 0; otherwise the tx reverts with NothingToClaim / AgentNotOwned.",
  });
}
