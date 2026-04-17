import { encodeFunctionData, parseUnits } from "viem";
import { config } from "../config.js";
import { arcClient, ERC8183Abi, ERC20Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

export async function jobSetBudgetHandler(args: {
  provider: string;
  jobId: string;
  amountUsdc: string;
}) {
  const provider = args.provider as `0x${string}`;
  const jobId = BigInt(args.jobId);

  let amount: bigint;
  try {
    amount = parseUnits(args.amountUsdc, 6);
  } catch {
    return errorResult(err("E_INVALID_AMOUNT", "amountUsdc must be a valid USDC amount"));
  }

  if (amount <= 0n) {
    return errorResult(err("E_ZERO_AMOUNT", "Budget amount must be greater than zero"));
  }

  const data = encodeFunctionData({
    abi: ERC8183Abi,
    functionName: "setBudget",
    args: [jobId, amount, "0x"],
  });

  return okResult({
    unsignedTx: {
      to: config.erc8183,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    provider,
    jobId: jobId.toString(),
    amountRaw: amount.toString(),
    amountUsdc: args.amountUsdc,
    note: "Budget set. Client must approve USDC then call job_fund.",
  });
}

export async function jobFundEscrowHandler(args: {
  client: string;
  jobId: string;
}) {
  const client = args.client as `0x${string}`;
  const jobId = BigInt(args.jobId);

  // Read job to get budget amount. viem returns a tuple matching ABI output order:
  // [id, client, provider, evaluator, description, budget, expiredAt, status, hook]
  let budget: bigint;
  try {
    const job = (await arcClient.readContract({
      address: config.erc8183,
      abi: ERC8183Abi,
      functionName: "getJob",
      args: [jobId],
    })) as readonly unknown[];
    const budgetRaw = job[5];
    if (typeof budgetRaw !== "bigint") {
      return errorResult(err("E_JOB_READ_FAILED", "Job budget field was not bigint at tuple[5] — ABI mismatch?"));
    }
    budget = budgetRaw;
  } catch {
    return errorResult(err("E_JOB_NOT_FOUND", `Could not read job ${args.jobId}`));
  }

  if (budget === 0n) {
    return errorResult(err("E_NO_BUDGET", "Job budget is zero. Provider must call job_set_budget first."));
  }

  // Check client's USDC balance and allowance
  const balance = await arcClient.readContract({
    address: config.usdc,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [client],
  });

  const allowance = await arcClient.readContract({
    address: config.usdc,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [client, config.erc8183],
  });

  const txs: Array<{ step: string; to: string; data: string; value: string; chainId: number }> = [];

  // Step 1: Approve if needed
  if ((allowance as bigint) < budget) {
    const approveData = encodeFunctionData({
      abi: ERC20Abi,
      functionName: "approve",
      args: [config.erc8183, budget],
    });
    txs.push({
      step: "1_approve",
      to: config.usdc,
      data: approveData,
      value: "0",
      chainId: config.arcChainId,
    });
  }

  // Step 2: Fund
  const fundData = encodeFunctionData({
    abi: ERC8183Abi,
    functionName: "fund",
    args: [jobId, "0x"],
  });
  txs.push({
    step: allowance as bigint >= budget ? "1_fund" : "2_fund",
    to: config.erc8183,
    data: fundData,
    value: "0",
    chainId: config.arcChainId,
  });

  return okResult({
    unsignedTxs: txs,
    client,
    jobId: jobId.toString(),
    budget: budget.toString(),
    balance: (balance as bigint).toString(),
    needsApproval: (allowance as bigint) < budget,
    note: "Fund escrow; send transactions in order.",
  });
}
