import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import { parseUnits } from "viem";
import { okResult, errorResult, err } from "../errors.js";

/**
 * Audit MCP1 (2026-05-08) — the LLM agent must NEVER see the player's PK.
 * Pre-fix the tool schema accepted `privateKey` as an argument, so each
 * tool call serialized the PK into the LLM's tool-call JSON, leaking it
 * into OpenRouter logs / prompt history. Now the MCP server reads PLAYER_PK
 * from its own environment at startup; the tool schema no longer accepts
 * a privateKey field.
 */
function loadPlayerPk(): `0x${string}` | { error: string } {
  const pk = process.env.PLAYER_PK;
  if (!pk) {
    return { error: "PLAYER_PK env not set on the MCP server (required for nano_pay/nano_deposit)" };
  }
  if (!pk.startsWith("0x") || pk.length !== 66) {
    return { error: "PLAYER_PK env must be a valid 0x-prefixed 32-byte hex string" };
  }
  return pk as `0x${string}`;
}

export async function nanoDepositHandler(args: {
  amountUsdc: string;
  chain?: string;
}) {
  const pkOrErr = loadPlayerPk();
  if (typeof pkOrErr !== "string") {
    return errorResult(err("E_PK_NOT_CONFIGURED", pkOrErr.error));
  }
  const pk = pkOrErr;

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
