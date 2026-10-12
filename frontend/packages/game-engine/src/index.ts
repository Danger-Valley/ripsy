import {
  CELLS,
  Choice,
  FigureVariant,
  FinishReason,
  GAME_CLOCK_INITIAL_MS,
  GameState,
  HEIGHT,
  canMoveTo,
  isMovablePiece,
  Owner,
  Phase,
  Piece,
  LINEUP_SETUP_DURATION_MS,
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
  schemaVersion: 5;
  id: string;
  phase: GameState['phase'];
  p0: string;
  p1: string;
  winner: string | null;
  finishReason: GameState['finishReason'];
  clock0Ms: number;
  clock1Ms: number;
  clockStartedAt: number | null;
  lineupDeadline0At: number | null;
  lineupDeadline1At: number | null;
  isP1Turn: boolean;
  owners: Owner[];
  pieces: Piece[];
  figureVariants: FigureVariant[];
  revealed: boolean[];
  choices: [Choice, Choice];
  live0: number;
  live1: number;
  attacker: number;
  defender: number;
  outcome: number;
  tiePending: boolean;
  tieRound: number;
  tieFrom: number;
  tieTo: number;
  createdAt: string;
  updatedAt: string;
}

export function createGameRecord(id: string, playerId: string, now = new Date()): GameRecord {
  const timestamp = now.toISOString();
  return {
    schemaVersion: 5,
    id,
    phase: Phase.Created,
    p0: playerId,
    p1: '',
    winner: null,
    finishReason: null,
    clock0Ms: GAME_CLOCK_INITIAL_MS,
    clock1Ms: GAME_CLOCK_INITIAL_MS,
    clockStartedAt: null,
    lineupDeadline0At: now.getTime() + LINEUP_SETUP_DURATION_MS,
    lineupDeadline1At: null,
    isP1Turn: false,
    owners: Array(CELLS).fill(Owner.None),
    pieces: Array(CELLS).fill(Piece.Empty),
    figureVariants: Array(CELLS).fill(FigureVariant.Empty),
    revealed: Array(CELLS).fill(false),
    choices: [Choice.None, Choice.None],
    live0: 0,
    live1: 0,
    attacker: Piece.Empty,
    defender: Piece.Empty,
    outcome: 0,
    tiePending: false,
    tieRound: 0,
    tieFrom: 0,
    tieTo: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function joinGame(game: GameRecord, playerId: string, now = new Date()) {
  if (settleLineupDeadline(game, now)) return;
  if (game.p0 === playerId || game.p1 === playerId) return;
  if (game.p1 || (game.phase !== Phase.Created && game.phase !== Phase.LineupP0Set)) {
    throw new Error('This game already has two players');
  }
  game.p1 = playerId;
  game.lineupDeadline1At = now.getTime() + LINEUP_SETUP_DURATION_MS;
  if (game.phase === Phase.Created) game.phase = Phase.Joined;
  touch(game, now);
}

export function submitLineup(
  game: GameRecord,
  playerId: string,
  xs: number[],
  ys: number[],
  rawPieces: number[],
  now = new Date(),
  rawFigureVariants?: number[],
) {
  requireParticipant(game, playerId);
  if (settleLineupDeadline(game, now)) return;
  if (game.phase >= Phase.Active) {
    throw new Error('Lineups cannot be changed in this game phase');
  }
  if (xs.length !== 14 || ys.length !== 14 || rawPieces.length !== 14) {
    throw new Error('A lineup must contain exactly 14 pieces');
  }
  const figureVariants = rawFigureVariants ?? starterFigureVariants();
  if (
    figureVariants.length !== 14
    || figureVariants.some(value => !Number.isInteger(value) || value < 1 || value > 255)
  ) {
    throw new Error('A lineup contains an invalid figure variant');
  }
  const isP0 = game.p0 === playerId;

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
    return { index: toIdx(x, y!), piece: piece as Piece, figureVariant: figureVariants[index] as FigureVariant };
  });

  if (new Set(positions.map(({ index }) => index)).size !== positions.length) {
    throw new Error('Two pieces cannot occupy the same cell');
  }
  for (const [piece, expected] of REQUIRED_PIECES) {
    if (counts.get(piece) !== expected) throw new Error('Lineup has the wrong piece composition');
  }

  const owner = isP0 ? Owner.P0 : Owner.P1;
  for (let index = 0; index < game.owners.length; index += 1) {
    if (game.owners[index] !== owner) continue;
    game.owners[index] = Owner.None;
    game.pieces[index] = Piece.Empty;
    game.figureVariants[index] = FigureVariant.Empty;
    game.revealed[index] = false;
  }
  for (const position of positions) {
    if (game.owners[position.index] !== Owner.None) throw new Error('A lineup cell is already occupied');
  }
  for (const position of positions) {
    game.owners[position.index] = owner;
    game.pieces[position.index] = position.piece;
    game.figureVariants[position.index] = position.figureVariant;
  }
  if (isP0) {
    game.live0 = 14;
    game.lineupDeadline0At = null;
  } else {
    game.live1 = 14;
    game.lineupDeadline1At = null;
  }
  game.phase = game.p1 && game.live0 === 14 && game.live1 === 14
    ? Phase.Active
    : game.live0 === 14
      ? Phase.LineupP0Set
      : game.live1 === 14
        ? Phase.LineupP1Set
        : game.p1 ? Phase.Joined : Phase.Created;
  if (game.phase === Phase.Active && game.clockStartedAt === null) game.clockStartedAt = now.getTime();
  touch(game, now);
}

export function movePiece(
  game: GameRecord,
  playerId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  now = new Date(),
) {
  requireParticipant(game, playerId);
  if (game.phase !== Phase.Active) throw new Error('The game is not active');
  if (settleGameClock(game, now)) return;
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
  if (!isMovablePiece(attacker)) throw new Error('That piece cannot move');
  if (!canMoveTo(attacker, game.owners[to]!)) throw new Error('The flag can only move to an empty cell');

  const defender = game.pieces[to]!;
  game.tieFrom = from;
  game.tieTo = to;
  game.attacker = attacker;
  game.defender = defender;
  game.outcome = 0;
  game.tieRound = 0;

  if (game.owners[to] === Owner.None) {
    relocate(game, from, to, owner, attacker);
    game.isP1Turn = !game.isP1Turn;
    startTurnClock(game, now);
    return;
  }
  if (game.owners[to] !== opponent) throw new Error('Invalid destination');
  // Once two pieces have fought, both identities are public knowledge. Keep
  // that knowledge on the surviving piece as it moves around the board.
  game.revealed[from] = true;
  game.revealed[to] = true;
  if (defender === Piece.Trap) {
    remove(game, from, owner);
    game.outcome = -1;
    game.isP1Turn = !game.isP1Turn;
    startTurnClock(game, now);
    return;
  }
  if (defender === Piece.Flag) {
    remove(game, to, opponent);
    relocate(game, from, to, owner, attacker);
    game.outcome = 1;
    game.phase = Phase.Finished;
    game.winner = playerId;
    game.finishReason = FinishReason.Flag;
    game.clockStartedAt = null;
    touch(game, now);
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
  startTurnClock(game, now);
}

export function chooseWeapon(game: GameRecord, playerId: string, choice: Choice, now = new Date()) {
  requireParticipant(game, playerId);
  if (game.phase === Phase.Active && settleGameClock(game, now)) return;
  if (!game.tiePending) throw new Error('There is no tied battle to resolve');
  if (choice !== Choice.Rock && choice !== Choice.Paper && choice !== Choice.Scissors) {
    throw new Error('Choose rock, paper, or scissors');
  }
  const playerIndex = game.p0 === playerId ? 0 : 1;
  if (game.choices[playerIndex] !== Choice.None) throw new Error('You already chose a weapon');
  game.choices[playerIndex] = choice;
  if (game.choices[0] === Choice.None || game.choices[1] === Choice.None) {
    touch(game, now);
    return;
  }

  const attackerOwner = game.owners[game.tieFrom]!;
  const attackerChoice = game.choices[attackerOwner === Owner.P0 ? 0 : 1];
  const defenderChoice = game.choices[attackerOwner === Owner.P0 ? 1 : 0];
  const outcome = rps(attackerChoice, defenderChoice);
  game.attacker = attackerChoice;
  game.defender = defenderChoice;
  game.outcome = outcome;

  if (outcome === 0) {
    game.tieRound += 1;
  } else {
    const defenderOwner = attackerOwner === Owner.P0 ? Owner.P1 : Owner.P0;
    if (outcome === 1) {
      remove(game, game.tieTo, defenderOwner);
      relocate(game, game.tieFrom, game.tieTo, attackerOwner, attackerChoice as Piece);
    } else {
      remove(game, game.tieFrom, attackerOwner);
      game.pieces[game.tieTo] = defenderChoice as Piece;
    }
    game.tiePending = false;
    game.tieRound = 0;
  }
  game.choices = [Choice.None, Choice.None];
  touch(game, now);
}

export function gameView(game: GameRecord, playerId: string, now = new Date()): GameState {
  const isParticipant = playerId === game.p0 || playerId === game.p1;
  const ownOwner = playerId === game.p0 ? Owner.P0 : playerId === game.p1 ? Owner.P1 : Owner.None;
  const pieces = game.pieces.map((piece, index) => {
    if (game.phase === Phase.Finished || game.owners[index] === ownOwner || game.revealed[index]) return piece;
    return Piece.Empty;
  });
  const [clock0Ms, clock1Ms] = effectiveClocks(game, now);
  return {
    gameId: game.id,
    phase: game.phase,
    isP1Turn: game.isP1Turn,
    owners: [...game.owners],
    pieces,
    figureVariants: [...game.figureVariants],
    live0: game.live0,
    live1: game.live1,
    attacker: game.attacker,
    defender: game.defender,
    outcome: game.outcome,
    playerChoice: isParticipant ? game.choices[playerId === game.p0 ? 0 : 1] : Choice.None,
    tiePending: game.tiePending,
    tieRound: game.tieRound,
    tieFrom: toXY(game.tieFrom),
    tieTo: toXY(game.tieTo),
    p0: game.p0,
    p1: game.p1,
    winner: game.winner,
    clock0Ms,
    clock1Ms,
    clockRunning: game.phase === Phase.Active ? (game.isP1Turn ? Owner.P1 : Owner.P0) : Owner.None,
    lineupDeadlineAt: ownOwner === Owner.P0
      ? game.lineupDeadline0At
      : ownOwner === Owner.P1 ? game.lineupDeadline1At : null,
    finishReason: game.finishReason,
  };
}

export function parseGameRecord(value: string, now = new Date()): GameRecord {
  const stored = JSON.parse(value) as Omit<Partial<GameRecord>, 'schemaVersion'> & { schemaVersion?: number };
  if (
    (stored.schemaVersion !== 1 && stored.schemaVersion !== 2 && stored.schemaVersion !== 3 && stored.schemaVersion !== 4 && stored.schemaVersion !== 5) ||
    !stored.id ||
    !Array.isArray(stored.owners) ||
    !Array.isArray(stored.pieces) ||
    !Array.isArray(stored.choices) ||
    stored.choices.length !== 2
  ) {
    throw new Error('Stored game data is invalid');
  }
  return {
    ...(stored as GameRecord),
    schemaVersion: 5,
    tieRound: validTieRound(stored.tieRound),
    revealed: validRevealed(stored.revealed),
    figureVariants: validFigureVariants(stored.figureVariants, stored.owners),
    finishReason: stored.finishReason ?? null,
    clock0Ms: validClock(stored.clock0Ms),
    clock1Ms: validClock(stored.clock1Ms),
    clockStartedAt: stored.phase === Phase.Active
      ? (typeof stored.clockStartedAt === 'number' ? stored.clockStartedAt : now.getTime())
      : null,
    lineupDeadline0At: legacyLineupDeadline(stored.lineupDeadline0At, stored.phase, stored.live0, stored.createdAt, now),
    lineupDeadline1At: stored.p1
      ? legacyLineupDeadline(stored.lineupDeadline1At, stored.phase, stored.live1, stored.updatedAt, now)
      : null,
  };
}

export function settleGameDeadline(game: GameRecord, now = new Date()): boolean {
  return settleLineupDeadline(game, now) || settleGameClock(game, now);
}

export function settleLineupDeadline(game: GameRecord, now = new Date()): boolean {
  if (game.phase >= Phase.Active) return false;
  const deadline = lineupDeadline(game);
  if (deadline === null || deadline > now.getTime()) return false;
  game.phase = Phase.Finished;
  game.winner = null;
  game.finishReason = FinishReason.LineupTimeout;
  game.clockStartedAt = null;
  game.lineupDeadline0At = null;
  game.lineupDeadline1At = null;
  touch(game, now);
  return true;
}

export function settleGameClock(game: GameRecord, now = new Date()): boolean {
  if (game.phase !== Phase.Active || game.clockStartedAt === null) return false;
  const elapsed = Math.max(0, now.getTime() - game.clockStartedAt);
  const key = game.isP1Turn ? 'clock1Ms' : 'clock0Ms';
  game[key] = Math.max(0, game[key] - elapsed);
  game.clockStartedAt = now.getTime();
  if (game[key] > 0) return false;
  game.phase = Phase.Finished;
  game.winner = game.isP1Turn ? game.p0 : game.p1;
  game.finishReason = FinishReason.Timeout;
  game.clockStartedAt = null;
  game.tiePending = false;
  game.choices = [Choice.None, Choice.None];
  touch(game, now);
  return true;
}

export function clockDeadline(game: GameRecord): number | null {
  if (game.phase !== Phase.Active || game.clockStartedAt === null) return null;
  return game.clockStartedAt + (game.isP1Turn ? game.clock1Ms : game.clock0Ms);
}

export function gameDeadline(game: GameRecord): number | null {
  return lineupDeadline(game) ?? clockDeadline(game);
}

function lineupDeadline(game: GameRecord): number | null {
  if (game.phase >= Phase.Active) return null;
  const deadlines = [game.lineupDeadline0At, game.lineupDeadline1At]
    .filter((value): value is number => typeof value === 'number');
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

function effectiveClocks(game: GameRecord, now: Date): [number, number] {
  if (game.phase !== Phase.Active || game.clockStartedAt === null) return [game.clock0Ms, game.clock1Ms];
  const elapsed = Math.max(0, now.getTime() - game.clockStartedAt);
  return game.isP1Turn
    ? [game.clock0Ms, Math.max(0, game.clock1Ms - elapsed)]
    : [Math.max(0, game.clock0Ms - elapsed), game.clock1Ms];
}

function startTurnClock(game: GameRecord, now: Date) {
  if (game.phase === Phase.Active) game.clockStartedAt = now.getTime();
  touch(game, now);
}

function validClock(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : GAME_CLOCK_INITIAL_MS;
}

function validTieRound(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function validRevealed(value: unknown): boolean[] {
  return Array.isArray(value) && value.length === CELLS && value.every(item => typeof item === 'boolean')
    ? [...value]
    : Array(CELLS).fill(false);
}

function validFigureVariants(value: unknown, owners: Owner[] | undefined): FigureVariant[] {
  if (
    Array.isArray(value)
    && value.length === CELLS
    && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)
  ) return [...value] as FigureVariant[];
  // Missing legacy model data cannot establish collectible ownership.
  return Array.from({ length: CELLS }, (_, index) => owners?.[index] === Owner.P0 || owners?.[index] === Owner.P1
    ? FigureVariant.Fig1 : FigureVariant.Empty);
}

function starterFigureVariants(): FigureVariant[] {
  return Array<FigureVariant>(14).fill(FigureVariant.Fig1);
}

function legacyLineupDeadline(
  value: unknown,
  phase: GameState['phase'] | undefined,
  livePieces: number | undefined,
  fallbackTimestamp: string | undefined,
  now: Date,
) {
  if (phase === Phase.Finished || phase === Phase.Active || livePieces === 14) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const fallback = fallbackTimestamp ? Date.parse(fallbackTimestamp) : Number.NaN;
  return (Number.isFinite(fallback) ? fallback : now.getTime()) + LINEUP_SETUP_DURATION_MS;
}

function requireParticipant(game: GameRecord, playerId: string) {
  if (game.p0 !== playerId && game.p1 !== playerId) throw new Error('You are not a player in this game');
}

function relocate(game: GameRecord, from: number, to: number, owner: Owner, piece: Piece) {
  const revealed = game.revealed[from] ?? false;
  const figureVariant = game.figureVariants[from] ?? FigureVariant.Fig1;
  game.owners[from] = Owner.None;
  game.pieces[from] = Piece.Empty;
  game.revealed[from] = false;
  game.figureVariants[from] = FigureVariant.Empty;
  game.owners[to] = owner;
  game.pieces[to] = piece;
  game.revealed[to] = revealed;
  game.figureVariants[to] = figureVariant;
}

function remove(game: GameRecord, index: number, owner: Owner) {
  game.owners[index] = Owner.None;
  game.pieces[index] = Piece.Empty;
  game.revealed[index] = false;
  game.figureVariants[index] = FigureVariant.Empty;
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

function touch(game: GameRecord, now = new Date()) {
  game.updatedAt = now.toISOString();
}
