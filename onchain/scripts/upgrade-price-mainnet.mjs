// Exactly the user-approved price/storage upgrade. Default is read-only.
// Uploads one recoverable buffer, then simulates/sends extension and upgrade
// in separate finalized blocks (loader forbids both in the same block).
// Never publishes an edition, changes price/pause, purchases, or changes authority.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { LOADER, upgradeInstructions } from "./loader-upgrade.mjs";
const program = "43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ";
const programData = "DZeMqKpHuE98CmdjbN4cgjXjGktUosgsCUGgScniEG3Y";
const authority = "BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh";
const oldHash =
  "199b77db47f82812d115346f706dffa9913f3f207ca3ff13825f4746a5b8d256";
const newHash =
  "530e0b4cacbb91bf4280a33887aa19eb9c2aa0fb9e2f08cce584383bc93f3ac4";
const binaryPath = "onchain/target/deploy/ripsy_packs.so";
const payerPath = "/Users/heymike/.config/solana/ducks.json";
const bufferPath = "onchain/keys/price-upgrade-buffer.json";
const startPath = "onchain/target/price-upgrade-start.json";
const statePath = "onchain/target/price-upgrade-state.json";
const reportPath = "onchain/price-upgrade-deployment.json";
const args = process.argv.slice(2);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const disc = (name) =>
  createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  if (args.length > 1 || args.some((a) => !["--send", "--verify"].includes(a)))
    throw new Error("Use no arguments, --send or --verify");
  const url = process.env.SHOP_SOLANA_RPC_URL;
  if (!url || new URL(url).protocol !== "https:")
    throw new Error("Private HTTPS RPC required");
  const binary = readFileSync(binaryPath);
  if (binary.length !== 483280 || hash(binary) !== newHash)
    throw new Error("Reviewed binary mismatch");
  const umi = createUmi(url, { commitment: "finalized" });
  const loadKey = (path) =>
    umi.eddsa.createKeypairFromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(path, "utf8")))
    );
  if (args.includes("--send")) {
    const payer = loadKey(payerPath);
    if (String(payer.publicKey) !== authority)
      throw new Error("Approved signing address mismatch");
    umi.use(keypairIdentity(payer));
  }
  async function rpc(method, params = []) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(30000),
      });
      const r = await response.json();
      if (r.error || r.result === undefined) throw new Error();
      return r.result;
    } catch {
      throw new Error(`RPC check failed: ${method}`);
    }
  }
  const account = async (key) =>
    (
      await rpc("getAccountInfo", [
        key,
        { encoding: "base64", commitment: "finalized" },
      ])
    ).value;
  const bytes = (a) => Buffer.from(a.data[0], "base64");
  const balance = async () =>
    (await rpc("getBalance", [authority, { commitment: "finalized" }])).value;
  if (
    (await rpc("getGenesisHash")) !==
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  )
    throw new Error("Not mainnet");
  async function code() {
    const p = await account(program),
      d = await account(programData);
    if (
      !p?.executable ||
      p.owner !== LOADER ||
      bytes(p).readUInt32LE(0) !== 2 ||
      base58.deserialize(bytes(p).subarray(4, 36))[0] !== programData ||
      !d ||
      d.owner !== LOADER ||
      d.executable ||
      bytes(d).readUInt32LE(0) !== 3 ||
      bytes(d)[12] !== 1 ||
      base58.deserialize(bytes(d).subarray(13, 45))[0] !== authority
    )
      throw new Error("Program or authority mismatch");
    return { p, d, binary: bytes(d).subarray(45) };
  }
  const start = existsSync(startPath)
    ? JSON.parse(readFileSync(startPath, "utf8"))
    : null;
  if (
    start &&
    (start.program !== program ||
      start.authority !== authority ||
      start.newHash !== newHash ||
      start.oldHash !== oldHash ||
      !Number.isSafeInteger(start.balanceBeforeLamports))
  )
    throw new Error("Start record mismatch");
  async function state() {
    return await rpc("getProgramAccounts", [
      program,
      { encoding: "base64", commitment: "finalized" },
    ]);
  }
  async function verify() {
    const current = await code();
    if (!current.binary.equals(binary))
      throw new Error("New code not finalized");
    if (!start || !existsSync(statePath))
      throw new Error("Missing pre-upgrade snapshot");
    const before = JSON.parse(readFileSync(statePath, "utf8"));
    const after = new Map((await state()).map((a) => [a.pubkey, a.account]));
    let exactReceipts = 0,
      progressedReceipts = 0,
      editions = 0,
      configs = 0;
    for (const a of before) {
      const next = after.get(a.pubkey);
      if (!next || next.owner !== program)
        throw new Error("Historical account missing");
      const b = bytes(a.account),
        n = bytes(next);
      if (b.subarray(0, 8).equals(disc("Receipt"))) {
        // Only randomness/state/dropIndex may legitimately progress during upload.
        if (
          b.length !== n.length ||
          !b.subarray(0, 136).equals(n.subarray(0, 136)) ||
          !b.subarray(168, 176).equals(n.subarray(168, 176)) ||
          b[178] !== n[178] ||
          n[176] < b[176]
        )
          throw new Error("Historical paid receipt terms changed");
        if (b.equals(n)) exactReceipts++;
        else progressedReceipts++;
      } else {
        if (!b.equals(n) || a.account.lamports !== next.lamports)
          throw new Error("Historical configuration changed");
        if (b.subarray(0, 8).equals(disc("Edition"))) editions++;
        if (b.subarray(0, 8).equals(disc("Config"))) configs++;
      }
    }
    const remainingBuffer = await account(start.buffer);
    if (remainingBuffer && remainingBuffer.lamports !== 0)
      throw new Error("Buffer rent not returned");
    const transaction = await rpc("getTransaction", [
      start.signature,
      {
        encoding: "json",
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (!transaction || transaction.meta.err)
      throw new Error("Upgrade transaction not finalized");
    const keys = transaction.transaction.message.accountKeys;
    const bufferIndex = keys.indexOf(start.buffer),
      authorityIndex = keys.indexOf(authority),
      dataIndex = keys.indexOf(programData);
    if (
      [bufferIndex, authorityIndex, dataIndex].some((i) => i < 0) ||
      transaction.meta.postBalances[bufferIndex] !== 0 ||
      transaction.meta.preBalances[bufferIndex] <
        start.temporaryBufferRentLamports ||
      transaction.meta.preBalances[bufferIndex] >
        start.temporaryBufferRentLamports + 100000 ||
      transaction.meta.postBalances[dataIndex] !==
        transaction.meta.preBalances[dataIndex] ||
      transaction.meta.postBalances[authorityIndex] -
        transaction.meta.preBalances[authorityIndex] !==
        transaction.meta.preBalances[bufferIndex] - transaction.meta.fee
    )
      throw new Error("Finalized buffer refund/balance mismatch");
    const extension = start.extensionSignature
      ? await rpc("getTransaction", [
          start.extensionSignature,
          {
            encoding: "json",
            commitment: "finalized",
            maxSupportedTransactionVersion: 0,
          },
        ])
      : null;
    if (!extension || extension.meta.err)
      throw new Error("Extension transaction not finalized");
    const extensionIndex =
      extension.transaction.message.accountKeys.indexOf(programData);
    if (
      extensionIndex < 0 ||
      extension.meta.postBalances[extensionIndex] -
        extension.meta.preBalances[extensionIndex] !==
        start.programGrowthRentLamports
    )
      throw new Error("Finalized program rent growth mismatch");
    const balanceAfter = await balance();
    return {
      verifiedAt: new Date().toISOString(),
      network: "mainnet-beta",
      program,
      programData,
      upgradeAuthority: authority,
      previousBinarySha256: oldHash,
      binarySha256: newHash,
      binaryBytes: binary.length,
      deployedSlot: bytes(current.d).readBigUInt64LE(4).toString(),
      signature: start.signature,
      extensionSignature: start.extensionSignature,
      extensionTransactionFeeLamports: extension.meta.fee,
      buffer: start.buffer,
      temporaryBufferRentLamports: start.temporaryBufferRentLamports,
      bufferRentReturned: true,
      temporaryBufferRefundLamports: transaction.meta.preBalances[bufferIndex],
      programGrowthRentLamports: start.programGrowthRentLamports,
      upgradeTransactionFeeLamports: transaction.meta.fee,
      balanceBeforeLamports: start.balanceBeforeLamports,
      balanceAfterLamports: balanceAfter,
      walletNetSpentLamports: start.balanceBeforeLamports - balanceAfter,
      totalFeesBalanceDerivedLamports:
        start.balanceBeforeLamports -
        balanceAfter -
        start.programGrowthRentLamports,
      historicalConfigUnchanged: configs,
      historicalEditionsUnchanged: editions,
      historicalReceiptsByteIdentical: exactReceipts,
      historicalReceiptsLegitimatelyProgressed: progressedReceipts,
      historicalReceiptPricesAndEditionsUnchanged: true,
      packPriceChanged: false,
      oddsChanged: false,
      authorityChanged: false,
      pauseChanged: false,
      paidPurchaseSent: false,
    };
  }
  const current = await code();
  if (current.binary.equals(binary) || args.includes("--verify")) {
    const report = await verify();
    if (args.includes("--verify") && !existsSync(reportPath))
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
        flag: "wx",
      });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  // Supports resumption after growth: old binary plus zero-filled allocated tail.
  if (
    current.binary.length < 449184 ||
    hash(current.binary.subarray(0, 449184)) !== oldHash ||
    current.binary.subarray(449184).some((b) => b !== 0)
  )
    throw new Error("Unexpected existing code");
  const growth = Math.max(0, binary.length - current.binary.length);
  if (
    args.includes("--send") &&
    start &&
    (start.signature || (growth && start.extensionSignature))
  )
    throw new Error(
      "A previous broadcast is recorded. Inspect its finalized/expired status before retrying; do not allocate or upgrade twice."
    );
  const rent = (size) => rpc("getMinimumBalanceForRentExemption", [size]);
  const growthRent = Math.max(
    0,
    (await rent(binary.length + 45)) - current.d.lamports
  );
  const bufferRent = await rent(binary.length + 37);
  const balanceBefore = await balance();
  let buffer = existsSync(bufferPath) ? loadKey(bufferPath) : null;
  const existing = buffer ? await account(String(buffer.publicKey)) : null;
  if (
    existing &&
    (existing.owner !== LOADER ||
      bytes(existing).readUInt32LE(0) !== 1 ||
      bytes(existing)[4] !== 1 ||
      base58.deserialize(bytes(existing).subarray(5, 37))[0] !== authority ||
      bytes(existing).length !== binary.length + 37)
  )
    throw new Error("Unexpected recovery buffer");
  if (
    balanceBefore <
    growthRent + bufferRent - (existing?.lamports ?? 0) + 20000000
  )
    throw new Error("Insufficient working balance");
  console.log(
    JSON.stringify({
      program,
      authority,
      binarySha256: newHash,
      balanceBeforeLamports: balanceBefore,
      programGrowthRentLamports: growthRent,
      temporaryBufferRentLamports: bufferRent,
      send: args.includes("--send"),
    })
  );
  if (!args.includes("--send")) return;
  if (!buffer) {
    buffer = umi.eddsa.generateKeypair();
    writeFileSync(bufferPath, JSON.stringify(Array.from(buffer.secretKey)), {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (!start) {
    writeFileSync(statePath, JSON.stringify(await state()), {
      flag: "wx",
      mode: 0o600,
    });
    writeFileSync(
      startPath,
      JSON.stringify({
        program,
        authority,
        oldHash,
        newHash,
        balanceBeforeLamports: balanceBefore,
        programGrowthRentLamports: growthRent,
        temporaryBufferRentLamports: bufferRent,
        buffer: String(buffer.publicKey),
      }),
      { flag: "wx" }
    );
  } else if (start.buffer !== String(buffer.publicKey))
    throw new Error("Recovery buffer mismatch");
  const rollback = readFileSync(
    "onchain/target/rollback/ripsy_packs-199b77db.so"
  );
  if (hash(rollback) !== oldHash) throw new Error("Rollback binary mismatch");
  if (!existing || !bytes(existing).subarray(37).equals(binary)) {
    const child = spawn(
      "solana",
      [
        "program",
        "write-buffer",
        binaryPath,
        "--url",
        url,
        "--keypair",
        payerPath,
        "--fee-payer",
        payerPath,
        "--buffer-authority",
        payerPath,
        "--buffer",
        bufferPath,
        "--max-len",
        String(binary.length),
        "--use-rpc",
        "--commitment",
        "confirmed",
        "--max-sign-attempts",
        "10",
        "--with-compute-unit-price",
        "1000",
        "--output",
        "json",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    // CLI output may include recovery phrases on failure; never forward it.
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    const exit = await new Promise((resolve, reject) => {
      child.on("error", () => reject(new Error("CLI start failed")));
      child.on("close", resolve);
    });
    if (exit !== 0)
      throw new Error(
        "Upload incomplete; recovery key retained. Inspect chain before retrying."
      );
  }
  let uploaded;
  for (let i = 0; i < 24; i++) {
    uploaded = await account(String(buffer.publicKey));
    if (uploaded && bytes(uploaded).subarray(37).equals(binary)) break;
    await sleep(2500);
  }
  if (
    !uploaded ||
    uploaded.owner !== LOADER ||
    bytes(uploaded)[4] !== 1 ||
    base58.deserialize(bytes(uploaded).subarray(5, 37))[0] !== authority ||
    !bytes(uploaded).subarray(37).equals(binary)
  )
    throw new Error("Finalized uploaded code mismatch");
  console.log(
    "Finalized upload hash verified. Preparing signed growth/upgrade simulations."
  );
  let fresh = await code();
  if (hash(fresh.binary.subarray(0, 449184)) !== oldHash)
    throw new Error("Program changed during upload");
  const limit = Buffer.alloc(5);
  limit[0] = 2;
  limit.writeUInt32LE(1400000, 1);
  const priority = Buffer.alloc(9);
  priority[0] = 3;
  priority.writeBigUInt64LE(1000n, 1);
  async function build(instructions) {
    // Finalized hash is recognized across the provider's load-balanced banks.
    const blockhash = await umi.rpc.getLatestBlockhash({
      commitment: "finalized",
    });
    const items = [limit, priority].map((data) => ({
      instruction: {
        programId: publicKey("ComputeBudget111111111111111111111111111111"),
        keys: [],
        data,
      },
      signers: [],
      bytesCreatedOnChain: 0,
    }));
    items.push(
      ...instructions.map((instruction) => ({
        instruction,
        signers: [umi.identity],
        bytesCreatedOnChain: 0,
      }))
    );
    const builder = transactionBuilder()
      .setVersion(0)
      .setFeePayer(umi.identity)
      .setBlockhash(blockhash)
      .add(items);
    if (builder.getInstructions().length !== 2 + instructions.length)
      throw new Error("Instruction count mismatch");
    return await builder.buildAndSign(umi);
  }
  const remainingGrowth = Math.max(0, binary.length - fresh.binary.length);
  if (remainingGrowth) {
    const [extend] = upgradeInstructions(
      program,
      programData,
      String(buffer.publicKey),
      authority,
      remainingGrowth
    );
    const tx = await build([extend]);
    const simulation = await umi.rpc.simulateTransaction(tx, {
      verifySignatures: true,
      accounts: [publicKey(programData)],
    });
    const extended = simulation.accounts?.[0]
      ? bytes(simulation.accounts[0]).subarray(45)
      : null;
    if (
      simulation.err ||
      !extended ||
      extended.length !== binary.length ||
      hash(extended.subarray(0, 449184)) !== oldHash ||
      extended.subarray(449184).some((b) => b !== 0)
    )
      throw new Error("Extension simulation failed; not submitted");
    const record = JSON.parse(readFileSync(startPath, "utf8"));
    record.extensionSignature = base58.deserialize(tx.signatures[0])[0];
    writeFileSync(startPath, JSON.stringify(record));
    console.log(
      JSON.stringify({
        extensionSimulationPassed: true,
        extensionSignature: record.extensionSignature,
      })
    );
    await umi.rpc.sendTransaction(tx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 5,
    });
    for (let i = 0; i < 24; i++) {
      fresh = await code();
      if (fresh.binary.length === binary.length) break;
      await sleep(2500);
    }
    if (
      fresh.binary.length !== binary.length ||
      hash(fresh.binary.subarray(0, 449184)) !== oldHash ||
      fresh.binary.subarray(449184).some((b) => b !== 0)
    )
      throw new Error(
        "Extension finalization pending/mismatched; inspect before resuming"
      );
    console.log(
      "ProgramData extension finalized; old executable bytes unchanged."
    );
  }
  // The loader changes ProgramData's slot on extension and rejects an upgrade
  // simulated in that same slot. Wait for a later finalized bank if necessary.
  for (let i = 0; i < 20; i++) {
    if (
      BigInt(await rpc("getSlot", [{ commitment: "finalized" }])) >
      bytes(fresh.d).readBigUInt64LE(4)
    )
      break;
    await sleep(500);
  }
  const [upgrade] = upgradeInstructions(
    program,
    programData,
    String(buffer.publicKey),
    authority,
    0
  );
  const tx = await build([upgrade]);
  // This provider permits returning only one simulated account. Return code;
  // verify the buffer refund from finalized state and transaction balances.
  const simulation = await umi.rpc.simulateTransaction(tx, {
    commitment: "finalized",
    verifySignatures: true,
    accounts: [publicKey(programData)],
  });
  if (simulation.err) {
    console.log(
      JSON.stringify({ simulationError: simulation.err, logs: simulation.logs })
    );
    throw new Error("Upgrade simulation failed, not submitted");
  }
  if (
    !simulation.accounts?.[0] ||
    !bytes(simulation.accounts[0]).subarray(45).equals(binary)
  ) {
    console.log(
      JSON.stringify({
        simulationPassed: true,
        unitsConsumed: simulation.unitsConsumed,
        returnedAccountCount: simulation.accounts?.length,
        returnedAccountExists: !!simulation.accounts?.[0],
        returnedDataBytes: simulation.accounts?.[0]
          ? bytes(simulation.accounts[0]).length
          : null,
        returnedCodeSha256: simulation.accounts?.[0]
          ? hash(bytes(simulation.accounts[0]).subarray(45))
          : null,
      })
    );
    throw new Error("Simulation code mismatch");
  }
  console.log(
    JSON.stringify({
      simulationPassed: true,
      unitsConsumed: simulation.unitsConsumed,
    })
  );
  const record = JSON.parse(readFileSync(startPath, "utf8"));
  record.signature = base58.deserialize(tx.signatures[0])[0];
  writeFileSync(startPath, JSON.stringify(record));
  // One exact signed message, preflight enabled; retries cannot create a new purchase.
  await umi.rpc.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 5,
  });
  console.log(JSON.stringify({ upgradeSignature: record.signature }));
  // Re-read saved start through a fresh --verify invocation after finalization.
  for (let i = 0; i < 24; i++) {
    const c = await code();
    if (c.binary.equals(binary)) {
      console.log(
        "Upgrade code finalized. Run --verify to record state/rent verification."
      );
      return;
    }
    await sleep(2500);
  }
  throw new Error("Finalization pending; use --verify, not a fresh upload");
}
main().catch((error) => {
  console.error(
    error instanceof Error && !/https?:|secret|keypair/i.test(error.message)
      ? error.message
      : "Upgrade checks failed; sensitive diagnostics suppressed"
  );
  process.exitCode = 1;
});
