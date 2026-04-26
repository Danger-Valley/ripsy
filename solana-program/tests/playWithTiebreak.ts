import { submitFixedLineup } from './submitFixedLineup';
import { decodeGame, printBoard } from './cells';
import { Choice } from './types';

export const playWithTiebreak = async () => {
  const { program, p0, p1, game, playerData0, playerData1 } = await submitFixedLineup();

  let g: any, gDecoded: any;

  await program.methods
    .movePieceXy(3, 4, 3, 3)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(0, 1, 0, 2)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(3, 3, 3, 2)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(1, 1, 1, 2)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(3, 2, 4, 2)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(2, 1, 2, 2)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(4, 2, 4, 1)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(0, 2, 0, 3)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(0, 4, 0, 3)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .chooseWeapon(Choice.Rock)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .chooseWeapon(Choice.Rock)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .chooseWeapon(Choice.Scissors)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .chooseWeapon(Choice.Scissors)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);
    
  await program.methods
    .chooseWeapon(Choice.Rock)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

await program.methods
    .chooseWeapon(Choice.Scissors)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();    

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(2, 2, 3, 2)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(0, 3, 0, 2)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(3, 2, 3, 3)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(0, 2, 1, 2)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(3, 3, 3, 4)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(4, 4, 4, 3)
    .accountsStrict({ game, playerData: playerData0, player: p0, opponentData: playerData1, opponent: p1.publicKey })
    .rpc();

  g = await program.account.game.fetch(game);
  gDecoded = decodeGame(g);
  printBoard(gDecoded.owners, gDecoded.pieces);

  await program.methods
    .movePieceXy(3, 4, 3, 5)
    .accountsStrict({ game, playerData: playerData1, player: p1.publicKey, opponentData: playerData0, opponent: p0 })
    .signers([p1])
    .rpc();

  // final
  const gFinal: any = await program.account.game.fetch(game);
  const finalDecoded = decodeGame(gFinal);
  printBoard(finalDecoded.owners, finalDecoded.pieces);
  console.log('Final:', finalDecoded);

  return {
    gameState: gFinal,
    decoded: finalDecoded,
  };
};
