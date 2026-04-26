import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { PokerDealAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

export async function pokerDealRevealHandler(args: {
  player: string;
  tableId: string;
  seed: string;
}) {
  const player = args.player as `0x${string}`;
  const tableId = args.tableId as `0x${string}`;
  const seed = args.seed as `0x${string}`;

  if (!player || player === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_INVALID_PLAYER", "player address cannot be zero"));
  }
  if (!tableId || tableId.length !== 66) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }
  if (!seed || seed.length !== 66) {
    return errorResult(err("E_INVALID_SEED", "seed must be 32-byte hex (preimage of commitHash)"));
  }

  const data = encodeFunctionData({
    abi: PokerDealAbi,
    functionName: "reveal",
    args: [tableId, seed],
  });

  return okResult({
    unsignedTx: {
      to: config.pokerDeal,
      data,
      value: "0",
      chainId: config.arcChainId,
    },
    player,
    tableId,
    seed,
    note: "Reveal phase. Contract verifies keccak256(seed) == previously committed hash, then XORs seed into shared randomness.",
  });
}
