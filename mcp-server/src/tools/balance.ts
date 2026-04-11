import { config } from "../config.js";
import { arcClient, ERC20Abi } from "../chains.js";
import { okResult, errorResult, err } from "../errors.js";
import { formatUnits } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function balanceHandler(args: { address: string }) {
  const address = args.address as `0x${string}`;

  if (!address || address === ZERO_ADDRESS) {
    return errorResult(err("E_INVALID_ADDRESS", "Address cannot be zero"));
  }

  const [usdcBalance, eurcBalance] = await Promise.all([
    arcClient.readContract({
      address: config.usdc,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [address],
    }) as Promise<bigint>,
    arcClient.readContract({
      address: config.eurc,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [address],
    }) as Promise<bigint>,
  ]);

  return okResult({
    address,
    usdc: {
      raw: usdcBalance.toString(),
      formatted: formatUnits(usdcBalance, 6),
      symbol: "USDC",
    },
    eurc: {
      raw: eurcBalance.toString(),
      formatted: formatUnits(eurcBalance, 6),
      symbol: "EURC",
    },
    explorer: `https://testnet.arcscan.app/address/${address}`,
  });
}
