import { createContext, useContext } from 'react';
import type { RipsyGameClient } from './index';

export const RipsyContext = createContext<{ gameClient: RipsyGameClient | null }>({ 
  gameClient: null 
});

export const useRipsyContext = () => useContext(RipsyContext);
