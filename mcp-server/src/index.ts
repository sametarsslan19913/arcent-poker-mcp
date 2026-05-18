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
import { jobRejectHandler } from "./tools/job_reject.js";
import { jobClaimRefundHandler } from "./tools/job_claim_refund.js";
import { jobStatusHandler } from "./tools/job_status.js";
import { sendTokenHandler } from "./tools/send_token.js";
import { bridgeSendHandler } from "./tools/bridge_send.js";
import { balanceHandler } from "./tools/balance.js";
import { nanoDepositHandler } from "./tools/nano_deposit.js";
import { nanoPayHandler } from "./tools/nano_pay.js";

// arcent-poker tools (M6.B 2026-04-26).
import { pokerCreateTournamentHandler } from "./tools/poker_create_tournament.js";
import { pokerRegisterForTournamentHandler } from "./tools/poker_register_for_tournament.js";
import { pokerStartTournamentHandler } from "./tools/poker_start_tournament.js";
import { pokerFinalizeTournamentHandler } from "./tools/poker_finalize_tournament.js";
import { pokerJoinTableHandler } from "./tools/poker_join_table.js";
import { pokerActionHandler } from "./tools/poker_action.js";
import { pokerTableStateHandler } from "./tools/poker_table_state.js";
import { pokerTournamentStateHandler } from "./tools/poker_tournament_state.js";
import { pokerShuffleProveHandler } from "./tools/poker_shuffle_prove.js";
import { pokerPublishSessionPkHandler } from "./tools/poker_publish_session_pk.js";
import { pokerHandStartHandler } from "./tools/poker_hand_start.js";
import { pokerDecryptShareHandler } from "./tools/poker_decrypt_share.js";
import { pokerDecryptBatchHandler } from "./tools/poker_decrypt_batch.js";
import { pokerRecoverCardHandler } from "./tools/poker_recover_card.js";
import { pokerRoundStatusHandler } from "./tools/poker_round_status.js";
import { pokerAdvancePhaseHandler } from "./tools/poker_advance_phase.js";
// 2026-05-11 — P0-4 son kullanici akisi tool'lari (Codex public-readiness audit).
import { pokerClaimPayoutHandler } from "./tools/poker_claim_payout.js";
import { pokerClaimRefundHandler } from "./tools/poker_claim_refund.js";
import { pokerWithdrawPendingDepositHandler } from "./tools/poker_withdraw_pending_deposit.js";

const server = new McpServer({
  name: "arcent-poker-mcp",
  version: "0.1.0",
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
  "job_reject",
  "Reject a job's deliverable (ERC-8183). Evaluator rejects substandard work. Job transitions to Rejected state and the contract AUTOMATICALLY refunds escrowed USDC to the client (no separate claimRefund call needed). Verified on Arc testnet: reject tx returns escrow to client wallet within the same block.",
  {
    evaluator: z.string().describe("Evaluator wallet (must match job's evaluator)"),
    jobId: z.string().describe("Job ID"),
    reason: z.string().optional().describe("Rejection reason (will be hashed). Default: 'rejected: deliverable does not meet criteria'"),
  },
  async (args) => jobRejectHandler(args),
);

server.tool(
  "job_claim_refund",
  "Reclaim escrowed USDC from an EXPIRED job (ERC-8183). Use only when a job passed its expiredAt deadline and funds are still locked. Bypasses hooks per EIP-8183 spec — guaranteed recovery path after expiry. For Rejected jobs, refund is automatic via job_reject (no need to call this).",
  {
    client: z.string().describe("Client wallet (must match job's client)"),
    jobId: z.string().describe("Job ID (must be in Expired state)"),
  },
  async (args) => jobClaimRefundHandler(args),
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
    chain: z.string().optional().describe("Source chain. Default: Arc_Testnet. Also supports Ethereum_Sepolia, Base_Sepolia, Arbitrum_Sepolia, Avalanche_Fuji, Optimism_Sepolia"),
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
    toChain: z.string().describe("Destination chain: Arc_Testnet, Ethereum_Sepolia, Base_Sepolia, Arbitrum_Sepolia, Avalanche_Fuji, Optimism_Sepolia, Unichain_Sepolia"),
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

// ═══════════════════════════════════════════
// Nanopayments (Circle Gateway + x402)
// ═══════════════════════════════════════════

server.tool(
  "nano_deposit",
  "Deposit USDC into Circle Gateway Wallet for gasless x402 nanopayments. After this one-time gas cost, all subsequent nano_pay calls settle off-chain (batched). PK is read from PLAYER_PK env on the MCP server — do NOT pass any private key in the tool call.",
  {
    amountUsdc: z.string().describe("USDC amount to deposit (e.g. '1.00'). This is one-time funding for the Gateway buffer."),
    chain: z.string().optional().describe("Chain name. Default: arcTestnet. Other supported testnets: baseSepolia, ethereumSepolia, arbitrumSepolia, avalancheFuji, optimismSepolia, polygonAmoy, etc."),
  },
  async (args) => nanoDepositHandler(args),
);

server.tool(
  "nano_pay",
  "Pay an x402-protected resource using Circle Gateway nanopayments. Handles 402 challenge automatically: parses requirements, signs EIP-3009 authorization, retries with X-Payment header. Gasless and sub-cent. PK is read from PLAYER_PK env on the MCP server — do NOT pass any private key in the tool call.",
  {
    url: z.string().describe("URL of the x402-paywalled resource (full http(s) URL)"),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().describe("HTTP method. Default: GET"),
    body: z.any().optional().describe("Request body (for POST/PUT)"),
    chain: z.string().optional().describe("Chain name. Default: arcTestnet"),
  },
  async (args) => nanoPayHandler(args),
);

// ═══════════════════════════════════════════
// arcent-poker (Texas Hold'em on Arc, M6.B)
// ═══════════════════════════════════════════

server.tool(
  "poker_create_tournament",
  "Create a new arcent-poker tournament. tournamentId is derived from `name` via keccak256. Defaults: entryFee 1 USDC, 50/30/20 payout, +30/+10/0 reputation deltas.",
  {
    admin: z.string().describe("Admin wallet (will sign + organize)"),
    name: z.string().describe("Tournament name; deterministic id = keccak256(utf8(name))"),
    entryFeeUsdc: z.string().optional().describe("Entry fee in USDC (default '1.00')"),
    minPlayers: z.number().optional().describe("Minimum players to start (default 2)"),
    maxPlayers: z.number().optional().describe("Maximum players (default 8, hard cap 9)"),
    payoutBps: z.array(z.number()).optional().describe("Payout distribution in basis points (must sum to 10000). Default [5000,3000,2000]."),
    reputationDelta: z.array(z.number()).optional().describe("Per-rank reputation delta. Default [30,10,0]. Must match payoutBps length."),
  },
  async (args) => pokerCreateTournamentHandler(args),
);

server.tool(
  "poker_register_for_tournament",
  "Register an agent for a tournament. Returns 2 unsigned txs: USDC.approve + Orchestrator.register. Sign in order.",
  {
    player: z.string().describe("Player wallet (agent owner). Must equal IdentityRegistry.ownerOf(agentId)."),
    tournamentId: z.string().describe("Tournament id (32-byte hex)"),
    agentId: z.string().describe("ERC-8004 agent token id (numeric string)"),
    entryFeeUsdc: z.string().optional().describe("Entry fee in USDC (must match tournament config; default '1.00')"),
  },
  async (args) => pokerRegisterForTournamentHandler(args),
);

server.tool(
  "poker_start_tournament",
  "Start a tournament (admin only). Phase Registering → Running. minPlayers must be met.",
  {
    admin: z.string().describe("Admin wallet (must match tournament's admin)"),
    tournamentId: z.string().describe("Tournament id"),
  },
  async (args) => pokerStartTournamentHandler(args),
);

server.tool(
  "poker_finalize_tournament",
  "Finalize a running tournament with a ranking (admin only). Distributes pot per payoutBps, emits ReputationDelta events.",
  {
    admin: z.string().describe("Admin wallet"),
    tournamentId: z.string().describe("Tournament id"),
    ranking: z.array(z.string()).describe("Agent ids in finishing order (1st,2nd,3rd...). Length must match payoutBps."),
  },
  async (args) => pokerFinalizeTournamentHandler(args),
);

server.tool(
  "poker_join_table",
  "Take a seat at a poker table. Buy-in is in chips (separate from USDC entry fee — chips are the in-tournament unit).",
  {
    player: z.string().describe("Player wallet"),
    tableId: z.string().describe("Table id (32-byte hex)"),
    seatIdx: z.number().describe("Seat slot 0..8"),
    agentId: z.string().describe("ERC-8004 agent token id (numeric string)"),
    buyInChips: z.string().describe("Initial chip stack (numeric string)"),
  },
  async (args) => pokerJoinTableHandler(args),
);

server.tool(
  "poker_action",
  "Submit a betting action: fold, check, call, or raise. There is no separate allin action; call/raise can consume the remaining stack and BetSystem marks the seat all-in. For raise, amount is the new ABSOLUTE round-level high bet target. For fold/check/call amount must be 0 — the contract derives the call amount from RoundState.currentBet - your seat.currentBet.",
  {
    player: z.string().describe("Player wallet (must match the seat's player at TableSystem.currentActor)"),
    tableId: z.string().describe("Table id"),
    action: z.enum(["fold", "check", "call", "raise"]).describe("Action label"),
    amount: z.string().optional().describe("Numeric string. Required (>0) for raise = new ABSOLUTE round high bet target. Must be 0 (or omitted) for fold/check/call."),
  },
  async (args) => pokerActionHandler(args),
);

server.tool(
  "poker_table_state",
  "Read live table state: seats (player, agentId, chips, contributions, folded), table (currentActor, phaseName, handNumber, blinds), activeSeats (kanonik in-hand non-folded seat list), round (currentPlayerSeat = TableSystem.currentActor, highBet = RoundState.currentBet, minRaiseAmount = RoundState.minRaise, roundComplete, lastAggressor, actedBitmap). Optional `minBlock` (decimal string) reads after head reaches that block — set to last write tx receipt.blockNumber for read-after-write consistency (Codex 2026-05-17 R-F3.12 mitigation).",
  {
    tableId: z.string().describe("Table id"),
    maxSeats: z.number().optional().describe("Number of seat slots to inspect (default 8)"),
    minBlock: z.string().optional().describe("Decimal string — wait until all read RPCs reach >= this block (read-after-write barrier; use receipt.blockNumber from prior write)"),
    quorumK: z.number().int().optional().describe("k-of-n quorum size (default ENV ARC_MCP_QUORUM_K, min(2,N))"),
  },
  async (args) => pokerTableStateHandler(args),
);

server.tool(
  "poker_tournament_state",
  "Read tournament state: admin, token, entryFee, min/max/registered players, phase (Draft/Registering/Running/Finalized/Cancelled), roster.",
  {
    tournamentId: z.string().describe("Tournament id"),
  },
  async (args) => pokerTournamentStateHandler(args),
);

server.tool(
  "poker_publish_session_pk",
  "Publish your per-hand BabyJubJub session pk_i to DealSystem so the joint pk = Σ pk_i can be assembled (real mental-poker pattern, no single-admin trust). Each seated agent calls this ONCE per hand BEFORE initDeal. The supplied `seed` derives your sk_i locally — keep it: you'll need the same seed in poker_decrypt_share to compute your decrypt share for hole/community cards. Returns the derived pk + an unsignedTx for the agent to broadcast.",
  {
    tableId: z.string().describe("32-byte hex tableId"),
    seed: z.string().describe("256-bit hex seed (your per-hand secret). Pick deterministically (HKDF(walletSk, tableId||handNumber)) or via CSPRNG and store locally for the duration of the hand."),
  },
  async (args) => pokerPublishSessionPkHandler(args),
);

server.tool(
  "poker_hand_start",
  "Coordinator-side hand bootstrap. Reads all published session pks from DealSystem, sums them on BabyJubJub off-chain to get the joint pk, builds the canonical initial 52-card deck encrypted under the joint pk, and returns an unsignedTx for DealSystem.initDeal. Set `withStartHand: true` to also receive a TableSystem.startHand unsignedTx (caller must be admin or authorized system on the table). Run AFTER all seated agents have called poker_publish_session_pk for this hand. Other agents will independently re-verify the joint pk before submitting their shuffle. Optional `minBlock` (decimal string) reads after head reaches that block — set to LAST publishSessionPk receipt.blockNumber for read-after-write consistency (R-F3.12 mitigation, Codex 2026-05-17 mainnet strategy).",
  {
    tableId: z.string().describe("32-byte hex tableId"),
    withStartHand: z.boolean().optional().describe("If true, also returns TableSystem.startHand unsignedTx as `unsignedTxStartHand`."),
    minPks: z.number().int().optional().describe("Minimum number of published pks before assembling joint pk (default 2)."),
    minBlock: z.string().optional().describe("Decimal string — wait until all read RPCs reach >= this block (read-after-write barrier; use receipt.blockNumber from last publishSessionPk write)"),
    quorumK: z.number().int().optional().describe("k-of-n quorum size (default ENV ARC_MCP_QUORUM_K, min(2,N))"),
  },
  async (args) => pokerHandStartHandler(args),
);

server.tool(
  "poker_shuffle_prove",
  // Tool description tells the LLM brain when to use this; semantics matter.
  "Generate the agent's encrypted shuffle proof for the current hand. Reads on-chain deck state from DealSystem, picks fresh randomness (permutation σ + per-card r[]), computes re-encrypted output ciphertexts, runs Groth16 proof (snarkjs ~20 s — slow), and returns an unsignedTx that the agent must broadcast. Each agent calls this once per hand in the seating order; the chain advances the deck after each accepted submitShuffle. Call ONLY when it is your turn in the shuffle round and DealSystem.shuffleRound matches your expected order. Pass expectedRound to reject stale deck snapshots before proof generation. Optional `seed` makes the proof deterministic (smoke tests only — production must omit for CSPRNG).",
  {
    tableId: z.string().describe("32-byte hex tableId"),
    seed: z
      .string()
      .optional()
      .describe(
        "Optional 256-bit hex seed for deterministic permutation. OMIT in production — CSPRNG is used by default.",
      ),
    expectedRound: z.number().int().optional().describe("Optional DealSystem.shuffleRound expected for this agent. The tool waits briefly and refuses stale deck snapshots."),
  },
  async (args) => pokerShuffleProveHandler(args),
);

server.tool(
  "poker_decrypt_share",
  "Compute and submit your partial decryption share for one card. Pass the SAME `seed` you used in poker_publish_session_pk earlier this hand (so the derived sk_i matches the published pk_i). The tool reads (c1, c2) from DealSystem, computes d = sk_i · c1 on BabyJubJub, generates a Groth16 DLEQ proof binding (pk_i, c1, d), and returns an unsignedTx for DecryptSystem.submitPartialDecryptShare. Hole-card owners must NOT call this for their own card during normal play — submission would revert (HoleOwnerCannotSubmit). Burn / unused slots are also rejected. Once threshold (N-1 hole, N community) is met, RevealReady fires; use poker_recover_card to assemble the plaintext. SHOWDOWN MODE — pass `forShowdown: true` (only valid while table is in Phase.Showdown) to route the share to DecryptSystem.submitOwnerShareForShowdown so the owner can reveal their own card on-chain for ShowdownInvoker.",
  {
    tableId: z.string().describe("32-byte hex tableId"),
    cardIdx: z.number().int().describe("Deck slot 0..51"),
    seed: z.string().describe("256-bit hex seed — the same value passed to poker_publish_session_pk this hand"),
    agentAddress: z.string().optional().describe("Optional agent wallet address — used only for an early local hole-owner check (the contract enforces it regardless)."),
    forShowdown: z.boolean().optional().describe("Owner showdown reveal — routes to submitOwnerShareForShowdown and bypasses the hole-owner short-circuit. Only valid during Phase.Showdown; default false."),
  },
  async (args) => pokerDecryptShareHandler(args),
);

server.tool(
  "poker_decrypt_batch",
  "Compute several partial decryption shares for the same agent and return one unsignedTx for DecryptSystem.submitPartialDecryptShares. Use this for the flop community-card reveal (three cardIdxs) to keep every DLEQ proof on-chain while reducing tx count. Not for owner showdown reveals.",
  {
    tableId: z.string().describe("32-byte hex tableId"),
    cardIdxs: z.array(z.number().int()).min(1).max(5).describe("Deck slots 0..51, unique. Flop reveal usually passes three community card indexes."),
    seed: z.string().describe("256-bit hex seed — the same value passed to poker_publish_session_pk this hand"),
    agentAddress: z.string().optional().describe("Optional agent wallet address — used only for early local hole-owner checks."),
  },
  async (args) => pokerDecryptBatchHandler(args),
);

server.tool(
  "poker_recover_card",
  "Off-chain plaintext recovery for one card slot. Reads every share published on DecryptSystem, sums them on BabyJubJub, computes m = c2 − Σ shares, then maps m to a canonical card identity 1..52 (and decodes suit/rank). For COMMUNITY cards anyone can call this — all shares live on chain. For HOLE cards only the owner can recover: pass `ownerSeed` (the seed they used in poker_publish_session_pk) so the tool can compute the missing owner share locally without ever transmitting sk_owner. Returns identity 0 with a warning if the recovered point doesn't match any m_k = k·G (cause: missing/duplicate shares, wrong joint pk, etc).",
  {
    tableId: z.string().describe("32-byte hex tableId"),
    cardIdx: z.number().int().describe("Deck slot 0..51"),
    ownerSeed: z.string().optional().describe("Required ONLY when recovering your own hole card — same seed used in poker_publish_session_pk."),
  },
  async (args) => pokerRecoverCardHandler(args),
);

server.tool(
  "poker_round_status",
  "Aggregated read for phase-orchestration decisions: returns table phase + handNumber + currentActor + occupiedSeats roster + BetSystem RoundState (roundComplete, currentBet, lastAggressor) + per-slot decrypt status (threshold/shareCount/revealed) for every community card belonging to the NEXT phase. Sets `readyToAdvance=true` once roundComplete AND every required community card is fully decrypted — i.e. the gate poker_advance_phase enforces. Cheap to call; pure view, no tx encoded.",
  {
    tableId: z.string().describe("32-byte hex tableId"),
  },
  async (args) => pokerRoundStatusHandler(args),
);

server.tool(
  "poker_advance_phase",
  "Coordinator-side phase transition. Validates BetSystem.RoundState.roundComplete=true AND that every community card belonging to the next phase is on-chain revealed (DecryptSystem.revealed[cardIdx]=true). Returns one or two unsignedTxs in `unsignedTxs[]` to broadcast in order: TableSystem.advancePhase + (only when transitioning into Flop/Turn/River) BetSystem.initRound. River → Showdown emits only the advancePhase tx (showdown invocation is B3.7.E's job). Showdown / Complete are rejected. Caller must be the table admin or be authorizeSystem'd on TableSystem AND BetSystem. Pass `force: true` to skip the readiness checks (diagnostic / smoke only).",
  {
    tableId: z.string().describe("32-byte hex tableId"),
    force: z.boolean().optional().describe("Skip the roundComplete + community-revealed gate. Default false."),
  },
  async (args) => pokerAdvancePhaseHandler(args),
);

// ── End-user claim tools (P0-4, Codex public-readiness audit 2026-05-11) ──
// Finalize/cancel sonrasi son kullanici akisini kapatir: agent owner
// kazandigi/iadesini cekebilsin, depositor kullanmadigi prepay'i geri alabilsin.

server.tool(
  "poker_claim_payout",
  "Pull a finalized tournament prize. MS-2 pull-over-push: finalizeFromCallback queues pendingPayout[T][agentId]; only the ERC-8004 owner of agentId can call. Returns 1 unsigned tx.",
  {
    player: z.string().describe("Agent owner wallet (must equal IdentityRegistry.ownerOf(agentId))."),
    tournamentId: z.string().describe("Tournament id (32-byte hex)"),
    agentId: z.string().describe("ERC-8004 agent token id (numeric string)"),
  },
  async (args) => pokerClaimPayoutHandler(args),
);

server.tool(
  "poker_claim_refund",
  "Pull a cancelled-tournament refund (full entry fee — rake never moved during Registering). Only callable when tournament phase is Cancelled and pendingRefund > 0. Same agent-owner gate as claim_payout. Returns 1 unsigned tx.",
  {
    player: z.string().describe("Agent owner wallet (must equal IdentityRegistry.ownerOf(agentId))."),
    tournamentId: z.string().describe("Tournament id (32-byte hex)"),
    agentId: z.string().describe("ERC-8004 agent token id (numeric string)"),
  },
  async (args) => pokerClaimRefundHandler(args),
);

server.tool(
  "poker_withdraw_pending_deposit",
  "Recover an unconsumed depositFor slot. Callable during Registering or Running phases by the original depositor wallet (no agent-ownership requirement). Use when you sent depositFor but never called register, or to clean up a phantom slot. Returns 1 unsigned tx.",
  {
    depositor: z.string().describe("Original depositor wallet (must equal the address that originally called depositFor)."),
    tournamentId: z.string().describe("Tournament id (32-byte hex)"),
    agentId: z.string().describe("ERC-8004 agent token id (numeric string)"),
  },
  async (args) => pokerWithdrawPendingDepositHandler(args),
);

// CRITICAL: Never console.log — corrupts JSON-RPC pipe
process.stderr.write("arcent-poker-mcp server starting...\n");

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write("arcent-poker-mcp server connected. 32 tools registered (13 base + 16 poker + 3 claim).\n");
