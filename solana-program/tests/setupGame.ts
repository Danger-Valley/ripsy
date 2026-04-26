import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';
import { Ripsy } from '../target/types/ripsy';
import { airdropIfNeeded } from './pdas';
import { buildFullLineupWithFlag, toIdx, u8 } from './cells';
const { randomBytes } = require('crypto');

export interface GameSetupReturn {
  program: anchor.Program<any>;
  p0: anchor.web3.PublicKey;
  p1: anchor.web3.Keypair;
  playerData0: anchor.web3.PublicKey;
  playerData1: anchor.web3.PublicKey;
  game: anchor.web3.PublicKey;
}

export const setupGame = async (): Promise<GameSetupReturn> => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Ripsy as Program<Ripsy>;
  const conn = provider.connection;

  const p0 = (provider.wallet as anchor.Wallet).publicKey;
  const p1 = Keypair.generate();
  await airdropIfNeeded(conn, p0);
  await airdropIfNeeded(conn, p1.publicKey);

  const nonce = randomBytes(32);

  const [game] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('game'), p0.toBuffer(), Buffer.from(nonce)],
    program.programId,
  );

  const [playerData0] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('player_data'), game.toBuffer(), p0.toBuffer()],
    program.programId,
  );

  const [playerData1] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('player_data'), game.toBuffer(), p1.publicKey.toBuffer()],
    program.programId,
  );

  // create
  await program.methods
    .createGame([...nonce])
    .accountsStrict({
      game,
      player: p0,
      playerData: playerData0,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  // lineup p0
  const p0FlagIdx = toIdx(3, 5);
  const p0TrapIdx = toIdx(2, 4);
  const {
    xs: xs0,
    ys: ys0,
    pcs: pcs0,
  } = buildFullLineupWithFlag(/* isP0 */ true, p0FlagIdx, p0TrapIdx);

  await program.methods
    .submitLineupXy(u8(xs0), u8(ys0), u8(pcs0))
    .accountsStrict({
      game, 
      player: p0,
      playerData: playerData0,
    })
    .rpc();

  // join
  await program.methods
    .joinGame()
    .accountsStrict({
      game,
      player: p1.publicKey,
      playerData: playerData1,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([p1])
    .rpc();

  return { program, p0, p1, game, playerData0, playerData1 };
};
