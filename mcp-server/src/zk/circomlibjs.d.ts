// circomlibjs ships no .d.ts; we use only buildBabyjub() and a handful of
// methods on the returned object. Keep the surface tight.
declare module "circomlibjs" {
  type Point = [Uint8Array, Uint8Array];

  export interface BabyJubField {
    e(x: bigint | string | number): Uint8Array;
    toString(x: Uint8Array): string;
  }

  export interface BabyJub {
    F: BabyJubField;
    Base8: Point;
    subOrder: bigint;
    mulPointEscalar(p: Point, k: bigint): Point;
    addPoint(a: Point, b: Point): Point;
  }

  export function buildBabyjub(): Promise<BabyJub>;
}
