export const WIDTH = 7;
export const HEIGHT = 7;
export const CELLS = WIDTH * HEIGHT;

export const Piece = {
  Empty: 0,
  Rock: 1,
  Paper: 2,
  Scissors: 3,
  Flag: 4,
  Trap: 5,
} as const;
export type Piece = (typeof Piece)[keyof typeof Piece];

export const Owner = { None: 0, P0: 1, P1: 2 } as const;
export type Owner = (typeof Owner)[keyof typeof Owner];

export const Phase = {
  Created: 0,
  Joined: 1,
  LineupP0Set: 2,
  LineupP1Set: 3,
  Active: 4,
  Finished: 5,
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const Choice = {
  None: 0,
  Rock: 1,
  Paper: 2,
  Scissors: 3,
} as const;
export type Choice = (typeof Choice)[keyof typeof Choice];

export type Move = 'rock' | 'paper' | 'scissors';
export type RoundResult = 'win' | 'lose' | 'draw';

export interface GameState {
  gamePda: string;
  phase: Phase;
  isP1Turn: boolean;
  owners: Owner[];
  pieces: Piece[];
  live0: number;
  live1: number;
  attacker: number;
  defender: number;
  outcome: number;
  playerChoice: Choice;
  tiePending: boolean;
  tieFrom: { x: number; y: number };
  tieTo: { x: number; y: number };
  p0: string;
  p1: string;
  winner: string | null;
}

export type ClientAction =
  | { type: 'createGame'; requestId: string }
  | { type: 'getGame'; requestId: string; gameId: string }
  | { type: 'joinGame'; requestId: string; gameId: string }
  | { type: 'submitLineup'; requestId: string; gameId: string; xs: number[]; ys: number[]; pieces: number[] }
  | { type: 'movePiece'; requestId: string; gameId: string; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'chooseWeapon'; requestId: string; gameId: string; choice: Choice };

export type ServerMessage =
  | { type: 'connected'; playerId: string }
  | { type: 'result'; requestId: string; gameId?: string; state?: GameState }
  | { type: 'state'; gameId: string; state: GameState }
  | { type: 'error'; requestId?: string; message: string };

export const toIdx = (x: number, y: number) => y * WIDTH + x;
export const toXY = (index: number) => ({ x: index % WIDTH, y: Math.floor(index / WIDTH) });
export const isEmptyAddress = (value: string | null | undefined) => !value;

export function decideRound(player: Move, opponent: Move): RoundResult {
  if (player === opponent) return 'draw';
  if (
    (player === 'rock' && opponent === 'scissors') ||
    (player === 'paper' && opponent === 'rock') ||
    (player === 'scissors' && opponent === 'paper')
  ) return 'win';
  return 'lose';
}

export function isMove(input: string): input is Move {
  return input === 'rock' || input === 'paper' || input === 'scissors';
}

export const MOVES: readonly Move[] = ['rock', 'paper', 'scissors'] as const;
