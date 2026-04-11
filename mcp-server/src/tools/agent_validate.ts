import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { arcClient, ValidationRegistryAbi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";
import { keccak256, toHex } from "viem";

export async function agentValidateHandler(args: {
  action: string;
  owner?: string;
  validator?: string;
  agentId?: string;
  requestURI?: string;
  requestHash?: string;
  response?: number;
  responseURI?: string;
  tag?: string;
}) {
  const { action } = args;

  if (action === "request") {
    const { owner, validator, agentId, requestURI } = args;
    if (!owner || !validator || !agentId || !requestURI) {
      return errorResult(err("E_MISSING_PARAMS", "request action requires: owner, validator, agentId, requestURI"));
    }

    const requestHash = keccak256(toHex(`${agentId}-${requestURI}-${Date.now()}`));

    const data = encodeFunctionData({
      abi: ValidationRegistryAbi,
      functionName: "validationRequest",
      args: [
        validator as `0x${string}`,
        BigInt(agentId),
        requestURI,
        requestHash,
      ],
    });

    return okResult({
      unsignedTx: {
        to: config.validationRegistry,
        data,
        value: "0",
        chainId: config.arcChainId,
      },
      owner,
      requestHash,
      note: "Owner sends this tx to request validation from the specified validator.",
    });
  }

  if (action === "respond") {
    const { validator, requestHash, response, responseURI, tag } = args;
    if (!validator || !requestHash) {
      return errorResult(err("E_MISSING_PARAMS", "respond action requires: validator, requestHash"));
    }

    const responseCode = response ?? 100; // 100 = passed, 0 = failed
    const responseHash = keccak256(toHex(`${requestHash}-${responseCode}-${Date.now()}`));

    const data = encodeFunctionData({
      abi: ValidationRegistryAbi,
      functionName: "validationResponse",
      args: [
        requestHash as `0x${string}`,
        responseCode,
        responseURI ?? "",
        responseHash,
        tag ?? "validation",
      ],
    });

    return okResult({
      unsignedTx: {
        to: config.validationRegistry,
        data,
        value: "0",
        chainId: config.arcChainId,
      },
      validator,
      requestHash,
      responseCode,
      note: "Validator sends this tx to respond. 100 = passed, 0 = failed.",
    });
  }

  if (action === "status") {
    const { requestHash } = args;
    if (!requestHash) {
      return errorResult(err("E_MISSING_PARAMS", "status action requires: requestHash"));
    }

    const status = await arcClient.readContract({
      address: config.validationRegistry,
      abi: ValidationRegistryAbi,
      functionName: "getValidationStatus",
      args: [requestHash as `0x${string}`],
    });

    return okResult({
      requestHash,
      status: Number(status),
      statusLabel: status === 100 ? "passed" : status === 0 ? "pending_or_failed" : `unknown(${status})`,
    });
  }

  return errorResult(err("E_INVALID_ACTION", "Action must be 'request', 'respond', or 'status'"));
}
