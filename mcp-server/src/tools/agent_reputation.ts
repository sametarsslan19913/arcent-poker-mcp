import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { ReputationRegistryAbi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";
import { keccak256, toHex } from "viem";

export async function agentReputationHandler(args: {
  action: string;
  agentId: string;
  reviewer?: string;
  score?: number;
  feedbackType?: number;
  tag?: string;
  comment?: string;
}) {
  const { action, agentId } = args;

  if (action === "give") {
    const score = args.score ?? 100;
    const feedbackType = args.feedbackType ?? 0;
    const tag = args.tag ?? "general";
    const comment = args.comment ?? "";
    const reviewer = args.reviewer;

    if (!reviewer) {
      return errorResult(err("E_NO_REVIEWER", "Reviewer address required for giving feedback"));
    }

    const feedbackHash = keccak256(toHex(`${agentId}-${score}-${Date.now()}`));

    const data = encodeFunctionData({
      abi: ReputationRegistryAbi,
      functionName: "giveFeedback",
      args: [
        BigInt(agentId),
        BigInt(score),
        feedbackType,
        tag,
        "",  // metadataURI
        "",  // evidenceURI
        comment,
        feedbackHash,
      ],
    });

    return okResult({
      unsignedTx: {
        to: config.reputationRegistry,
        data,
        value: "0",
        chainId: config.arcChainId,
      },
      reviewer,
      agentId,
      score,
      tag,
      note: "Agent owners cannot give feedback to their own agents. The reviewer (msg.sender) must be a different address.",
    });
  }

  return errorResult(err("E_INVALID_ACTION", "Action must be 'give'. Read queries coming soon."));
}
