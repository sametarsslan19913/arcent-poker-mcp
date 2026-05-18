import "dotenv/config";

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const config = {
  arcRpc: env("ARC_RPC", "https://rpc.testnet.arc.network"),
  // Codex 2026-05-13 B2 / Codex 2026-05-16 RPC burst rate root-cause handoff —
  // opsiyonel TX/READ split + multi-RPC fallback. Hiçbiri set değilse arcRpc
  // kullanılır (geriye dönük). agent-runner spawn anında bu env'leri geçiriyordu
  // (smoke-arc-8agent-usdc.ts L1126-1128); burada okumuyorduk → chains.ts
  // 17:19+17:47 koşumlarında dRPC direct endpoint'e burst atıp 429 yedi.
  // Şimdi chains.ts viem fallback transport'una besliyor.
  arcTxRpcUrl: process.env.ARC_TX_RPC_URL ?? null,
  arcReadRpcUrl: process.env.ARC_READ_RPC_URL ?? null,
  arcReadRpcUrls: (process.env.ARC_READ_RPC_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as string[],
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

  // arcent-poker — env-required.
  //
  // 2026-05-11 — Codex public-readiness audit P0-2 fix. Eski hardcoded
  // default'lar her redeploy'da geride kaldığı için (M6.A 2026-04-26 →
  // 6+ redeploy turu) env zorunlu hale getirildi. Caller (agent-runner
  // start-all.sh veya kullanıcı `.mcp.json`'u) güncel adresleri sağlamalı.
  // En son redeploy adresleri: arcent-poker/docs/DEPLOYMENT.md (2026-05-11
  // deep-audit refactor + USDC-only).
  //
  // POKER_RANDOMNESS_SYSTEM 2026-05-10 audit'inde legacy/'a taşındı
  // (Arc block.prevrandao = 0 → kullanılamaz, hiçbir sistem çağırmıyordu).
  pokerOrchestrator: env("POKER_ORCHESTRATOR") as `0x${string}`,
  pokerTable:        env("POKER_TABLE_SYSTEM") as `0x${string}`,
  pokerBet:          env("POKER_BET_SYSTEM")   as `0x${string}`,
  pokerShowdown:     env("POKER_SHOWDOWN_SYSTEM") as `0x${string}`,
  pokerDeal:         env("POKER_DEAL_SYSTEM")  as `0x${string}`,
  pokerDecrypt:      env("POKER_DECRYPT_SYSTEM") as `0x${string}`,

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

  // ZK decrypt artifacts (B3.7.C). elgamal_decrypt.circom — proves d = sk·c1
  // and pk = sk·G for a single share. Public signals (6): pk[2] + c1[2] + d[2].
  // Same prover backends (snarkjs / rapidsnark) work; circuit is small (~10K
  // constraints) so prove time is sub-second on either backend.
  zkDecryptZkey: env(
    "ZK_DECRYPT_ZKEY",
    "/home/vpsadmin/arcent-poker/packages/circuits/build/elgamal_decrypt_final.zkey",
  ),
  zkDecryptWasm: env(
    "ZK_DECRYPT_WASM",
    "/home/vpsadmin/arcent-poker/packages/circuits/build/elgamal_decrypt_js/elgamal_decrypt.wasm",
  ),
} as const;
