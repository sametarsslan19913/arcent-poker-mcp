import { encodeFunctionData, keccak256, toHex } from "viem";
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
  const reasonHash = keccak256(toHex(reason));

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
    note: "Evaluator (msg.sender) approves the deliverable and releases payment to the provider.",
  });
}
