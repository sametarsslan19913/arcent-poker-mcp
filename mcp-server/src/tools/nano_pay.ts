import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import { okResult, errorResult, err } from "../errors.js";

export async function nanoPayHandler(args: {
  privateKey: string;
  url: string;
  method?: string;
  body?: unknown;
  chain?: string;
}) {
  const pk = args.privateKey as `0x${string}`;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    return errorResult(err("E_INVALID_PK", "privateKey must be a valid 0x-prefixed 32-byte hex string"));
  }

  if (!args.url || (!args.url.startsWith("http://") && !args.url.startsWith("https://"))) {
    return errorResult(err("E_INVALID_URL", "url must be a valid http(s) URL"));
  }

  const chain = (args.chain ?? "arcTestnet") as SupportedChainName;
  const method = ((args.method ?? "GET").toUpperCase()) as "GET" | "POST" | "PUT" | "DELETE";

  try {
    const gateway = new GatewayClient({ chain, privateKey: pk });
    const start = Date.now();
    const result = await gateway.pay(args.url, { method, body: args.body });
    const latencyMs = Date.now() - start;

    return okResult({
      status: "paid",
      url: args.url,
      method,
      paidAmount: result.formattedAmount,
      transaction: result.transaction,
      httpStatus: result.status,
      latencyMs,
      data: result.data,
      chain,
      note: "x402 nanopayment settled via Circle Gateway. Payment signed off-chain (EIP-3009), batched on-chain. Cost amortized across many calls — single deposit covered all gas.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(err("E_NANO_PAY_FAILED", `Gateway pay failed: ${message}`));
  }
}
