import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { arcClient, ERC20Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const TOKEN_MAP: Record<string, { address: `0x${string}`; symbol: string; decimals: number }> = {
  usdc: { address: config.usdc, symbol: "USDC", decimals: 6 },
  eurc: { address: config.eurc, symbol: "EURC", decimals: 6 },
};

export async function sendTokenHandler(args: {
  from: string;
  to: string;
  amount: string;
  token?: string;
}) {
  const from = args.from as `0x${string}`;
  const to = args.to as `0x${string}`;
  const tokenKey = (args.token ?? "usdc").toLowerCase();
  const tokenInfo = TOKEN_MAP[tokenKey];

  if (!tokenInfo) {
    return errorResult(err("E_UNKNOWN_TOKEN", `Unknown token: ${args.token}. Supported: USDC, EURC`));
  }

  const amount = BigInt(Math.round(parseFloat(args.amount) * 10 ** tokenInfo.decimals));

  if (!from || from === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_FROM", "Sender address cannot be zero"));
  }
  if (!to || to === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_TO", "Recipient address cannot be zero"));
  }
  if (amount <= 0n) {
    return errorResult(err("E_ZERO_AMOUNT", "Amount must be greater than zero"));
  }

  const balance = await arcClient.readContract({
    address: tokenInfo.address,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [from],
  }) as bigint;

  if (balance < amount) {
    return errorResult(err("E_INSUFFICIENT_BALANCE",
      `Insufficient ${tokenInfo.symbol}: have ${(Number(balance) / 10 ** tokenInfo.decimals).toFixed(2)}, need ${args.amount}`));
  }

  const data = encodeFunctionData({
    abi: ERC20Abi,
    functionName: "transfer",
    args: [to, amount],
  });

  return okResult({
    unsignedTx: {
      to: tokenInfo.address,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    from,
    to: args.to,
    token: tokenInfo.symbol,
    amountRaw: amount.toString(),
    amount: args.amount,
    balanceBefore: (Number(balance) / 10 ** tokenInfo.decimals).toFixed(2),
    explorerNote: "Track at https://testnet.arcscan.app",
  });
}
