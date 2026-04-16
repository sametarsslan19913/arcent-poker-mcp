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
    note: "Client (msg.sender) reclaims escrowed USDC. Use ONLY for Expired jobs (past expiredAt). Bypasses hooks per EIP-8183 spec — guaranteed recovery path after expiry. Rejected jobs auto-refund via job_reject — calling this for Rejected jobs will revert.",
  });
}
