import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import { parseUnits } from "viem";
import { okResult, errorResult, err } from "../errors.js";

export async function nanoDepositHandler(args: {
  privateKey: string;
  amountUsdc: string;
  chain?: string;
}) {
  const pk = args.privateKey as `0x${string}`;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    return errorResult(err("E_INVALID_PK", "privateKey must be a valid 0x-prefixed 32-byte hex string"));
  }

  try {
    if (parseUnits(args.amountUsdc, 6) <= 0n) {
      return errorResult(err("E_INVALID_AMOUNT", "amountUsdc must be a positive USDC amount"));
    }
  } catch {
    return errorResult(err("E_INVALID_AMOUNT", "amountUsdc must be a valid USDC amount"));
  }

  const chain = (args.chain ?? "arcTestnet") as SupportedChainName;

  try {
    const gateway = new GatewayClient({ chain, privateKey: pk });
    const result = await gateway.deposit(args.amountUsdc);
    const balances = await gateway.getBalances();

    return okResult({
      status: "deposited",
      depositTxHash: result.depositTxHash,
      approvalTxHash: result.approvalTxHash ?? null,
      depositedAmount: result.formattedAmount,
      depositor: result.depositor,
      gatewayAvailable: balances.gateway.formattedAvailable,
      walletUsdcBalance: balances.wallet.formatted,
      chain,
      explorer: `https://testnet.arcscan.app/tx/${result.depositTxHash}`,
      note: "Gateway deposit complete. Subsequent nano_pay calls are gasless.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(err("E_DEPOSIT_FAILED", `Gateway deposit failed: ${message}`));
  }
}
