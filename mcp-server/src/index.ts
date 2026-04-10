import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bridgeQuoteHandler } from "./tools/bridge_quote.js";
import { bridgeSendHandler } from "./tools/bridge_send.js";
import { bridgeStatusHandler } from "./tools/bridge_status.js";
import { bridgeReceiptHandler } from "./tools/bridge_receipt.js";
import { bridgeCancelHandler } from "./tools/bridge_cancel.js";

const server = new McpServer({
  name: "arcent-bridge",
  version: "1.0.0",
});

// bridge_quote
server.tool(
  "bridge_quote",
  "Get a quote for bridging USDC from Arc to Base Sepolia. Returns estimated output, fees, and an intent template.",
  {
    srcChainId: z.number().describe("Source chain ID (5042002 for Arc)"),
    dstChainId: z.number().describe("Destination chain ID (84532 for Base Sepolia)"),
    amountIn: z.string().describe("Amount in 18-decimals (Arc WUSDC), as string"),
    recipient: z.string().describe("Recipient address on destination chain"),
  },
  async (args) => bridgeQuoteHandler(args),
);

// bridge_send
server.tool(
  "bridge_send",
  "Build an unsigned tx to create a bridge intent. The agent's wallet signs. This tool never holds keys.",
  {
    maker: z.string().describe("Maker address (wallet that will sign)"),
    srcChainId: z.number().describe("Source chain ID"),
    dstChainId: z.number().describe("Destination chain ID"),
    amountIn: z.string().describe("Amount in 18-decimals"),
    recipient: z.string().describe("Recipient on destination chain"),
    minAmountOut: z.string().optional().describe("Min output in 6-decimals (optional)"),
    deadline: z.number().optional().describe("Unix timestamp deadline (optional)"),
    salt: z.string().optional().describe("32-byte hex salt (optional)"),
  },
  async (args) => bridgeSendHandler(args),
);

// bridge_status
server.tool(
  "bridge_status",
  "Check bridge intent status: pending, filled, expired, or refunded.",
  {
    intentId: z.string().describe("Intent ID (bytes32 hex)"),
  },
  async (args) => bridgeStatusHandler(args),
);

// bridge_receipt
server.tool(
  "bridge_receipt",
  "Retrieve the EIP-712 signed receipt for a filled bridge intent.",
  {
    intentId: z.string().describe("Intent ID (bytes32 hex)"),
  },
  async (args) => bridgeReceiptHandler(args),
);

// bridge_cancel
server.tool(
  "bridge_cancel",
  "Build an unsigned tx to cancel (refund) an expired intent. Only maker can cancel after deadline.",
  {
    maker: z.string().describe("Maker address (must match intent creator)"),
    intentId: z.string().describe("Intent ID to cancel"),
  },
  async (args) => bridgeCancelHandler(args),
);

// CRITICAL: Never console.log — corrupts JSON-RPC pipe
process.stderr.write("arcent MCP server starting...\n");

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write("arcent MCP server connected.\n");
