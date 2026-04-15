import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { agentRegisterHandler } from "./tools/agent_register.js";
import { agentReputationHandler } from "./tools/agent_reputation.js";
import { agentValidateHandler } from "./tools/agent_validate.js";
import { jobCreateHandler } from "./tools/job_create.js";
import { jobSetBudgetHandler, jobFundEscrowHandler } from "./tools/job_fund.js";
import { jobSubmitHandler } from "./tools/job_submit.js";
import { jobCompleteHandler } from "./tools/job_complete.js";
import { jobStatusHandler } from "./tools/job_status.js";
import { sendTokenHandler } from "./tools/send_token.js";
import { bridgeSendHandler } from "./tools/bridge_send.js";
import { balanceHandler } from "./tools/balance.js";
import { swapHandler } from "./tools/swap.js";

const server = new McpServer({
  name: "arc-agent-toolkit",
  version: "2.0.0",
});

// ═══════════════════════════════════════════
// ERC-8004: Agent Identity & Reputation
// ═══════════════════════════════════════════

server.tool(
  "agent_register",
  "Register an AI agent on-chain (ERC-8004). Mints an ERC-721 identity NFT. The caller becomes the agent owner.",
  {
    owner: z.string().describe("Owner wallet address (will sign the tx)"),
    metadataURI: z.string().describe("IPFS or HTTP URI pointing to agent metadata JSON"),
  },
  async (args) => agentRegisterHandler(args),
);

server.tool(
  "agent_reputation",
  "Give reputation feedback to an AI agent (ERC-8004). Agent owners cannot rate their own agents.",
  {
    action: z.enum(["give"]).describe("Action: 'give' to submit feedback"),
    agentId: z.string().describe("Agent token ID (from registration)"),
    reviewer: z.string().optional().describe("Reviewer wallet address (must differ from agent owner)"),
    score: z.number().optional().describe("Score (e.g. 0-100). Default: 100"),
    feedbackType: z.number().optional().describe("Feedback type (0=general). Default: 0"),
    tag: z.string().optional().describe("Tag for categorization (e.g. 'reliability'). Default: 'general'"),
    comment: z.string().optional().describe("Free-text comment about agent performance"),
  },
  async (args) => agentReputationHandler(args),
);

server.tool(
  "agent_validate",
  "Request or respond to agent validation (ERC-8004). Validators certify agent capabilities.",
  {
    action: z.enum(["request", "respond", "status"]).describe("Action: request validation, respond to request, or check status"),
    owner: z.string().optional().describe("Agent owner address (for 'request' action)"),
    validator: z.string().optional().describe("Validator address"),
    agentId: z.string().optional().describe("Agent token ID"),
    requestURI: z.string().optional().describe("URI describing what to validate"),
    requestHash: z.string().optional().describe("Request hash (for 'respond' and 'status')"),
    response: z.number().optional().describe("Validation response: 100=passed, 0=failed"),
    responseURI: z.string().optional().describe("URI with validation details"),
    tag: z.string().optional().describe("Validation category tag"),
  },
  async (args) => agentValidateHandler(args),
);

// ═══════════════════════════════════════════
// ERC-8183: Agentic Jobs
// ═══════════════════════════════════════════

server.tool(
  "job_create",
  "Create an agentic job (ERC-8183). Client posts a job, provider does the work, evaluator approves payment.",
  {
    client: z.string().describe("Client wallet (job creator, will sign tx)"),
    provider: z.string().describe("Provider wallet (who will do the work)"),
    evaluator: z.string().optional().describe("Evaluator wallet (defaults to client). Approves deliverables."),
    description: z.string().describe("Human-readable job description"),
    deadlineMinutes: z.number().optional().describe("Job deadline in minutes from now. Default: 1440 (24h). Min: 15, Max: 43200 (30d)."),
  },
  async (args) => jobCreateHandler(args),
);

server.tool(
  "job_set_budget",
  "Set the budget for a job (ERC-8183). Provider specifies how much USDC the job should pay.",
  {
    provider: z.string().describe("Provider wallet (must match job's provider)"),
    jobId: z.string().describe("Job ID (from job_create event)"),
    amountUsdc: z.string().describe("Budget amount in USDC (e.g. '10.00')"),
  },
  async (args) => jobSetBudgetHandler(args),
);

server.tool(
  "job_fund",
  "Fund a job's escrow (ERC-8183). Client deposits USDC into the contract. Returns approve + fund transactions.",
  {
    client: z.string().describe("Client wallet (must match job's client)"),
    jobId: z.string().describe("Job ID"),
  },
  async (args) => jobFundEscrowHandler(args),
);

server.tool(
  "job_submit",
  "Submit a deliverable for a job (ERC-8183). Provider submits a hash of their work.",
  {
    provider: z.string().describe("Provider wallet (must match job's provider)"),
    jobId: z.string().describe("Job ID"),
    deliverable: z.string().describe("Deliverable content or description (will be hashed on-chain)"),
  },
  async (args) => jobSubmitHandler(args),
);

server.tool(
  "job_complete",
  "Approve a job and release payment (ERC-8183). Evaluator confirms the deliverable and USDC flows to provider.",
  {
    evaluator: z.string().describe("Evaluator wallet (must match job's evaluator)"),
    jobId: z.string().describe("Job ID"),
    reason: z.string().optional().describe("Approval reason (will be hashed). Default: 'approved'"),
  },
  async (args) => jobCompleteHandler(args),
);

server.tool(
  "job_status",
  "Check the status of an agentic job (ERC-8183). Returns parties, budget, status, and deadline.",
  {
    jobId: z.string().describe("Job ID to query"),
  },
  async (args) => jobStatusHandler(args),
);

// ═══════════════════════════════════════════
// Payments: Send & Bridge
// ═══════════════════════════════════════════

server.tool(
  "send_token",
  "Send USDC, EURC, or USDT on-chain using Circle App Kit. Supports Arc Testnet + other EVM testnets.",
  {
    privateKey: z.string().describe("Sender wallet private key (0x-prefixed, 32 bytes). Signs the transfer."),
    to: z.string().describe("Recipient wallet address"),
    amount: z.string().describe("Amount to send (e.g. '5.00')"),
    token: z.enum(["USDC", "EURC", "USDT"]).optional().describe("Token to send. Default: USDC"),
    chain: z.string().optional().describe("Source chain. Default: Arc_Testnet. Also supports Ethereum_Sepolia, Base_Sepolia, Arbitrum_Sepolia, Avalanche_Fuji, Polygon_Amoy, Optimism_Sepolia"),
  },
  async (args) => sendTokenHandler(args),
);

server.tool(
  "bridge_send",
  "Bridge USDC across chains via Circle App Kit Bridge Kit (CCTP v2). Works in both directions: Arc ↔ other EVM chains.",
  {
    privateKey: z.string().describe("Wallet private key (0x-prefixed, 32 bytes). Signs both approve + burn."),
    amountUsdc: z.string().describe("Amount in USDC (e.g. '10.00')"),
    fromChain: z.string().optional().describe("Source chain. Default: Arc_Testnet"),
    toChain: z.string().describe("Destination chain: Arc_Testnet, Ethereum_Sepolia, Base_Sepolia, Arbitrum_Sepolia, Avalanche_Fuji, Polygon_Amoy, Optimism_Sepolia, Unichain_Sepolia"),
    speed: z.enum(["FAST", "SLOW"]).optional().describe("Transfer speed. FAST uses standard CCTP v2, SLOW is cheaper. Default: FAST"),
  },
  async (args) => bridgeSendHandler(args),
);

server.tool(
  "balance",
  "Check USDC and EURC balances for any wallet on Arc Testnet.",
  {
    address: z.string().describe("Wallet address to check"),
  },
  async (args) => balanceHandler(args),
);

server.tool(
  "swap",
  "Swap between USDC and EURC on Arc Testnet using Circle App Kit. Executes the swap on-chain and returns the tx hash.",
  {
    privateKey: z.string().describe("Wallet private key (0x-prefixed, 32 bytes). Signs the swap tx."),
    tokenIn: z.enum(["USDC", "EURC"]).describe("Token to swap from"),
    tokenOut: z.enum(["USDC", "EURC"]).describe("Token to swap to"),
    amountIn: z.string().describe("Amount to swap (e.g. '1.00')"),
    slippageBps: z.number().optional().describe("Max slippage in basis points. Default: 300 (3%)"),
  },
  async (args) => swapHandler(args),
);

// CRITICAL: Never console.log — corrupts JSON-RPC pipe
process.stderr.write("arc-agent-toolkit MCP server starting...\n");

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write("arc-agent-toolkit MCP server connected. 13 tools registered.\n");
