import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import {
  address,
  createSolanaRpc,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { ConnectorClient } from '@solana/connector';
import {
  permissionPdaFromAccount,
  getAuthToken,
  waitUntilPermissionActive,
  AUTHORITY_FLAG,
  Member,
  createDelegatePermissionInstruction,
  TX_LOGS_FLAG,
  createCommitAndUndelegatePermissionInstruction,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { randomBytes } from 'crypto';
import { toast } from 'sonner';

import { Ripsy } from './ripsy';
import {
  WIDTH,
  HEIGHT,
  CELLS,
  Piece,
  Owner,
  Phase,
  Choice,
  toIdx,
  toXY,
  spawnCells,
  padPieces,
  u8,
  decodeGame,
  printBoard,
  printGameBoard,
  isEmptyAddress,
  decodePlayerData,
} from './types';

import idl from './idl/ripsy.json';

export type Commitment = 'processed' | 'confirmed' | 'finalized';

export interface ClusterConfig {
  rpcUrl: string;
  commitment?: Commitment;
  teeUrl: string;
  teeWsUrl: string;
  er_validator: anchor.web3.PublicKey;
}

// Shared options for all RPC calls
const DEFAULT_RPC_OPTS = {
  skipPreflight: true,
  preflightCommitment: 'confirmed' as Commitment,
  commitment: 'confirmed' as Commitment,
  maxRetries: 3,
};

export function getDefaultCluster(): ClusterConfig {
  return {
    rpcUrl: 'https://api.devnet.solana.com',
    commitment: DEFAULT_RPC_OPTS.commitment,
    teeUrl: "https://devnet-tee.magicblock.app",
    teeWsUrl: "wss://devnet-tee.magicblock.app",
    er_validator: new anchor.web3.PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo")
  };
}

// Game client class
export class RipsyGameClient {
  private program: Program<Ripsy>;
  private provider: AnchorProvider;
  private connection: anchor.web3.Connection;
  private isCreatingGame: boolean = false;

  private providerEphemeralRollup: AnchorProvider;
  private er_validator: anchor.web3.PublicKey;
  private permissionForPlayerData!: anchor.web3.PublicKey;
  private wallet: any;
  private providerTeePlayer!: AnchorProvider;
  private teeUrl: string;
  private teeWsUrl: string;

  private game!: anchor.web3.PublicKey;
  private playerData!: anchor.web3.PublicKey;

  private accountChangeSubscriptionId: number | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private onUpdateCallback: (() => void) | null = null;

  player: anchor.web3.PublicKey;

  constructor(connectorClient: ConnectorClient, account: string, signer: any, gamePda?: string) {
    this.wallet = {
      publicKey: new anchor.web3.PublicKey(account),
      signTransaction: async (tx: anchor.web3.Transaction) => {
        const signed = await signer.signTransaction(tx);
        return signed as anchor.web3.Transaction;
      },
      signAllTransactions: async (txs: anchor.web3.Transaction[]) => {
        const signed = await signer.signAllTransactions(txs);
        return signed as anchor.web3.Transaction[];
      },
      signMessage: async (msg: Uint8Array) => {
        if (!signer.signMessage) {
          throw new Error('Signer does not support signMessage');
        }
        const signMessage = signer.signMessage(msg);

        return signMessage;
      },
      signer
    };

    this.player = this.wallet.publicKey;

    const defaultCluster = getDefaultCluster();

    const endpoint = connectorClient?.getRpcUrl() ?? defaultCluster.rpcUrl;
    const connection = new anchor.web3.Connection(endpoint, defaultCluster.commitment);

    this.provider = new AnchorProvider(connection, this.wallet, DEFAULT_RPC_OPTS);
    this.connection = this.provider.connection;

    this.er_validator = defaultCluster.er_validator;

    this.teeUrl = defaultCluster.teeUrl;
    this.teeWsUrl = defaultCluster.teeWsUrl;

    this.providerEphemeralRollup = new anchor.AnchorProvider(
      new anchor.web3.Connection(this.teeUrl, {
        wsEndpoint: this.teeWsUrl,
        commitment: "confirmed",
      }),
      this.wallet,
    );

    // Initialize the program with the provided IDL
    this.program = new Program<Ripsy>(
      idl,
      this.provider
    );
  }

  async initGame(game: anchor.web3.PublicKey) {
    this.game = game;
    this.playerData = await this.playerDataPda(this.game, this.player);
    //this.providerTeePlayer = this.provider;

    this.permissionForPlayerData = permissionPdaFromAccount(this.playerData);

    const authTokenPlayer = await getAuthToken(
      this.providerEphemeralRollup.connection.rpcEndpoint,
      this.player,
      async (message: Uint8Array) => await this.wallet.signMessage(message)
    );

    console.log("Player Explorer URL:", `https://solscan.io/?cluster=custom&customUrl=${this.teeUrl}?token=${authTokenPlayer.token}`);

    this.providerTeePlayer = new anchor.AnchorProvider(
      new anchor.web3.Connection(
        process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
        `${this.teeUrl}?token=${authTokenPlayer.token}`,
        {
          wsEndpoint:
            process.env.EPHEMERAL_WS_ENDPOINT || `${this.teeWsUrl}?token=${authTokenPlayer.token}`,
        },
      ),
      this.wallet,
    );
  }

  get teeConnection(): anchor.web3.Connection {
    return this.providerTeePlayer?.connection ?? this.connection;
  }

  private async resubscribe(): Promise<void> {
    const connection = this.teeConnection;

    if (this.accountChangeSubscriptionId !== null) {
      try {
        await connection.removeAccountChangeListener(this.accountChangeSubscriptionId);
      } catch { }
      this.accountChangeSubscriptionId = null;
    }

    if (!this.onUpdateCallback) return;

    try {
      this.accountChangeSubscriptionId = connection.onAccountChange(
        this.game,
        () => this.onUpdateCallback?.(),
        'confirmed'
      );
      console.log('[subscribe] Game account subscription active');
    } catch (err) {
      console.warn('[subscribe] Failed to subscribe, retrying in 5s...', err);
      this.reconnectTimeout = setTimeout(() => this.resubscribe(), 5000);
    }
  }

  subscribeToGameChanges(onUpdate: () => void): () => void {
    this.onUpdateCallback = onUpdate;

    const connection = this.teeConnection;

    const ws = (connection as any)._rpcWebSocket;
    if (ws) {
      ws.on('close', () => {
        console.warn('[subscribe] WebSocket closed, reconnecting...');
        this.reconnectTimeout = setTimeout(() => this.resubscribe(), 2000);
      });
      ws.on('error', () => {
        console.warn('[subscribe] WebSocket error, reconnecting...');
        this.reconnectTimeout = setTimeout(() => this.resubscribe(), 2000);
      });
    }

    this.resubscribe();

    return () => {
      this.onUpdateCallback = null;

      if (this.reconnectTimeout !== null) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      if (this.accountChangeSubscriptionId !== null) {
        this.teeConnection
          .removeAccountChangeListener(this.accountChangeSubscriptionId)
          .catch(() => { });
        this.accountChangeSubscriptionId = null;
      }
    };
  }

  async sendTransaction(
    transaction: anchor.web3.Transaction,
    connection: anchor.web3.Connection,
  ): Promise<string> {
    const { blockhash } = await connection.getLatestBlockhash();
    
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signed = await this.wallet.signTransaction(transaction);
    
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      ...DEFAULT_RPC_OPTS,
      skipPreflight: true,
    });

    await connection.confirmTransaction(signature, DEFAULT_RPC_OPTS.commitment);

    return signature;
  }

  /** Derives the game PDA using {@link getProgramDerivedAddress} (@solana/kit). */
  async gamePda(payer: anchor.web3.PublicKey, nonce: Buffer): Promise<anchor.web3.PublicKey> {
    const programAddress = address(this.program.programId.toBase58());
    const encoder = getAddressEncoder();
    const [pda] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        Buffer.from('game'),
        encoder.encode(address(payer.toBase58())),
        nonce,
      ],
    });
    return new anchor.web3.PublicKey(pda);
  }

  /** Derives the player data PDA using {@link getProgramDerivedAddress} (@solana/kit). */
  async playerDataPda(game: anchor.web3.PublicKey, player: anchor.web3.PublicKey): Promise<anchor.web3.PublicKey> {
    const programAddress = address(this.program.programId.toBase58());
    const encoder = getAddressEncoder();
    const [pda] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        Buffer.from('player_data'),
        encoder.encode(address(game.toBase58())),
        encoder.encode(address(player.toBase58())),
      ],
    });
    return new anchor.web3.PublicKey(pda);
  }

  async getOpponent(): Promise<anchor.web3.PublicKey> {
    const { p0, p1 } = await this.getGameState();

    return new anchor.web3.PublicKey(p0.toString() === this.player.toString() ? p1 : p0);
  }

  // Create a new game
  async createGame(): Promise<{ gamePda: anchor.web3.PublicKey }> {
    // Check if already creating a game
    if (this.isCreatingGame) {
      throw new Error('Game creation already in progress');
    }

    this.isCreatingGame = true;

    try {
      console.log('Creating game...');
      console.log('Provider wallet:', this.player.toString());
      console.log('Program ID:', this.program.programId.toString());
      console.log('RPC URL:', this.connection.rpcEndpoint);

      const rpc = createSolanaRpc(this.connection.rpcEndpoint);
      const walletAddr = address(this.player.toBase58());
      const { value: lamports } = await rpc.getBalance(walletAddr).send();
      console.log('Wallet balance:', Number(lamports) / 1e9, 'SOL');

      if (lamports < BigInt(Math.floor(0.01 * 1e9))) {
        throw new Error('Insufficient SOL balance. Need at least 0.01 SOL for transaction fees.');
      }

      const nonce = randomBytes(32);
      const game = await this.gamePda(this.player, nonce);
      console.log('Game PDA:', game);

      await this.initGame(game);

      const createGameIx = await this.program.methods
        .createGame([...nonce])
        .accountsStrict({
          game: this.game,
          player: this.player,
          playerData: this.playerData,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      let members: Member[] | null = [
        {
          flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
          pubkey: this.player
        }
      ]
      const createPlayerData0PermissionIx = await this.program.methods
        .createPermission(
          { playerData: { game: this.game, player: this.player } },
          members
        )
        .accountsPartial({
          payer: this.player,
          permissionedAccount: this.playerData,
          permission: this.permissionForPlayerData,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const delegatePlayerData0Permission = createDelegatePermissionInstruction({
        payer: this.player,
        validator: this.er_validator,
        permissionedAccount: [this.playerData, false],
        authority: [this.player, true],
      })

      const delegatePlayerData0Ix = await this.program.methods
        .delegatePda({ playerData: { game: this.game, player: this.player } })
        .accounts({
          payer: this.player,
          validator: this.er_validator,
          pda: this.playerData,
        })
        .instruction();

      const transaction = new anchor.web3.Transaction().add(
        createGameIx,
        createPlayerData0PermissionIx,
        delegatePlayerData0Permission,
        delegatePlayerData0Ix,
      );

      const signature = await this.sendTransaction(transaction, this.provider.connection);

      await waitUntilPermissionActive(
        this.providerEphemeralRollup.connection.rpcEndpoint,
        this.playerData
      );

      console.log('Transaction signature:', signature);
      console.log('Game created successfully!');

      return { gamePda: this.game };
    } catch (error) {
      console.error('Game creation failed:', error);
      throw error;
    } finally {
      // Reset the flag
      this.isCreatingGame = false;
    }
  }

  // Join an existing game
  async joinGame(gamePda: anchor.web3.PublicKey): Promise<void> {
    console.log('Joining game...');
    console.log('Game PDA:', gamePda.toString());
    console.log('Joiner:', this.player.toString());

    // Check current game state first
    try {
 //     await this.initGame(gamePda);
      console.log('Game PDA:', this.game.toString());

      const currentState = await this.getGameState();
      console.log('Current game state:', currentState);

      // Check if player is already in the game
      if (currentState.p0 === this.player.toString() ||
        currentState.p1 === this.player.toString()) {
        console.log('Player is already in this game');
        return; // Already joined, no need to join again
      }

      // Check if game already has 2 players
      console.log('Current game state currentState.p0', currentState.p0);
      console.log('Current game state currentState.p1', currentState.p1);
      console.log('Current game state currentState.p0.toString()', currentState.p0.toString());
      console.log('Current game state currentState.p1.toString()', currentState.p1.toString());
      console.log('Current game state isEmptyAddress(currentState.p0)', isEmptyAddress(currentState.p0));
      console.log('Current game state isEmptyAddress(currentState.p1)', isEmptyAddress(currentState.p1));
      if (!isEmptyAddress(currentState.p0) && !isEmptyAddress(currentState.p1)) {
        throw new Error('Game is already full (2)');
      }

      const joinGameIx = await this.program.methods
        .joinGame()
        .accountsStrict({
          game: this.game,
          player: this.player,
          playerData: this.playerData,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      let members: Member[] | null = [
        {
          flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
          pubkey: this.player
        }
      ]
      const createPlayerData1PermissionIx = await this.program.methods
        .createPermission(
          { playerData: { game: this.game, player: this.player } },
          members
        )
        .accountsPartial({
          payer: this.player,
          permissionedAccount: this.playerData,
          permission: this.permissionForPlayerData,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const delegatePlayerData1Permission = createDelegatePermissionInstruction({
        payer: this.player,
        validator: this.er_validator,
        permissionedAccount: [this.playerData, false],
        authority: [this.player, true],
      })

      const delegatePlayerData1Ix = await this.program.methods
        .delegatePda({ playerData: { game: this.game, player: this.player } })
        .accounts({
          payer: this.player,
          validator: this.er_validator,
          pda: this.playerData,
        })
        .instruction()

      const { nonce } = await this.getGameState();

      const creator = await this.getOpponent();

      const delegateGameIx = await this.program.methods
        .delegatePda({ game: { player: creator, nonce } },)
        .accounts({
          payer: this.player,
          validator: this.er_validator,
          pda: this.game,
        })
        .instruction()

      const transaction = new anchor.web3.Transaction().add(
        joinGameIx,
        createPlayerData1PermissionIx,
        delegatePlayerData1Permission,
        delegatePlayerData1Ix,
        delegateGameIx,
      );

      const signature = await this.sendTransaction(transaction, this.provider.connection);

      await waitUntilPermissionActive(
        this.providerEphemeralRollup.connection.rpcEndpoint,
        this.playerData
      );

      console.log('Transaction signature:', signature);
      console.log('Successfully joined game');
    } catch (err) {
      console.error('Error checking game state before joining:', err);
      toast.error((err as Error)?.message ?? 'Unknown error');
    }
  }

  // Submit lineup with XY coordinates
  async submitLineup(
    isP0: boolean,
    flagPos: number
  ): Promise<void> {
    // Get spawn cells for the player
    const cells = spawnCells(isP0).filter(i => i !== flagPos);
    const xs = cells.map(i => toXY(i).x);
    const ys = cells.map(i => toXY(i).y);
    const pieces = padPieces([], cells.length);

    const submitLineupXyIx = await this.program.methods
      .submitLineupXy(u8(xs), u8(ys), u8(pieces))
      .accountsStrict({
        game: this.game,
        playerData: this.playerData,
        player: this.player
      })
      .instruction();

    const transaction = new anchor.web3.Transaction().add(
      submitLineupXyIx
    );

    const signature = await this.sendTransaction(transaction, this.providerTeePlayer.connection);
  }

  // Submit custom lineup with specific positions and pieces
  async submitCustomLineup(
    xs: number[],
    ys: number[],
    pieces: number[]
  ): Promise<void> {
    console.log('Submitting custom lineup...');
    console.log('Game PDA:', this.game.toString());
    console.log('Positions (xs, ys):', xs, ys);
    console.log('Pieces:', pieces);
    console.log('Pieces as bytes:', u8(pieces));

    const submitLineupXyIx = await this.program.methods
      .submitLineupXy(u8(xs), u8(ys), u8(pieces))
      .accountsStrict({
        game: this.game,
        playerData: this.playerData,
        player: this.player
      })
      .instruction();

    const transaction = new anchor.web3.Transaction().add(
      submitLineupXyIx
    );

    const signature = await this.sendTransaction(transaction, this.providerTeePlayer.connection);
    console.log("submitLineup signature:", signature)
    console.log('Lineup submitted successfully');
  }

  // Move a piece
  async movePiece(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): Promise<void> {
    const opponent = await this.getOpponent();
    const opponentData = await this.playerDataPda(this.game, opponent);
    console.log("movePiece", {
      fromX,
      fromY,
      toX,
      toY,
    })

    const movePieceXy = await this.program.methods
      .movePieceXy(fromX, fromY, toX, toY)
      .accountsStrict({
        game: this.game,
        playerData: this.playerData,
        player: this.player,
        opponentData: opponentData,
        opponent: opponent,
      })
      .instruction();

    const transaction = new anchor.web3.Transaction().add(
      movePieceXy
    );

    const signature = await this.sendTransaction(transaction, this.providerTeePlayer.connection);
  }

  // Choose weapon for tie-breaking
  async chooseWeapon(choice: Choice): Promise<void> {
    const opponent = await this.getOpponent();
    const opponentData = await this.playerDataPda(this.game, opponent);

    const chooseWeaponIx = await this.program.methods
      .chooseWeapon(choice as number)
      .accountsStrict({
        game: this.game,
        playerData: this.playerData,
        player: this.player,
        opponentData: opponentData,
        opponent: opponent,
      })
      .instruction();


    const transaction = new anchor.web3.Transaction().add(
      chooseWeaponIx
    );

    const signature = await this.sendTransaction(transaction, this.providerTeePlayer.connection);
  }

  async finishPlayerData(): Promise<void> {
    const undelegatePlayerDataIx = await this.program.methods
      .undelegatePda()
      .accountsPartial({
        pda: this.playerData,
        payer: this.player,
      })
      .instruction();

    const commitAndUndelegatePlayerDataPermissionIx = createCommitAndUndelegatePermissionInstruction({
      authority: [this.player, true],
      permissionedAccount: [this.playerData, false],
    });

    const closePlayerDataPermissionIx = await this.program.methods
      .closePermission({ playerData: { game: this.game, player: this.player } },)
      .accountsPartial({
        payer: this.player,
        permissionedAccount: this.playerData,
        permission: this.permissionForPlayerData,
      })
      .instruction();

    const closePlayerDataIx = await this.program.methods
      .closePlayerData()
      .accountsPartial({
        game: this.game,
        playerData: this.playerData,
        player: this.player,
      })
      .instruction();

    const transaction1 = new anchor.web3.Transaction().add(
      undelegatePlayerDataIx,
      commitAndUndelegatePlayerDataPermissionIx,
    );

    const signature1 = await this.sendTransaction(transaction1, this.providerTeePlayer.connection);

    const transaction2 = new anchor.web3.Transaction().add(
      closePlayerDataPermissionIx,
      closePlayerDataIx,
    );

    const signature2 = await this.sendTransaction(transaction2, this.connection);
  }

  async finishGame(): Promise<void> {
    const undelegateGameIx = await this.program.methods
      .undelegatePda()
      .accountsPartial({
        pda: this.game,
        payer: this.player,
      })
      .instruction();

    const closeGameIx = await this.program.methods
      .closeGame()
      .accountsPartial({
        game: this.game,
        player: this.player,
      })
      .instruction();

    const transaction1 = new anchor.web3.Transaction().add(
      undelegateGameIx,
    );

    const signature1 = await this.sendTransaction(transaction1, this.providerTeePlayer.connection);

    const transaction2 = new anchor.web3.Transaction().add(
      closeGameIx,
    );

    const signature2 = await this.sendTransaction(transaction2, this.connection);
  }

  // Fetch game state
  async getGameState() {
    let gameState;

    if(this.providerTeePlayer) {
      const raw = await this.providerTeePlayer.connection.getAccountInfo(this.game);
      gameState = this.program.account.game.coder.accounts.decode("game", raw!.data);
    } else {
      gameState = await this.program.account.game.fetch(this.game);
    }

    return decodeGame(gameState);
  }

  // Fetch player data state
  async getPlayerDataState() {
    if(!this.providerTeePlayer) return null;

    const playerDataPda = await this.playerDataPda(this.game, this.player);
    const raw = await this.providerTeePlayer.connection.getAccountInfo(playerDataPda);
    if (!raw) {
      return null;
    }

    const playerData = this.program.account.playerData.coder.accounts.decode("playerData", raw.data);
    return decodePlayerData(playerData);
  }

  // Print current board state
  async printGameBoard() {
    const gameState = await this.getGameState();
    const playerDataState = await this.getPlayerDataState();
    printGameBoard(gameState.owners, playerDataState ? playerDataState.pieces : []);
    return gameState;
  }

  // Check if it's the player's turn
  async isPlayerTurn(isPlayer1: boolean): Promise<boolean> {
    const gameState = await this.getGameState();
    return gameState.isP1Turn === isPlayer1;
  }

  // Get available moves for a piece
  getAvailableMoves(
    fromX: number,
    fromY: number,
    owners: Owner[],
    pieces: Piece[]
  ): { x: number; y: number }[] {
    const moves: { x: number; y: number }[] = [];
    const directions = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];

    directions.forEach(({ x: deltaX, y: deltaY }) => {
      const newX = fromX + deltaX;
      const newY = fromY + deltaY;

      // Check bounds
      if (newX >= 0 && newX < WIDTH && newY >= 0 && newY < HEIGHT) {
        const targetIdx = toIdx(newX, newY);
        const targetOwner = owners[targetIdx];

        // Can move to empty cells or attack opponent pieces
        if (targetOwner === Owner.None || targetOwner !== owners[toIdx(fromX, fromY)]) {
          moves.push({ x: newX, y: newY });
        }
      }
    });

    return moves;
  }

  // Check if a move is valid
  isValidMove(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    owners: Owner[],
    pieces: Piece[]
  ): boolean {
    const availableMoves = this.getAvailableMoves(fromX, fromY, owners, pieces);
    return availableMoves.some(move => move.x === toX && move.y === toY);
  }
}

// Export all types and utilities
export * from './types';
export * from './hooks/useRipsyGame';
export * from './context';