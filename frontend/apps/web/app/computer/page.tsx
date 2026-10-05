"use client";

import { useState } from 'react';
import { BattleScreen } from '../game/[id]/game-content';
import { LOCAL_PLAYER_ID } from './local-computer-game';
import { useLocalComputerGame } from './use-local-computer-game';

export default function ComputerGamePage() {
  const [presentationBusy, setPresentationBusy] = useState(false);
  const game = useLocalComputerGame(presentationBusy);
  return <BattleScreen game={game} gameId="computer" isComputer onAnimationStateChange={setPresentationBusy} playerId={LOCAL_PLAYER_ID} />;
}
