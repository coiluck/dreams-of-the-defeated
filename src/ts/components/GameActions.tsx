// src/ts/components/GameActions.tsx
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import './GameActions.css';
import { getTranslatedText } from '../modules/i18n';
import { SettingState } from '../modules/store';
import GameNationalFocus from './GameNationalFocus';
import GameFinance from './GameFinance';
import GameWar from './GameWar';
import Tooltip from './ToolTip';

export type ActionTabType = 'focus' | 'finance' | 'war';

const TAB_CONFIG: {
  id: ActionTabType;
  key: string;
  Component: () => React.JSX.Element;
}[] = [
  { id: 'focus',   key: 'gameActions.focus', Component: GameNationalFocus },
  { id: 'finance', key: 'gameActions.finance', Component: GameFinance },
  { id: 'war',     key: 'gameActions.war', Component: GameWar },
];

export default function GameActions() {
  const [openTab, setOpenTab] = useState<ActionTabType | null>(null);
  const [translations, setTranslations] = useState({ focus: '', finance: '', war: '' });

  useEffect(() => {
    Promise.all([
      getTranslatedText('gameActions.focus', []),
      getTranslatedText('gameActions.finance', []),
      getTranslatedText('gameActions.war', []),
    ]).then(([focus, finance, war]) => {
      setTranslations({ focus: focus || '', finance: finance || '', war: war || '' });
    });
  }, [SettingState.language]);

  const handleTabClick = useCallback((id: ActionTabType) => {
    // 同じタブを押したら閉じる
    setOpenTab(prev => (prev === id ? null : id));
  }, []);

  const handleClose = useCallback(() => {
    setOpenTab(null);
  }, []);

  const activeConfig = TAB_CONFIG.find(t => t.id === openTab);
  const PanelContent = activeConfig?.Component ?? null;

  return (
    <>
      {/* サイドボタン群 */}
      <div className={`game-actions-component-buttons-container ${openTab !== null ? 'hidden' : ''}`}>
        {TAB_CONFIG.map((tab) => (
          <Tooltip text={translations[tab.id]} isBelow={true}>
            <div
              key={tab.id}
              className={`game-actions-component-button ${tab.id} ${openTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
            >
              <div
                className={`game-actions-component-button-image ${tab.id}`}
              />
            </div>
          </Tooltip>
        ))}
      </div>

      {/* スライドパネル */}
      <div className={`game-actions-component-panel ${openTab !== null ? 'open' : ''}`}>
        <div className="game-actions-component-panel-bg" />
        <div className="game-actions-component-panel-noise" />

        <div className="game-actions-component-panel-header">
          <span className="game-actions-component-panel-title">
            {activeConfig ? translations[activeConfig.id] : ''}
          </span>
          <div
            className="game-actions-component-close-button"
            onClick={handleClose}
          />
        </div>

        <div className="game-actions-component-panel-content">
          {PanelContent && <PanelContent />}
        </div>
      </div>
    </>
  );
}