import { SwapKit } from "@circle-fin/swap-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { parseUnits } from "viem";
import { okResult, errorResult, err } from "../errors.js";

const SUPPORTED_TOKENS = ["USDC", "EURC"] as const;
type SwapToken = (typeof SUPPORTED_TOKENS)[number];

export async function swapHandler(args: {
  privateKey: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps?: number;
}) {
  const tokenIn = args.tokenIn.toUpperCase() as SwapToken;
  const tokenOut = args.tokenOut.toUpperCase() as SwapToken;

  if (!SUPPORTED_TOKENS.includes(tokenIn)) {
    return errorResult(err("E_INVALID_TOKEN_IN", `Unsupported tokenIn: ${args.tokenIn}. Supported: ${SUPPORTED_TOKENS.join(", ")}`));
  }
  if (!SUPPORTED_TOKENS.includes(tokenOut)) {
    return errorResult(err("E_INVALID_TOKEN_OUT", `Unsupported tokenOut: ${args.tokenOut}. Supported: ${SUPPORTED_TOKENS.join(", ")}`));
  }
  if (tokenIn === tokenOut) {
    return errorResult(err("E_SAME_TOKEN", "tokenIn and tokenOut must be different"));
  }

  try {
    if (parseUnits(args.amountIn, 6) <= 0n) {
      return errorResult(err("E_INVALID_AMOUNT", "amountIn must be a positive amount"));
    }
  } catch {
    return errorResult(err("E_INVALID_AMOUNT", "amountIn must be a valid numeric amount"));
  }

  const kitKey = process.env.KIT_KEY;
  if (!kitKey) {
    return errorResult(err("E_NO_KIT_KEY", "KIT_KEY environment variable is required for swap"));
  }

  const pk = args.privateKey as `0x${string}`;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    return errorResult(err("E_INVALID_PK", "privateKey must be a valid 0x-prefixed 32-byte hex string"));
  }

  try {
    const adapter = createViemAdapterFromPrivateKey({ privateKey: pk });
    const kit = new SwapKit();

    const result = await kit.swap({
      // 2026-04-28: SwapKit + ViemAdapter ActionKeys cross-package mismatch
      // surfaced after a fresh pnpm install resolved Circle SDKs to slightly
      // different transitive versions. swap is unused by the poker flows;
      // tracked for cleanup alongside pnpm-lock.yaml commit.
      from: { adapter, chain: "Arc_Testnet" } as never,
      tokenIn,
      tokenOut,
      amountIn: args.amountIn,
      config: {
        kitKey,
        slippageBps: args.slippageBps ?? 300,
      },
    });

    return okResult({
      status: "completed",
      txHash: result.txHash,
      tokenIn: result.tokenIn,
      tokenOut: result.tokenOut,
      amountIn: result.amountIn,
      amountOut: result.amountOut ?? "pending",
      chain: "Arc_Testnet",
      explorer: `https://testnet.arcscan.app/tx/${result.txHash}`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(err("E_SWAP_FAILED", `Swap failed: ${message}`));
  }
}
