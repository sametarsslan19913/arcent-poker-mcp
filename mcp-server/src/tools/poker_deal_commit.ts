import { encodeFunctionData } from "viem";
import { config } from "../config.js";
import { PokerDealAbi } from "../poker-abis.js";
import { okResult, errorResult, err } from "../errors.js";

export async function pokerDealCommitHandler(args: {
  player: string;
  tableId: string;
  commitHash: string;
}) {
  const player = args.player as `0x${string}`;
  const tableId = args.tableId as `0x${string}`;
  const commitHash = args.commitHash as `0x${string}`;

  if (!player || player === "0x0000000000000000000000000000000000000000") {
    return errorResult(err("E_INVALID_PLAYER", "player address cannot be zero"));
  }
  if (!tableId || tableId.length !== 66) {
    return errorResult(err("E_INVALID_TABLE_ID", "tableId must be 32-byte hex"));
  }
  if (!commitHash || commitHash.length !== 66) {
    return errorResult(err("E_INVALID_COMMIT", "commitHash must be 32-byte hex (keccak256(seed))"));
  }

  const data = encodeFunctionData({
    abi: PokerDealAbi,
    functionName: "commit",
    args: [tableId, commitHash],
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
    commitHash,
    note: "Commit phase of N-of-N commit-reveal randomness. Reveal seed in poker_deal_reveal after all players commit.",
  });
}
