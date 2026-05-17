import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { config } from "./config.js";

// 2026-05-16 — Codex burst rate root-cause handoff. arcClient transport,
// ARC_READ_RPC_URLS set ise viem fallback'e geçer (primary + extras, sıralı
// failover). Tek-URL ise eski davranış aynı kalır. Mevcut readContractWithRetry
// aşağıdaki wrapper aynı kalır → iki kademe koruma:
//   (1) viem fallback transport: bir provider 5xx/timeout verince diğerine geçer
//   (2) readContractWithRetry: 429/transient'leri exp-backoff ile yutar
// Primary = ARC_READ_RPC_URL || ARC_RPC. Extras = ARC_READ_RPC_URLS CSV.
const READ_PRIMARY = config.arcReadRpcUrl ?? config.arcRpc;
const READ_URLS = Array.from(new Set([READ_PRIMARY, ...config.arcReadRpcUrls]));
const readTransport = READ_URLS.length === 1
  ? http(READ_URLS[0])
  : fallback(
      READ_URLS.map((u) => http(u)),
      { rank: false, retryCount: 0 },
    );

export const arcTestnet = {
  id: config.arcChainId,
  name: "Arc Testnet",
  // Arc native gas: USDC 18-dec (ERC-20 görünüm 6-dec ama nativeCurrency
  // viem'in formatEther/formatUnits varsayılan dönüşlerinde 18 olmalı).
  // 2026-05-11 — Codex public-readiness audit P0-1 fix.
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: READ_URLS } },
} as const;

export const arcClient: PublicClient = createPublicClient({
  chain: arcTestnet,
  transport: readTransport,
});

// 2026-05-17 — Codex Round 2 mainnet stratejisi. Per-URL ayrı public client'lar
// quorum read için. arcClient (fallback) ile kıyasla: fallback tek RPC seçer +
// stale data'yı görmez (5xx vermediği sürece OK sayar). Quorum read N farklı
// RPC'den paralel okuyup k-of-n aynı değeri bekler — Arc RPC LB-level
// node-arası state propagation skew'unu (R-F3.12) bu katmanda yakalar.
// Tek-URL fallback'de quorum no-op (degenerate path), birinci client geri döner.
export const arcReadClients: PublicClient[] = READ_URLS.map((url) =>
  createPublicClient({
    chain: arcTestnet,
    transport: http(url),
  }),
);

const QUORUM_K = Number(process.env.ARC_MCP_QUORUM_K ?? Math.min(2, READ_URLS.length));
const QUORUM_ATTEMPTS = Number(process.env.ARC_MCP_QUORUM_ATTEMPTS ?? 8);
const QUORUM_BACKOFF_BASE_MS = Number(process.env.ARC_MCP_QUORUM_BACKOFF_BASE_MS ?? 250);
const QUORUM_BACKOFF_MAX_MS = Number(process.env.ARC_MCP_QUORUM_BACKOFF_MAX_MS ?? 4000);
const HEAD_WAIT_TIMEOUT_MS = Number(process.env.ARC_MCP_HEAD_WAIT_TIMEOUT_MS ?? 30_000);
const HEAD_WAIT_POLL_MS = Number(process.env.ARC_MCP_HEAD_WAIT_POLL_MS ?? 500);

// 2026-05-14 Codex handoff — Arc okuma planı flaky. `readContract` çağrıları
// timeout/429/5xx/network glitch yiyince MCP tool çağrısı fatal görünüyor ama
// tx aslında zincirde başarılı (Gemini HAND 4 `readContract(getSeat)` river
// betting'te birden fazla transient hata verdi, retry path kurtardı).
// Burada `arcClient.readContract`'ı exponential backoff'lu wrapper ile sar:
//   - max attempts ARC_MCP_READ_RETRY_MAX_ATTEMPTS (default 8)
//   - base delay ARC_MCP_READ_RETRY_BASE_DELAY_MS (default 500ms)
//   - max delay ARC_MCP_READ_RETRY_MAX_DELAY_MS (default 10s)
// Daily quota / hard rate-limit retry edilmez — provider failover ihtiyacı.
const rawReadContract = arcClient.readContract.bind(arcClient);
const READ_RETRY_MAX_ATTEMPTS = Number(process.env.ARC_MCP_READ_RETRY_MAX_ATTEMPTS ?? 8);
const READ_RETRY_BASE_DELAY_MS = Number(process.env.ARC_MCP_READ_RETRY_BASE_DELAY_MS ?? 500);
const READ_RETRY_MAX_DELAY_MS = Number(process.env.ARC_MCP_READ_RETRY_MAX_DELAY_MS ?? 10_000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableReadError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  if (/daily request limit reached/i.test(message)) return false;
  return /timeout|temporarily unavailable|rate limit|too many requests|429|500|502|503|504|ECONNRESET|ETIMEDOUT|fetch failed|network error/i.test(message);
}

async function readContractWithRetry(args: any): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= READ_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await rawReadContract(args);
    } catch (e) {
      lastErr = e;
      if (!isRetryableReadError(e) || attempt >= READ_RETRY_MAX_ATTEMPTS) throw e;
      const delay = Math.min(
        READ_RETRY_MAX_DELAY_MS,
        READ_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

Object.assign(arcClient, {
  readContract: readContractWithRetry as typeof arcClient.readContract,
});

// ── 2026-05-17 Codex Round 2 mainnet RPC sync ── PR #19 scope.
//
// Üç katmanlı state-validate:
//   (A) waitHeadsAtLeast(minBlock) — bütün read client'larının head'i en az
//       minBlock olana kadar bekle (read-after-write barrier — write yapan
//       caller receipt.blockNumber'ı tool'a aktarır)
//   (B) readContractQuorum(args, opts) — k-of-n eşit JSON karşılaştırması
//       (BigInt ve nested obje guard'lı). Quorum sağlanmazsa exp-backoff retry.
//   (C) Caller (smoke/brain) write receipt.blockNumber'ı bir sonraki read
//       tool çağrısının `minBlock` arg'ına geçirir → read pinned + barrier.

export class StateNotFinalError extends Error {
  constructor(public readonly args: { last?: unknown; quorum?: number; required: number; attempts: number }) {
    super(
      `E_STATE_NOT_FINAL — quorum not reached after ${args.attempts} attempt(s); required=${args.required} got=${args.quorum ?? 0}`,
    );
    this.name = "StateNotFinalError";
  }
}

/**
 * Wait until every read client's reported block number is at least `minBlock`.
 * Used as read-after-write barrier: write tx receipt'inin block'unu MCP read
 * tool'una `minBlock` olarak geçirirsin, böylece henüz bu block'u görmemiş
 * stale RPC'lerden veri okumayı engellersin.
 *
 * Tek-URL setup'ta hızlı path: tek client polled.
 */
export async function waitHeadsAtLeast(
  minBlock: bigint,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  if (minBlock <= 0n) return;
  const timeoutMs = opts.timeoutMs ?? HEAD_WAIT_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? HEAD_WAIT_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const heads = await Promise.allSettled(
      arcReadClients.map((c) => c.getBlockNumber()),
    );
    const ok = heads.every(
      (h) => h.status === "fulfilled" && h.value >= minBlock,
    );
    if (ok) return;
    await sleep(pollMs);
  }
  throw new Error(
    `E_HEAD_WAIT_TIMEOUT — read clients did not reach block ${minBlock} within ${timeoutMs}ms`,
  );
}

/**
 * Stable JSON for quorum comparison. BigInt → decimal string; sorted object
 * keys; arrays preserved in order. Tuple-returning ABI fonksiyonları array
 * döndürür — sıra korunur.
 */
function stableStringify(value: unknown): string {
  if (typeof value === "bigint") return `"${value.toString()}n"`;
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface QuorumOptions {
  /** Quorum eşiği (min eşit yanıt). Default ENV ARC_MCP_QUORUM_K ya da min(2, N) */
  k?: number;
  /** Read pinning — bu block'tan oku. Set ise tüm client'lar aynı block'tan okur. */
  blockNumber?: bigint;
  /** Read-after-write barrier — bu block'a ulaşılmadan başlama */
  minBlock?: bigint;
  attempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Etiket (log için, opsiyonel) */
  label?: string;
}

/**
 * K-of-N quorum read across `arcReadClients`. Tek-URL setup'ta tek read yapar
 * (quorum no-op). Multi-URL setup'ta paralel okur, k eşit sonuç beklenir.
 *
 * Eşit değilse: backoff retry. Tüm attempt'ler sonrası StateNotFinalError.
 *
 * `blockNumber` set ise tüm client'lar o block'tan okur (pinned read). Aksi
 * halde her client kendi head'inden okur (race riski — quorum yakalar).
 */
export async function readContractQuorum<T = unknown>(
  args: Parameters<PublicClient["readContract"]>[0],
  opts: QuorumOptions = {},
): Promise<T> {
  if (opts.minBlock !== undefined) {
    await waitHeadsAtLeast(opts.minBlock);
  }

  const N = arcReadClients.length;
  const k = Math.min(N, opts.k ?? QUORUM_K);
  const attempts = opts.attempts ?? QUORUM_ATTEMPTS;
  const backoffBase = opts.backoffBaseMs ?? QUORUM_BACKOFF_BASE_MS;
  const backoffMax = opts.backoffMaxMs ?? QUORUM_BACKOFF_MAX_MS;

  // Tek client veya k=1: quorum no-op, direkt readContractWithRetry
  if (N === 1 || k <= 1) {
    const pinnedArgs = opts.blockNumber !== undefined
      ? { ...args, blockNumber: opts.blockNumber }
      : args;
    return (await rawReadContract(pinnedArgs as Parameters<PublicClient["readContract"]>[0])) as T;
  }

  const pinnedArgs = opts.blockNumber !== undefined
    ? { ...args, blockNumber: opts.blockNumber }
    : args;

  let lastQuorum = 0;
  let lastValue: T | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const settled = await Promise.allSettled(
      arcReadClients.map((c) =>
        c.readContract(pinnedArgs as Parameters<PublicClient["readContract"]>[0]),
      ),
    );
    const buckets = new Map<string, { count: number; value: unknown }>();
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      const key = stableStringify(s.value);
      const b = buckets.get(key);
      if (b) b.count += 1;
      else buckets.set(key, { count: 1, value: s.value });
    }
    let bestCount = 0;
    let bestValue: unknown;
    for (const b of buckets.values()) {
      if (b.count > bestCount) {
        bestCount = b.count;
        bestValue = b.value;
      }
    }
    if (bestCount >= k) {
      return bestValue as T;
    }
    lastQuorum = bestCount;
    lastValue = bestValue as T;
    if (attempt < attempts) {
      const delay = Math.min(backoffMax, backoffBase * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  throw new StateNotFinalError({
    last: lastValue,
    quorum: lastQuorum,
    required: k,
    attempts,
  });
}

/** Salt blockNumber okuma — head probe için kullanılabilir. */
export async function currentBlockNumber(): Promise<bigint> {
  return await arcClient.getBlockNumber();
}

// ── ERC-20 ──
export const ERC20Abi = [
  {
    type: "function", name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "allowance",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "transfer",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// ── ERC-8004: Agent Identity ──
export const IdentityRegistryAbi = [
  {
    type: "function", name: "register",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "tokenURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

export const ReputationRegistryAbi = [
  {
    type: "function", name: "giveFeedback",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "int128" },
      { name: "feedbackType", type: "uint8" },
      { name: "tag", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "evidenceURI", type: "string" },
      { name: "comment", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const ValidationRegistryAbi = [
  {
    type: "function", name: "validationRequest",
    inputs: [
      { name: "validator", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "requestURI", type: "string" },
      { name: "requestHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "validationResponse",
    inputs: [
      { name: "requestHash", type: "bytes32" },
      { name: "response", type: "uint8" },
      { name: "responseURI", type: "string" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getValidationStatus",
    inputs: [{ name: "requestHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

// ── ERC-8183: Agentic Jobs ──
export const ERC8183Abi = [
  {
    type: "function", name: "createJob",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "setBudget",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "fund",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "submit",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "complete",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "reject",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "claimRefund",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "setProvider",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "provider_", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getJob",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "description", type: "string" },
      { name: "budget", type: "uint256" },
      { name: "expiredAt", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "hook", type: "address" },
    ],
    stateMutability: "view",
  },
  // Event for extracting jobId
  {
    type: "event", name: "JobCreated",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "evaluator", type: "address", indexed: false },
      { name: "expiredAt", type: "uint256", indexed: false },
      { name: "hook", type: "address", indexed: false },
    ],
  },
] as const;

// ── CCTP v2 ──
export const TokenMessengerV2Abi = [
  {
    type: "function", name: "depositForBurn",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
    stateMutability: "nonpayable",
  },
] as const;
