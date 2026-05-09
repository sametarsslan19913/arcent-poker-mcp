import { GatewayClient, type SupportedChainName } from "@circle-fin/x402-batching/client";
import { okResult, errorResult, err } from "../errors.js";

const PAY_TIMEOUT_MS = 30_000;

// NOTE on defense-in-depth:
//  - DNS rebinding (evil.com -> 169.254.169.254 at resolve time) is NOT closed
//    here; the SDK does not expose a custom DNS resolver. Callers routing nano_pay
//    through untrusted inputs should use a dedicated network namespace or firewall.
//  - Promise.race timeout below does not abort the in-flight pay() — the SDK does
//    not accept an AbortSignal. The caller's process continues, the HTTP request
//    may complete in the background. Acceptable for a user-driven MCP tool.
function isBlockedHost(hostname: string): string | null {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return "loopback";
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return "local-suffix";

  // IPv6 private / link-local
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return "rfc4193-ula";
  if (h.startsWith("fe80:")) return "link-local-v6";
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice(7);
    const sub = isBlockedHost(v4);
    if (sub) return `v4-mapped-${sub}`;
  }

  // IPv4 non-dotted numeric formats (decimal, octal, hex) — normalize to dotted
  const numeric = parseNumericIPv4(h);
  if (numeric !== null) {
    const sub = isBlockedHost(numeric);
    if (sub) return `numeric-${sub}`;
    return "numeric-ipv4";
  }

  // IPv4 dotted literal
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

function parseNumericIPv4(h: string): string | null {
  // Decimal single integer (0 - 4294967295): e.g. 2130706433 = 127.0.0.1
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (Number.isFinite(n) && n >= 0 && n <= 0xFFFFFFFF) return intToIPv4(n);
  }
  // Hex literal: 0x7f000001 = 127.0.0.1
  if (/^0x[0-9a-f]+$/i.test(h)) {
    const n = parseInt(h, 16);
    if (Number.isFinite(n) && n >= 0 && n <= 0xFFFFFFFF) return intToIPv4(n);
  }
  // Octal-leading form: 0177.0.0.1 — partial; Node URL.hostname usually strips, but cover anyway
  if (/^0[0-7]+$/.test(h)) {
    const n = parseInt(h, 8);
    if (Number.isFinite(n) && n >= 0 && n <= 0xFFFFFFFF) return intToIPv4(n);
  }
  return null;
}

function intToIPv4(n: number): string {
  return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF].join(".");
}

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

export async function nanoPayHandler(args: {
  url: string;
  method?: string;
  body?: unknown;
  chain?: string;
}) {
  const pkOrErr = loadPlayerPk();
  if (typeof pkOrErr !== "string") {
    return errorResult(err("E_PK_NOT_CONFIGURED", pkOrErr.error));
  }
  const pk = pkOrErr;

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
      note: "x402 settlement via Gateway; gasless after deposit.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(err("E_NANO_PAY_FAILED", `Gateway pay failed: ${message}`));
  }
}
