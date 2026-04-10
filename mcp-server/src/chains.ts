import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { config } from "./config.js";

// Arc testnet chain definition (not in viem defaults)
const arcTestnet = {
  id: config.arcChainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [config.arcRpc] } },
} as const;

export const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(config.arcRpc),
});

export const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: http(config.baseRpc),
});

// ABI fragments used by MCP tools
export const ERC20ReadAbi = [
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
] as const;

export const IntentVaultReadAbi = [
  {
    type: "function", name: "nonces",
    inputs: [{ name: "maker", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "intentStates",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "intents",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [
      { name: "maker", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "srcChainId", type: "uint256" },
      { name: "dstChainId", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "nonce", type: "uint64" },
      { name: "salt", type: "bytes32" },
    ],
    stateMutability: "view",
  },
] as const;

export const ReactorReadAbi = [
  {
    type: "function", name: "filled",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;
