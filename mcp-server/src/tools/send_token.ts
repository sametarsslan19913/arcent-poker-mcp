import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { okResult, errorResult, err } from "../errors.js";

const SUPPORTED_TOKENS = ["USDC", "EURC", "USDT"] as const;
type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

const SUPPORTED_CHAINS = [
  "Arc_Testnet",
  "Ethereum_Sepolia",
  "Base_Sepolia",
  "Arbitrum_Sepolia",
  "Avalanche_Fuji",
  "Polygon_Amoy",
  "Optimism_Sepolia",
] as const;
type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

function normalizeChain(input: string): SupportedChain | null {
  const normalized = input.trim().replace(/[\s-]/g, "_").toLowerCase();
  for (const chain of SUPPORTED_CHAINS) {
    if (chain.toLowerCase() === normalized) return chain;
  }
  return null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function sendTokenHandler(args: {
  privateKey: string;
  to: string;
  amount: string;
  token?: string;
  chain?: string;
}) {
  const pk = args.privateKey as `0x${string}`;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    return errorResult(err("E_INVALID_PK", "privateKey must be a 0x-prefixed 32-byte hex string"));
  }

  const to = args.to as `0x${string}`;
  if (!to || to === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_TO", "Recipient address cannot be zero"));
  }

  const amountNum = parseFloat(args.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return errorResult(err("E_INVALID_AMOUNT", "amount must be a positive number"));
  }

  const tokenUpper = (args.token ?? "USDC").toUpperCase();
  if (!SUPPORTED_TOKENS.includes(tokenUpper as SupportedToken)) {
    return errorResult(err("E_UNKNOWN_TOKEN", `Unknown token: ${args.token}. Supported: ${SUPPORTED_TOKENS.join(", ")}`));
  }
  const token = tokenUpper as SupportedToken;

  const chain = normalizeChain(args.chain ?? "Arc_Testnet");
  if (!chain) {
    return errorResult(err("E_UNSUPPORTED_CHAIN", `Unsupported chain. Supported: ${SUPPORTED_CHAINS.join(", ")}`));
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({ privateKey: pk });
    const kit = new AppKit();

    const step = await kit.send({
      from: { adapter, chain },
      to,
      amount: args.amount,
      token,
    });

    return okResult({
      status: step.state,
      txHash: step.txHash,
      explorerUrl: step.explorerUrl,
      to: args.to,
      amount: args.amount,
      token,
      chain,
      note: "Send via Circle App Kit. Same-chain token transfer.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(err("E_SEND_FAILED", `Send failed: ${message}`));
  }
}
