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

  // MCP1 (audit 2026-05-08) — switch from the legacy 2-step approve+register
  // flow to the H2 3-step pre-pay chain that mitigates Arc Bug 1
  // (`transferFrom` contract-spender StackUnderflow precompile bug).
  // Sequence:
  //   1. caller direct USDC.transfer(orchestrator, fee)  — msg.sender == EOA, bypasses Bug 1
  //   2. orchestrator.depositFor(tournamentId, agentId, fee) — credits depositor-bound slot
  //   3. orchestrator.register(tournamentId, agentId) — consumes pendingDeposit, no transferFrom
  //
  // The agent runner has the H2.5 atomic alternative (`registerWithAuthorization`,
  // single tx via EIP-3009) that smoke-arc-*-brain.ts uses; this MCP path
  // is the chain-neutral 3-step variant for harnesses that don't sign EIP-3009
  // typed-data and for tokens without that surface (e.g. CHIP).
  const transferData = encodeFunctionData({
    abi: ERC20Abi,
    functionName: "transfer",
    args: [config.pokerOrchestrator, entryFee],
  });

  const depositForData = encodeFunctionData({
    abi: PokerOrchestratorAbi,
    functionName: "depositFor",
    args: [tournamentId, agentId, entryFee],
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
        purpose: "USDC transfer (caller → orchestrator, Bug 1 bypass)",
        to: config.usdc,
        data: transferData,
        value: "0",
        chainId: config.arcChainId,
      },
      {
        step: 2,
        purpose: "Orchestrator depositFor (credit depositor-bound slot)",
        to: config.pokerOrchestrator,
        data: depositForData,
        value: "0",
        chainId: config.arcChainId,
      },
      {
        step: 3,
        purpose: "Tournament register (consumes pendingDeposit)",
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
    note: "Sign step 1, 2, 3 in order. All three must land before registration is complete. Step 1 is a direct transfer (caller is EOA → Arc Bug 1 bypass). Step 2 credits the depositor-bound slot; step 3 consumes it.",
  });
}
