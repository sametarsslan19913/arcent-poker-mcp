import "dotenv/config";

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const config = {
  arcRpc: env("ARC_RPC", "https://rpc.testnet.arc.network"),
  arcChainId: 5042002,

  // Stablecoins (6 decimals)
  usdc: env("USDC_ADDRESS", "0x3600000000000000000000000000000000000000") as `0x${string}`,
  eurc: env("EURC_ADDRESS", "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`,

  // ERC-8183 Agentic Jobs
  erc8183: env("ERC8183_ADDRESS", "0x0747EEf0706327138c69792bF28Cd525089e4583") as `0x${string}`,

  // ERC-8004 Agent Identity
  identityRegistry: env("IDENTITY_REGISTRY", "0x8004A818BFB912233c491871b3d84c89A494BD9e") as `0x${string}`,
  reputationRegistry: env("REPUTATION_REGISTRY", "0x8004B663056A597Dffe9eCcC1965A193B7388713") as `0x${string}`,
  validationRegistry: env("VALIDATION_REGISTRY", "0x8004Cb1BF31DAf7788923b405b754f57acEB4272") as `0x${string}`,

  // CCTP v2
  cctpTokenMessenger: env("CCTP_TOKEN_MESSENGER", "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA") as `0x${string}`,
  cctpMessageTransmitter: env("CCTP_MESSAGE_TRANSMITTER", "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275") as `0x${string}`,

  // StableFX / Swap
  fxEscrow: env("FX_ESCROW", "0x867650F5eAe8df91445971f14d89fd84F0C9a9f8") as `0x${string}`,
  permit2: env("PERMIT2", "0x000000000022D473030F116dDEE9F6B43aC78BA3") as `0x${string}`,
} as const;
