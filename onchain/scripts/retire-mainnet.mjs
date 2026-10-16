// User-authorized retirement. Default is read-only; --send enables writes.
// Keeps original Rust/IDL/deployment evidence. Never prints keys or RPC URLs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { upgradeInstructions } from "./loader-upgrade.mjs";
import {
  ADMIN,
  PROGRAM,
  PROGRAM_DATA,
  STATE,
  LOADER,
  cleanupInstruction,
  closeInstruction,
  umiItem,
} from "../retirement/instructions.mjs";

const OLD_HASH =
  "530e0b4cacbb91bf4280a33887aa19eb9c2aa0fb9e2f08cce584383bc93f3ac4";
const CLEANUP_HASH =
  "949d48258e33c2a53060e9c7b76db4831a3defa12b183dde680f4fe8a02d6d3d";
const ADMIN_PATH = "/Users/heymike/.config/solana/ducks.json";
const BUFFER_PATH = "onchain/keys/retirement-buffer.json";
const BINARY_PATH = "onchain/target/retirement/close-state.so";
const REPORT_PATH = "onchain/retirement/mainnet-retirement.json";
const SNAPSHOT_PATH = "onchain/retirement/pre-closure-accounts.json";
const args = process.argv.slice(2);
if (args.some((a) => !["--send", "--verify"].includes(a)) || args.length > 1)
  throw new Error("Use no arguments, --send or --verify");
const url = process.env.SHOP_SOLANA_RPC_URL;
if (!url || new URL(url).protocol !== "https:")
  throw new Error("Configured HTTPS RPC required");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const redact = (value) =>
  String(value)
    .replaceAll(url, "[RPC]")
    .replace(/https?:\/\/[^\s"']+/g, "[URL]");
async function rpc(method, params = []) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (result.error || result.result === undefined)
      throw new Error("Rejected");
    return result.result;
  } catch {
    throw new Error(`RPC failed: ${method}`);
  }
}
const account = async (key) =>
  (
    await rpc("getAccountInfo", [
      key,
      { encoding: "base64", commitment: "finalized" },
    ])
  ).value;
const bytes = (value) => Buffer.from(value.data[0], "base64");
const publicFromBytes = (value) => base58.deserialize(value)[0];
const tag = (name) =>
  createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const umi = createUmi(url, { commitment: "finalized" });
const signer = umi.eddsa.createKeypairFromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(ADMIN_PATH, "utf8")))
);
assert.equal(String(signer.publicKey), ADMIN, "Wrong signing wallet");
umi.use(keypairIdentity(signer));
assert.equal(
  await rpc("getGenesisHash"),
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  "Wrong cluster"
);
let report = existsSync(REPORT_PATH)
  ? JSON.parse(readFileSync(REPORT_PATH, "utf8"))
  : {
      program: PROGRAM,
      programData: PROGRAM_DATA,
      recipient: ADMIN,
      network: "mainnet-beta",
      originalBinarySha256: OLD_HASH,
      cleanupBinarySha256: CLEANUP_HASH,
    };
assert.equal(report.program, PROGRAM);
assert.equal(report.recipient, ADMIN);
const save = (update) => {
  report = { ...report, ...update, updatedAt: new Date().toISOString() };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
};
async function inventory() {
  const rows = await rpc("getProgramAccounts", [
    PROGRAM,
    { encoding: "base64", commitment: "finalized" },
  ]);
  for (const row of rows) {
    const b = bytes(row.account);
    assert.ok(
      STATE.includes(row.pubkey),
      "Unrecognized state or buyer receipt: stop before closure"
    );
    assert.equal(row.account.owner, PROGRAM);
    assert.equal(row.account.executable, false);
    const valid =
      (b.length === 142 &&
        b.subarray(0, 8).equals(tag("Config")) &&
        b[140] === 1 &&
        publicFromBytes(b.subarray(8, 40)) === ADMIN) ||
      (b.length === 25 && b.subarray(0, 8).equals(tag("EditionPrice"))) ||
      (b.length === 8985 && b.subarray(0, 8).equals(tag("Edition")));
    assert.ok(valid, "Unexpected or unpaused administrative state");
  }
  return rows;
}
async function requireDisabledApi() {
  const response = await fetch("https://api.ripsy.fun/session", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 201);
  const { token } = await response.json();
  const catalog = await fetch("https://api.ripsy.fun/shop/packs/catalog", {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(catalog.status, 200);
  assert.equal(
    (await catalog.json()).available,
    false,
    "Production packs must be disabled"
  );
}
async function simulate(builder, keys) {
  const tx = await builder.buildAndSign(umi);
  const value = (
    await rpc("simulateTransaction", [
      Buffer.from(umi.transactions.serialize(tx)).toString("base64"),
      {
        encoding: "base64",
        sigVerify: true,
        commitment: "finalized",
        accounts: { encoding: "base64", addresses: keys },
      },
    ])
  ).value;
  assert.equal(
    value.err,
    null,
    `Retirement simulation rejected: ${JSON.stringify(value.err)}`
  );
  return value;
}
async function send(builder) {
  const result = await builder.sendAndConfirm(umi, {
    confirm: { commitment: "finalized" },
  });
  assert.equal(result.result.value.err, null, "Transaction failed");
  return base58.deserialize(result.signature)[0];
}
async function finalizedTransaction(signature) {
  for (let i = 0; i < 12; i++) {
    const value = await rpc("getTransaction", [
      signature,
      {
        commitment: "finalized",
        encoding: "json",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (value) {
      assert.equal(value.meta.err, null);
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    "Finalized transaction details not indexed yet; rerun --verify"
  );
}
async function verifyClosed() {
  assert.equal(await account(PROGRAM_DATA), null, "ProgramData still exists");
  assert.equal((await inventory()).length, 0, "State accounts remain");
  const p = await account(PROGRAM);
  assert.ok(p && p.owner === LOADER, "Unexpected program tombstone");
  const tx = await finalizedTransaction(report.closeSignature);
  const index = tx.transaction.message.accountKeys.indexOf(ADMIN);
  assert.ok(index >= 0);
  const refunded =
    tx.meta.postBalances[index] - tx.meta.preBalances[index] + tx.meta.fee;
  assert.equal(
    refunded,
    report.expectedCloseRefundLamports ?? report.expectedRefundLamports,
    "Exact refund mismatch"
  );
  const totalRefunded =
    refunded + (report.programRentReturnedOnUpgradeLamports ?? 0);
  assert.equal(
    totalRefunded,
    report.expectedRefundLamports,
    "Total rent refund mismatch"
  );
  save({
    status: "closed",
    verifiedAt: new Date().toISOString(),
    closeSlot: tx.slot,
    refundedLamports: totalRefunded,
    closeRefundLamports: refunded,
    closeFeeLamports: tx.meta.fee,
    recipientBalanceAfterCloseLamports: tx.meta.postBalances[index],
    remainingProgramTombstoneLamports: p.lamports,
    programDataClosed: true,
    allAdministrativeStateClosed: true,
    buyerReceiptCountBeforeClose: 0,
    sourceRetained: true,
    futurePackPlan:
      "Backend-managed packs; no MagicBlock VRF. Not implemented or enabled by retirement.",
  });
  console.log(JSON.stringify(report, null, 2));
}
try {
  if (args.includes("--verify")) {
    assert.ok(report.closeSignature, "No recorded closure to verify");
    await verifyClosed();
  } else {
    const p = await account(PROGRAM),
      d = await account(PROGRAM_DATA);
    assert.ok(
      p?.executable && p.owner === LOADER && d?.owner === LOADER,
      "Unexpected loader accounts"
    );
    assert.equal(publicFromBytes(bytes(p).subarray(4, 36)), PROGRAM_DATA);
    const metadata = bytes(d);
    assert.equal(metadata.readUInt32LE(), 3);
    assert.equal(metadata[12], 1);
    assert.equal(
      publicFromBytes(metadata.subarray(13, 45)),
      ADMIN,
      "Wrong upgrade authority"
    );
    const binary = readFileSync(BINARY_PATH);
    assert.equal(hash(binary), CLEANUP_HASH, "Cleanup build changed");
    const installed = metadata.subarray(45);
    const old = hash(installed) === OLD_HASH;
    const cleanup =
      installed.subarray(0, binary.length).equals(binary) &&
      installed.subarray(binary.length).every((b) => b === 0);
    assert.ok(old || cleanup, "Unrecognized executable");
    let rows = await inventory();
    assert.equal(
      rows.length,
      4,
      "Expected four administrative accounts and no receipts"
    );
    const balance = (
      await rpc("getBalance", [ADMIN, { commitment: "finalized" }])
    ).value;
    const bufferRent = await rpc("getMinimumBalanceForRentExemption", [
      binary.length + 37,
    ]);
    const expectedRefund =
      d.lamports + rows.reduce((sum, row) => sum + row.account.lamports, 0);
    console.log(
      JSON.stringify({
        program: PROGRAM,
        recipient: ADMIN,
        originalCodeVerified: old,
        cleanupAlreadyInstalled: cleanup,
        administrativeAccounts: rows.length,
        buyerReceipts: 0,
        programDataLamports: d.lamports,
        stateLamports: expectedRefund - d.lamports,
        expectedRefundLamports: expectedRefund,
        balanceLamports: balance,
        temporaryBufferRentLamports: bufferRent,
        additionalFundingNeededLamports: Math.max(
          0,
          bufferRent + 200000 - balance
        ),
        send: args.includes("--send"),
      })
    );
    if (args.includes("--send")) {
      await requireDisabledApi();
      if (!existsSync(SNAPSHOT_PATH))
        writeFileSync(
          SNAPSHOT_PATH,
          `${JSON.stringify(
            {
              capturedAt: new Date().toISOString(),
              program: PROGRAM,
              programDataLamports: d.lamports,
              programTombstoneLamports: p.lamports,
              originalBinarySha256: OLD_HASH,
              administrativeAccounts: rows,
            },
            null,
            2
          )}\n`,
          { flag: "wx" }
        );
      save({
        status: "preparing-cleanup",
        expectedRefundLamports: expectedRefund,
        programDataRentLamports: d.lamports,
        administrativeStateRentLamports: expectedRefund - d.lamports,
        originalProgramTombstoneLamports: p.lamports,
        pauseSignature:
          "5w7tZ9SLtjjfusr5QWurmdDAMWGthsLgZnQB2XLz9FedoGWtmjP2xRYuec6Uc5WtoALDbhpak9FW7bimhcxzgWYY",
        backendPacksDisabled: true,
        backendDeployment: "f69758c4-8408-411b-a582-e58821b9b051",
      });
      if (old) {
        if (!existsSync(BUFFER_PATH))
          writeFileSync(
            BUFFER_PATH,
            JSON.stringify(Array.from(umi.eddsa.generateKeypair().secretKey)),
            { mode: 0o600, flag: "wx" }
          );
        const buffer = String(
          umi.eddsa.createKeypairFromSecretKey(
            Uint8Array.from(JSON.parse(readFileSync(BUFFER_PATH, "utf8")))
          ).publicKey
        );
        let uploaded = await account(buffer);
        if (uploaded) {
          assert.equal(uploaded.owner, LOADER);
          assert.equal(bytes(uploaded).readUInt32LE(), 1);
          assert.equal(publicFromBytes(bytes(uploaded).subarray(5, 37)), ADMIN);
          assert.equal(bytes(uploaded).length, binary.length + 37);
        }
        assert.ok(
          balance >= (uploaded ? 0 : bufferRent) + 200000,
          "Fund the small temporary buffer before retiring state"
        );
        if (!uploaded || !bytes(uploaded).subarray(37).equals(binary)) {
          const child = spawn(
            "solana",
            [
              "program",
              "write-buffer",
              BINARY_PATH,
              "--buffer",
              BUFFER_PATH,
              "--buffer-authority",
              ADMIN_PATH,
              "--fee-payer",
              ADMIN_PATH,
              "--keypair",
              ADMIN_PATH,
              "--url",
              url,
              "--use-rpc",
              "--commitment",
              "confirmed",
              "--max-sign-attempts",
              "2",
              "--output",
              "json",
            ],
            { stdio: ["ignore", "pipe", "pipe"] }
          );
          let output = "";
          child.stdout.on("data", (data) => {
            output += data;
          });
          child.stderr.on("data", (data) => {
            output += data;
          });
          const code = await new Promise((resolve, reject) => {
            child.on("error", reject);
            child.on("close", resolve);
          });
          if (code !== 0)
            throw new Error(
              `Buffer upload incomplete; key retained. ${redact(output)}`
            );
          for (let i = 0; i < 30; i++) {
            uploaded = await account(buffer);
            if (
              uploaded?.owner === LOADER &&
              bytes(uploaded).subarray(37).equals(binary)
            )
              break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        assert.ok(
          uploaded?.owner === LOADER &&
            bytes(uploaded).subarray(37).equals(binary),
          "Uploaded buffer mismatch"
        );
        assert.equal(publicFromBytes(bytes(uploaded).subarray(5, 37)), ADMIN);
        save({ buffer, temporaryBufferRentLamports: uploaded.lamports });
        const upgrade = transactionBuilder().add(
          upgradeInstructions(PROGRAM, PROGRAM_DATA, buffer, ADMIN, 0).map(
            (instruction) => ({
              instruction,
              signers: [umi.identity],
              bytesCreatedOnChain: 0,
            })
          )
        );
        await simulate(upgrade, [ADMIN, buffer]);
        const signature = await send(upgrade);
        save({ status: "cleanup-installed", upgradeSignature: signature });
        assert.equal(
          await account(buffer),
          null,
          "Temporary buffer not refunded"
        );
        const upgradedAccount = await account(PROGRAM_DATA);
        const upgraded = bytes(upgradedAccount).subarray(45);
        assert.ok(
          upgraded.subarray(0, binary.length).equals(binary) &&
            upgraded.subarray(binary.length).every((b) => b === 0),
          "Installed cleanup differs"
        );
        const upgradeTx = await finalizedTransaction(signature);
        const payerIndex =
          upgradeTx.transaction.message.accountKeys.indexOf(ADMIN);
        assert.ok(payerIndex >= 0);
        const upgradeRefund =
          upgradeTx.meta.postBalances[payerIndex] -
          upgradeTx.meta.preBalances[payerIndex] +
          upgradeTx.meta.fee;
        const returnedProgramRent = d.lamports - upgradedAccount.lamports;
        assert.equal(
          upgradeRefund,
          uploaded.lamports + returnedProgramRent,
          "Buffer refund mismatch"
        );
        save({
          temporaryBufferClosed: true,
          temporaryBufferRefundLamports: uploaded.lamports,
          programRentReturnedOnUpgradeLamports: returnedProgramRent,
          upgradeFeeLamports: upgradeTx.meta.fee,
        });
      }
      rows = await inventory();
      assert.equal(rows.length, 4);
      save({
        expectedCloseRefundLamports:
          (await account(PROGRAM_DATA)).lamports +
          rows.reduce((sum, row) => sum + row.account.lamports, 0),
      });
      const close = transactionBuilder().add([
        ...rows.map((row) =>
          umiItem(cleanupInstruction(row.pubkey), umi.identity)
        ),
        umiItem(closeInstruction(), umi.identity),
      ]);
      const simulation = await simulate(close, [
        ADMIN,
        PROGRAM_DATA,
        ...rows.map((row) => row.pubkey),
      ]);
      assert.ok(
        simulation.accounts.slice(1).every((a) => !a || a.lamports === 0),
        "Simulation did not close every target"
      );
      save({
        status: "close-simulated",
        closeSimulationUnits: simulation.unitsConsumed,
      });
      const signature = await send(close);
      save({ status: "close-submitted", closeSignature: signature });
      await verifyClosed();
    }
  }
} catch (error) {
  console.error(
    redact(error instanceof Error ? error.message : "Retirement failed")
  );
  process.exitCode = 1;
}
// All critical work is awaited; release any Umi websocket keepalive handles.
process.exit(process.exitCode ?? 0);
