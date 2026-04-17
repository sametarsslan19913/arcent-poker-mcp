import { encodeFunctionData, keccak256, stringToHex } from "viem";
import { config } from "../config.js";
import { ERC8183Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

export async function jobSubmitHandler(args: {
  provider: string;
  jobId: string;
  deliverable: string;
}) {
  const provider = args.provider as `0x${string}`;
  const jobId = BigInt(args.jobId);
  const { deliverable } = args;

  if (!deliverable || deliverable.length === 0) {
    return errorResult(err("E_EMPTY_DELIVERABLE", "Deliverable description cannot be empty"));
  }

  // Hash the deliverable content — on-chain stores only the hash
  const deliverableHash = keccak256(stringToHex(deliverable));

  const data = encodeFunctionData({
    abi: ERC8183Abi,
    functionName: "submit",
    args: [jobId, deliverableHash, "0x"],
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
    deliverableHash,
    deliverablePreview: deliverable.slice(0, 200),
    note: "Deliverable hash submitted. Evaluator can now call job_complete.",
  });
}
