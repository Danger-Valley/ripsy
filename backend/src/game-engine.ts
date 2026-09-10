import {
  CELLS,
  Choice,
  GameState,
  HEIGHT,
  Owner,
  Phase,
  Piece,
  toIdx,
  toXY,
  WIDTH,
} from '@rps/core';

const REQUIRED_PIECES = new Map<number, number>([
  [Piece.Rock, 4],
  [Piece.Paper, 4],
  [Piece.Scissors, 4],
  [Piece.Flag, 1],
  [Piece.Trap, 1],
]);

export interface GameRecord {
  schemaVersion: 1;
  id: string;
  phase: GameState['phase'];
  p0: string;
  p1: string;
  winner: string | null;
  isP1Turn: boolean;
  owners: Owner[];
  pieces: Piece[];
  choices: [Choice, Choice];
  live0: number;
  live1: number;
  attacker: number;
  defender: number;
  outcome: number;
  tiePending: boolean;
  tieFrom: number;
  tieTo: number;
  createdAt: string;
  updatedAt: string;
}

export function createGameRecord(id: string, playerId: string, now = new Date()): GameRecord {
  const timestamp = now.toISOString();
  return {
    schemaVersion: 1,
    id,
    phase: Phase.Created,
    p0: playerId,
    p1: '',
    winner: null,
    isP1Turn: false,
    owners: Array(CELLS).fill(Owner.None),
    pieces: Array(CELLS).fill(Piece.Empty),
    choices: [Choice.None, Choice.None],
    live0: 0,
    live1: 0,
    attacker: Piece.Empty,
    defender: Piece.Empty,
    outcome: 0,
    tiePending: false,
    tieFrom: 0,
    tieTo: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function joinGame(game: GameRecord, playerId: string) {
  if (game.p0 === playerId || game.p1 === playerId) return;
  if (game.p1 || game.phase !== Phase.Created) throw new Error('This game already has two players');
  game.p1 = playerId;
  game.phase = Phase.Joined;
  touch(game);
}

export function submitLineup(
  game: GameRecord,
  playerId: string,
  xs: number[],
  ys: number[],
  rawPieces: number[],
) {
  requireParticipant(game, playerId);
  if (game.phase !== Phase.Joined && game.phase !== Phase.LineupP0Set && game.phase !== Phase.LineupP1Set) {
    throw new Error('Lineups cannot be changed in this game phase');
  }
  if (xs.length !== 14 || ys.length !== 14 || rawPieces.length !== 14) {
    throw new Error('A lineup must contain exactly 14 pieces');
  }
  const isP0 = game.p0 === playerId;
  if ((isP0 && game.phase === Phase.LineupP0Set) || (!isP0 && game.phase === Phase.LineupP1Set)) {
    throw new Error('Your lineup has already been submitted');
  }

  const counts = new Map<number, number>();
  const positions = xs.map((x, index) => {
    const y = ys[index];
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= WIDTH || y! < 0 || y! >= HEIGHT) {
      throw new Error('Lineup contains an invalid board position');
    }
    if (isP0 ? y! < HEIGHT - 2 : y! > 1) throw new Error('Pieces must be placed in your two starting rows');
    const piece = rawPieces[index]!;
    if (!REQUIRED_PIECES.has(piece)) throw new Error('Lineup contains an invalid piece');
    counts.set(piece, (counts.get(piece) ?? 0) + 1);
    return { index: toIdx(x, y!), piece: piece as Piece };
  });

  if (new Set(positions.map(({ index }) => index)).size !== positions.length) {
    throw new Error('Two pieces cannot occupy the same cell');
  }
  for (const [piece, expected] of REQUIRED_PIECES) {
    if (counts.get(piece) !== expected) throw new Error('Lineup has the wrong piece composition');
  }

  const owner = isP0 ? Owner.P0 : Owner.P1;
  for (const position of positions) {
    if (game.owners[position.index] !== Owner.None) throw new Error('A lineup cell is already occupied');
  }
  for (const position of positions) {
    game.owners[position.index] = owner;
    game.pieces[position.index] = position.piece;
  }
  if (isP0) {
    game.live0 = 14;
    game.phase = game.phase === Phase.LineupP1Set ? Phase.Active : Phase.LineupP0Set;
  } else {
    game.live1 = 14;
    game.phase = game.phase === Phase.LineupP0Set ? Phase.Active : Phase.LineupP1Set;
  }
  touch(game);
}

export function movePiece(
  game: GameRecord,
  playerId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  requireParticipant(game, playerId);
  if (game.phase !== Phase.Active) throw new Error('The game is not active');
  if (game.tiePending) throw new Error('Resolve the current battle first');
  const isP1 = game.p1 === playerId;
  if (game.isP1Turn !== isP1) throw new Error('It is not your turn');
  for (const value of [fromX, fromY, toX, toY]) {
    if (!Number.isInteger(value)) throw new Error('Move coordinates must be integers');
  }
  if (fromX < 0 || fromX >= WIDTH || toX < 0 || toX >= WIDTH || fromY < 0 || fromY >= HEIGHT || toY < 0 || toY >= HEIGHT) {
    throw new Error('Move is outside the board');
  }
  if (Math.abs(fromX - toX) + Math.abs(fromY - toY) !== 1) throw new Error('Pieces move one orthogonal cell');

  const from = toIdx(fromX, fromY);
  const to = toIdx(toX, toY);
  const owner = isP1 ? Owner.P1 : Owner.P0;
  const opponent = isP1 ? Owner.P0 : Owner.P1;
  if (game.owners[from] !== owner) throw new Error('That is not your piece');
  if (game.owners[to] === owner) throw new Error('You cannot stack your pieces');
  const attacker = game.pieces[from]!;
  if (attacker === Piece.Empty || attacker === Piece.Trap) throw new Error('That piece cannot move');

  const defender = game.pieces[to]!;
  game.attacker = attacker;
  game.defender = defender;
  game.outcome = 0;

  if (game.owners[to] === Owner.None) {
    relocate(game, from, to, owner, attacker);
    game.isP1Turn = !game.isP1Turn;
    touch(game);
    return;
  }
  if (game.owners[to] !== opponent) throw new Error('Invalid destination');
  if (defender === Piece.Trap) {
    remove(game, from, owner);
    game.outcome = -1;
    game.isP1Turn = !game.isP1Turn;
    touch(game);
    return;
  }
  if (defender === Piece.Flag) {
    remove(game, to, opponent);
    relocate(game, from, to, owner, attacker);
    game.outcome = 1;
    game.phase = Phase.Finished;
    game.winner = playerId;
    touch(game);
    return;
  }

  const outcome = rps(attacker, defender);
  game.outcome = outcome;
  if (outcome === 0) {
    game.tiePending = true;
    game.tieFrom = from;
    game.tieTo = to;
    game.choices = [Choice.None, Choice.None];
    game.isP1Turn = !game.isP1Turn;
  } else if (outcome === 1) {
    remove(game, to, opponent);
    relocate(game, from, to, owner, attacker);
    game.isP1Turn = !game.isP1Turn;
  } else {
    remove(game, from, owner);
    game.isP1Turn = !game.isP1Turn;
  }
  touch(game);
}

export function chooseWeapon(game: GameRecord, playerId: string, choice: Choice) {
  requireParticipant(game, playerId);
  if (!game.tiePending) throw new Error('There is no tied battle to resolve');
  if (choice !== Choice.Rock && choice !== Choice.Paper && choice !== Choice.Scissors) {
    throw new Error('Choose rock, paper, or scissors');
  }
  const playerIndex = game.p0 === playerId ? 0 : 1;
  if (game.choices[playerIndex] !== Choice.None) throw new Error('You already chose a weapon');
  game.choices[playerIndex] = choice;
  if (game.choices[0] === Choice.None || game.choices[1] === Choice.None) {
    touch(game);
    return;
  }

  const attackerOwner = game.owners[game.tieFrom]!;
  const attackerChoice = game.choices[attackerOwner === Owner.P0 ? 0 : 1];
  const defenderChoice = game.choices[attackerOwner === Owner.P0 ? 1 : 0];
  const outcome = rps(attackerChoice, defenderChoice);
  game.attacker = attackerChoice;
  game.defender = defenderChoice;
  game.outcome = outcome;

  if (outcome !== 0) {
    const defenderOwner = attackerOwner === Owner.P0 ? Owner.P1 : Owner.P0;
    if (outcome === 1) {
      remove(game, game.tieTo, defenderOwner);
      relocate(game, game.tieFrom, game.tieTo, attackerOwner, attackerChoice as Piece);
    } else {
      remove(game, game.tieFrom, attackerOwner);
      game.pieces[game.tieTo] = defenderChoice as Piece;
    }
    game.tiePending = false;
  }
  game.choices = [Choice.None, Choice.None];
  touch(game);
}

export function gameView(game: GameRecord, playerId: string): GameState {
  const isParticipant = playerId === game.p0 || playerId === game.p1;
  const ownOwner = playerId === game.p0 ? Owner.P0 : playerId === game.p1 ? Owner.P1 : Owner.None;
  const pieces = game.pieces.map((piece, index) => {
    if (game.phase === Phase.Finished || game.owners[index] === ownOwner) return piece;
    return Piece.Empty;
  });
  return {
    gameId: game.id,
    phase: game.phase,
    isP1Turn: game.isP1Turn,
    owners: [...game.owners],
    pieces,
    live0: game.live0,
    live1: game.live1,
    attacker: game.attacker,
    defender: game.defender,
    outcome: game.outcome,
    playerChoice: isParticipant ? game.choices[playerId === game.p0 ? 0 : 1] : Choice.None,
    tiePending: game.tiePending,
    tieFrom: toXY(game.tieFrom),
    tieTo: toXY(game.tieTo),
    p0: game.p0,
    p1: game.p1,
    winner: game.winner,
  };
}

export function parseGameRecord(value: string): GameRecord {
  const game = JSON.parse(value) as GameRecord;
  if (
    game.schemaVersion !== 1 ||
    !game.id ||
    !Array.isArray(game.owners) ||
    !Array.isArray(game.pieces) ||
    !Array.isArray(game.choices) ||
    game.choices.length !== 2
  ) {
    throw new Error('Stored game data is invalid');
  }
  return game;
}

function requireParticipant(game: GameRecord, playerId: string) {
  if (game.p0 !== playerId && game.p1 !== playerId) throw new Error('You are not a player in this game');
}

function relocate(game: GameRecord, from: number, to: number, owner: Owner, piece: Piece) {
  game.owners[from] = Owner.None;
  game.pieces[from] = Piece.Empty;
  game.owners[to] = owner;
  game.pieces[to] = piece;
}

function remove(game: GameRecord, index: number, owner: Owner) {
  game.owners[index] = Owner.None;
  game.pieces[index] = Piece.Empty;
  if (owner === Owner.P0) game.live0 = Math.max(0, game.live0 - 1);
  if (owner === Owner.P1) game.live1 = Math.max(0, game.live1 - 1);
}

function rps(attacker: number, defender: number): number {
  if (attacker === defender) return 0;
  if (
    (attacker === Piece.Rock && defender === Piece.Scissors) ||
    (attacker === Piece.Paper && defender === Piece.Rock) ||
    (attacker === Piece.Scissors && defender === Piece.Paper)
  ) return 1;
  return -1;
}

function touch(game: GameRecord) {
  game.updatedAt = new Date().toISOString();
}
