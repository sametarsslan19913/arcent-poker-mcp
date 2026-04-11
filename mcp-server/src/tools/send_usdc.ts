import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { arcClient, ERC20Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function sendUsdcHandler(args: {
  from: string;
  to: string;
  amountUsdc: string;
}) {
  const from = args.from as `0x${string}`;
  const to = args.to as `0x${string}`;
  const amount = BigInt(Math.round(parseFloat(args.amountUsdc) * 1_000_000)); // 6 decimals

  if (!from || from === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_FROM", "Sender address cannot be zero"));
  }
  if (!to || to === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_TO", "Recipient address cannot be zero"));
  }
  if (amount <= 0n) {
    return errorResult(err("E_ZERO_AMOUNT", "Amount must be greater than zero"));
  }

  // Check balance
  const balance = await arcClient.readContract({
    address: config.usdc,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [from],
  }) as bigint;

  if (balance < amount) {
    return errorResult(err("E_INSUFFICIENT_BALANCE",
      `Insufficient USDC: have ${(Number(balance) / 1_000_000).toFixed(2)}, need ${args.amountUsdc}`));
  }

  const data = encodeFunctionData({
    abi: ERC20Abi,
    functionName: "transfer",
    args: [to, amount],
  });

  return okResult({
    unsignedTx: {
      to: config.usdc,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    from,
    to: args.to,
    amountRaw: amount.toString(),
    amountUsdc: args.amountUsdc,
    balanceAfter: ((balance - amount).toString()),
    explorerNote: "Track at https://testnet.arcscan.app",
  });
}
