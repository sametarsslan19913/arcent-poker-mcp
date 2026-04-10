import { config } from "../config.js";
import { arcClient, baseClient, IntentVaultReadAbi, ReactorV2ReadAbi } from "../chains.js";
import { err, errorResult, okResult } from "../errors.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function bridgeStatusHandler(args: { intentId: string }) {
  const intentId = args.intentId as `0x${string}`;

  try {
    const [stateRaw, pendingFill, intentData] = await Promise.all([
      arcClient.readContract({ address: config.intentVault, abi: IntentVaultReadAbi, functionName: "intentStates", args: [intentId] }),
      baseClient.readContract({ address: config.settlementReactorV2, abi: ReactorV2ReadAbi, functionName: "pendingFills", args: [intentId] }),
      arcClient.readContract({ address: config.intentVault, abi: IntentVaultReadAbi, functionName: "intents", args: [intentId] }),
    ]);

    const state = Number(stateRaw);
    const now = Math.floor(Date.now() / 1000);
    if (state === 0) return errorResult(err("E_INTENT_NOT_FOUND", "Intent not found on source chain"));

    const deadline = Number(intentData[6]);
    const hasPendingFill = pendingFill[0] !== ZERO_ADDRESS; // solver != 0x0
    const challengeEnd = Number(pendingFill[4]);
    const isFinalized = pendingFill[5];
    const isSlashed = pendingFill[6];

    let status: string;
    if (state === 2) status = "refunded";
    else if (isSlashed) status = "slashed";
    else if (isFinalized) status = "finalized";
    else if (hasPendingFill && now < challengeEnd) status = "pending_challenge";
    else if (hasPendingFill && now >= challengeEnd) status = "ready_to_finalize";
    else if (now >= deadline) status = "expired";
    else status = "pending";

    return okResult({
      intentId,
      status,
      deadline,
      now,
      ...(hasPendingFill ? {
        solver: pendingFill[0],
        challengeEnd,
        bond: pendingFill[3].toString(),
      } : {}),
    });
  } catch (e: any) {
    return errorResult(err("E_RPC_FAILURE", `RPC call failed: ${e.message}`));
  }
}
