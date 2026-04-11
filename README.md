# Arc Agent Toolkit

> The first MCP-native toolkit for Arc's agent economy — AI agents can register identity, create jobs, escrow payments, and bridge USDC, all through natural language.

**11 MCP tools** that connect Claude (and any MCP-compatible AI) to Arc Testnet's on-chain agent infrastructure: **ERC-8183** agentic jobs, **ERC-8004** agent identity, **CCTP v2** cross-chain bridge, and USDC payments.

## What Can an AI Agent Do?

```
"Register my agent on Arc"              → agent_register (ERC-8004 identity NFT)
"Create a job for 10 USDC"              → job_create + job_fund (ERC-8183 escrow)
"Submit the deliverable"                → job_submit (hash on-chain)
"Approve and release payment"           → job_complete (USDC to provider)
"Send 5 USDC to 0xABC..."              → send_usdc (ERC-20 transfer)
"Bridge 100 USDC to Base Sepolia"       → bridge_send (CCTP v2 burn/mint)
"Check agent reputation"                → agent_reputation (on-chain scoring)
```

No frontend needed. No SDK integration. Just talk to Claude.

## Tools

### Agent Identity (ERC-8004)
| Tool | What it does |
|---|---|
| `agent_register` | Mint an ERC-721 identity NFT for your AI agent |
| `agent_reputation` | Give/query reputation feedback (self-rating blocked) |
| `agent_validate` | Request/respond to validator certifications |

### Agentic Jobs (ERC-8183)
| Tool | What it does |
|---|---|
| `job_create` | Create a job: client, provider, evaluator, deadline |
| `job_set_budget` | Provider sets the USDC compensation |
| `job_fund` | Client escrows USDC into the contract |
| `job_submit` | Provider submits deliverable hash |
| `job_complete` | Evaluator approves, USDC released to provider |
| `job_status` | Query job state, parties, budget |

### Payments
| Tool | What it does |
|---|---|
| `send_usdc` | Transfer USDC between wallets on Arc |
| `bridge_send` | Bridge USDC to other chains via CCTP v2 |

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/anthropics/arcent.git
cd arcent/mcp-server
npm install
```

### 2. Configure Claude Code

Add to your `.mcp.json` (or it's already included):

```json
{
  "mcpServers": {
    "arc-agent-toolkit": {
      "command": "npx",
      "args": ["tsx", "mcp-server/src/index.ts"],
      "cwd": "/path/to/arcent",
      "env": {
        "ARC_RPC": "https://rpc.testnet.arc.network"
      }
    }
  }
}
```

### 3. Use It

Open Claude Code and start talking:

> "Register an AI agent with metadata URI ipfs://..."
> "Create a job for provider 0xABC... with description 'analyze market data'"
> "Check the status of job #42"

## Architecture

```
Claude Code ──MCP──> arc-agent-toolkit ──RPC──> Arc Testnet
                          │
                          ├── ERC-8004 (Identity)
                          ├── ERC-8183 (Jobs + Escrow)
                          ├── CCTP v2 (Bridge)
                          └── USDC (Payments)
```

**Key design:** Stateless MCP server. Never holds private keys. Returns unsigned transactions for the wallet to sign.

## Contract Addresses (Arc Testnet)

| Contract | Address |
|---|---|
| USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| ERC-8183 (Jobs) | `0x0747EEf0706327138c69792bF28Cd525089e4583` |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| CCTP TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |

## Tech Stack

- **TypeScript** + [MCP SDK](https://github.com/modelcontextprotocol/sdk) + [viem](https://viem.sh) + [Zod](https://zod.dev)
- **Arc Testnet** — Circle's EVM-compatible L1 with USDC-native gas
- **ERC-8183** — Agentic job standard (escrow, deliverables, settlement)
- **ERC-8004** — Agent identity & reputation (ERC-721 based)
- **CCTP v2** — Circle's cross-chain transfer protocol

## Resources

- [Arc Docs](https://docs.arc.network)
- [Arc Community](https://community.arc.network)
- [ERC-8183 Tutorial](https://docs.arc.network/arc/tutorials/create-your-first-erc-8183-job)
- [ERC-8004 Tutorial](https://docs.arc.network/arc/tutorials/register-your-first-ai-agent)
- [Testnet Faucet](https://faucet.circle.com)
- [Arc Explorer](https://testnet.arcscan.app)

## License

MIT
