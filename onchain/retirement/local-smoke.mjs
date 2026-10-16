// Actual SBF integration, localhost only. No mainnet RPC or funds are used.
import assert from "node:assert/strict";
import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  publicKey,
  transactionBuilder,
  sol,
} from "@metaplex-foundation/umi";
import {
  ADMIN,
  PROGRAM,
  PROGRAM_DATA,
  STATE,
  cleanupInstruction,
  closeInstruction,
  umiItem,
} from "./instructions.mjs";

const work = mkdtempSync(join(tmpdir(), "ripsy-retirement-local-"));
const port = randomInt(30000, 48000);
// Refuse to connect to any validator that was already running.
for (const candidate of [port, port + 1, port + 2])
  await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(candidate, "127.0.0.1", () => socket.close(resolve));
  });
const umi = createUmi(`http://127.0.0.1:${port}`, { commitment: "confirmed" });
const adminKey = umi.eddsa.createKeypairFromSecretKey(
  Uint8Array.from(
    JSON.parse(readFileSync("/Users/heymike/.config/solana/ducks.json", "utf8"))
  )
);
assert.equal(String(adminKey.publicKey), ADMIN);
umi.use(keypairIdentity(adminKey));
const args = [
  "--ledger",
  join(work, "ledger"),
  "--rpc-port",
  String(port),
  "--faucet-port",
  String(port + 2),
  "--dynamic-port-range",
  `${port + 3}-${port + 33}`,
  "--bind-address",
  "127.0.0.1",
  "--upgradeable-program",
  PROGRAM,
  "onchain/target/retirement/close-state.so",
  ADMIN,
  "--quiet",
];
const tag = (name) =>
  createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
let stateLamports = 0;
for (let i = 0; i < STATE.length; i++) {
  const size = [142, 25, 8985, 8985][i];
  const data = Buffer.alloc(size);
  data.set(tag(["Config", "EditionPrice", "Edition", "Edition"][i]));
  if (i === 0) data[140] = 1;
  const lamports = (size + 128) * 6960;
  stateLamports += lamports;
  const file = join(work, `state-${i}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      pubkey: STATE[i],
      account: {
        lamports,
        data: [data.toString("base64"), "base64"],
        owner: PROGRAM,
        executable: false,
        rentEpoch: 0,
      },
    })
  );
  args.push("--account", STATE[i], file);
}
const adminFile = join(work, "admin.json");
writeFileSync(
  adminFile,
  JSON.stringify({
    pubkey: ADMIN,
    account: {
      lamports: 1_000_000_000,
      data: ["", "base64"],
      owner: "11111111111111111111111111111111",
      executable: false,
      rentEpoch: 0,
    },
  })
);
args.push("--account", ADMIN, adminFile);
const validator = spawn("solana-test-validator", args, {
  stdio: ["ignore", "ignore", "pipe"],
});
let logs = "";
validator.stderr.on("data", (data) => {
  logs = (logs + data).slice(-4000);
});
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (validator.exitCode !== null)
      throw new Error(`Local validator exited: ${logs}`);
    try {
      await umi.rpc.getSlot();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert.ok(ready, "Local validator did not become ready");
  assert.notEqual(
    await umi.rpc.call("getGenesisHash"),
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  );
  const funded = await umi.rpc.getAccount(publicKey(ADMIN));
  assert.ok(funded.exists);
  assert.equal(funded.lamports.basisPoints, 1_000_000_000n);
  await umi.rpc.airdrop(publicKey(ADMIN), sol(1), { commitment: "confirmed" });
  const before = await umi.rpc.getAccount(publicKey(PROGRAM_DATA));
  assert.ok(before.exists);
  const tx = transactionBuilder().add([
    ...STATE.map((state) => umiItem(cleanupInstruction(state), umi.identity)),
    umiItem(closeInstruction(), umi.identity),
  ]);
  const signed = await tx.buildAndSign(umi);
  // Explicit commitment keeps simulation on the same fixture bank as reads.
  const simulationResponse = await fetch(`http://127.0.0.1:${port}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: [
        Buffer.from(umi.transactions.serialize(signed)).toString("base64"),
        { encoding: "base64", sigVerify: true, commitment: "confirmed" },
      ],
    }),
  });
  const simulation = await simulationResponse.json();
  assert.ok(simulation.result, JSON.stringify(simulation));
  assert.equal(
    simulation.result.value.err,
    null,
    JSON.stringify(simulation.result.value)
  );
  await tx.sendAndConfirm(umi);
  for (const key of [...STATE, PROGRAM_DATA])
    assert.equal((await umi.rpc.getAccount(publicKey(key))).exists, false, key);
  const admin = await umi.rpc.getAccount(publicKey(ADMIN));
  assert.ok(admin.exists);
  assert.equal(
    admin.lamports.basisPoints,
    2_000_000_000n + BigInt(stateLamports) + before.lamports.basisPoints - 5000n
  );
  const program = await umi.rpc.getAccount(publicKey(PROGRAM));
  console.log(
    JSON.stringify({
      localSbfPassed: true,
      allStateClosed: true,
      programDataClosed: true,
      exactRentReturned: true,
      remainingProgramLamports: program.exists
        ? String(program.lamports.basisPoints)
        : "0",
      programExecutable: program.exists && program.executable,
      fixtures: work,
    })
  );
} finally {
  validator.kill("SIGTERM");
  await new Promise((resolve) => {
    if (validator.exitCode !== null) resolve();
    else {
      validator.once("close", resolve);
      setTimeout(() => {
        validator.kill("SIGKILL");
        resolve();
      }, 3000).unref();
    }
  });
}
// Umi's websocket adapter may reconnect after validator shutdown.
process.exit(0);
