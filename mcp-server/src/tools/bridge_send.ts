import { encodeFunctionData, pad } from "viem";
import { config } from "../config.js";
import { arcClient, ERC20Abi, TokenMessengerV2Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

// CCTP domain IDs — https://developers.circle.com/stablecoins/supported-domains
const DOMAIN_MAP: Record<string, number> = {
  "ethereum_sepolia": 0,
  "avalanche_fuji": 1,
  "arbitrum_sepolia": 3,
  "base_sepolia": 6,
  "polygon_amoy": 7,
  "arc_testnet": 26,
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function bridgeSendHandler(args: {
  from: string;
  amountUsdc: string;
  destinationChain: string;
  recipient: string;
}) {
  const from = args.from as `0x${string}`;
  const recipient = args.recipient as `0x${string}`;
  const amount = BigInt(Math.round(parseFloat(args.amountUsdc) * 1_000_000));
  const destChain = args.destinationChain.toLowerCase().replace(/[\s-]/g, "_");

  if (!from || from === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_FROM", "Sender address cannot be zero"));
  }
  if (!recipient || recipient === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_RECIPIENT", "Recipient address cannot be zero"));
  }
  if (amount <= 0n) {
    return errorResult(err("E_ZERO_AMOUNT", "Amount must be greater than zero"));
  }

  const destDomain = DOMAIN_MAP[destChain];
  if (destDomain === undefined) {
    return errorResult(err("E_UNSUPPORTED_CHAIN",
      `Unsupported destination chain: ${args.destinationChain}. Supported: ${Object.keys(DOMAIN_MAP).join(", ")}`));
  }

  // Check USDC balance
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

  // Check allowance
  const allowance = await arcClient.readContract({
    address: config.usdc,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [from, config.cctpTokenMessenger],
  }) as bigint;

  const txs: Array<{ step: string; to: string; data: string; value: string; chainId: number }> = [];

  // Step 1: Approve CCTP if needed
  if (allowance < amount) {
    const approveData = encodeFunctionData({
      abi: ERC20Abi,
      functionName: "approve",
      args: [config.cctpTokenMessenger, amount],
    });
    txs.push({
      step: "1_approve",
      to: config.usdc,
      data: approveData,
      value: "0",
      chainId: config.arcChainId,
    });
  }

  // Step 2: depositForBurn
  const mintRecipient = pad(recipient, { size: 32 }); // bytes32 left-padded
  const burnData = encodeFunctionData({
    abi: TokenMessengerV2Abi,
    functionName: "depositForBurn",
    args: [amount, destDomain, mintRecipient, config.usdc],
  });

  txs.push({
    step: allowance >= amount ? "1_burn" : "2_burn",
    to: config.cctpTokenMessenger,
    data: burnData,
    value: "0",
    chainId: config.arcChainId,
  });

  return okResult({
    unsignedTxs: txs,
    from,
    recipient: args.recipient,
    amountUsdc: args.amountUsdc,
    amountRaw: amount.toString(),
    destinationDomain: destDomain,
    destinationChain: args.destinationChain,
    needsApproval: allowance < amount,
    note: "CCTP bridge: USDC is burned on Arc and minted on destination chain. Attestation takes ~1-2 minutes. Send transactions in order.",
  });
}
