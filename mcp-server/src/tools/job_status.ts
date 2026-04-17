import { formatUnits } from "viem";
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

    const result = job as unknown as unknown[];
    const statusCode = Number(result[7] as bigint);

    return okResult({
      jobId: (result[0] as bigint).toString(),
      client: result[1] as string,
      provider: result[2] as string,
      evaluator: result[3] as string,
      description: result[4] as string,
      budget: (result[5] as bigint).toString(),
      budgetUsdc: formatUnits(result[5] as bigint, 6),
      expiredAt: (result[6] as bigint).toString(),
      status: statusCode,
      statusLabel: STATUS_LABELS[statusCode] ?? `Unknown(${statusCode})`,
      hook: result[8] as string,
      explorerUrl: `https://testnet.arcscan.app/address/${config.erc8183}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorResult(err("E_JOB_READ_FAILED", `Failed to read job ${args.jobId}: ${message}`));
  }
}
