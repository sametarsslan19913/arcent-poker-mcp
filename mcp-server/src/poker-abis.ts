// Minimal ABI subset for arcent-poker contracts (M6.A redeploy 2026-04-26).
// Each ABI captures only the functions / events the poker tools call — keeps
// the bundle tight and the typed function names tractable for tool dispatch.

export const PokerOrchestratorAbi = [
  {
    type: "function", name: "createTournament",
    inputs: [
      { name: "tournamentId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "entryFee", type: "uint256" },
      { name: "minPlayers", type: "uint8" },
      { name: "maxPlayers", type: "uint8" },
      { name: "payoutBps", type: "uint16[]" },
      { name: "reputationDelta", type: "int64[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "register",
    inputs: [
      { name: "tournamentId", type: "bytes32" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "start",
    inputs: [{ name: "tournamentId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "finalize",
    inputs: [
      { name: "tournamentId", type: "bytes32" },
      { name: "ranking", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "tournamentOf",
    inputs: [{ name: "tournamentId", type: "bytes32" }],
    outputs: [
      { name: "admin", type: "address" },
      { name: "token", type: "address" },
      { name: "entryFee", type: "uint256" },
      { name: "minPlayers", type: "uint8" },
      { name: "maxPlayers", type: "uint8" },
      { name: "registered", type: "uint8" },
      { name: "phase", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "rosterOf",
    inputs: [{ name: "tournamentId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "isRegistered",
    inputs: [
      { name: "tournamentId", type: "bytes32" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const PokerTableAbi = [
  {
    type: "function", name: "joinTable",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "seatIdx", type: "uint8" },
      { name: "agentId", type: "bytes32" },
      { name: "buyInChips", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "leaveTable",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    // Full Seat struct from TableSystem.sol — field NAMES are advisory but
    // ORDER + TYPES are load-bearing for ABI decoding. Previous shorter shape
    // collapsed `occupied`/`inHand`/`folded` into `handContribution`/`folded`/
    // `active` and dropped `allIn` + `currentBet`, so seat.folded actually
    // returned seat.inHand. Action-loop fold detection broke silently.
    type: "function", name: "getSeat",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "seatIdx", type: "uint8" },
    ],
    outputs: [
      {
        name: "", type: "tuple",
        components: [
          { name: "player",            type: "address" },
          { name: "agentId",           type: "bytes32" },
          { name: "chips",             type: "uint256" },
          { name: "occupied",          type: "bool"    },
          { name: "inHand",            type: "bool"    },
          { name: "folded",            type: "bool"    },
          { name: "allIn",             type: "bool"    },
          { name: "currentBet",        type: "uint256" },
          { name: "handContribution",  type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "activeSeats",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8[]" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getTable",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [
      {
        name: "", type: "tuple",
        components: [
          { name: "admin", type: "address" },
          { name: "maxSeats", type: "uint8" },
          { name: "occupiedCount", type: "uint8" },
          { name: "smallBlind", type: "uint256" },
          { name: "bigBlind", type: "uint256" },
          { name: "minBuyIn", type: "uint256" },
          { name: "maxBuyIn", type: "uint256" },
          { name: "dealerButton", type: "uint8" },
          { name: "currentActor", type: "uint8" },
          { name: "handNumber", type: "uint64" },
          { name: "phase", type: "uint8" }, // 0..6 = WaitingForPlayers..Complete
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

export const PokerBetAbi = [
  {
    // action enum: 0=Fold, 1=Check, 2=Call, 3=Raise, 4=AllIn
    type: "function", name: "act",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "action", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    // RoundState as declared in BetSystem.sol (field order + types are
    // load-bearing for ABI decoding — field NAMES are advisory).
    type: "function", name: "getRound",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [
      {
        name: "", type: "tuple",
        components: [
          { name: "handNumber", type: "uint64" },
          { name: "currentBet", type: "uint256" },     // round-level high bet
          { name: "minRaise", type: "uint256" },       // minimum raise increment
          { name: "lastAggressor", type: "uint8" },    // 0xFF if none
          { name: "actedBitmap", type: "uint16" },
          { name: "roundComplete", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    // BetSystem.toCall(tableId) uses Table.currentActor internally; no seat arg.
    type: "function", name: "toCall",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// NOTE (2026-04-28, B3.6): the commit/reveal entries below are placeholders that
// historically pointed at RandomnessSystem (which is what poker_deal_commit /
// poker_deal_reveal actually need to call). Real DealSystem entries are
// initDeal + submitShuffle (used by poker_shuffle_prove). The commit/reveal
// pair is left in place to keep poker_deal_commit/_reveal compiling — those
// tools should be retargeted to RandomnessSystem in a follow-up (their `reveal`
// signature is also wrong: real RandomnessSystem.reveal takes (roundId, seed,
// salt), not (tableId, seed)). Tracked as a B3.7 cleanup.
export const PokerDealAbi = [
  // DealSystem.initDeal — seed table deck with joint pk + initial ciphertexts.
  // Called once per hand by the table admin (or first agent) before sequential
  // shuffle proofs start. Subsequent submitShuffle calls chain the deck state.
  {
    type: "function", name: "initDeal",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "pk", type: "uint256[2]" },
      { name: "initialC1", type: "uint256[2][52]" },
      { name: "initialC2", type: "uint256[2][52]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // DealSystem.submitShuffle — agent submits one re-encrypted permutation
  // round + Groth16 proof (verified on-chain by ShuffleEncrypt52Verifier).
  // Public signal layout (418):
  //   [0..1]      pk
  //   [2..105]    inputC1[52]   (current on-chain deck state)
  //   [106..209]  inputC2[52]
  //   [210..313]  outputC1[52]  (this submission's output)
  //   [314..417]  outputC2[52]
  // The contract reconstructs sig[] from stored deck + submitted output, so
  // the agent only sends output ciphertexts + (pA, pB, pC).
  {
    type: "function", name: "submitShuffle",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "outputC1", type: "uint256[2][52]" },
      { name: "outputC2", type: "uint256[2][52]" },
      { name: "pA", type: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // Views — mostly used by poker_shuffle_prove to read the current deck state.
  {
    type: "function", name: "isInitialized",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "deckPk",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [
      { name: "x", type: "uint256" },
      { name: "y", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "cardCiphertext",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "cardIdx", type: "uint8" },
    ],
    outputs: [
      { name: "c1x", type: "uint256" },
      { name: "c1y", type: "uint256" },
      { name: "c2x", type: "uint256" },
      { name: "c2y", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "shuffleRound",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  // B3.7.B: per-hand session pk audit trail (real mental poker — joint pk =
  // Σ pk_i, not single-admin). Each agent calls publishSessionPk before
  // initDeal; coordinator reads getSessionPks, sums them off-chain, feeds the
  // result into initDeal. Other agents re-sum and verify against deckPk
  // before submitting their shuffle round (trust-but-verify, no on-chain
  // BabyJub aggregation).
  {
    type: "function", name: "publishSessionPk",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "pkX", type: "uint256" },
      { name: "pkY", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getSessionPks",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [
      {
        name: "", type: "tuple[]",
        components: [
          { name: "agent", type: "address" },
          { name: "pkX",   type: "uint256" },
          { name: "pkY",   type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "sessionPkCount",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "hasPublishedSessionPk",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "agent", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // -- legacy placeholders (see NOTE above) --
  {
    type: "function", name: "commit",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "commitHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "reveal",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "seed", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// DecryptSystem.sol — partial-decryption share collector. B3.7.A introduced
// per-card threshold (hole = N-1, community = N, burn/unused = 0) and a
// hole-owner submission block. B3.7.C wires the agent-side path: each
// non-owner publishes d_i = sk_i · c1 + ZK proof, then anyone can recover
// plaintext m = c2 - Σ d_i once threshold is met (off-chain BabyJub sum).
export const PokerDecryptAbi = [
  {
    // Public signal layout for the verifier (6): pk[2] + c1[2] + d[2].
    // The contract reads c1/c2 from DealSystem.cardCiphertext and reconstructs
    // sig[] internally — agents only send (contributorPk, d, pA, pB, pC).
    type: "function", name: "submitPartialDecryptShare",
    inputs: [
      { name: "tableId",        type: "bytes32" },
      { name: "cardIdx",        type: "uint8" },
      { name: "contributorPk",  type: "uint256[2]" },
      { name: "d",              type: "uint256[2]" },
      { name: "pA",             type: "uint256[2]" },
      { name: "pB",             type: "uint256[2][2]" },
      { name: "pC",             type: "uint256[2]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "requiredSharesFor",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "cardIdx", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "holeOwnerOf",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "cardIdx", type: "uint8" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    // CardRole enum: 0=Unused, 1=Hole, 2=Burn, 3=Community.
    type: "function", name: "cardRoleOf",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "cardIdx", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getShare",
    inputs: [
      { name: "tableId",     type: "bytes32" },
      { name: "cardIdx",     type: "uint8" },
      { name: "contributor", type: "address" },
    ],
    outputs: [
      { name: "x", type: "uint256" },
      { name: "y", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "shareCount",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "cardIdx", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "revealed",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "cardIdx", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

// CardRole enum mirror — keep in sync with DecryptSystem.sol.
export const CardRole = {
  Unused: 0,
  Hole: 1,
  Burn: 2,
  Community: 3,
} as const;

// Friendly action label → enum mapping for the unified poker_action tool.
export const PokerActionEnum = {
  fold: 0,
  check: 1,
  call: 2,
  raise: 3,
  allin: 4,
} as const;

export type PokerActionLabel = keyof typeof PokerActionEnum;
