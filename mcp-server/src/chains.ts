import { createPublicClient, http } from "viem";
import { config } from "./config.js";

export const arcTestnet = {
  id: config.arcChainId,
  name: "Arc Testnet",
  // Arc native gas: USDC 18-dec (ERC-20 görünüm 6-dec ama nativeCurrency
  // viem'in formatEther/formatUnits varsayılan dönüşlerinde 18 olmalı).
  // 2026-05-11 — Codex public-readiness audit P0-1 fix.
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [config.arcRpc] } },
} as const;

export const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(config.arcRpc),
});

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
