import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { okResult, errorResult, err } from "../errors.js";

const SUPPORTED_CHAINS = [
  "Arc_Testnet",
  "Ethereum_Sepolia",
  "Base_Sepolia",
  "Arbitrum_Sepolia",
  "Avalanche_Fuji",
  "Polygon_Amoy",
  "Optimism_Sepolia",
  "Unichain_Sepolia",
] as const;
type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

function normalizeChain(input: string): SupportedChain | null {
  const normalized = input
    .trim()
    .replace(/[\s-]/g, "_")
    .toLowerCase();
  for (const chain of SUPPORTED_CHAINS) {
    if (chain.toLowerCase() === normalized) return chain;
  }
  return null;
}

export async function bridgeSendHandler(args: {
  privateKey: string;
  amountUsdc: string;
  fromChain?: string;
  toChain: string;
  speed?: "FAST" | "SLOW";
}) {
  const pk = args.privateKey as `0x${string}`;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    return errorResult(err("E_INVALID_PK", "privateKey must be a 0x-prefixed 32-byte hex string"));
  }

  const amount = parseFloat(args.amountUsdc);
  if (isNaN(amount) || amount <= 0) {
    return errorResult(err("E_INVALID_AMOUNT", "amountUsdc must be a positive number"));
  }

  const fromChain = normalizeChain(args.fromChain ?? "Arc_Testnet");
  const toChain = normalizeChain(args.toChain);

  if (!fromChain) {
    return errorResult(err("E_UNSUPPORTED_FROM", `Unsupported fromChain. Supported: ${SUPPORTED_CHAINS.join(", ")}`));
  }
  if (!toChain) {
    return errorResult(err("E_UNSUPPORTED_TO", `Unsupported toChain. Supported: ${SUPPORTED_CHAINS.join(", ")}`));
  }
  if (fromChain === toChain) {
    return errorResult(err("E_SAME_CHAIN", "fromChain and toChain must differ. Use send for same-chain transfers."));
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({ privateKey: pk });
    const kit = new AppKit();

    const result = await kit.bridge({
      from: { adapter, chain: fromChain },
      to: { adapter, chain: toChain },
      amount: args.amountUsdc,
      token: "USDC",
      config: args.speed ? { transferSpeed: args.speed } : undefined,
    });

    return okResult({
      status: result.state,
      fromChain,
      toChain,
      amountUsdc: args.amountUsdc,
      steps: result.steps.map((s) => ({
        name: s.name,
        txHash: s.txHash,
        explorerUrl: s.explorerUrl,
        state: s.state,
      })),
      speed: result.config?.transferSpeed,
      note: "Bridge via Circle App Kit (CCTP v2). Attestation handled automatically.",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(err("E_BRIDGE_FAILED", `Bridge failed: ${message}`));
  }
}
