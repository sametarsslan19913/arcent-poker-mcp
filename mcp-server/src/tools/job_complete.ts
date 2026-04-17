import { encodeFunctionData, keccak256, stringToHex } from "viem";
import { config } from "../config.js";
import { ERC8183Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

export async function jobCompleteHandler(args: {
  evaluator: string;
  jobId: string;
  reason?: string;
}) {
  const evaluator = args.evaluator as `0x${string}`;
  const jobId = BigInt(args.jobId);
  const reason = args.reason ?? "approved";
  const reasonHash = keccak256(stringToHex(reason));

  const data = encodeFunctionData({
    abi: ERC8183Abi,
    functionName: "complete",
    args: [jobId, reasonHash, "0x"],
  });

  return okResult({
    unsignedTx: {
      to: config.erc8183,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    evaluator,
    jobId: jobId.toString(),
    reasonHash,
    note: "Approve deliverable and release payment.",
  });
}
