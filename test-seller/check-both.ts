import { GatewayClient } from "@circle-fin/x402-batching/client";
import fs from "fs";

const envPath = ".env";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

async function bal(label: string, pk: string) {
  const g = new GatewayClient({ chain: "arcTestnet", privateKey: pk as `0x${string}` });
  const b = await g.getBalances();
  console.log(`${label}`);
  console.log(`  Addr:    ${g.address}`);
  console.log(`  Wallet:  ${b.wallet.formatted} USDC`);
  console.log(`  Gateway: ${b.gateway.formattedAvailable} USDC (raw ${b.gateway.available})`);
}

async function main() {
  await bal("BUYER", process.env.BUYER_PRIVATE_KEY!);
  await bal("SELLER", process.env.SELLER_PRIVATE_KEY!);
}
main().catch(e => { console.error(e); process.exit(1); });
