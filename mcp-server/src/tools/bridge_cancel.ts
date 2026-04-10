import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { arcClient, IntentVaultReadAbi } from "../chains.js";
import { err, errorResult, okResult } from "../errors.js";

const refundAbi = [{
  type: "function" as const, name: "refund",
  inputs: [{ name: "intentId", type: "bytes32" }],
  outputs: [],
  stateMutability: "nonpayable",
}] as const;

export async function bridgeCancelHandler(args: { maker: string; intentId: string }) {
  const maker = args.maker as `0x${string}`;
  const intentId = args.intentId as `0x${string}`;

  try {
    const [stateRaw, intentData] = await Promise.all([
      arcClient.readContract({ address: config.intentVault, abi: IntentVaultReadAbi, functionName: "intentStates", args: [intentId] }),
      arcClient.readContract({ address: config.intentVault, abi: IntentVaultReadAbi, functionName: "intents", args: [intentId] }),
    ]);

    const state = Number(stateRaw);
    if (state === 0) return errorResult(err("E_INTENT_NOT_FOUND", "Intent not found"));
    if (state === 2) return errorResult(err("E_ALREADY_REFUNDED", "Intent already refunded"));

    const intentMaker = intentData[0] as `0x${string}`;
    const amountIn = intentData[2] as bigint;
    const deadline = Number(intentData[6]);
    const now = Math.floor(Date.now() / 1000);

    if (maker.toLowerCase() !== intentMaker.toLowerCase()) return errorResult(err("E_UNAUTHORIZED", "Only the intent maker can cancel"));
    if (now < deadline) return errorResult(err("E_DEADLINE_NOT_REACHED", `Wait ${deadline - now}s more`));

    const calldata = encodeFunctionData({ abi: refundAbi, functionName: "refund", args: [intentId] });

    return okResult({
      unsignedTx: { to: config.intentVault, data: calldata, value: "0", chainId: config.arcChainId },
      intentId,
      refundAmount: amountIn.toString(),
    });
  } catch (e: any) {
    return errorResult(err("E_RPC_FAILURE", `Failed: ${e.message}`));
  }
}
