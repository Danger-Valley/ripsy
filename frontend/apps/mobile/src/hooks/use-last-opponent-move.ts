import { useEffect, useRef, useState } from 'react';
import { HEIGHT, Owner, Phase, WIDTH, type GameState } from '@rps/core';
import { isCompletedMoveTransition } from '../game-animation';

type Coordinate = { x: number; y: number };
type Marker = { gameId: string; owner: Owner; to: Coordinate };

function hasMoveCoordinates(state: GameState) {
  const { tieFrom: from, tieTo: to } = state;
  return [from, to].every(point => Number.isInteger(point.x) && Number.isInteger(point.y)
    && point.x >= 0 && point.x < WIDTH && point.y >= 0 && point.y < HEIGHT)
    && Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1;
}

/** Consume the displayed board, never a future snapshot ahead of its animation. */
export function useLastOpponentMove(state: GameState | null, ownOwner: Owner) {
  const previous = useRef<GameState | null>(null);
  const [marker, setMarker] = useState<Marker | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (!state || state.phase < Phase.Active || ownOwner === Owner.None) {
      setMarker(current => current ? null : current);
      return;
    }
    const ownTurn = (state.isP1Turn ? Owner.P1 : Owner.P0) === ownOwner;
    // The turn has already switched after a normal move, including a tied
    // collision. Flag captures finish without switching the turn instead.
    const opponentFinishedByMove = before && before.gameId === state.gameId
      && isCompletedMoveTransition(before, state) && state.phase === Phase.Finished
      && (before.isP1Turn ? Owner.P1 : Owner.P0) !== ownOwner;
    const hasOpponentMove = hasMoveCoordinates(state)
      && ((state.phase === Phase.Active && ownTurn) || opponentFinishedByMove);
    setMarker(current => {
      const sameGame = current?.gameId === state.gameId && current.owner === ownOwner;
      if (!hasOpponentMove) return sameGame ? current : null;
      const to = state.tieTo;
      if (sameGame && current.to.x === to.x && current.to.y === to.y) return current;
      return { gameId: state.gameId, owner: ownOwner, to: { ...to } };
    });
  }, [state, ownOwner]);

  return state && state.phase >= Phase.Active && marker?.gameId === state.gameId
    && marker.owner === ownOwner ? marker.to : null;
}
