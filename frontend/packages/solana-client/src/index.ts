import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import {
  address,
  createSolanaRpc,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { SolanaIcqRps } from './types';
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
} from './types';
import { randomBytes } from 'crypto';
import { toast } from 'sonner';

export type Commitment = 'processed' | 'confirmed' | 'finalized';

export interface ClusterConfig {
  rpcUrl: string;
  commitment?: Commitment;
}

// Shared options for all RPC calls
const DEFAULT_RPC_OPTS = {
  skipPreflight: true,
  preflightCommitment: 'confirmed' as Commitment,
  commitment: 'confirmed' as Commitment,
  maxRetries: 0,
};

export function getDefaultCluster(): ClusterConfig {
  return { rpcUrl: 'https://api.devnet.solana.com', commitment: 'confirmed' };
}

// Game client class
export class RpsGameClient {
  private program: Program<SolanaIcqRps>;
  private provider: AnchorProvider;
  private connection: Connection;
  private isCreatingGame: boolean = false;

  constructor(provider: AnchorProvider, idl: SolanaIcqRps) {
    this.provider = provider;
    this.connection = provider.connection;
    
    // Initialize the program with the provided IDL
    this.program = new Program<SolanaIcqRps>(
      idl,
      provider
    );
  }

  /** Derives the game PDA using {@link getProgramDerivedAddress} (@solana/kit). */
  public async gamePda(payer: PublicKey, nonce: Buffer): Promise<PublicKey> {
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
    return new PublicKey(pda);
  }

  // Create a new game
  async createGame(): Promise<{ gamePda: PublicKey }> {
    // Check if already creating a game
    if (this.isCreatingGame) {
      throw new Error('Game creation already in progress');
    }
    
    this.isCreatingGame = true;
    
    try {
      console.log('Creating game...');
      console.log('Provider wallet:', this.provider.wallet.publicKey?.toString());
      console.log('Program ID:', this.program.programId.toString());
      console.log('RPC URL:', this.connection.rpcEndpoint);
      
      const rpc = createSolanaRpc(this.connection.rpcEndpoint);
      const walletAddr = address(this.provider.wallet.publicKey!.toBase58());
      const { value: lamports } = await rpc.getBalance(walletAddr).send();
      console.log('Wallet balance:', Number(lamports) / 1e9, 'SOL');

      if (lamports < BigInt(Math.floor(0.01 * 1e9))) {
        throw new Error('Insufficient SOL balance. Need at least 0.01 SOL for transaction fees.');
      }
      
      const nonce = randomBytes(32);

      const gamePda = await this.gamePda(this.provider.wallet.publicKey!, nonce);
      console.log('Game PDA:', gamePda.toString());

      // Call the create_game instruction on the smart contract
      console.log('Sending createGame transaction...');
      const signature = await this.program.methods
        .createGame([...nonce])
        .accountsStrict({
          game: gamePda,
          payer: this.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(DEFAULT_RPC_OPTS);

      console.log('Transaction signature:', signature);
      console.log('Game created successfully!');

      return { gamePda };
    } catch (error) {
      console.error('Game creation failed:', error);
      throw error;
    } finally {
      // Reset the flag
      this.isCreatingGame = false;
    }
  }

  // Join an existing game
  async joinGame(gamePda: PublicKey): Promise<void> {
    console.log('Joining game...');
    console.log('Game PDA:', gamePda.toString());
    console.log('Joiner:', this.provider.wallet.publicKey?.toString());
    
    // Check current game state first
    try {
      const currentState = await this.getGameState(gamePda);
      console.log('Current game state:', currentState);
      
      // Check if player is already in the game
      if (currentState.p0 === this.provider.wallet.publicKey?.toString() || 
          currentState.p1 === this.provider.wallet.publicKey?.toString()) {
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

      await this.program.methods
        .joinGame()
        .accountsStrict({
            game: gamePda,
            joiner: this.provider.wallet.publicKey,
        })
        .rpc(DEFAULT_RPC_OPTS);
    
        console.log('Successfully joined game');
    } catch (err) {
      console.error('Error checking game state before joining:', err);
      toast.error((err as Error)?.message ?? 'Unknown error');
    }
  }

  // Place flag at specific coordinates
  // NOTE: There's no separate place_flag instruction in the smart contract.
  // Flag position should be included in the lineup submission.
  async placeFlag(gamePda: PublicKey, x: number, y: number): Promise<void> {
    throw new Error('placeFlag is not implemented. Use submitLineup or submitCustomLineup instead.');
  }

  // Submit lineup with XY coordinates
  async submitLineup(
    gamePda: PublicKey,
    isP0: boolean,
    flagPos: number
  ): Promise<void> {
    // Get spawn cells for the player
    const cells = spawnCells(isP0).filter(i => i !== flagPos);
    const xs = cells.map(i => toXY(i).x);
    const ys = cells.map(i => toXY(i).y);
    const pieces = padPieces([], cells.length);

    await this.program.methods
      .submitLineupXy(u8(xs), u8(ys), u8(pieces))
      .accountsStrict({
        inner: {
          game: gamePda,
          signer: this.provider.wallet.publicKey,
        },
      })
      .rpc(DEFAULT_RPC_OPTS);
  }

  // Submit custom lineup with specific positions and pieces
  async submitCustomLineup(
    gamePda: PublicKey,
    xs: number[],
    ys: number[],
    pieces: number[]
  ): Promise<void> {
    console.log('Submitting custom lineup...');
    console.log('Game PDA:', gamePda.toString());
    console.log('Positions (xs, ys):', xs, ys);
    console.log('Pieces:', pieces);
    console.log('Pieces as bytes:', u8(pieces));
    
    await this.program.methods
      .submitLineupXy(u8(xs), u8(ys), u8(pieces))
      .accountsStrict({
        inner: {
          game: gamePda,
          signer: this.provider.wallet.publicKey,
        },
      })
      .rpc(DEFAULT_RPC_OPTS);
    
    console.log('Lineup submitted successfully');
  }

  // Move a piece
  async movePiece(
    gamePda: PublicKey,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): Promise<void> {
    await this.program.methods
      .movePieceXy(fromX, fromY, toX, toY)
      .accountsStrict({
        game: gamePda,
        signer: this.provider.wallet.publicKey,
      })
      .rpc(DEFAULT_RPC_OPTS);
  }

  // Choose weapon for tie-breaking
  async chooseWeapon(gamePda: PublicKey, choice: Choice): Promise<void> {
    await this.program.methods
      .chooseWeapon(choice)
      .accountsStrict({
        game: gamePda,
        signer: this.provider.wallet.publicKey,
      })
      .rpc(DEFAULT_RPC_OPTS);
  }

  // Fetch game state
  async getGameState(gamePda: PublicKey) {
    const game = await this.program.account.game.fetch(gamePda);
    return decodeGame(game);
  }

  // Print current board state
  async printGameBoard(gamePda: PublicKey) {
    const gameState = await this.getGameState(gamePda);
    printGameBoard(gameState.owners, gameState.pieces);
    return gameState;
  }

  // Check if it's the player's turn
  async isPlayerTurn(gamePda: PublicKey, isPlayer1: boolean): Promise<boolean> {
    const gameState = await this.getGameState(gamePda);
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
export * from './hooks/useRpsGame';

