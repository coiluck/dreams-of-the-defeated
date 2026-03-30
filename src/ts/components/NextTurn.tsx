// src/ts/components/NextTurn.tsx
import { useEffect, useCallback } from 'react';
import './NextTurn.css';
import ToolTip from './ToolTip';
import { DiamondButton } from './DiamondButton';

import { useGameStore } from '../modules/gameState';

export default function NextTurn() {
  const nextTurn = useGameStore(s => s.nextTurn);

  const handleNextTurn = useCallback(() => {
    nextTurn();
  }, []);

  // keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleNextTurn();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextTurn]);


  return (
    <div className="next-turn-component-container">
      <ToolTip text="[Enter] Next Turn">
        <DiamondButton
          text="Next Turn"
          size="9rem"
          onClick={handleNextTurn}
          className={`game-actions-next-turn-button`}
          data-se="metallic"
        />
      </ToolTip>
  </div>
  );
}