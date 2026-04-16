# Arcent Agent MCP

> **An MCP-native toolkit that turns AI agents into first-class participants in Arc's agent economy.** ERC-8004 identity, ERC-8183 jobs, Circle Nanopayments, CCTP bridge, StableFX swap — **17 tools in one server**.

> **Note:** **Not affiliated with [cutepawss/arcent](https://github.com/cutepawss/arcent) (x402 gateway) or U.S. Army Central.** Arcent Agent MCP is a separate project — the first MCP-native toolkit for Arc's agent economy.

> Built for the **[Agentic Economy on Arc Hackathon](https://lablab.ai/ai-hackathons/nano-payments-arc)** — Track 2: Agent-to-Agent Payment Loop.

---

## What Is This?

AI agents (Claude, Cursor, ChatGPT) can think but they can't act on a blockchain — no wallet, no contract calls, no payment rails. We wrap **Arc's agent economy infrastructure** in 17 MCP tools so any AI client can:

- **Have an identity** on-chain (ERC-8004 NFT)
- **Hire other agents** with escrow-protected jobs (ERC-8183)
- **Pay sub-cent prices** for paywalled APIs (Circle Nanopayments + x402)
- **Move USDC across chains** (CCTP v2)
- **Swap USDC ↔ EURC** (Circle StableFX)

Just talk to your AI:

```
"Register my agent on Arc"                         → agent_register
"Create a job, 10 USDC, escrowed"                  → job_create + job_fund
"Reject this submission, refund my escrow"         → job_reject + job_claim_refund
"Deposit 1 USDC into Gateway, then pay this API"   → nano_deposit + nano_pay
"Bridge 100 USDC to Base Sepolia"                  → bridge_send
"Swap 5 USDC to EURC"                              → swap
```

No frontend. No SDK glue. Just Claude Desktop config + your private key.

---

## The 17 Tools

### Agent Identity — ERC-8004 (3)

| Tool | Purpose |
|---|---|
| `agent_register` | Mint an ERC-721 identity NFT for your AI agent |
| `agent_reputation` | Give/query reputation feedback (self-rating blocked) |
| `agent_validate` | Request/respond to validator certifications |

### Agentic Jobs — ERC-8183 (8)

| Tool | Purpose |
|---|---|
| `job_create` | Open a job: client, provider, evaluator, deadline |
| `job_set_budget` | Provider proposes USDC compensation |
| `job_fund` | Client escrows USDC into the contract |
| `job_submit` | Provider submits deliverable hash |
| `job_complete` | Evaluator approves → USDC released |
| `job_reject` | Evaluator rejects substandard work |
| `job_claim_refund` | Client recovers escrow (after reject or expiry) |
| `job_status` | Query job state, parties, budget |

### Payments — Circle App Kit + direct (4)

| Tool | Purpose | SDK |
|---|---|---|
| `send_token` | Transfer USDC / EURC / USDT on Arc + 6 testnets | `AppKit.send()` |
| `swap` | USDC ↔ EURC via StableFX | `SwapKit.swap()` |
| `bridge_send` | USDC across chains via CCTP v2 (bidirectional) | `AppKit.bridge()` |
| `balance` | USDC + EURC balance for any wallet | direct RPC |

### Nanopayments — Circle Gateway + x402 (2)

| Tool | Purpose | SDK |
|---|---|---|
| `nano_deposit` | One-time USDC deposit into Gateway Wallet | `@circle-fin/x402-batching` |
| `nano_pay` | Pay an x402-paywalled URL (gasless, sub-cent) | `@circle-fin/x402-batching` |

---

## Why These Standards?

The agent economy is being shaped by three official, public standards. **None are proprietary to Arc** — Arc adopted and deployed them.

### ERC-8004 — Trustless Agents
Authors: Davide Crapis (Ethereum Foundation dAI), Marco De Rossi (MetaMask), Jordan Ellis (Google), Erik Reppel (Coinbase). Reviewed by 100+ companies. [Spec →](https://eips.ethereum.org/EIPS/eip-8004)

Three registries:
- **IdentityRegistry** — every agent gets an ERC-721 NFT identity
- **ReputationRegistry** — peer feedback, on-chain scoring
- **ValidationRegistry** — third-party validators certify capabilities

### ERC-8183 — Agentic Commerce
Authors: Davide Crapis (EF dAI), Bryan Lim, Tay Weixiong, Chooi Zuhwa (Virtuals Protocol). [Spec →](https://eips.ethereum.org/EIPS/eip-8183)

A 6-state escrow lifecycle for AI-to-AI work contracts: `Open → Funded → Submitted → Completed | Rejected | Expired`. Money is locked before work begins, released only on approval, recoverable on dispute.

### Circle Nanopayments + x402
Gas-free USDC transfers as small as **$0.000001** (one millionth of a dollar). Built on Circle's Gateway: one on-chain deposit, then unlimited off-chain signed authorizations batched periodically. [Blog →](https://www.circle.com/blog/circle-nanopayments-launches-on-testnet-as-the-core-primitive-for-agentic-economic-activity)

The x402 protocol (HTTP 402 Payment Required) lets any API charge per-call. Combined with Gateway batching, sub-cent API pricing finally works.

---

## Real Scenarios

### Scenario 1 — Premium Data API (Hackathon Demo)

Two agents on Arc, no humans involved:

```
Buyer AI                           Seller (Circle reference demo)
   │                                       │
   ├── nano_deposit("1 USDC") ──→ Gateway Wallet (one tx, ~5¢ gas)
   │                                       │
   ├── nano_pay(/api/quote)    ──→ 402 + signed authorization → 200 OK + data ($0.001)
   ├── nano_pay(/api/dataset)  ──→ ($0.01)
   ├── nano_pay(/api/compute)  ──→ ($0.0003)
   ├── ... × 50 calls ...
   │
   └── Total: ~$0.25 spent, 1 on-chain tx for gas
       Traditional CCTP per-call: $0.30+ gas EACH → 50× = $15+ → unviable
```

The **margin difference** ($15 vs $0.05 in gas) is the entire point of nanopayments.

### Scenario 2 — Translation Marketplace

Your AI hires three other AIs to translate one document into ten languages:

```
Your AI                Translator AI #1     #2     #3
   │                          │              │      │
   agent_register  ─────→  has identity, has reputation
   job_create($50, "translate to 10 languages")
   job_fund($50)  ─────→  escrowed
                              │
                          job_submit(hash)
                              │
   job_complete  ─────→  $50 released, distributed
   agent_reputation(+5, "fast and accurate")
```

If the translation is bad: `job_reject` → `job_claim_refund` → your $50 comes back.

### Scenario 3 — NFT Trading Curator

```
Your AI Curator          Seller AI
   │                          │
   balance ──────→  500 USDC available
   agent_reputation(seller) → 4.9★, 47 prior sales
   job_create("buy NFT #1234, $50")
   job_fund($50) ──→ escrow
                              │
                          NFT transferred to your wallet
                          job_submit(tx_hash)
   job_complete  ──→ $50 to seller
   swap($50 USDC → $40 EURC)  (you wanted EUR)
   bridge_send($40 EURC → Base Sepolia)  (you wanted Base)
```

Single conversation. Multiple chains. No human clicks.

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/arcent-agent-mcp.git
cd arcent-agent-mcp/mcp-server
npm install
npm run build
```

### 2. Configure environment

```bash
cp .mcp.json.example .mcp.json
# Edit .mcp.json — add your KIT_KEY (from Circle Console)
```

### 3. Add to Claude Desktop

In your Claude Desktop config:

```json
{
  "mcpServers": {
    "arc-agent-toolkit": {
      "command": "npx",
      "args": ["tsx", "mcp-server/src/index.ts"],
      "cwd": "/path/to/arcent-agent-mcp",
      "env": {
        "ARC_RPC": "https://rpc.testnet.arc.network",
        "KIT_KEY": "KIT_KEY:<keyId>:<keySecret>"
      }
    }
  }
}
```

### 4. Talk to Claude

> "Register an AI agent for me on Arc"
> "Deposit 1 USDC into Gateway, then pay http://localhost:3000/api/quote"
> "Check the status of job #42"

Need testnet USDC? [Circle faucet](https://faucet.circle.com).

---

## Architecture

```
Claude / Cursor / any MCP client
              │
              ▼
   arcent-agent-mcp (this repo)
   ├── 13 stateless tools  → return unsigned tx, wallet signs
   └── 4 stateful tools    → SDK signs directly (privateKey arg)
              │
              ▼
              Arc Testnet (chainId 5042002)
              ├── ERC-8004 contracts (0x8004...)
              ├── ERC-8183 contract (0x0747EE...)
              ├── Circle Gateway (0x0077777d... + 0x0022222A...)
              ├── CCTP v2 (0x8FE6B9...)
              └── USDC + EURC
```

**Hybrid pattern by design:** Where SDK abstraction helps (`swap`, `bridge_send`, `send_token`, `nano_pay`), we wrap official Circle SDKs. Where direct contract calls are cleaner (all `agent_*` and `job_*` tools), we use viem to return unsigned transactions for the wallet to sign.

---

## Contract Addresses (Arc Testnet)

| Contract | Address |
|---|---|
| USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| ERC-8183 (Agentic Jobs) | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| IdentityRegistry (ERC-8004) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry (ERC-8004) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry (ERC-8004) | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| Gateway Wallet (Circle Nanopayments) | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| Gateway Minter (Circle Nanopayments) | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| CCTP TokenMessenger v2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| FxEscrow (StableFX) | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

---

## Tech Stack

- **TypeScript** + [MCP SDK](https://github.com/modelcontextprotocol/sdk) + [viem](https://viem.sh) + [Zod](https://zod.dev)
- **Arc Testnet** — Circle's EVM-compatible L1 with USDC-native gas
- **Circle App Kits** — `@circle-fin/app-kit`, `@circle-fin/swap-kit` for Bridge/Swap/Send
- **Circle Nanopayments SDK** — `@circle-fin/x402-batching` for gasless x402 payments
- **CCTP v2** — Circle's cross-chain transfer protocol

---

## Testing

End-to-end verification artifacts live in `demos/`:

| Test | Result | Artifact |
|---|---|---|
| Clean nano_pay run | **300/300** settled, 0 failures | `demos/nano-e2e.json` |
| Edge-case probes (parallel/burst/hammer/cheap/bad-URL/re-init) | **85/88** settled (3 bad-URL gracefully failed, no charge) | `demos/nano-probes.json` |
| **Hardened 1K stress test** | **1000/1000 settled**, 0 fail, 0 dup, reconciliation MATCH ✓ | `demos/nano-1k-stress.json` |
| Escrow reject + auto-refund | Verified on Arc testnet | `demos/safety-e2e.json` |
| MCP live invocation | `nano_deposit` + `nano_pay` called from Claude Desktop | `demos/mcp-live-test.json` |
| App Kit send/bridge/swap | E2E on Arc + cross-chain to Base Sepolia | `demos/appkit-e2e.json`, `demos/swap-e2e.json` |

**Cumulative:** **1,385 nano_pay calls executed**, all clean settlements (100% on clean + hardened, 3 probe bad-URLs gracefully rejected with zero charge) — **27× the 50-call hackathon minimum**. Latency on 1K run: p50=360ms, p95=425ms, p99=513ms. Total gas: **$0.008155 across 3 deposits** ≈ **36,787× cheaper than traditional CCTP per-call ($300+ for 1000 calls)**.

**On-chain verification (1K stress deposits, Arc Testnet):**
- Initial deposit (call 0): [`0xd118d4ac...e618e`](https://testnet.arcscan.app/tx/0xd118d4acf9f263316aa0be822e0f84d19c6cae415838c3e1eb67457aae1e618e)
- Preemptive top-up (call 451): [`0xc2daf47c...c4fae1`](https://testnet.arcscan.app/tx/0xc2daf47c9d78beb29e1cc7e15fc1f2f356e0672673095bb87e4ff04281c4fae1)
- Preemptive top-up (call 951): [`0x207a681c...26eaff`](https://testnet.arcscan.app/tx/0x207a681c6b8c7071ea7c88d4935becc250dd691e8566ba39cb8376ec1226eaff)

Buyer wallet: `0x29C2F998B325053F2e81532b5e3a44dac7A84978` · Seller wallet: `0xafEEfe92766Dfb27916f7fc853992012934f291c`. All 1,000 individual nano_pay settlements are in `demos/nano-1k-stress.json`.

---

## Project Evolution

This project started in a different direction. The first iteration was a custom cross-chain bridge — IntentVault and SettlementReactor contracts, an SP1 ZK prover for storage proof verification, end-to-end tested on Base Sepolia. Solid engineering, no audience: Circle's CCTP v2 already solved the same problem better.

The pivot came after reading Arc's adoption of two emerging Ethereum standards — ERC-8004 (Trustless Agents) and ERC-8183 (Agentic Commerce) — both authored by the Ethereum Foundation's dAI team alongside MetaMask, Google, Coinbase, and Virtuals Protocol. **Standards existed, but no MCP toolkit wrapped them for AI agents.** That gap became Arcent Agent MCP.

Old custom-bridge code is preserved at git tag `v1.0-custom-bridge` for reference.

---

## Hackathon

This repo is the submission for the **Agentic Economy on Arc Hackathon** ([lablab.ai](https://lablab.ai/ai-hackathons/nano-payments-arc)) — Track 2: Agent-to-Agent Payment Loop. The demo scenario above ($0.25 in 50 nanopayments vs $15 in gas) is the live submission demo.

Team: `0xarcent`. Solo build.

---

## Resources

- [Arc Docs](https://docs.arc.network) · [Arc Community](https://community.arc.network) · [Arc Explorer](https://testnet.arcscan.app)
- [ERC-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004) · [ERC-8183 Spec](https://eips.ethereum.org/EIPS/eip-8183)
- [Circle Nanopayments Blog](https://www.circle.com/blog/circle-nanopayments-launches-on-testnet-as-the-core-primitive-for-agentic-economic-activity)
- [Circle Gateway Docs](https://developers.circle.com/gateway)
- [Circle Faucet (testnet USDC)](https://faucet.circle.com)
- [Reference seller demo](https://github.com/circlefin/arc-nanopayments) — used in our Track 2 demo

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Samet Arslan (arcent)
