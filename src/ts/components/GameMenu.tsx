// src/ts/components/GameMenu.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './GameMenu.css';
import { Button } from './Button';
import SavePage from '../pages/SavePage';
import LoadPage from '../pages/LoadPage';
import OptionsPage from '../pages/OptionsPage';

type ActivePanel = 'save' | 'load' | 'options' | null;

export default function GameMenu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const [isActive, setIsActive] = useState(false);
  const [subPanel, setSubPanel] = useState<ActivePanel>(null);

  const openSub  = (panel: ActivePanel) => setSubPanel(panel);
  const closeSub = () => setSubPanel(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsActive(true), 10);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="game-menu-component-container">
      <div className={`game-menu-component-overlay-blur ${isActive ? 'active' : ''}`} onClick={onClose}></div>
      <div className={`game-menu-component-overlay-background ${isActive ? 'active' : ''}`} onClick={onClose}></div>
      {subPanel === null && (
      <div className={`game-menu-component-button-container ${isActive ? 'active' : ''}`}>
            <Button text="Save Game" onClick={() => openSub('save')} minWidth="clamp(14rem, 6rem + 14vw, 20rem)" data-se="metallic" />
          <Button text="Load Game" onClick={() => openSub('load')} minWidth="clamp(14rem, 6rem + 14vw, 20rem)" data-se="metallic" />
          <Button text="Options" onClick={() => openSub('options')} minWidth="clamp(14rem, 6rem + 14vw, 20rem)" data-se="metallic" />
          <Button text="to Top" onClick={() => navigate('/top')} minWidth="clamp(14rem, 6rem + 14vw, 20rem)" data-se="disabled" />
          <Button text="Return to Game" onClick={onClose} minWidth="clamp(14rem, 6rem + 14vw, 20rem)" data-se="disabled" />
        </div>
      )}

      {subPanel === 'save'    && <SavePage onBack={closeSub} />}
      {subPanel === 'load'    && <LoadPage mode="game-menu" onBack={closeSub} />}
      {subPanel === 'options' && <OptionsPage mode="game-menu" onBack={closeSub} />}
    </div>
  );
}