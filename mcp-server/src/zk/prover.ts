// Pluggable Groth16 prover.
//
// The default backend uses snarkjs (~20 s/proof on a 4-core VPS, ~1.6 GB RSS).
// B3.6.5 will add a rapidsnark backend (C++ native, ~3-4 s/proof) — both
// consume the same .zkey + .wasm + witness shape, so the surface stays:
//
//   prove(witness, opts) -> { proof, publicSignals }
//
// Callers (poker_shuffle_prove) pick a backend via config.zkProverBackend.

import { config } from "../config.js";
import { createRequire } from "node:module";

export type Groth16Proof = {
  pi_a: string[];      // [a0, a1, "1"]
  pi_b: string[][];    // [[b00, b01], [b10, b11], ["1","0"]]
  pi_c: string[];      // [c0, c1, "1"]
  protocol: string;
  curve: string;
};

export type ProveResult = {
  proof: Groth16Proof;
  publicSignals: string[];
  /** Wall-clock breakdown so callers can log/diagnose. */
  timings: {
    witnessMs: number;
    proveMs: number;
    totalMs: number;
  };
};

export interface ShuffleProver {
  /** Generate witness + Groth16 proof for the bound shuffle circuit. */
  prove(witnessInput: object): Promise<ProveResult>;
  /** Identifier — appears in tool result metadata. */
  readonly backend: string;
}

// snarkjs is published with a "main" of build/main.cjs but its package.json
// "exports" field doesn't expose it as ESM cleanly when installed flat. We
// load via createRequire + the build/main.cjs path that always resolves.
const require = createRequire(import.meta.url);
let cachedSnarkjs: any | null = null;
function getSnarkjs(): any {
  if (cachedSnarkjs) return cachedSnarkjs;
  // Try the ESM-friendly default first; fall back to the cjs build path.
  try {
    cachedSnarkjs = require("snarkjs");
  } catch {
    cachedSnarkjs = require("snarkjs/build/main.cjs");
  }
  return cachedSnarkjs;
}

class SnarkjsShuffleProver implements ShuffleProver {
  readonly backend = "snarkjs";
  constructor(private wasmPath: string, private zkeyPath: string) {}

  async prove(witnessInput: object): Promise<ProveResult> {
    const snarkjs = getSnarkjs();
    const t0 = performance.now();

    // snarkjs.groth16.fullProve does witness gen + prove in one shot,
    // skipping the intermediate .wtns file. Memory peaks are similar.
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      witnessInput,
      this.wasmPath,
      this.zkeyPath,
    );
    const t1 = performance.now();

    return {
      proof: proof as Groth16Proof,
      publicSignals: publicSignals as string[],
      timings: {
        // fullProve doesn't break out witness vs prove; report combined total
        // under proveMs to keep the shape stable across backends.
        witnessMs: 0,
        proveMs: t1 - t0,
        totalMs: t1 - t0,
      },
    };
  }
}

export function makeShuffleProver(): ShuffleProver {
  switch (config.zkProverBackend) {
    case "snarkjs":
      return new SnarkjsShuffleProver(config.zkShuffleWasm, config.zkShuffleZkey);
    case "rapidsnark":
      // B3.6.5 — drop in a child-process wrapper around the rapidsnark binary,
      // reading the same wasm/zkey + writing witness via snarkjs WitnessCalculator.
      throw new Error(
        "rapidsnark backend not yet implemented (planned for B3.6.5). " +
          "Set ZK_PROVER_BACKEND=snarkjs.",
      );
    default:
      throw new Error(`Unknown ZK_PROVER_BACKEND: ${config.zkProverBackend}`);
  }
}

/**
 * Convert a snarkjs Groth16 proof to the calldata-shaped tuple the Solidity
 * verifier expects: pA[2], pB[2][2], pC[2]. snarkjs encodes pi_b in the
 * "natural" Fp2 order (Fp2 = a + b*u, stored as [a, b]) but the verifier
 * expects them flipped (b first, a second) for the on-chain pairing layout.
 *
 * The same row-flip applies to publicSignals trim (snarkjs adds a trailing "1"
 * at index 0, callers strip it before passing to the contract).
 */
export function proofToSolidityCalldata(p: Groth16Proof): {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
} {
  const big = (s: string) => BigInt(s);
  return {
    pA: [big(p.pi_a[0]), big(p.pi_a[1])],
    // Note the inner-pair flip: contract expects [b1, b0] not [b0, b1].
    pB: [
      [big(p.pi_b[0][1]), big(p.pi_b[0][0])],
      [big(p.pi_b[1][1]), big(p.pi_b[1][0])],
    ],
    pC: [big(p.pi_c[0]), big(p.pi_c[1])],
  };
}
