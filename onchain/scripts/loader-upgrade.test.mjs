import test from "node:test";
import assert from "node:assert/strict";
import { upgradeInstructions, LOADER } from "./loader-upgrade.mjs";
const program = "43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ";
const data = "DZeMqKpHuE98CmdjbN4cgjXjGktUosgsCUGgScniEG3Y";
const buffer = "11111111111111111111111111111111";
const authority = "BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh";
test("loader-v3 extension and authority-signed upgrade ABI matches Rust SDK", () => {
  const [extend, upgrade] = upgradeInstructions(
    program,
    data,
    buffer,
    authority,
    34096
  );
  assert.equal(extend.programId, LOADER);
  assert.equal(extend.data.toString("hex"), "0600000030850000");
  assert.deepEqual(
    extend.keys.map((k) => [k.pubkey, k.isWritable, k.isSigner]),
    [
      [data, true, false],
      [program, true, false],
      [buffer, false, false],
      [authority, true, true],
    ]
  );
  assert.equal(upgrade.data.toString("hex"), "03000000");
  assert.deepEqual(
    upgrade.keys.map((k) => [k.pubkey, k.isWritable, k.isSigner]),
    [
      [data, true, false],
      [program, true, false],
      [buffer, true, false],
      [authority, true, false],
      ["SysvarRent111111111111111111111111111111111", false, false],
      ["SysvarC1ock11111111111111111111111111111111", false, false],
      [authority, false, true],
    ]
  );
});
test("already-extended recovery never allocates twice", () => {
  assert.equal(
    upgradeInstructions(program, data, buffer, authority, 0).length,
    1
  );
});
test("rejects invalid or excessive allocation", () => {
  for (const growth of [-1, 1.5, NaN, Infinity, 100001])
    assert.throws(() =>
      upgradeInstructions(program, data, buffer, authority, growth)
    );
});
