import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { baseClient, ReactorV2ReadAbi } from "../chains.js";
import { err, errorResult, okResult } from "../errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECEIPTS_DIR = join(__dirname, "..", "..", "..", "relayer", "receipts");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function bridgeReceiptHandler(args: { intentId: string }) {
  const intentId = args.intentId as `0x${string}`;

  try {
    const pendingFill = await baseClient.readContract({
      address: config.settlementReactorV2, abi: ReactorV2ReadAbi, functionName: "pendingFills", args: [intentId],
    });

    const solver = pendingFill[0] as string;
    const isFinalized = pendingFill[5] as boolean;

    if (solver === ZERO_ADDRESS) return errorResult(err("E_NOT_FILLED", "Intent not filled yet. Check bridge_status first."));
    if (!isFinalized) return errorResult(err("E_NOT_FINALIZED", "Fill pending challenge window. Check bridge_status for challengeEnd."));

    const receiptPath = join(RECEIPTS_DIR, `${intentId}.json`);
    if (!existsSync(receiptPath)) {
      return errorResult(err("E_RECEIPT_UNAVAILABLE", "Finalized on-chain but receipt file not yet available. Retry shortly."));
    }

    const stored = JSON.parse(readFileSync(receiptPath, "utf-8"));

    return okResult({
      receipt: {
        version: 1,
        primaryType: "Receipt",
        domain: { name: "arcent", version: "1", chainId: config.baseChainId, verifyingContract: config.settlementReactorV2 },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" }, { name: "version", type: "string" },
            { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
          ],
          Receipt: [
            { name: "intentId", type: "bytes32" }, { name: "srcChainId", type: "uint256" },
            { name: "dstChainId", type: "uint256" }, { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" }, { name: "srcTxHash", type: "bytes32" },
            { name: "dstTxHash", type: "bytes32" }, { name: "timestamp", type: "uint64" },
          ],
        },
        message: stored.receipt,
        signature: stored.signature,
        attester: stored.receipt.attester ?? config.settlementReactorV2,
      },
    });
  } catch (e: any) {
    return errorResult(err("E_RPC_FAILURE", `Failed: ${e.message}`));
  }
}
