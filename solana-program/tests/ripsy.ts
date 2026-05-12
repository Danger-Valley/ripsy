import { setupGame, GameSetupReturn } from './setupGame';
import {
  u8, decodeGame, printBoard, toIdx, buildFullLineupWithFlag,
  decodePlayerData,
  assertPlayerDataInvariants
} from './cells';
import { Choice } from './types';
import { createCommitAndUndelegatePermissionInstruction, getPermissionStatus } from '@magicblock-labs/ephemeral-rollups-sdk';
import { accountExists, sendTransaction } from './helper';
import { assert } from 'chai';


type PlayStep =
  | { type: 'move'; fromX: number; fromY: number; toX: number; toY: number; isP1: boolean }
  | { type: 'weapon'; choice: Choice; isP1: boolean };

describe('Ripsy', () => {
  let context: GameSetupReturn;

  before(async () => {
    context = await setupGame();
    console.log('--- Setup Done ---');
  });

  describe('Lineup Stage', () => {
    it('Should submit fixed lineup', async () => {
      const { program, p1, p0, game, playerData1, playerData0, connection0, connection1 } = context;

      const p0FlagIdx = toIdx(3, 6);
      const p0TrapIdx = toIdx(2, 5);
      const {
        xs: xs0,
        ys: ys0,
        pcs: pcs0,
      } = buildFullLineupWithFlag(/* isP0 */ true, p0FlagIdx, p0TrapIdx);

      const submitLineup0XyIx = await program.methods
        .submitLineupXy(u8(xs0), u8(ys0), u8(pcs0))
        .accountsStrict({
          game,
          player: p0.publicKey,
          playerData: playerData0,
        })
        .signers([p0])
        .instruction();

      await sendTransaction(
        connection0,
        [
          submitLineup0XyIx
        ],
        p0
      );

      const p1FlagIdx = toIdx(3, 0);
      const p1TrapIdx = toIdx(4, 1);
      const { xs, ys, pcs } = buildFullLineupWithFlag(false, p1FlagIdx, p1TrapIdx);

      const submitLineup1XyIx = await program.methods
        .submitLineupXy(u8(xs), u8(ys), u8(pcs))
        .accountsStrict({
          game,
          playerData: playerData1,
          player: p1.publicKey
        })
        .signers([p1])
        .instruction();

      await sendTransaction(
        connection1,
        [
          submitLineup1XyIx
        ],
        p1
      );
    });
  });

  describe('Battle Stage', () => {
    const sequence: PlayStep[] = [
      { type: 'move', fromX: 3, fromY: 5, toX: 3, toY: 4, isP1: false },
      { type: 'move', fromX: 0, fromY: 1, toX: 0, toY: 2, isP1: true },
      { type: 'move', fromX: 3, fromY: 4, toX: 3, toY: 3, isP1: false },
      { type: 'move', fromX: 1, fromY: 1, toX: 1, toY: 2, isP1: true },
      { type: 'move', fromX: 3, fromY: 3, toX: 4, toY: 3, isP1: false },
      { type: 'move', fromX: 2, fromY: 1, toX: 2, toY: 2, isP1: true },
      { type: 'move', fromX: 4, fromY: 3, toX: 4, toY: 2, isP1: false },
      { type: 'move', fromX: 0, fromY: 2, toX: 0, toY: 3, isP1: true },
      { type: 'move', fromX: 4, fromY: 2, toX: 4, toY: 1, isP1: false },
      { type: 'move', fromX: 0, fromY: 3, toX: 0, toY: 4, isP1: true },
      { type: 'move', fromX: 0, fromY: 5, toX: 0, toY: 4, isP1: false },
      { type: 'weapon', choice: Choice.Rock, isP1: false },
      { type: 'weapon', choice: Choice.Rock, isP1: true },
      { type: 'weapon', choice: Choice.Scissors, isP1: false },
      { type: 'weapon', choice: Choice.Scissors, isP1: true },
      { type: 'weapon', choice: Choice.Rock, isP1: false },
      { type: 'weapon', choice: Choice.Scissors, isP1: true },
      { type: 'move', fromX: 2, fromY: 2, toX: 3, toY: 2, isP1: true },
      { type: 'move', fromX: 0, fromY: 4, toX: 0, toY: 3, isP1: false },
      { type: 'move', fromX: 3, fromY: 2, toX: 3, toY: 3, isP1: true },
      { type: 'move', fromX: 0, fromY: 3, toX: 0, toY: 2, isP1: false },
      { type: 'move', fromX: 3, fromY: 3, toX: 3, toY: 4, isP1: true },
      { type: 'move', fromX: 0, fromY: 2, toX: 1, toY: 2, isP1: false },
      { type: 'move', fromX: 3, fromY: 4, toX: 3, toY: 5, isP1: true },
      { type: 'move', fromX: 4, fromY: 5, toX: 4, toY: 4, isP1: false },
      { type: 'move', fromX: 3, fromY: 5, toX: 3, toY: 6, isP1: true },
    ];

    it('Executes the full sequence of moves and weapon choices', async () => {
      const { program, p0, p1, game, playerData0, playerData1, connection0, connection1 } = context;

      let gameStateDecoded;
      let playerData0Decoded, playerData1Decoded;
      let instruction;

      for (const [index, step] of sequence.entries()) {
        const isP1 = step.isP1;

        const accounts = {
          game,
          playerData: isP1 ? playerData1 : playerData0,
          player: isP1 ? p1.publicKey : p0.publicKey,
          opponentData: isP1 ? playerData0 : playerData1,
          opponent: isP1 ? p0.publicKey : p1.publicKey,
        };

        const signers = isP1 ? [p1] : [p0];

        try {
          if (step.type === 'move') {
            instruction = await program.methods
              .movePieceXy(step.fromX, step.fromY, step.toX, step.toY)
              .accountsStrict(accounts)
              .signers(signers)
              .instruction();
          } else {
            instruction = await program.methods
              .chooseWeapon(step.choice)
              .accountsStrict(accounts)
              .signers(signers)
              .instruction();
          }

          await sendTransaction(
            isP1 ? connection1 : connection0,
            [
              instruction
            ],
            isP1 ? p1 : p0
          );

          const gameAccountInfo = await connection0.getAccountInfo(game);
          gameStateDecoded = decodeGame(program, gameAccountInfo!);
          console.log(`Step ${index + 1} (${step.type}):`);
          console.log(step);
          
          const playerData0AccountInfo = await connection0.getAccountInfo(playerData0);
          playerData0Decoded = decodePlayerData(program, playerData0AccountInfo!);
          printBoard(gameStateDecoded.owners, playerData0Decoded.boardPieces);

          const playerData1AccountInfo = await connection1.getAccountInfo(playerData1);
          playerData1Decoded = decodePlayerData(program, playerData1AccountInfo!);
          printBoard(gameStateDecoded!.owners, playerData1Decoded.boardPieces);
        } catch (err) {
          console.error(`Failed at step ${index + 1}:`, err);
          throw err;
        }
      }

      console.log('Final Game State:', gameStateDecoded);
    });
  });

  describe('PlayerData access control', () => {
    it("Player0 reads and validates his own PlayerData", async () => {
      const { program, playerData0, connection0, p0 } = context;

      const accountInfo = await connection0.getAccountInfo(playerData0);
      assert.isNotNull(accountInfo, "playerData0 account must exist");

      const data = decodePlayerData(program, accountInfo!);
      console.log("👀 Player0 data:", data);

      assertPlayerDataInvariants(data, "Player0", p0.publicKey);
    });

    it("Player0 reads and validates his own PlayerData", async () => {
      const { program, playerData0, connection0, p0 } = context;

      const accountInfo = await connection0.getAccountInfo(playerData0);
      assert.isNotNull(accountInfo, "playerData0 account must exist");

      const data = decodePlayerData(program, accountInfo!);
      console.log("👀 Player0 data:", data);

      assertPlayerDataInvariants(data, "Player0", p0.publicKey);
    });

    it("Player1 reads and validates his own PlayerData", async () => {
      const { program, playerData1, connection1, p1 } = context;

      const accountInfo = await connection1.getAccountInfo(playerData1);
      assert.isNotNull(accountInfo, "playerData1 account must exist");

      const data = decodePlayerData(program, accountInfo!);
      console.log("👀 Player1 data:", data);

      assertPlayerDataInvariants(data, "Player1", p1.publicKey);
    });

    it("Player0 data is isolated from Player1 data", async () => {
      const { program, playerData0, playerData1, connection0, connection1 } = context;

      const [raw0, raw1] = await Promise.all([
        connection0.getAccountInfo(playerData0),
        connection1.getAccountInfo(playerData1),
      ]);

      assert.isNotNull(raw0, "playerData0 must exist");
      assert.isNotNull(raw1, "playerData1 must exist");

      assert.notEqual(
        playerData0.toBase58(),
        playerData1.toBase58(),
        "playerData0 and playerData1 must be distinct accounts"
      );

      const data0 = decodePlayerData(program, raw0!);
      const data1 = decodePlayerData(program, raw1!);

      assert.notEqual(
        data0.player.toBase58(),
        data1.player.toBase58(),
        "Players must be different"
      );
    });

    it("Sneak PlayerData0: player1's RPC cannot see player0's account", async () => {
      const { playerData0, connection1 } = context;

      await getPermissionStatus(connection1.rpcEndpoint, playerData0);

      const accountInfo = await connection1.getAccountInfo(playerData0);

      assert.isNull(
        accountInfo,
        "playerData0 must NOT be visible through player1's connection"
      );
    });

    it("Sneak PlayerData1: player0's RPC cannot see player1's account", async () => {
      const { playerData1, connection0 } = context;

      await getPermissionStatus(connection0.rpcEndpoint, playerData1);

      const accountInfo = await connection0.getAccountInfo(playerData1);

      assert.isNull(
        accountInfo,
        "playerData1 must NOT be visible through player0's connection"
      );
    })
  });

  describe("Undelegate Accounts", () => {
    it("Successfully Player0 undelegates his PDA and commits state back to base layer", async () => {
      const { program, p0, playerData0, connection0 } = context;

      assert.isTrue(
        await accountExists(connection0, playerData0),
        "delegatedPda must exist on ephemeral layer before undelegate"
      );

      const undelegatePdaIx = await program.methods
        .undelegatePda()
        .accountsPartial({
          pda: playerData0,
          payer: p0.publicKey,
        })
        .signers([p0])
        .instruction();

      const commitAndUndelegatePermissionIx = createCommitAndUndelegatePermissionInstruction({
        authority: [p0.publicKey, true],
        permissionedAccount: [playerData0, false],
      });

      await sendTransaction(
        connection0,
        [
          undelegatePdaIx,
          commitAndUndelegatePermissionIx,
        ],
        p0
      );
    });

    it("Fails to undelegate already undelegated PDA", async () => {
      const { program, playerData0, p0, connection0 } = context;

      try {
        const undelegatePdaIx = await program.methods
          .undelegatePda()
          .accountsPartial({
            pda: playerData0,
            payer: p0.publicKey,
          })
          .signers([p0])
          .instruction();

        await sendTransaction(
          connection0,
          [
            undelegatePdaIx
          ],
          p0
        );

        assert.fail("Expected error on double-undelegate");
      } catch (e: any) {
        assert.ok(e, "Must throw when trying to undelegate already returned PDA");
      }
    });

    it("Successfully Player1 undelegates his PDA and commits state back to base layer", async () => {
      const { program, p1, playerData1, connection1 } = context;

      assert.isTrue(
        await accountExists(connection1, playerData1),
        "delegatedPda must exist on ephemeral layer before undelegate"
      );

      const undelegatePdaIx = await program.methods
        .undelegatePda()
        .accountsPartial({
          pda: playerData1,
          payer: p1.publicKey,
        })
        .signers([p1])
        .instruction();

      const commitAndUndelegatePermissionIx = createCommitAndUndelegatePermissionInstruction({
        authority: [p1.publicKey, true],
        permissionedAccount: [playerData1, false],
      });

      await sendTransaction(
        connection1,
        [
          undelegatePdaIx,
          commitAndUndelegatePermissionIx,
        ],
        p1
      );
    });

    it("Successfully Player0 undelegates Game PDA and commits state back to base layer", async () => {
      const { program, game, p0, connection0 } = context;

      assert.isTrue(
        await accountExists(connection0, game),
        "delegatedPda must exist on ephemeral layer before undelegate"
      );

      const undelegatePdaIx = await program.methods
        .undelegatePda()
        .accountsPartial({
          pda: game,
          payer: p0.publicKey,
        })
        .signers([p0])
        .instruction();

      await sendTransaction(
        connection0,
        [
          undelegatePdaIx,
        ],
        p0
      );
    });
  });

  describe("Close Permissions", () => {
    it("Successfully Player0 closes his PlayerData permission", async () => {
      const { program, game, p0, playerData0, connection, permissionForPlayerData0 } = context;

      const info = await connection.getAccountInfo(permissionForPlayerData0);
      console.log("permission owner:", info?.owner.toBase58());

      const closePlayerData0PermissionIx = await program.methods
        .closePermission({ playerData: { game, player: p0.publicKey } },)
        .accountsPartial({
          payer: p0.publicKey,
          permissionedAccount: playerData0,
          permission: permissionForPlayerData0,
        })
        .signers([p0])
        .instruction();

      await sendTransaction(
        connection,
        [
          closePlayerData0PermissionIx
        ],
        p0
      );
    });

    it("Successfully Player1 closes his PlayerData permission", async () => {
      const { program, game, p1, playerData1, connection, permissionForPlayerData1 } = context;

      const info = await connection.getAccountInfo(permissionForPlayerData1);
      console.log("permission owner:", info?.owner.toBase58());

      const closePlayerData1PermissionIx = await program.methods
        .closePermission({ playerData: { game, player: p1.publicKey } },)
        .accountsPartial({
          payer: p1.publicKey,
          permissionedAccount: playerData1,
          permission: permissionForPlayerData1,
        })
        .signers([p1])
        .instruction();

      await sendTransaction(
        connection,
        [
          closePlayerData1PermissionIx
        ],
        p1
      );
    });
  });

  describe("Close Accounts", () => {
    it("Successfully Player0 close his PDA", async () => {
      const { program, game, p0, playerData0, connection } = context;

      const closePlayerDataIx = await program.methods
        .closePlayerData()
        .accountsPartial({
          game,
          playerData: playerData0,
          player: p0.publicKey,
        })
        .signers([p0])
        .instruction();

      await sendTransaction(
        connection,
        [
          closePlayerDataIx
        ],
        p0
      );
    });

    it("Successfully Player1 close his PDA", async () => {
      const { program, game, p1, playerData1, connection } = context;

      const closePlayerDataIx = await program.methods
        .closePlayerData()
        .accountsPartial({
          game,
          playerData: playerData1,
          player: p1.publicKey,
        })
        .signers([p1])
        .instruction();

      await sendTransaction(
        connection,
        [
          closePlayerDataIx,
        ],
        p1
      );
    });

    it("Successfully Player0 close Game PDA", async () => {
      const { program, game, p0, connection } = context;

      const closeGameIx = await program.methods
        .closeGame()
        .accountsPartial({
          game,
          player: p0.publicKey,
        })
        .signers([p0])
        .instruction();

      await sendTransaction(
        connection,
        [
          closeGameIx
        ],
        p0
      );
    });
  });
});