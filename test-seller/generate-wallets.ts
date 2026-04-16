import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import path from "path";

const envPath = path.resolve(".env");

function generateWallet(label: string) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  console.log(`\n${label}`);
  console.log(`  Address:     ${account.address}`);
  console.log(`  Private key: (written to .env — never printed)`);
  return { address: account.address, privateKey };
}

const seller = generateWallet("Seller (receives payments)");
const buyer = generateWallet("Buyer (funded wallet — spends nanopayments)");

const content = `# Generated wallets — DO NOT COMMIT
SELLER_ADDRESS=${seller.address}
SELLER_PRIVATE_KEY=${seller.privateKey}
BUYER_ADDRESS=${buyer.address}
BUYER_PRIVATE_KEY=${buyer.privateKey}
`;

fs.writeFileSync(envPath, content);
console.log(`\nWritten to ${envPath}\n`);

console.log(`Next steps:`);
console.log(`  1. Fund the BUYER wallet with testnet USDC:`);
console.log(`     https://faucet.circle.com/`);
console.log(`     Select: Arc Testnet`);
console.log(`     Address: ${buyer.address}`);
console.log(`  2. npm run dev  (starts seller on port 3000)`);
console.log(`  3. Use nano_deposit + nano_pay from arcent-agent-mcp to test\n`);
