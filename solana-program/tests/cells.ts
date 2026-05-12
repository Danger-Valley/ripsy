import * as anchor from '@coral-xyz/anchor';
import { assert } from "chai";

import { Ripsy } from '../target/types/ripsy';
import { CELLS, HEIGHT, Owner, Piece, WIDTH } from './types';

export const toIdx = (x: number, y: number) => y * WIDTH + x;
export const toXY = (i: number) => ({ x: i % WIDTH, y: Math.floor(i / WIDTH) });
export const spawnCells = (isP0: boolean) => {
  const cells: number[] = [];
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      if (isP0 ? y >= 5 : y <= 1) {
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
        : o === Owner.P0
        ? '1'
        : o === Owner.P1
        ? '2'
        : ' . ';
    return o === Owner.P0 ? ` ${base.toLowerCase()} ` : ` ${base} `;
  };
  const rows = board2D(
    [...Array(CELLS).keys()].map((i) => sym(owners[i], pieces[i])),
  );
  console.log('\nBoard (y=0 top):');
  for (let y = 0; y < HEIGHT; y++) console.log(rows[y].join(''));
};

export const decodeGame = (program: anchor.Program<Ripsy>, raw: anchor.web3.AccountInfo<Buffer>) => {
  const gameAccount = program.coder.accounts.decode("game", raw.data);
  
  const owners: Owner[] = (gameAccount.boardCellsOwner as number[]).map(
    (n) => n as Owner,
  );

  return {
    p0: gameAccount.player0 as string,
    p1: gameAccount.player1 as string,
    winner: (gameAccount.winner ? gameAccount.winner : null) as string | null,
    phase: gameAccount.phase as number,
    isP1Turn: Boolean(gameAccount.isPlayer1Turn),
    owners,
    live0: Number(gameAccount.livePlayer0),
    live1: Number(gameAccount.livePlayer1),
    tiePending: Boolean(gameAccount.tiePending),
    tieFrom: toXY(Number(gameAccount.tieFrom)),
    tieTo: toXY(Number(gameAccount.tieTo)),
  };
};

export function assertPlayerDataInvariants(
  data: any,
  label: string,
  expectedPlayer?: anchor.web3.PublicKey
) {
  assert.exists(data.boardPieces, `${label}: boardPieces must exist`);
  assert.exists(data.player,      `${label}: player must exist`);

  assert.isArray(data.boardPieces,
    `${label}: boardPieces must be an array`);
  assert.equal(data.boardPieces.length, CELLS,
    `${label}: boardPieces length must equal CELLS (${CELLS})`);

  data.boardPieces.forEach((cell: number, i: number) => {
    assert.include([0, 1, 2, 3, 4, 5], cell,
      `${label}: boardPieces[${i}] must be 0, 1, 2, 3, 4, or 5, got ${cell}`);
  });

  if (expectedPlayer) {
    assert.equal(
      data.player.toBase58(),
      expectedPlayer.toBase58(),
      `${label}: player mismatch`
    );
  }
}

export function decodePlayerData(program: anchor.Program<Ripsy>, raw: anchor.web3.AccountInfo<Buffer>) {
  const playerData = program.account.playerData.coder.accounts.decode("playerData", raw.data);

  const boardPieces: Piece[] = (playerData.boardPieces as number[]).map((n) => n as Piece);

  return {
    boardPieces,
    player: playerData.player,
  };
}