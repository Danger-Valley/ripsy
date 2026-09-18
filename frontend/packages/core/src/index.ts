export const WIDTH = 7;
export const HEIGHT = 7;
export const CELLS = WIDTH * HEIGHT;
export const PROTOCOL_VERSION = 1 as const;
export const GAME_CLOCK_INITIAL_MS = 10 * 60 * 1000;
export const LINEUP_SETUP_DURATION_MS = 3 * 60 * 1000;

export const Piece = {
  Empty: 0,
  Rock: 1,
  Paper: 2,
  Scissors: 3,
  Flag: 4,
  Trap: 5,
} as const;
export type Piece = (typeof Piece)[keyof typeof Piece];

export function isMovablePiece(piece: Piece) {
  // Only weapon-bearing fighters can move. Flags and traps are stationary
  // objectives, even though a flag is still a valid lineup piece.
  return piece === Piece.Rock || piece === Piece.Paper || piece === Piece.Scissors;
}

export const Owner = { None: 0, P0: 1, P1: 2 } as const;
export type Owner = (typeof Owner)[keyof typeof Owner];

export const FigureVariant = { Empty: 0, Fig1: 1, Fig2: 2 } as const;
export type FigureVariant = (typeof FigureVariant)[keyof typeof FigureVariant];

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

export const FinishReason = {
  Flag: 'flag',
  Timeout: 'timeout',
  LineupTimeout: 'lineup_timeout',
} as const;
export type FinishReason = (typeof FinishReason)[keyof typeof FinishReason];

export type Move = 'rock' | 'paper' | 'scissors';
export type RoundResult = 'win' | 'lose' | 'draw';

export interface GameState {
  gameId: string;
  phase: Phase;
  isP1Turn: boolean;
  owners: Owner[];
  pieces: Piece[];
  figureVariants?: FigureVariant[];
  live0: number;
  live1: number;
  attacker: number;
  defender: number;
  outcome: number;
  playerChoice: Choice;
  tiePending: boolean;
  tieRound?: number;
  tieFrom: { x: number; y: number };
  tieTo: { x: number; y: number };
  p0: string;
  p1: string;
  winner: string | null;
  clock0Ms?: number;
  clock1Ms?: number;
  clockRunning?: Owner;
  lineupDeadlineAt?: number | null;
  finishReason?: FinishReason | null;
}

export type ClientAction =
  | { type: 'createGame'; requestId: string }
  | { type: 'listGames'; requestId: string }
  | { type: 'getGame'; requestId: string; gameId: string }
  | { type: 'joinGame'; requestId: string; gameId: string }
  | { type: 'submitLineup'; requestId: string; gameId: string; xs: number[]; ys: number[]; pieces: number[]; figureVariants?: number[] }
  | { type: 'movePiece'; requestId: string; gameId: string; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'chooseWeapon'; requestId: string; gameId: string; choice: Choice };

export type ClientMessage = ClientAction | { type: 'authenticate'; token: string; protocolVersion: number };

export type ServerErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_MESSAGE'
  | 'REQUEST_FAILED'
  | 'UNSUPPORTED_PROTOCOL_VERSION';

export type ServerMessage =
  | { type: 'connected'; playerId: string; protocolVersion: number }
  | { type: 'result'; requestId: string; gameId?: string; state?: GameState; games?: GameState[] }
  | { type: 'state'; gameId: string; state: GameState }
  | {
      type: 'error';
      requestId?: string;
      code: ServerErrorCode;
      message: string;
      expectedProtocolVersion?: number;
      receivedProtocolVersion?: number;
    };

export const toIdx = (x: number, y: number) => y * WIDTH + x;
export const toXY = (index: number) => ({ x: index % WIDTH, y: Math.floor(index / WIDTH) });
export const isEmptyPlayerId = (value: string | null | undefined) => !value;

export class ProtocolMessageError extends Error {
  readonly code = 'INVALID_MESSAGE' as const;

  constructor(message = 'Invalid protocol message') {
    super(message);
    this.name = 'ProtocolMessageError';
  }
}

export class ProtocolVersionError extends Error {
  readonly code = 'UNSUPPORTED_PROTOCOL_VERSION' as const;

  constructor(
    readonly expectedVersion: number,
    readonly receivedVersion: number | undefined,
  ) {
    super(`Unsupported protocol version: expected ${expectedVersion}, received ${receivedVersion ?? 'none'}`);
    this.name = 'ProtocolVersionError';
  }
}

export function parseClientMessage(value: unknown): ClientMessage {
  const message = requireRecord(value);
  const type = requireString(message.type, 'Message type');

  if (type === 'authenticate') {
    const protocolVersion = message.protocolVersion === undefined
      ? PROTOCOL_VERSION
      : requireInteger(message.protocolVersion, 'Protocol version');
    if (protocolVersion !== PROTOCOL_VERSION) throw new ProtocolVersionError(PROTOCOL_VERSION, protocolVersion);
    return { type, token: requireString(message.token, 'Session token'), protocolVersion };
  }

  const requestId = requireString(message.requestId, 'Request ID');
  if (type === 'createGame' || type === 'listGames') return { type, requestId };
  const gameId = requireString(message.gameId, 'Game ID');
  if (type === 'getGame' || type === 'joinGame') return { type, requestId, gameId };
  if (type === 'submitLineup') {
    return {
      type,
      requestId,
      gameId,
      xs: requireIntegerArray(message.xs, 'Lineup x coordinates'),
      ys: requireIntegerArray(message.ys, 'Lineup y coordinates'),
      pieces: requireIntegerArray(message.pieces, 'Lineup pieces'),
      ...(message.figureVariants === undefined ? {} : {
        figureVariants: requireIntegerArray(message.figureVariants, 'Lineup figure variants'),
      }),
    };
  }
  if (type === 'movePiece') {
    return {
      type,
      requestId,
      gameId,
      fromX: requireInteger(message.fromX, 'Move fromX'),
      fromY: requireInteger(message.fromY, 'Move fromY'),
      toX: requireInteger(message.toX, 'Move toX'),
      toY: requireInteger(message.toY, 'Move toY'),
    };
  }
  if (type === 'chooseWeapon') {
    const choice = requireInteger(message.choice, 'Weapon choice');
    if (!isChoice(choice)) throw new ProtocolMessageError('Weapon choice is invalid');
    return { type, requestId, gameId, choice };
  }
  throw new ProtocolMessageError(`Unknown client message type: ${type}`);
}

export function parseServerMessage(value: unknown): ServerMessage {
  const message = requireRecord(value);
  const type = requireString(message.type, 'Message type');
  if (type === 'connected') {
    const protocolVersion = message.protocolVersion === undefined
      ? PROTOCOL_VERSION
      : requireInteger(message.protocolVersion, 'Protocol version');
    if (protocolVersion !== PROTOCOL_VERSION) throw new ProtocolVersionError(PROTOCOL_VERSION, protocolVersion);
    return { type, playerId: requireString(message.playerId, 'Player ID'), protocolVersion };
  }
  if (type === 'state') {
    const gameId = requireString(message.gameId, 'Game ID');
    const state = parseGameState(message.state);
    if (state.gameId !== gameId) throw new ProtocolMessageError('Game state ID does not match its envelope');
    return {
      type,
      gameId,
      state,
    };
  }
  if (type === 'result') {
    const result: Extract<ServerMessage, { type: 'result' }> = {
      type,
      requestId: requireString(message.requestId, 'Request ID'),
    };
    if (message.gameId !== undefined) result.gameId = requireString(message.gameId, 'Game ID');
    if (message.state !== undefined) result.state = parseGameState(message.state);
    if (message.games !== undefined) {
      if (!Array.isArray(message.games)) throw new ProtocolMessageError('Game list is invalid');
      result.games = message.games.map(parseGameState);
    }
    if (result.gameId && result.state && result.gameId !== result.state.gameId) {
      throw new ProtocolMessageError('Game state ID does not match its envelope');
    }
    return result;
  }
  if (type === 'error') {
    const code = requireString(message.code, 'Error code');
    if (!isServerErrorCode(code)) throw new ProtocolMessageError('Server error code is invalid');
    const error: Extract<ServerMessage, { type: 'error' }> = {
      type,
      code,
      message: requireString(message.message, 'Error message'),
    };
    if (message.requestId !== undefined) error.requestId = requireString(message.requestId, 'Request ID');
    if (message.expectedProtocolVersion !== undefined) {
      error.expectedProtocolVersion = requireInteger(message.expectedProtocolVersion, 'Expected protocol version');
    }
    if (message.receivedProtocolVersion !== undefined) {
      error.receivedProtocolVersion = requireInteger(message.receivedProtocolVersion, 'Received protocol version');
    }
    return error;
  }
  throw new ProtocolMessageError(`Unknown server message type: ${type}`);
}

export function parseGameState(value: unknown): GameState {
  const state = requireRecord(value);
  const phase = requireInteger(state.phase, 'Game phase');
  if (!isPhase(phase)) throw new ProtocolMessageError('Game phase is invalid');
  const owners = requireIntegerArray(state.owners, 'Game owners');
  const pieces = requireIntegerArray(state.pieces, 'Game pieces');
  if (owners.length !== CELLS || !owners.every(isOwner)) throw new ProtocolMessageError('Game owners are invalid');
  if (pieces.length !== CELLS || !pieces.every(isPiece)) throw new ProtocolMessageError('Game pieces are invalid');
  const figureVariants = state.figureVariants === undefined
    ? legacyFigureVariants(owners)
    : requireIntegerArray(state.figureVariants, 'Game figure variants');
  if (figureVariants.length !== CELLS || !figureVariants.every(isFigureVariant)) {
    throw new ProtocolMessageError('Game figure variants are invalid');
  }
  const playerChoice = requireInteger(state.playerChoice, 'Player choice');
  if (!isChoice(playerChoice)) throw new ProtocolMessageError('Player choice is invalid');
  return {
    gameId: requireString(state.gameId, 'Game ID'),
    phase,
    isP1Turn: requireBoolean(state.isP1Turn, 'Turn flag'),
    owners,
    pieces,
    figureVariants,
    live0: requireCount(state.live0, 'Player 0 live count'),
    live1: requireCount(state.live1, 'Player 1 live count'),
    attacker: requirePiece(state.attacker, 'Attacker'),
    defender: requirePiece(state.defender, 'Defender'),
    outcome: requireOutcome(state.outcome),
    playerChoice,
    tiePending: requireBoolean(state.tiePending, 'Tie flag'),
    tieRound: state.tieRound === undefined ? 0 : requireNonNegativeInteger(state.tieRound, 'Tie round'),
    tieFrom: requirePosition(state.tieFrom, 'Tie origin'),
    tieTo: requirePosition(state.tieTo, 'Tie destination'),
    p0: requireString(state.p0, 'Player 0 ID', true),
    p1: requireString(state.p1, 'Player 1 ID', true),
    winner: state.winner === null ? null : requireString(state.winner, 'Winner ID'),
    clock0Ms: state.clock0Ms === undefined ? GAME_CLOCK_INITIAL_MS : requireNonNegativeNumber(state.clock0Ms, 'Player 0 clock'),
    clock1Ms: state.clock1Ms === undefined ? GAME_CLOCK_INITIAL_MS : requireNonNegativeNumber(state.clock1Ms, 'Player 1 clock'),
    clockRunning: state.clockRunning === undefined ? Owner.None : requireOwner(state.clockRunning, 'Running clock'),
    lineupDeadlineAt: state.lineupDeadlineAt === undefined || state.lineupDeadlineAt === null
      ? null
      : requireNonNegativeNumber(state.lineupDeadlineAt, 'Lineup deadline'),
    finishReason: state.finishReason === undefined || state.finishReason === null
      ? null
      : requireFinishReason(state.finishReason),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProtocolMessageError();
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new ProtocolMessageError(`${label} is invalid`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ProtocolMessageError(`${label} is invalid`);
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  const number = requireNumber(value, label);
  if (number < 0) throw new ProtocolMessageError(`${label} is invalid`);
  return number;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  const number = requireInteger(value, label);
  if (number < 0) throw new ProtocolMessageError(`${label} is invalid`);
  return number;
}

function requireOwner(value: unknown, label: string): Owner {
  const owner = requireInteger(value, label);
  if (!isOwner(owner)) throw new ProtocolMessageError(`${label} is invalid`);
  return owner;
}

function requireFinishReason(value: unknown): FinishReason {
  if (value !== FinishReason.Flag && value !== FinishReason.Timeout && value !== FinishReason.LineupTimeout) {
    throw new ProtocolMessageError('Finish reason is invalid');
  }
  return value;
}

function requireInteger(value: unknown, label: string): number {
  const number = requireNumber(value, label);
  if (!Number.isInteger(number)) throw new ProtocolMessageError(`${label} is invalid`);
  return number;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ProtocolMessageError(`${label} is invalid`);
  return value;
}

function requireIntegerArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'number' && Number.isInteger(item))) {
    throw new ProtocolMessageError(`${label} are invalid`);
  }
  return value;
}

function requirePosition(value: unknown, label: string) {
  const position = requireRecord(value);
  const x = requireInteger(position.x, `${label} x`);
  const y = requireInteger(position.y, `${label} y`);
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) throw new ProtocolMessageError(`${label} is invalid`);
  return {
    x,
    y,
  };
}

function requireCount(value: unknown, label: string) {
  const count = requireInteger(value, label);
  if (count < 0 || count > 14) throw new ProtocolMessageError(`${label} is invalid`);
  return count;
}

function requirePiece(value: unknown, label: string): Piece {
  const piece = requireInteger(value, label);
  if (!isPiece(piece)) throw new ProtocolMessageError(`${label} is invalid`);
  return piece;
}

function requireOutcome(value: unknown) {
  const outcome = requireInteger(value, 'Outcome');
  if (outcome !== -1 && outcome !== 0 && outcome !== 1) throw new ProtocolMessageError('Outcome is invalid');
  return outcome;
}

function isChoice(value: number): value is Choice {
  return value === Choice.None || value === Choice.Rock || value === Choice.Paper || value === Choice.Scissors;
}

function isOwner(value: number): value is Owner {
  return value === Owner.None || value === Owner.P0 || value === Owner.P1;
}

function isFigureVariant(value: number): value is FigureVariant {
  return value === FigureVariant.Empty || value === FigureVariant.Fig1 || value === FigureVariant.Fig2;
}

function legacyFigureVariants(owners: number[]): FigureVariant[] {
  const variants: FigureVariant[] = Array(CELLS).fill(FigureVariant.Empty);
  for (const owner of [Owner.P0, Owner.P1]) {
    const indexes = owners.map((value, index) => ({ value, index })).filter(item => item.value === owner);
    indexes.forEach(({ index }, position) => {
      variants[index] = position % 2 === 0 ? FigureVariant.Fig1 : FigureVariant.Fig2;
    });
  }
  return variants;
}

function isPiece(value: number): value is Piece {
  return value >= Piece.Empty && value <= Piece.Trap && Number.isInteger(value);
}

function isPhase(value: number): value is Phase {
  return value >= Phase.Created && value <= Phase.Finished && Number.isInteger(value);
}

function isServerErrorCode(value: string): value is ServerErrorCode {
  return value === 'AUTHENTICATION_FAILED' ||
    value === 'INVALID_MESSAGE' ||
    value === 'REQUEST_FAILED' ||
    value === 'UNSUPPORTED_PROTOCOL_VERSION';
}

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
