declare module "node:crypto" {
  interface Hmac {
    update(data: string | Uint8Array): Hmac;
    digest(encoding: "hex"): string;
  }
  export function createHmac(algorithm: string, key: Uint8Array | string): Hmac;
  export interface Hash { update(data: string | Uint8Array): Hash; digest(encoding: "hex"): string; }
  export function createHash(algorithm: string): Hash;
  export function randomUUID(): string;
}

declare module "node:test" {
  type TestCallback = () => void | Promise<void>;
  const test: (name: string, callback: TestCallback) => void;
  export default test;
}

declare module "node:assert/strict" {
  interface Assertion {
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, expected: RegExp, message?: string): void;
    throws(block: () => unknown, expected?: RegExp | ((error: unknown) => boolean)): void;
    rejects(block: PromiseLike<unknown> | (() => PromiseLike<unknown>), expected?: RegExp | ((error: unknown) => boolean)): Promise<void>;
    doesNotThrow(block: () => unknown): void;
    ok(value: unknown, message?: string): void;
  }
  const assert: Assertion;
  export default assert;
}
