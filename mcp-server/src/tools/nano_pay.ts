import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import { okResult, errorResult, err } from "../errors.js";

const PAY_TIMEOUT_MS = 30_000;

function isBlockedHost(hostname: string): string | null {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return "loopback";
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return "local-suffix";
  // IPv4 literal checks
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = m.slice(1).map(Number);
    if (a === 10) return "rfc1918-10";
    if (a === 172 && b >= 16 && b <= 31) return "rfc1918-172";
    if (a === 192 && b === 168) return "rfc1918-192";
    if (a === 127) return "loopback-127";
    if (a === 169 && b === 254) return "link-local-metadata";
    if (a === 0) return "zero";
    if (a >= 224) return "multicast-reserved";
  }
  return null;
}

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

  let parsed: URL;
  try {
    parsed = new URL(args.url);
  } catch {
    return errorResult(err("E_INVALID_URL", "url must be a valid http(s) URL"));
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return errorResult(err("E_INVALID_URL", "url must use http or https protocol"));
  }
  const blocked = isBlockedHost(parsed.hostname);
  const allowPrivate = process.env.ARCENT_ALLOW_PRIVATE_HOSTS === "1";
  if (blocked && !allowPrivate) {
    return errorResult(err("E_BLOCKED_HOST", `Refusing to pay host ${parsed.hostname} (${blocked}) — SSRF guard. Set ARCENT_ALLOW_PRIVATE_HOSTS=1 in MCP env to override for local-seller testing.`));
  }

  const chain = (args.chain ?? "arcTestnet") as SupportedChainName;
  const method = ((args.method ?? "GET").toUpperCase()) as "GET" | "POST" | "PUT" | "DELETE";

  try {
    const gateway = new GatewayClient({ chain, privateKey: pk });
    const start = Date.now();
    const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("nano_pay timed out after 30s")), PAY_TIMEOUT_MS));
    const result = await Promise.race([gateway.pay(args.url, { method, body: args.body }), timer]);
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
