// Explicit one-program deployment. Default is read-only; --send broadcasts.
// Never prints RPC credentials or key contents. Keeps a recoverable buffer key.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { base58 } from '@metaplex-foundation/umi/serializers';
import { address, getProgramDerivedAddress } from '@solana/kit';

const program = '43FcaAGsYrqmviVpmChmCVsrqqqZzH3Usn6HEMztpdQJ';
const payer = 'BJomJVCbjz22kd84scx7X3eqMTBmuqZ4nhiFR7Cvm6dh';
const loader = 'BPFLoaderUpgradeab1e11111111111111111111111';
const expectedHash = '199b77db47f82812d115346f706dffa9913f3f207ca3ff13825f4746a5b8d256';
const binaryPath = 'onchain/target/deploy/ripsy_packs.so';
const payerPath = '/Users/heymike/.config/solana/ducks.json';
const programPath = 'onchain/keys/ripsy-packs-keypair.json';
const bufferPath = 'onchain/keys/mainnet-deploy-buffer.json';
const reportPath = 'onchain/mainnet-deployment.json';
const startPath = 'onchain/mainnet-deployment-start.json';
const url = process.env.SHOP_SOLANA_RPC_URL;
const args = process.argv.slice(2);
if (args.some(a => !['--send', '--verify'].includes(a)) || (args.includes('--send') && args.includes('--verify')))
  throw new Error('Use no arguments, --send, or --verify');
if (!url || new URL(url).protocol !== 'https:') throw new Error('Configured HTTPS RPC required');
const redact = value => String(value).replaceAll(url, '[RPC]').replace(/https?:\/\/[^\s"']+/g, '[URL]');
const hash = data => createHash('sha256').update(data).digest('hex');
const binary = readFileSync(binaryPath);
if (hash(binary) !== expectedHash) throw new Error('Binary differs from the reviewed build');
const umi = createUmi(url);
const loadKey = path => umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
if (String(loadKey(payerPath).publicKey) !== payer || String(loadKey(programPath).publicKey) !== program)
  throw new Error('Signing address mismatch');
async function rpc(method, params = []) {
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (result.error || result.result === undefined) throw new Error('RPC rejected request');
    return result.result;
  } catch { throw new Error(`RPC check failed: ${method}`); }
}
async function account(pubkey) {
  return (await rpc('getAccountInfo', [pubkey, { encoding: 'base64', commitment: 'finalized' }])).value;
}
const genesis = await rpc('getGenesisHash');
if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('Not Solana mainnet');
const balanceBefore = (await rpc('getBalance', [payer, { commitment: 'finalized' }])).value;
const start = existsSync(startPath) ? JSON.parse(readFileSync(startPath, 'utf8')) : null;
if (start && (start.program !== program || start.feePayer !== payer || start.binarySha256 !== expectedHash ||
    !Number.isSafeInteger(start.balanceBeforeLamports))) throw new Error('Deployment start record mismatch');
const existing = await account(program);
async function verify() {
  const p = await account(program);
  if (!p?.executable || p.owner !== loader) throw new Error('Deployed executable not finalized');
  const programBytes = Buffer.from(p.data[0], 'base64');
  if (programBytes.readUInt32LE(0) !== 2) throw new Error('Invalid program metadata');
  const programData = base58.deserialize(programBytes.subarray(4, 36))[0];
  const d = await account(programData);
  if (!d || d.owner !== loader || d.executable) throw new Error('Invalid ProgramData owner');
  const data = Buffer.from(d.data[0], 'base64');
  if (data.readUInt32LE(0) !== 3 || data[12] !== 1) throw new Error('Unexpected upgradeability');
  const authority = base58.deserialize(data.subarray(13, 45))[0];
  if (authority !== payer || !data.subarray(45).equals(binary)) throw new Error('Onchain code or authority mismatch');
  const [configAddress] = await getProgramDerivedAddress({ programAddress: address(program),
    seeds: [new TextEncoder().encode('config')] });
  const config = await account(configAddress);
  let onchainBuysAllowed = false;
  if (config) {
    const cfg = Buffer.from(config.data[0], 'base64');
    const discriminator = createHash('sha256').update('account:Config').digest().subarray(0, 8);
    if (config.owner !== program || cfg.length !== 142 || !cfg.subarray(0, 8).equals(discriminator))
      throw new Error('Unexpected config layout or owner');
    onchainBuysAllowed = cfg.readUInt32LE(136) > 0 && cfg[140] === 0;
  }
  const balanceAfter = (await rpc('getBalance', [payer, { commitment: 'finalized' }])).value;
  return {
    verifiedAt: new Date().toISOString(), network: 'mainnet-beta', program,
    programData, upgradeAuthority: authority, feePayer: payer,
    binarySha256: hash(binary), binaryBytes: binary.length,
    deployedSlot: data.readBigUInt64LE(4).toString(),
    programRentLamports: p.lamports + d.lamports,
    balanceBeforeLamports: start?.balanceBeforeLamports ?? balanceBefore, balanceAfterLamports: balanceAfter,
    netSpentLamports: (start?.balanceBeforeLamports ?? balanceBefore) - balanceAfter,
    configAddress, configInitialized: !!config, onchainBuysAllowed,
    localBackendPackEnabled: process.env.PACK_ENABLED === 'true',
  };
}
if (args.includes('--verify')) {
  const verified = await verify();
  console.log(JSON.stringify(verified, null, 2));
} else {
  if (existing) throw new Error('Program already exists. Use --verify, not a second deployment');
  const rent = await rpc('getMinimumBalanceForRentExemption', [binary.length + 45]);
  const programRent = await rpc('getMinimumBalanceForRentExemption', [36]);
  let bufferBalance = 0;
  if (existsSync(bufferPath)) {
    const buffer = await account(String(loadKey(bufferPath).publicKey));
    if (buffer) {
      const bytes = Buffer.from(buffer.data[0], 'base64');
      if (buffer.owner !== loader || bytes.readUInt32LE(0) !== 1 || bytes[4] !== 1 ||
          base58.deserialize(bytes.subarray(5, 37))[0] !== payer || bytes.length !== binary.length + 37)
        throw new Error('Existing buffer has unexpected owner, authority or size');
      bufferBalance = buffer.lamports;
    }
  }
  const required = rent + programRent - bufferBalance + 30000000;
  if (balanceBefore < required) throw new Error('Insufficient balance for rent and fee reserve');
  console.log(JSON.stringify({ network: 'mainnet-beta', program, payer,
    upgradeAuthority: payer, binaryBytes: binary.length, binarySha256: expectedHash,
    permanentRentSol: (rent + programRent) / 1e9, balanceSol: balanceBefore / 1e9,
    existingBufferSol: bufferBalance / 1e9, send: args.includes('--send') }));
  if (args.includes('--send')) {
    if (!start) writeFileSync(startPath, `${JSON.stringify({ program, feePayer: payer,
      binarySha256: expectedHash, balanceBeforeLamports: balanceBefore }, null, 2)}\n`, { flag: 'wx' });
    if (!existsSync(bufferPath)) {
      const key = umi.eddsa.generateKeypair();
      writeFileSync(bufferPath, JSON.stringify(Array.from(key.secretKey)), { mode: 0o600, flag: 'wx' });
    }
    const child = spawn('solana', ['program', 'deploy', binaryPath,
      '--url', url, '--keypair', payerPath, '--fee-payer', payerPath,
      '--upgrade-authority', payerPath, '--program-id', programPath,
      '--buffer', bufferPath, '--max-len', String(binary.length),
      '--use-rpc', '--commitment', 'confirmed', '--max-sign-attempts', '10',
      '--with-compute-unit-price', '1000', '--output', 'json'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const code = await new Promise((resolve, reject) => {
      child.on('error', () => reject(new Error('Could not start Solana CLI')));
      child.on('close', resolve);
    });
    console.log(redact(output));
    if (code !== 0) throw new Error('Deployment incomplete. Buffer key retained; inspect chain before resuming');
    let verified;
    for (let attempt = 0; attempt < 24; attempt++) {
      try { verified = await verify(); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 2500)); }
    }
    if (!verified) throw new Error('CLI completed but final verification is pending. Run --verify');
    writeFileSync(reportPath, `${JSON.stringify(verified, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(verified, null, 2));
  }
}
