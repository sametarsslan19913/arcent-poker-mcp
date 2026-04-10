import { encodeFunctionData, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { config } from "../config.js";
import { arcClient, ERC20ReadAbi, IntentVaultReadAbi } from "../chains.js";
import { err, errorResult, okResult } from "../errors.js";
import { randomBytes } from "node:crypto";

const DECIMALS_DIFF = 10n ** 12n;

const createIntentAbi = [{
  type: "function" as const, name: "createIntent",
  inputs: [
    { name: "recipient", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "dstChainId", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "salt", type: "bytes32" },
  ],
  outputs: [{ name: "intentId", type: "bytes32" }],
  stateMutability: "nonpayable",
}] as const;

export async function bridgeSendHandler(args: {
  maker: string; srcChainId: number; dstChainId: number;
  amountIn: string; recipient: string;
  minAmountOut?: string; deadline?: number; salt?: string;
}) {
  const maker = args.maker as `0x${string}`;
  const { srcChainId, dstChainId } = args;
  const amountIn = BigInt(args.amountIn);
  const recipient = args.recipient as `0x${string}`;

  if (srcChainId === dstChainId) return errorResult(err("E_INVALID_CHAIN_PAIR", "Source and destination must differ"));
  if (amountIn === 0n) return errorResult(err("E_AMOUNT_ZERO", "amountIn must be > 0"));
  if (!maker || maker === "0x0000000000000000000000000000000000000000") return errorResult(err("E_BAD_ADDRESS", "Maker cannot be zero"));
  if (!recipient || recipient === "0x0000000000000000000000000000000000000000") return errorResult(err("E_RECIPIENT_ZERO", "Recipient cannot be zero"));

  try {
    const [balance, allowance, nonce] = await Promise.all([
      arcClient.readContract({ address: config.arcUsdc, abi: ERC20ReadAbi, functionName: "balanceOf", args: [maker] }),
      arcClient.readContract({ address: config.arcUsdc, abi: ERC20ReadAbi, functionName: "allowance", args: [maker, config.intentVault] }),
      arcClient.readContract({ address: config.intentVault, abi: IntentVaultReadAbi, functionName: "nonces", args: [maker] }),
    ]);

    if (balance < amountIn) return errorResult(err("E_INSUFFICIENT_BALANCE", `Balance ${balance} < amountIn ${amountIn}`));
    if (allowance < amountIn) return errorResult(err("E_INSUFFICIENT_ALLOWANCE", `Allowance ${allowance} < amountIn ${amountIn}`));

    const deadline = args.deadline ?? Math.floor(Date.now() / 1000) + config.defaultDeadlineSec;
    if (deadline <= Math.floor(Date.now() / 1000)) return errorResult(err("E_INVALID_DEADLINE", "Deadline must be in the future"));

    const salt = (args.salt ?? "0x" + randomBytes(32).toString("hex")) as `0x${string}`;
    const amountOut6 = amountIn / DECIMALS_DIFF;
    const minAmountOut = args.minAmountOut ? BigInt(args.minAmountOut) : amountOut6 - (amountOut6 * BigInt(config.defaultSlippageBps)) / 10000n;

    const encoded = encodeAbiParameters(
      parseAbiParameters("address,address,uint256,uint256,uint256,uint256,uint64,uint64,bytes32"),
      [maker, recipient, amountIn, minAmountOut, BigInt(srcChainId), BigInt(dstChainId), BigInt(deadline), BigInt(nonce), salt]
    );
    const intentId = keccak256(encoded);

    const calldata = encodeFunctionData({
      abi: createIntentAbi,
      functionName: "createIntent",
      args: [recipient, amountIn, minAmountOut, BigInt(dstChainId), BigInt(deadline), salt],
    });

    const warnings: string[] = [];
    if (amountIn < 1000000000000000000n) warnings.push("Small amount: less than 1 USDC");

    return okResult({
      unsignedTx: { to: config.intentVault, data: calldata, value: "0", chainId: srcChainId },
      intentId,
      nonce: Number(nonce),
      intent: { maker, recipient, amountIn: amountIn.toString(), minAmountOut: minAmountOut.toString(), srcChainId, dstChainId, deadline, nonce: Number(nonce), salt },
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (e: any) {
    return errorResult(err("E_RPC_FAILURE", `RPC call failed: ${e.message}`));
  }
}
