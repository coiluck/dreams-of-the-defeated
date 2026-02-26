// src/ts/components/TopBar.tsx
import { useEffect, useState } from 'react';
import './TopBar.css';
import { useGameStore, usePlayerCountry } from '../modules/gameState';
import { SettingState } from '../modules/store';
import Tooltip from './ToolTip';
import { getTranslatedText } from '../modules/i18n';

export default function TopBar() {
  const game = useGameStore(state => state.game);
  const playerCountry = usePlayerCountry();

  const [tooltips, setTooltips] = useState({
    politicalPower: '',
    legitimacy: '',
    economicStrength: '',
    culturalUnity: '',
    deployedMilitary: '',
    militaryEquipment: '',
    mechanization: '',
  });

  useEffect(() => {
    const fetchTooltips = async () => {
      const [
        politicalPower,
        legitimacy,
        economicStrength,
        culturalUnity,
        deployedMilitary,
        militaryEquipment,
        mechanization
      ] = await Promise.all([
        getTranslatedText('topBar.politicalPower.description', []),
        getTranslatedText('topBar.legitimacy.description', []),
        getTranslatedText('topBar.economicStrength.description', []),
        getTranslatedText('topBar.culturalUnity.description', []),
        getTranslatedText('topBar.deployedMilitary.description', []),
        getTranslatedText('topBar.militaryEquipment.description', []),
        getTranslatedText('topBar.mechanization.description', [])
      ]);
      setTooltips({
        politicalPower: politicalPower || '',
        legitimacy: legitimacy || '',
        economicStrength: economicStrength || '',
        culturalUnity: culturalUnity || '',
        deployedMilitary: deployedMilitary || '',
        militaryEquipment: militaryEquipment || '',
        mechanization: mechanization || '',
      });
    };

    fetchTooltips();
  }, [SettingState.language]);

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
          <Tooltip text={tooltips.politicalPower} isBelow={true}>
            <div className="topbar-component-status-item">
              <div className="topbar-component-status-item-icon politicalPower"></div>
              <div className="topbar-component-status-item-text">
                {playerCountry.politicalPower}
              </div>
            </div>
          </Tooltip>
          <Tooltip text={tooltips.legitimacy} isBelow={true}>
            <div className="topbar-component-status-item">
              <div className="topbar-component-status-item-icon legitimacy"></div>
              <div className="topbar-component-status-item-text">
                {playerCountry.legitimacy}%
              </div>
            </div>
          </Tooltip>
          <Tooltip text={tooltips.economicStrength} isBelow={true}>
            <div className="topbar-component-status-item">
              <div className="topbar-component-status-item-icon economicStrength"></div>
              <div className="topbar-component-status-item-text">
                {playerCountry.economicStrength}
              </div>
            </div>
          </Tooltip>
          <Tooltip text={tooltips.culturalUnity} isBelow={true}>
            <div className="topbar-component-status-item">
              <div className="topbar-component-status-item-icon culturalUnity"></div>
              <div className="topbar-component-status-item-text">
                {playerCountry.culturalUnity}%
              </div>
            </div>
          </Tooltip>
          <Tooltip text={tooltips.deployedMilitary} isBelow={true}>
            <div className="topbar-component-status-item">
              <div className="topbar-component-status-item-icon deployedMilitary"></div>
              <div className="topbar-component-status-item-text">
                {playerCountry.deployedMilitary}
              </div>
            </div>
          </Tooltip>
          <Tooltip text={tooltips.militaryEquipment} isBelow={true}>
            <div className="topbar-component-status-item">
              <div className="topbar-component-status-item-icon militaryEquipment"></div>
              <div className="topbar-component-status-item-text">
                {playerCountry.militaryEquipment}
              </div>
            </div>
          </Tooltip>
          <Tooltip text={tooltips.mechanization} isBelow={true}>
            <div className="topbar-component-status-item">
              <div className="topbar-component-status-item-icon mechanization"></div>
              <div className="topbar-component-status-item-text">
                {playerCountry.mechanizationRate}%
              </div>
            </div>
          </Tooltip>
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