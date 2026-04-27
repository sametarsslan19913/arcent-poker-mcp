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
    type: "function", name: "getSeat",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "seatIdx", type: "uint8" },
    ],
    outputs: [
      {
        name: "", type: "tuple",
        components: [
          { name: "player", type: "address" },
          { name: "agentId", type: "bytes32" },
          { name: "chips", type: "uint256" },
          { name: "handContribution", type: "uint256" },
          { name: "folded", type: "bool" },
          { name: "active", type: "bool" },
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
    type: "function", name: "getRound",
    inputs: [{ name: "tableId", type: "bytes32" }],
    outputs: [
      {
        name: "", type: "tuple",
        components: [
          { name: "currentPlayerSeat", type: "uint8" },
          { name: "minRaiseAmount", type: "uint256" },
          { name: "lastRaiseAmount", type: "uint256" },
          { name: "highBet", type: "uint256" },
          { name: "roundComplete", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "toCall",
    inputs: [
      { name: "tableId", type: "bytes32" },
      { name: "seatIdx", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const PokerDealAbi = [
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

// Friendly action label → enum mapping for the unified poker_action tool.
export const PokerActionEnum = {
  fold: 0,
  check: 1,
  call: 2,
  raise: 3,
  allin: 4,
} as const;

export type PokerActionLabel = keyof typeof PokerActionEnum;
