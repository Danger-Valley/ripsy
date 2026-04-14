import { CELLS, Choice, HEIGHT, Owner, Piece, WIDTH } from './types';

export const toIdx = (x: number, y: number) => y * WIDTH + x;
export const toXY = (i: number) => ({ x: i % WIDTH, y: Math.floor(i / WIDTH) });
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

export const padPiecesRPS = (len: number) => {
  const out: number[] = [];
  for (let k = 0; k < len; k++) {
    out.push((k % 3) + 1); // 1=Rock,2=Paper,3=Scissors
  }
  return out;
};

export const buildFullLineupWithFlag = (
  isP0: boolean,
  flagIdx: number,
  trapIdx: number | null,
): { xs: number[]; ys: number[]; pcs: number[] } => {
  const baseCells = spawnCells(isP0);

  const forcedCells: number[] = [flagIdx];
  if (trapIdx !== null && trapIdx !== flagIdx) {
    forcedCells.push(trapIdx);
  }

  const otherCells = baseCells.filter((c) => !forcedCells.includes(c));

  const otherPieces = padPiecesRPS(otherCells.length);

  const allCells: number[] = [];
  const allPieces: number[] = [];

  allCells.push(flagIdx);
  allPieces.push(Piece.Flag);

  if (trapIdx !== null && trapIdx !== flagIdx) {
    allCells.push(trapIdx);
    allPieces.push(Piece.Trap);
  }

  for (let i = 0; i < otherCells.length; i++) {
    allCells.push(otherCells[i]);
    allPieces.push(otherPieces[i]);
  }

  const xs: number[] = [];
  const ys: number[] = [];
  for (const idx of allCells) {
    const { x, y } = toXY(idx);
    xs.push(x);
    ys.push(y);
  }

  return { xs, ys, pcs: allPieces };
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
        : p === Piece.Trap
        ? 'T'
        : ' . ';
    return o === Owner.P0 ? ` ${base.toLowerCase()} ` : ` ${base} `;
  };
  const rows = board2D(
    [...Array(CELLS).keys()].map((i) => sym(owners[i], pieces[i])),
  );
  console.log('\nBoard (y=0 top):');
  for (let y = 0; y < HEIGHT; y++) console.log(rows[y].join(''));
};

export const decodeGame = (raw: any) => {
  const owners: Owner[] = (raw.boardCellsOwner as number[]).map(
    (n) => n as Owner,
  );
  const pieces: Piece[] = (raw.boardPieces as number[]).map((n) => n as Piece);

  return {
    p0: raw.player0 as string,
    p1: raw.player1 as string,
    winner: (raw.winner ? raw.winner : null) as string | null,
    phase: raw.phase as number,
    isP1Turn: Boolean(raw.isPlayer1Turn),
    owners,
    pieces,
    live0: Number(raw.livePlayer0),
    live1: Number(raw.livePlayer1),
    flagPos0: Number(raw.flagPos0),
    flagPos1: Number(raw.flagPos1),
    tiePending: Boolean(raw.tiePending),
    tieFrom: toXY(Number(raw.tieFrom)),
    tieTo: toXY(Number(raw.tieTo)),
    choiceMade0: Boolean(raw.choiceMade0),
    choiceMade1: Boolean(raw.choiceMade1),
    choice0: Number(raw.choice0) as Choice,
    choice1: Number(raw.choice1) as Choice,
  };
};
