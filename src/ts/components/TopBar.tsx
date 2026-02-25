// src/ts/components/TopBar.tsx
import { useGameStore, usePlayerCountry } from '../modules/gameState';
import './TopBar.css';
import { SettingState } from '../modules/store';

export default function TopBar() {
  const game = useGameStore(state => state.game);
  const playerCountry = usePlayerCountry();

  if (!game || !playerCountry) {
    return <div className="topbar-component-container">Now Loading...</div>;
  }

  const isEn = SettingState.language === 'en';
  const enMonths = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  return (
    <div className="topbar-component-container">
      <div className="topbar-component-background"></div>

      <div className="topbar-component-left-container">

        <div className="topbar-component-flag-container">
          <img src={playerCountry.flag} alt="flag"/>
          <div className="topbar-component-flag-overlay"></div>
        </div>

        <div className="topbar-component-status-container">
          <div className="topbar-component-status-item">
            <div className="topbar-component-status-item-icon politicalPower"></div>
            <div className="topbar-component-status-item-text">
              {playerCountry.politicalPower}
            </div>
          </div>
          <div className="topbar-component-status-item">
            <div className="topbar-component-status-item-icon legitimacy"></div>
            <div className="topbar-component-status-item-text">
              {playerCountry.legitimacy}%
            </div>
          </div>
          <div className="topbar-component-status-item">
            <div className="topbar-component-status-item-icon economicStrength"></div>
            <div className="topbar-component-status-item-text">
              {playerCountry.economicStrength}
            </div>
          </div>
          <div className="topbar-component-status-item">
            <div className="topbar-component-status-item-icon culturalUnity"></div>
            <div className="topbar-component-status-item-text">
              {playerCountry.culturalUnity}%
            </div>
          </div>
          <div className="topbar-component-status-item">
            <div className="topbar-component-status-item-icon deployedMilitary"></div>
            <div className="topbar-component-status-item-text">
              {playerCountry.deployedMilitary}
            </div>
          </div>
          <div className="topbar-component-status-item">
            <div className="topbar-component-status-item-icon militaryEquipment"></div>
            <div className="topbar-component-status-item-text">
              {playerCountry.militaryEquipment}
            </div>
          </div>
          <div className="topbar-component-status-item">
            <div className="topbar-component-status-item-icon mechanization"></div>
            <div className="topbar-component-status-item-text">
              {playerCountry.mechanizationRate}%
            </div>
          </div>
        </div>
      </div>

      <div className="topbar-component-right-container">
        <div className="topbar-component-time-container">
          <div className="topbar-component-time-text">
            {isEn
              ? `${enMonths[game.currentMonth - 1]} ${game.currentYear}`
              : `${game.currentYear}年 ${game.currentMonth}月`
            }
          </div>
          <div className="topbar-component-turn-text">
            {isEn
              ? `TURN ${game.currentTurn}`
              : `ターン: ${game.currentTurn}`
            }
          </div>
        </div>
        <div className="topbar-component-menu-container">
          <div className="topbar-component-menu-icon"></div>
        </div>
      </div>
    </div>
  );
}