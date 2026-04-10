import { config } from "../config.js";
import { arcClient, baseClient, IntentVaultReadAbi, ReactorReadAbi } from "../chains.js";
import { err, errorResult, okResult } from "../errors.js";

export async function bridgeStatusHandler(args: { intentId: string }) {
  const intentId = args.intentId as `0x${string}`;

  try {
    const [stateRaw, isFilled, intentData] = await Promise.all([
      arcClient.readContract({ address: config.intentVault, abi: IntentVaultReadAbi, functionName: "intentStates", args: [intentId] }),
      baseClient.readContract({ address: config.settlementReactor, abi: ReactorReadAbi, functionName: "filled", args: [intentId] }),
      arcClient.readContract({ address: config.intentVault, abi: IntentVaultReadAbi, functionName: "intents", args: [intentId] }),
    ]);

    const state = Number(stateRaw);
    const now = Math.floor(Date.now() / 1000);
    if (state === 0) return errorResult(err("E_INTENT_NOT_FOUND", "Intent not found on source chain"));

    const deadline = Number(intentData[6]);
    let status: string;
    if (state === 2) status = "refunded";
    else if (isFilled) status = "filled";
    else if (now >= deadline) status = "expired";
    else status = "pending";

    return okResult({ intentId, status, srcTxHash: null, dstTxHash: null, filledAt: null, deadline, now });
  } catch (e: any) {
    return errorResult(err("E_RPC_FAILURE", `RPC call failed: ${e.message}`));
  }
}
