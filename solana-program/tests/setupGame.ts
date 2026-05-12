import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  permissionPdaFromAccount,
  getAuthToken,
  waitUntilPermissionActive,
  AUTHORITY_FLAG,
  Member,
  createDelegatePermissionInstruction,
  TX_LOGS_FLAG,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import * as nacl from 'tweetnacl';
const { randomBytes } = require('crypto');

import { Ripsy } from '../target/types/ripsy';
import { airdropIfNeeded, fund, sendTransaction } from './helper';

export interface GameSetupReturn {
  program: anchor.Program<any>;
  p0: anchor.web3.Keypair;
  p1: anchor.web3.Keypair;
  playerData0: anchor.web3.PublicKey;
  playerData1: anchor.web3.PublicKey;
  permissionForPlayerData0: anchor.web3.PublicKey;
  permissionForPlayerData1: anchor.web3.PublicKey;
  game: anchor.web3.PublicKey;
  connection0: anchor.web3.Connection;
  connection1: anchor.web3.Connection;
  connection: anchor.web3.Connection;
}

export const setupGame = async (): Promise<GameSetupReturn> => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Ripsy as Program<Ripsy>;

  const teeUrl = "https://devnet-tee.magicblock.app";
  const teeWsUrl = "wss://devnet-tee.magicblock.app";
  const ephemeralRpcEndpoint = (
    process.env.TEE_PROVIDER_ENDPOINT || teeUrl
  ).replace(/\/$/, "");

  let providerEphemeralRollup = new anchor.AnchorProvider(
    new anchor.web3.Connection(ephemeralRpcEndpoint, {
      wsEndpoint: process.env.TEE_WS_ENDPOINT || teeWsUrl,
      commitment: "confirmed",
    }),
    anchor.Wallet.local(),
  );

  let ER_VALIDATOR = new anchor.web3.PublicKey(process.env.TEE_VALIDATOR || "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");

  console.log("Base Layer Connection: ", provider.connection.rpcEndpoint);
  console.log(
    "Ephemeral Rollup Connection: ",
    providerEphemeralRollup.connection.rpcEndpoint,
  );

  const p0 = provider.wallet.payer!;
  const p1 = anchor.web3.Keypair.generate();

  if(provider.connection.rpcEndpoint.includes("localhost") ||
        provider.connection.rpcEndpoint.includes("127.0.0.1")
  ) {
    await airdropIfNeeded(provider.connection, p0.publicKey);
    await airdropIfNeeded(provider.connection, p1.publicKey);
  } else {
    await fund(provider, p1.publicKey, 0.03 * anchor.web3.LAMPORTS_PER_SOL);
  }

  const nonce = randomBytes(32);

  const [game] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('game'), p0.publicKey.toBuffer(), Buffer.from(nonce)],
    program.programId,
  );

  const [playerData0] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('player_data'), game.toBuffer(), p0.publicKey.toBuffer()],
    program.programId,
  );

  const [playerData1] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('player_data'), game.toBuffer(), p1.publicKey.toBuffer()],
    program.programId,
  );

  const permissionForPlayerData0 = permissionPdaFromAccount(playerData0);
  const permissionForPlayerData1 = permissionPdaFromAccount(playerData1);

  console.log("Game PDA:", game.toBase58());
  console.log("Player0 (creator):", p0.publicKey.toBase58());
  console.log("Player1 (joiner):", p1.publicKey.toBase58());
  console.log("PlayerData PDA for Player0:", playerData0.toBase58());
  console.log("PlayerData PDA for Player1:", playerData1.toBase58());
  console.log("Permission PDA for PlayerData0:", permissionForPlayerData0.toString());
  console.log("Permission PDA for PlayerData1:", permissionForPlayerData1.toString());

  let authTokenPlayer0: { token: string; expiresAt: number };
  let authTokenPlayer1: { token: string; expiresAt: number };
  let providerTeePlayer0;
  let providerTeePlayer1;

  if (ephemeralRpcEndpoint.includes("tee")) {
    authTokenPlayer0 = await getAuthToken(ephemeralRpcEndpoint, p0.publicKey, (message: Uint8Array) => Promise.resolve(nacl.sign.detached(message, p0.secretKey)));
    console.log("Player 0 Explorer URL:", `https://solscan.io/?cluster=custom&customUrl=${teeUrl}?token=${authTokenPlayer0.token}`);
    
    authTokenPlayer1 = await getAuthToken(ephemeralRpcEndpoint, p1.publicKey, (message: Uint8Array) => Promise.resolve(nacl.sign.detached(message, p1.secretKey)));
    console.log("Player 1 Explorer URL:", `https://solscan.io/?cluster=custom&customUrl=${teeUrl}?token=${authTokenPlayer1.token}`);

    providerTeePlayer0 = new anchor.AnchorProvider(
      new anchor.web3.Connection(
        process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
        `${teeUrl}?token=${authTokenPlayer0.token}`,
        {
          wsEndpoint:
            process.env.EPHEMERAL_WS_ENDPOINT || `${teeWsUrl}?token=${authTokenPlayer0.token}`,
        },
      ),
      anchor.Wallet.local(),
    );
    
    providerTeePlayer1 = new anchor.AnchorProvider(
      new anchor.web3.Connection(
        process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
        `${teeUrl}?token=${authTokenPlayer1.token}`,
        {
          wsEndpoint:
            process.env.EPHEMERAL_WS_ENDPOINT || `${teeWsUrl}?token=${authTokenPlayer1.token}`,
        },
      ),
      anchor.Wallet.local(),
    );
  }

  // create
  {
    const createGameIx = await program.methods
      .createGame([...nonce])
      .accountsStrict({
        game,
        player: p0.publicKey,
        playerData: playerData0,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    let members: Member[] | null = [
      {
        flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
        pubkey: p0.publicKey
      }
    ]
    const createPlayerData0PermissionIx = await program.methods
      .createPermission(
        { playerData: { game, player: p0.publicKey } },
        members
      )
      .accountsPartial({
        payer: p0.publicKey,
        permissionedAccount: playerData0,
        permission: permissionForPlayerData0,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    const delegatePlayerData0Permission = createDelegatePermissionInstruction({
      payer: p0.publicKey,
      validator: ER_VALIDATOR,
      permissionedAccount: [playerData0, false],
      authority: [p0.publicKey, true],
    })

    const delegatePlayerData0Ix = await program.methods
      .delegatePda({ playerData: { game, player: p0.publicKey } })
      .accounts({
        payer: p0.publicKey,
        validator: ER_VALIDATOR,
        pda: playerData0,
      })
      .instruction();

    let txHash = await sendTransaction(
      provider.connection, 
      [
        createGameIx,
        createPlayerData0PermissionIx,
        delegatePlayerData0Permission,
        delegatePlayerData0Ix
      ], 
      p0
    );

    const result = await waitUntilPermissionActive(ephemeralRpcEndpoint, playerData0);
    if (result) {
      console.log("✅ PlayerData0 permission active:", playerData0.toBase58(), txHash);
    } else {
      console.log("❌ PlayerData0 permission not active:", playerData0.toBase58());
    }
  }

  // join
  {
    const joinGameIx = await program.methods
      .joinGame()
      .accountsStrict({
        game,
        player: p1.publicKey,
        playerData: playerData1,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([p1])
      .instruction();

    let members: Member[] | null = [
      {
        flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
        pubkey: p1.publicKey
      }
    ]
    const createPlayerData1PermissionIx = await program.methods
      .createPermission(
        { playerData: { game, player: p1.publicKey } },
        members
      )
      .accountsPartial({
        payer: p1.publicKey,
        permissionedAccount: playerData1,
        permission: permissionForPlayerData1,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    const delegatePlayerData1Permission = createDelegatePermissionInstruction({
      payer: p1.publicKey,
      validator: ER_VALIDATOR,
      permissionedAccount: [playerData1, false],
      authority: [p1.publicKey, true],
    })

    const delegatePlayerData1Ix = await program.methods
      .delegatePda({ playerData: { game, player: p1.publicKey } })
      .accounts({
        payer: p1.publicKey,
        validator: ER_VALIDATOR,
        pda: playerData1,
      })
      .instruction()

    const delegateGameIx = await program.methods
      .delegatePda({ game: { player: p0.publicKey, nonce } },)
      .accounts({
        payer: p1.publicKey,
        validator: ER_VALIDATOR,
        pda: game,
      })
      .instruction()

    let txHash = await sendTransaction(
      provider.connection, 
      [
        joinGameIx,
        createPlayerData1PermissionIx,
        delegatePlayerData1Permission,
        delegatePlayerData1Ix,
        delegateGameIx,
      ], 
      p1
    );

    console.log(`✅ Player 1 joined game ${game}: ${txHash}`);

    const player2DataResult = await waitUntilPermissionActive(ephemeralRpcEndpoint, playerData1);
    if (player2DataResult) {
      console.log("✅ PlayerData 1 permission active:", playerData1.toBase58(), txHash);
    } else {
      console.log("❌ PlayerData 1 permission not active:", playerData1.toBase58());
    }
  }

  return {
    program, p0, p1, game, playerData0, playerData1, permissionForPlayerData0, permissionForPlayerData1,
    connection0: providerTeePlayer0!.connection, connection1: providerTeePlayer1!.connection,
    connection: provider.connection
  };
};