// src/ts/components/GameMenu.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './GameMenu.css';
import { Button } from './Button';

export default function GameMenu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsActive(true), 10);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="game-menu-component-container">
      <div className={`game-menu-component-overlay-blur ${isActive ? 'active' : ''}`} onClick={onClose}></div>
      <div className={`game-menu-component-overlay-background ${isActive ? 'active' : ''}`} onClick={onClose}></div>
      <div className={`game-menu-component-button-container ${isActive ? 'active' : ''}`}>
        <Button text="Save Game" onClick={() => navigate('/newgame')} />
        <Button text="Load Game" onClick={() => navigate('/newgame')} />
        <Button text="Options" onClick={() => navigate('/newgame')} />
        <Button text="Exit" onClick={() => navigate('/top')} />
      </div>
    </div>
  );
}