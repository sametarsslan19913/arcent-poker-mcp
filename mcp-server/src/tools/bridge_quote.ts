import { config } from "../config.js";
import { err, errorResult, okResult } from "../errors.js";
import { randomBytes } from "node:crypto";

const DECIMALS_DIFF = 10n ** 12n;

export async function bridgeQuoteHandler(args: { srcChainId: number; dstChainId: number; amountIn: string; recipient: string }) {
  const { srcChainId, dstChainId, recipient } = args;
  const amountIn = BigInt(args.amountIn);

  if (srcChainId === dstChainId) return errorResult(err("E_INVALID_CHAIN_PAIR", "Source and destination chains must differ"));
  if (amountIn === 0n) return errorResult(err("E_AMOUNT_ZERO", "amountIn must be > 0"));
  if (!recipient || recipient === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_RECIPIENT_ZERO", "Recipient cannot be zero address"));
  }

  const feeBps = config.feeBps;
  const feeAbsolute = (amountIn * BigInt(feeBps)) / 10000n;
  const amountAfterFee = amountIn - feeAbsolute;
  const amountOut = amountAfterFee / DECIMALS_DIFF;
  const minAmountOut = amountOut - (amountOut * BigInt(config.defaultSlippageBps)) / 10000n;

  const deadline = Math.floor(Date.now() / 1000) + config.defaultDeadlineSec;
  const salt = "0x" + randomBytes(32).toString("hex");

  return okResult({
    amountOut: amountOut.toString(),
    feeAbsolute: feeAbsolute.toString(),
    feeBps,
    expectedSeconds: 30,
    intentTemplate: {
      maker: null,
      recipient,
      amountIn: amountIn.toString(),
      minAmountOut: minAmountOut.toString(),
      srcChainId,
      dstChainId,
      deadline,
      nonce: null,
      salt,
    },
  });
}
