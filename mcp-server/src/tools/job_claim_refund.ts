import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { ERC8183Abi } from "../chains.js";
import { okResult } from "../errors.js";

export async function jobClaimRefundHandler(args: {
  client: string;
  jobId: string;
}) {
  const client = args.client as `0x${string}`;
  const jobId = BigInt(args.jobId);

  const data = encodeFunctionData({
    abi: ERC8183Abi,
    functionName: "claimRefund",
    args: [jobId],
  });

  return okResult({
    unsignedTx: {
      to: config.erc8183,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    client,
    jobId: jobId.toString(),
    note: "Use for Expired jobs only. Rejected jobs auto-refund; calling here reverts.",
  });
}
