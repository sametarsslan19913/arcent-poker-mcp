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

  // arcent-poker (M6.A redeploy 2026-04-26, block 39173820)
  pokerOrchestrator: env("POKER_ORCHESTRATOR", "0xbD4F6Ae631306EF2819aE6a1DD04251df90a02DA") as `0x${string}`,
  pokerTable:        env("POKER_TABLE_SYSTEM", "0x19b83045B5b8A78896B4922D24F162a002cA18a6") as `0x${string}`,
  pokerBet:          env("POKER_BET_SYSTEM",   "0xaaF95D579d1BA200D10a38efE880a169eDF25F4E") as `0x${string}`,
  pokerShowdown:     env("POKER_SHOWDOWN_SYSTEM", "0x23212EcF4cf2b79a893FE1f768EB079E429d9CC1") as `0x${string}`,
  pokerDeal:         env("POKER_DEAL_SYSTEM",  "0xc69a40C24ec71eC321190957e98db9F7f3737532") as `0x${string}`,
  pokerDecrypt:      env("POKER_DECRYPT_SYSTEM", "0x24607f3BA930C657837a3B1CCA8BAbb69238fc8D") as `0x${string}`,
  pokerRandomness:   env("POKER_RANDOMNESS_SYSTEM", "0x06763877A3269aD32b28F1238EcF012c0Bb73d54") as `0x${string}`,

  // ZK shuffle artifacts (B3.6). N=52 deck, snarkjs Groth16 production verifier.
  // Prover backend swappable: "snarkjs" (default, JS, ~20 s/proof) or "rapidsnark" (B3.6.5, C++ native, ~3-4 s/proof).
  // Same zkey + wasm work for both backends — only the prove call differs.
  zkShuffleZkey: env(
    "ZK_SHUFFLE_ZKEY",
    "/home/vpsadmin/arcent-poker/packages/circuits/build/shuffle_encrypt_n52_final.zkey",
  ),
  zkShuffleWasm: env(
    "ZK_SHUFFLE_WASM",
    "/home/vpsadmin/arcent-poker/packages/circuits/build/shuffle_encrypt_n52_js/shuffle_encrypt_n52.wasm",
  ),
  zkProverBackend: env("ZK_PROVER_BACKEND", "snarkjs"),
  // Rapidsnark binary path. Built once on the VPS via `make host` in the
  // rapidsnark repo; output lands at <repo>/package/bin/prover. Override with
  // ZK_RAPIDSNARK_BIN when using a system-wide install or symlink.
  zkRapidsnarkBin: env("ZK_RAPIDSNARK_BIN", "/home/vpsadmin/rapidsnark/package/bin/prover"),
} as const;
