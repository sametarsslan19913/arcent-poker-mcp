import { config } from "../config.js";
import { arcClient, ERC8183Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Funded",
  2: "Submitted",
  3: "Completed",
  4: "Rejected",
  5: "Expired",
};

export async function jobStatusHandler(args: { jobId: string }) {
  const jobId = BigInt(args.jobId);

  try {
    const job = await arcClient.readContract({
      address: config.erc8183,
      abi: ERC8183Abi,
      functionName: "getJob",
      args: [jobId],
    });

    const result = job as any;
    const statusCode = Number(result[3]);

    return okResult({
      jobId: jobId.toString(),
      client: result[0],
      provider: result[1],
      evaluator: result[2],
      status: statusCode,
      statusLabel: STATUS_LABELS[statusCode] ?? `Unknown(${statusCode})`,
      budget: result[4].toString(),
      budgetUsdc: (Number(result[4]) / 1_000_000).toFixed(2),
      expiredAt: result[5].toString(),
      description: result[6],
      explorerUrl: `https://testnet.arcscan.app/address/${config.erc8183}`,
    });
  } catch {
    return errorResult(err("E_JOB_NOT_FOUND", `Job ${args.jobId} not found or contract call failed`));
  }
}
