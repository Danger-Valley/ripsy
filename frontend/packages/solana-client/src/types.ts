import type { Address } from "@solana/addresses";

// Game constants and types
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

export const Owner = {
  None: 0,
  P0: 1,
  P1: 2,
} as const;
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

const CHOICE_MAP: Record<string, Choice> = {
  none:     Choice.None,
  rock:     Choice.Rock,
  paper:    Choice.Paper,
  scissors: Choice.Scissors,
};

// Utility functions
export const toIdx = (x: number, y: number) => y * WIDTH + x;
export const toXY = (i: number) => ({ x: i % WIDTH, y: Math.floor(i / WIDTH) });

// Check if an address is empty (null, undefined, or default Solana address)
export const isEmptyAddress = (
  addr: string | null | undefined | Address,
): boolean => {
  const s = addr == null ? '' : String(addr);
  return (
    !s ||
    s === 'null' ||
    s === '' ||
    s === '11111111111111111111111111111111'
  );
};

export const spawnCells = (isP0: boolean) => {
  const cells: number[] = [];
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      if (isP0 ? y >= 4 : y <= 1) {
        cells.push(toIdx(x, y));
      }
    }
  return cells;
};

export const padPieces = (pieces: number[], len: number) => {
  const out: number[] = [...pieces];
  for (let k = pieces.length; k < len; k++) {
    out.push((k % 3) + 1); // 1=Rock,2=Paper,3=Scissors
  }
  return out;
};

export const u8 = (arr: number[]) => Buffer.from(Uint8Array.from(arr));

export function board2D<T>(flat: T[]): T[][] {
  const rows: T[][] = [];
  for (let y = 0; y < HEIGHT; y++)
    rows.push(flat.slice(y * WIDTH, (y + 1) * WIDTH));
  return rows;
}

export const printBoard = (owners: Owner[], pieces: Piece[]) => {
  const sym = (o: Owner, p: Piece) => {
    if (o === Owner.None) return ' . ';
    const base =
      p === Piece.Rock
        ? 'R'
        : p === Piece.Paper
        ? 'P'
        : p === Piece.Scissors
        ? 'S'
        : p === Piece.Flag
        ? 'F'
        : 'T';
    return o === Owner.P0 ? ` ${base.toLowerCase()} ` : ` ${base} `;
  };
  const rows = board2D(
    [...Array(CELLS).keys()].map((i) => sym(owners[i] ?? Owner.None, pieces[i] ?? Piece.Rock)),
  );
  console.log('\nBoard (y=0 top):');
  for (let y = 0; y < HEIGHT; y++) {
    const row = rows[y];
    if (row) console.log(row.join(''));
  }
};

export const printGameBoard = printBoard;

export const decodeGame = (raw: any) => {
  const owners: Owner[] = (raw.boardCellsOwner as number[]).map(
    (n) => n as Owner,
  );

  return {
    p0: raw.player0 as string,
    p1: raw.player1 as string,
    winner: (raw.winner ? raw.winner : null) as string | null,
    phase: raw.phase as number,
    isP1Turn: Boolean(raw.isPlayer1Turn),
    owners,
    live0: Number(raw.livePlayer0),
    live1: Number(raw.livePlayer1),
    attacker: Number(raw.attacker),
    defender: Number(raw.defender),
    outcome: Number(raw.outcome),
    tiePending: Boolean(raw.tiePending),
    tieFrom: toXY(Number(raw.tieFrom)),
    tieTo: toXY(Number(raw.tieTo)),
    nonce: raw.nonce
  };
};

export const decodeChoice = (raw: any): Choice => {
  const key = Object.keys(raw)[0];
  if (!key) return Choice.None;
  return CHOICE_MAP[key] ?? Choice.None;
};

export const decodePlayerData = (raw: any) => {
  const pieces: Piece[] = (raw.boardPieces as number[]).map((n) => n as Piece);

  return {
    pieces,
    choice: decodeChoice(raw.choice),
  };
};
