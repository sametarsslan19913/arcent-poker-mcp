import "dotenv/config";

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const config = {
  arcRpc: env("ARC_RPC", "https://rpc.testnet.arc.network"),
  baseRpc: env("BASE_RPC", "https://sepolia.base.org"),
  arcChainId: 5042002,
  baseChainId: 84532,
  arcUsdc: env("ARC_USDC", "0x911b4000d3422f482f4062a913885f7b035382df") as `0x${string}`,
  baseUsdc: env("BASE_USDC", "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`,
  intentVault: env("INTENT_VAULT", "0xb72C382e7f5F73d36C1FDe167601099B596f3194") as `0x${string}`,
  settlementReactor: env("SETTLEMENT_REACTOR", "0xb72C382e7f5F73d36C1FDe167601099B596f3194") as `0x${string}`,
  feeBps: 0,
  defaultSlippageBps: 50,
  defaultDeadlineSec: 900,
} as const;
