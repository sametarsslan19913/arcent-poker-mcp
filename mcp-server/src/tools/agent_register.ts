import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { arcClient, IdentityRegistryAbi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";

export async function agentRegisterHandler(args: {
  owner: string;
  metadataURI: string;
}) {
  const owner = args.owner as `0x${string}`;
  const { metadataURI } = args;

  if (!owner || owner === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_INVALID_OWNER", "Owner address cannot be zero"));
  }
  if (!metadataURI || metadataURI.length === 0) {
    return errorResult(err("E_INVALID_URI", "Metadata URI cannot be empty"));
  }

  const data = encodeFunctionData({
    abi: IdentityRegistryAbi,
    functionName: "register",
    args: [metadataURI],
  });

  return okResult({
    unsignedTx: {
      to: config.identityRegistry,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    owner,
    metadataURI,
    note: "This tx mints an ERC-721 identity NFT for your AI agent. The caller (msg.sender) becomes the agent owner.",
  });
}
