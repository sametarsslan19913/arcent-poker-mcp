# arcent

> First bridge with native MCP integration + cryptographic receipts for agent accountability.

Cross-chain USDC bridge between **Arc testnet** and **Base Sepolia**, speaking the Anthropic Model Context Protocol (MCP) natively and issuing EIP-712 typed-data receipts for every settlement.

## Status

**Phase 0 — Research, specification, scaffolding** (in progress).

See `docs/SPEC.md` for the authoritative specification (living document).
See `lexical-wondering-lynx.md` for the original roadmap.
Execution plan lives at `~/.claude/plans/bright-juggling-newell.md`.

## Components

| Dir | Purpose |
|---|---|
| `contracts/` | Solidity (Foundry). `IntentVault.sol` on Arc, `SettlementReactor.sol` on Base. |
| `relayer/` | TypeScript Node service. Event listener, attester, receipt generator. |
| `mcp-server/` | MCP TypeScript SDK server exposing 5 tools to Claude Code and compatible agents. |
| `example-agent/` | Reference agent demonstrating 24h autonomous operation. |
| `demos/` | Per-phase proof artifacts (tx hashes, receipts, videos). |
| `docs/` | Specifications, research notes, deployment records. |

## Core invariants

- **Stateless wallet model**: MCP server never holds private keys. It returns calldata + transaction parameters; the agent's wallet signs.
- **EIP-712 receipts**: Every settlement produces a typed-data signed receipt, verifiable on-chain and off-chain.
- **Testnet only** through all phases. No mainnet deployment.
- **USDC only**. No other tokens.
- **Arc ↔ Base only**. No additional chains in MVP.

## Progress tracking

Phase-stamped, not time-stamped. Each phase completes when its verification artifacts are produced and approved. Plan and memory are living documents, updated at every phase boundary.
