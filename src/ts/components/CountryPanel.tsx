// ts/components/CountryPanel.tsx
import { useState, useEffect } from 'react';
import './CountryPanel.css';
import { useGameStore, calculateEffectiveStats, FINANCE_LEVELS } from '../modules/gameState';
import { SettingState } from '../modules/store';
import { loadSpiritDefinition } from '../modules/nationalFocus';
import { useMappedTranslations } from '../modules/i18n';

const formatEconomicStrength = (value: number): string => {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${value}`;
};

interface CountryPanelProps {
  isOpen: boolean;
  countryId: string; // ex: FRA
  onClose: () => void;
  onDeclareWar: (targetId: string) => void;
}

export default function CountryPanel({ isOpen, countryId, onClose, onDeclareWar }: CountryPanelProps) {
  const [spiritNames, setSpiritNames] = useState<Record<string, { ja: string; en: string }>>({});

  const countries = useGameStore((state) => state.game?.countries ?? {});
  const wars = useGameStore((state) => state.game?.wars ?? {});

  const targetCountry = countries[countryId];
  const playerCountryId = useGameStore((state) => state.game?.playerCountryId);

  const lang = SettingState.language as 'ja' | 'en';

  // 国民精神の名前
  useEffect(() => {
    if (!targetCountry || !targetCountry.nationalSpirits) return;
    const fetchSpiritNames = async () => {
      const names: Record<string, { ja: string; en: string }> = {};
      await Promise.all(
        targetCountry.nationalSpirits.map(async (spirit) => {
          if (spiritNames[spirit.id]) return;

          const def = await loadSpiritDefinition(spirit.id);
          if (def) {
            names[spirit.id] = def.name;
          }
        })
      );
      setSpiritNames((prev) => ({ ...prev, ...names }));
    };

    fetchSpiritNames();
  }, [targetCountry]);

  const t = useMappedTranslations({
    countryInformation: 'countryPanel.countryInformation',
    baseParameters: 'countryPanel.baseParameters',
    nationalSpirits: 'countryPanel.nationalSpirits',
    legitimacy:    'topBar.legitimacy',
    politicalPower: 'topBar.politicalPower',
    economicStrength: 'topBar.economicStrength',
    culturalUnity: 'topBar.culturalUnity',
    deployedMilitary: 'topBar.deployedMilitary',
    militaryEquipment: 'topBar.militaryEquipment',
    mechanization: 'topBar.mechanization',
    attackPower: 'countryPanel.attackPower',
    defensePower: 'countryPanel.defensePower',
    politicalPowerRate: 'countryPanel.politicalPowerRate',
    economicStrengthRate: 'countryPanel.economicStrengthRate',
    nationalSpiritNone: 'countryPanel.nationalSpiritNone',
    playerCountry: 'countryPanel.playerCountry',
    allies: 'countryPanel.allies',
    wars: 'countryPanel.wars',
    vassalCountry: 'countryPanel.vassalCountry',
    suzerainCountry: 'countryPanel.suzerainCountry',
    declareWar: 'countryPanel.declareWar',
  });

  if (!countryId || !targetCountry) {
    return null;
  }

  const effectiveStats = calculateEffectiveStats(targetCountry);

  // 外交状態
  const allyCountries = targetCountry.allies
    .map((id) => countries[id])
    .filter(Boolean);

  const warEnemyCountries = targetCountry.activeWarIds
    .flatMap((warId) => {
      const war = wars[warId];
      if (!war) return [];
      if (war.attackerId === countryId) return [countries[war.defenderId]];
      if (war.defenderId === countryId) return [countries[war.attackerId]];
      return [];
    })
    .filter(Boolean);

  const vassalCountries = (targetCountry.vassalIds ?? [])
    .map((id) => countries[id])
    .filter(Boolean);

  const suzerainCountry = targetCountry.suzerainId
    ? countries[targetCountry.suzerainId]
    : null;

  return (
    <div className={`cp-component-container ${isOpen ? 'open' : ''}`}>
      <div className="cp-component-container-bg" />
      <div className="cp-component-container-noise" />

      <div className="cp-component-header">
        <span className="cp-component-title">
          {t.countryInformation}
        </span>
        <div className="cp-component-close-button" onClick={onClose} />
      </div>

      <div className="cp-component-country-info">
        <div className="cp-component-country-info-header">
          <div
            className="cp-component-country-info-header-flag"
            style={{ backgroundImage: `url(${targetCountry.flag})` }}
          />
          <div className="cp-component-country-info-header-text">
            <span className="cp-component-country-info-header-country-name">{targetCountry.name[lang]}</span>
            {targetCountry.id == playerCountryId && (
              <span className="cp-component-country-info-header-player-country">{t.playerCountry}</span>
            )}
          </div>
        </div>

        {/* 外交関係 */}
        {suzerainCountry && (
          <div className="cp-component-country-info-diplomacy-container">
            <div className="cp-component-country-info-title">{t.suzerainCountry}</div>
            <div className="cp-component-country-info-diplomacy-item">
              {suzerainCountry.name[lang]}
            </div>
          </div>
        )}
        {vassalCountries.length > 0 && (
          <div className="cp-component-country-info-diplomacy-container">
            <div className="cp-component-country-info-title">{t.vassalCountry}</div>
            {vassalCountries.map((c) =>
              <div className="cp-component-country-info-diplomacy-item">
                {c.name[lang]}
              </div>
            )}
          </div>
        )}
        {allyCountries.length > 0 && (
          <div className="cp-component-country-info-diplomacy-container">
            <div className="cp-component-country-info-title">{t.allies}</div>
            {allyCountries.map((c) =>
              <div className="cp-component-country-info-diplomacy-item">
                {c.name[lang]}
              </div>
            )}
          </div>
        )}
        {warEnemyCountries.length > 0 && (
          <div className="cp-component-country-info-diplomacy-container">
            <div className="cp-component-country-info-title">{t.wars}</div>
            {warEnemyCountries.map((c) =>
              <div className="cp-component-country-info-diplomacy-item">
                {c.name[lang]}
              </div>
            )}
          </div>
        )}

        <div className="cp-component-country-info-status">
          <div className="cp-component-country-info-title">{t.baseParameters}</div>
          <div className="cp-component-country-info-status-content">
            <div className="cp-component-country-info-status-item">
              <div className="cp-component-country-info-status-item-label">{t.legitimacy}</div>
              <div className="cp-component-country-info-status-item-value">{effectiveStats.legitimacy}%</div>
            </div>
            <div className="cp-component-country-info-status-item">
              <div className="cp-component-country-info-status-item-label">{t.economicStrength}</div>
              <div className="cp-component-country-info-status-item-value">{formatEconomicStrength(targetCountry.economicStrength)}</div>
            </div>
            <div className="cp-component-country-info-status-item">
              <div className="cp-component-country-info-status-item-label">{t.culturalUnity}</div>
              <div className="cp-component-country-info-status-item-value">{effectiveStats.culturalUnity}%</div>
            </div>
            <div className="cp-component-country-info-status-item">
              <div className="cp-component-country-info-status-item-label">{t.deployedMilitary}</div>
              <div className="cp-component-country-info-status-item-value">{targetCountry.deployedMilitary}</div>
            </div>
            <div className="cp-component-country-info-status-item">
              <div className="cp-component-country-info-status-item-label">{t.militaryEquipment}</div>
              <div className="cp-component-country-info-status-item-value">{targetCountry.militaryEquipment}</div>
            </div>
            <div className="cp-component-country-info-status-item">
              <div className="cp-component-country-info-status-item-label">{t.mechanization}</div>
              <div className="cp-component-country-info-status-item-value">{effectiveStats.mechanizationRate}%</div>
            </div>
          </div>
        </div>

        <div className="cp-component-country-info-spirits">
          <div className="cp-component-country-info-title">{t.nationalSpirits}</div>
          {targetCountry.nationalSpirits && targetCountry.nationalSpirits.length > 0 ? (
            <div className="cp-component-country-info-spirits-container">
              {targetCountry.nationalSpirits.map((spirit, index) => {
                // financialの国民精神の場合
                const financeLevel = FINANCE_LEVELS.find((f) => f.id === spirit.id);
                // YAMLから取得した名前 or FINANCE_LEVELSの名前
                const spiritName = spiritNames[spirit.id]?.[lang] || financeLevel?.name[lang] || spirit.id;

                return (
                  <div
                    key={`${spirit.id}-${index}`}
                    className="cp-component-country-info-spirits-item"
                  >
                    <div className="cp-component-country-info-spirits-item-name">{spiritName}</div>
                    <div className="cp-component-country-info-spirits-item-stats-container">
                      {Object.entries(spirit.stats).map(([key, value]) => {
                        const numValue = Number(value);
                        if (isNaN(numValue)) return null;

                        // 数値がプラスの場合
                        const displayValue = numValue > 0 ? `+${numValue}` : numValue;
                        const valueClass = numValue > 0 ? "buff" : numValue < 0 ? "debuff" : "";

                        // label
                        const statLabelMap: Record<string, string> = {
                          legitimacy: t.legitimacy,
                          mechanizationRate: t.mechanization,
                          attackPower: t.attackPower,
                          defensePower: t.defensePower,
                          culturalUnity: t.culturalUnity,
                          politicalPowerRate: t.politicalPowerRate,
                          economicStrengthRate: t.economicStrengthRate,
                        };
                        const label = statLabelMap[key] || key;

                        return (
                          <div
                            key={key}
                            className={`cp-component-country-info-spirits-item-stats-item ${valueClass}`}
                          >
                            {label}: {displayValue}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>{t.nationalSpiritNone}</p>
          )}
        </div>

        {targetCountry.id !== playerCountryId && (
          <button onClick={() => onDeclareWar?.(countryId)}>{t.declareWar}</button>
        )}
      </div>
    </div>
  );
}