// Build a snarkjs witness input for the N=52 shuffle_encrypt circuit.
//
// The circuit proves: outputC1[i] = inputC1[positions[i]] + r[i]·G,
//                     outputC2[i] = inputC2[positions[i]] + r[i]·pk,
// where positions is a permutation (and invPositions its inverse).
//
// Given (pk, inputC1[52], inputC2[52]) the prover picks fresh randomness
// (positions, r[]) and computes (outputC1, outputC2) on the BabyJubJub curve,
// then writes everything as decimal-string-encoded points for snarkjs.
//
// Determinism: the caller passes the seeded RNG so smoke tests can reproduce
// proofs. Production wallets get a CSPRNG (`crypto.randomBytes`).

import { buildBabyjub } from "circomlibjs";

const DECK_SIZE = 52;
const SUB_ORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n;

export type Point = [bigint, bigint];
export type RNG = () => bigint;

export type ShuffleProveInput = {
  pk: Point;
  inputC1: Point[];
  inputC2: Point[];
};

export type ShuffleProveOutput = {
  /** snarkjs-shaped witness input (decimal-string fields). */
  witness: {
    pk: [string, string];
    inputC1: [string, string][];
    inputC2: [string, string][];
    outputC1: [string, string][];
    outputC2: [string, string][];
    positions: string[];
    invPositions: string[];
    r: string[];
  };
  /** Output ciphertexts as bigint pairs (for tx encoding). */
  outputC1: Point[];
  outputC2: Point[];
  /** Permutation + per-card randomness chosen by this agent. Kept for audit/debug. */
  positions: number[];
  r: bigint[];
};

/** Fisher-Yates shuffle over [0..N-1] using the supplied RNG (modular). */
function fisherYates(n: number, rng: RNG): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    // Bias is negligible for n=52 << 2^256, so straight modulo is fine.
    const j = Number(rng() % BigInt(i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a witness for one agent's shuffle round.
 * @param input pk + current deck ciphertexts (read from DealSystem on-chain).
 * @param rng   bigint generator (≥ 256 bits each call). Reduced mod subOrder.
 */
export async function buildShuffleWitness(
  input: ShuffleProveInput,
  rng: RNG,
): Promise<ShuffleProveOutput> {
  if (input.inputC1.length !== DECK_SIZE || input.inputC2.length !== DECK_SIZE) {
    throw new Error(
      `expected ${DECK_SIZE} input ciphertexts, got C1=${input.inputC1.length}, C2=${input.inputC2.length}`,
    );
  }

  const bj = await buildBabyjub();
  const G = bj.Base8;

  // Drive permutation and randomness from the same RNG so callers control
  // determinism vs CSPRNG with one knob.
  const positions = fisherYates(DECK_SIZE, rng);
  const invPositions = new Array<number>(DECK_SIZE);
  for (let i = 0; i < DECK_SIZE; i++) invPositions[positions[i]] = i;

  const r: bigint[] = [];
  for (let i = 0; i < DECK_SIZE; i++) r.push(rng() % SUB_ORDER);

  // pk as a curve point (the circuit re-encrypts under it).
  const pkPoint: [Uint8Array, Uint8Array] = [
    bj.F.e(input.pk[0]),
    bj.F.e(input.pk[1]),
  ];

  const inC1: [Uint8Array, Uint8Array][] = input.inputC1.map((p) => [
    bj.F.e(p[0]),
    bj.F.e(p[1]),
  ]);
  const inC2: [Uint8Array, Uint8Array][] = input.inputC2.map((p) => [
    bj.F.e(p[0]),
    bj.F.e(p[1]),
  ]);

  const outC1F: [Uint8Array, Uint8Array][] = [];
  const outC2F: [Uint8Array, Uint8Array][] = [];
  for (let i = 0; i < DECK_SIZE; i++) {
    const src = positions[i];
    const rG = bj.mulPointEscalar(G, r[i]);
    const rPk = bj.mulPointEscalar(pkPoint, r[i]);
    outC1F.push(bj.addPoint(inC1[src], rG) as [Uint8Array, Uint8Array]);
    outC2F.push(bj.addPoint(inC2[src], rPk) as [Uint8Array, Uint8Array]);
  }

  const fmt = (p: [Uint8Array, Uint8Array]): [string, string] => [
    bj.F.toString(p[0]),
    bj.F.toString(p[1]),
  ];

  const witness = {
    pk: fmt(pkPoint),
    inputC1: inC1.map(fmt),
    inputC2: inC2.map(fmt),
    outputC1: outC1F.map(fmt),
    outputC2: outC2F.map(fmt),
    positions: positions.map((n) => n.toString()),
    invPositions: invPositions.map((n) => n.toString()),
    r: r.map((b) => b.toString()),
  };

  // Convert outputs back to bigint pairs for tx encoding.
  const toBig = (p: [Uint8Array, Uint8Array]): Point => [
    BigInt(bj.F.toString(p[0])),
    BigInt(bj.F.toString(p[1])),
  ];

  return {
    witness,
    outputC1: outC1F.map(toBig),
    outputC2: outC2F.map(toBig),
    positions,
    r,
  };
}

/** CSPRNG-backed RNG for production. Returns a 256-bit bigint per call. */
export function csprngRng(): RNG {
  // crypto.randomBytes is sync and uses OpenSSL CSPRNG — fine for a few dozen calls per hand.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  return () => {
    const buf = randomBytes(32);
    return BigInt("0x" + buf.toString("hex"));
  };
}

/**
 * Deterministic seeded RNG (xorshift-like over bigint). For smoke tests / debug.
 * Two callers passing the same seed get the same permutation + r[].
 */
export function seededRng(seed: bigint): RNG {
  let state = seed === 0n ? 1n : seed;
  return () => {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 256n) - 1n;
    return state;
  };
}

/**
 * Derive a BabyJubJub session keypair from a 256-bit seed.
 * `sk = seed mod subOrder`, `pk = sk · Base8`.
 *
 * Used by poker_publish_session_pk + poker_decrypt_share to:
 *  - publish pk_i on-chain at hand start (agent self-attestation)
 *  - compute the agent's per-hand decrypt share d_i = sk_i · c1
 *
 * The seed is the *agent's secret*: never sent over the wire, never stored
 * server-side. Production wallets should derive it via HKDF(walletSk,
 * tableId || handNumber) so it's reconstructible across MCP restarts but
 * still indistinguishable from random to anyone without walletSk.
 */
export async function deriveSessionKeypair(seed: bigint): Promise<{
  sk: bigint;
  pk: Point;
}> {
  const bj = await buildBabyjub();
  const sk = ((seed % SUB_ORDER) + SUB_ORDER) % SUB_ORDER;
  if (sk === 0n) {
    // pk = 0·G = identity, useless as a session pk. Reject so the agent picks
    // a non-trivial seed (vanishingly rare with a CSPRNG).
    throw new Error("session sk reduces to 0 — pick a different seed");
  }
  const pkPoint = bj.mulPointEscalar(bj.Base8, sk) as [Uint8Array, Uint8Array];
  return {
    sk,
    pk: [BigInt(bj.F.toString(pkPoint[0])), BigInt(bj.F.toString(pkPoint[1]))],
  };
}

/**
 * Sum a list of BabyJubJub points (off-chain joint pk aggregation).
 * Returns the identity (0, 1) for an empty list — agents should treat this as
 * "no published pks yet" and refuse to trust the deck.
 */
export async function sumBabyJubPoints(points: Point[]): Promise<Point> {
  const bj = await buildBabyjub();
  // BabyJub identity in Edwards form is (0, 1).
  let acc: [Uint8Array, Uint8Array] = [bj.F.e(0n), bj.F.e(1n)];
  for (const p of points) {
    const pf: [Uint8Array, Uint8Array] = [bj.F.e(p[0]), bj.F.e(p[1])];
    acc = bj.addPoint(acc, pf) as [Uint8Array, Uint8Array];
  }
  return [BigInt(bj.F.toString(acc[0])), BigInt(bj.F.toString(acc[1]))];
}
