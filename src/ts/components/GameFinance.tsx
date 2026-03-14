// src/ts/components/GameFinance.tsx
import { useMemo } from 'react';
import { useGameStore, usePlayerCountry, CountryState } from '../modules/gameState';
import './GameFinance.css';
import Tooltip from './ToolTip';

const FINANCE_LEVELS = [
  { id: 0, name: '緊縮財政', ratio: 0, buff: '経済成長率 +10%, 政治力獲得倍率 +10%', debuff: 'なし' },
  { id: 1, name: '平和維持', ratio: 0.5, buff: '経済成長率 +10%', debuff: 'なし' },
  { id: 2, name: '標準予算', ratio: 2, buff: 'なし', debuff: 'なし' },
  { id: 3, name: '軍拡財政', ratio: 5, buff: 'なし', debuff: '経済成長率 -20%, 正統性 -10%' },
  { id: 4, name: '総力戦体制', ratio: 10, buff: 'なし', debuff: '経済成長率 -40%, 正統性 -15%, 文化統合度 -10%' },
];

const formatEconomicStrength = (value: number): string => {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${value}`;
};

export default function GameFinance() {
  const game = useGameStore(state => state.game);
  const playerCountry = usePlayerCountry();
  const updateCountry = useGameStore(state => state.updateCountry);

  // ステータスから各種計算を行う
  const { effectiveGDP, militaryBudget, currentRatio, currentLevel } = useMemo(() => {
    if (!playerCountry) return { effectiveGDP: 0, militaryBudget: 0, currentRatio: 0, currentLevel: FINANCE_LEVELS[0] };

    // 正統性と文化統合度による補正（0.5 ~ 1.0）
    const legMultiplier = 0.25 + (playerCountry.legitimacy / 400);
    const culMultiplier = 0.25 + (playerCountry.culturalUnity / 400);
    const totalMultiplier = legMultiplier + culMultiplier;
    const effectiveGDP = playerCountry.economicStrength * totalMultiplier;

    // 軍事予算の算出
    const C_BASE = 50000       // 師団基礎維持費
    const ALPHA = 0.7         // 機械化影響係数
    const BETA = 2            // 非線形指数
    const C_EQUIP = 4         // 装備備蓄維持費
    const FIXED_COST = 20_000_000  // 固定費

    const divisionCost = playerCountry.deployedMilitary * C_BASE * (1 + ALPHA * Math.pow(playerCountry.mechanizationRate, BETA))
    const equipmentCost = playerCountry.militaryEquipment * C_EQUIP
    const militaryBudget = divisionCost + equipmentCost + FIXED_COST

    // 軍事予算の比率（%）
    const currentRatio = effectiveGDP > 0 ? (militaryBudget / effectiveGDP) * 100 : 0;

    // 現在の財政段階の判定
    let currentLevel = FINANCE_LEVELS[0];
    for (let i = FINANCE_LEVELS.length - 1; i >= 0; i--) {
      if (currentRatio >= FINANCE_LEVELS[i].ratio) {
        currentLevel = FINANCE_LEVELS[i];
        break;
      }
    }

    return { effectiveGDP, militaryBudget, currentRatio, currentLevel };
  }, [playerCountry]);

  if (!game || !playerCountry) {
    return <div className="gf-component-container">Now Loading...</div>;
  }

  // アクション
  const ACTIONS = [
    {
      name: { ja: '正規軍の編成', en: 'Military Formation' },
      description: { ja: '展開兵力 +5', en: 'Deployed military +5.' },
      cost: { politicalPower: 20, militaryEquipment: 500 },
      effect: (country: CountryState) => ({
        deployedMilitary: country.deployedMilitary + 5
      })
    },
    {
      name: { ja: '師団の解体', en: 'Disband Division' },
      description: { ja: '展開兵力 -5', en: 'Deployed military -5.' },
      cost: { politicalPower: 15 },
      effect: (country: CountryState) => ({
        deployedMilitary: Math.max(0, country.deployedMilitary - 5)
      })
    },
    {
      name: { ja: '装備の生産', en: 'Equipment Production' },
      description: { ja: '装備備蓄 +200', en: 'Equipment stockpile +200.' },
      cost: { politicalPower: 20 },
      effect: (country: CountryState) => ({
        militaryEquipment: country.militaryEquipment + 200
      })
    },
    {
      name: { ja: '装備の破棄', en: 'Equipment Destruction' },
      description: { ja: '装備備蓄 -200', en: 'Equipment stockpile -200.' },
      cost: { politicalPower: 15 },
      effect: (country: CountryState) => ({
        militaryEquipment: Math.max(0, country.militaryEquipment - 200)
      })
    },
    {
      name: { ja: '機械化の推進', en: 'Mechanization Advancement' },
      description: { ja: '機械化率 +5', en: 'Mechanization rate +5.' },
      cost: { politicalPower: 20, militaryEquipment: 300 },
      effect: (country: CountryState) => ({
        mechanizationRate: Math.min(100, country.mechanizationRate + 5)
      })
    },
    {
      name: { ja: '守旧的な軍隊の編成', en: 'Traditional Army Formation' },
      description: { ja: '機械化率 -5', en: 'Mechanization rate -5.' },
      cost: { politicalPower: 15 },
      effect: (country: CountryState) => ({
        mechanizationRate: Math.max(0, country.mechanizationRate - 5)
      })
    }
  ];

  // 実際のratioを0〜100%の視覚的なプログレスバーの幅に変換する
const visualProgress = useMemo(() => {
  const maxIndex = FINANCE_LEVELS.length - 1;
  if (currentRatio <= FINANCE_LEVELS[0].ratio) return 0;
  if (currentRatio >= FINANCE_LEVELS[maxIndex].ratio) return 100;

  for (let i = 0; i < maxIndex; i++) {
    const current = FINANCE_LEVELS[i];
    const next = FINANCE_LEVELS[i + 1];

    // 現在のratioがどの区間（i と i+1 の間）にいるかを判定
    if (currentRatio >= current.ratio && currentRatio <= next.ratio) {
      const sectionWidth = 100 / maxIndex; // 今回は5段階(4区間)なので25%
      const progressWithinSection = (currentRatio - current.ratio) / (next.ratio - current.ratio);

      return (i * sectionWidth) + (progressWithinSection * sectionWidth);
    }
  }
  return 100;
}, [currentRatio]);

  return (
    <div className="gf-component-container">

      {/* 基礎データ表示 */}
      <div className="gf-component-stats-header">
        <div className="gf-component-stat-box">
          <div className="gf-component-stat-box-label">基礎GDP</div>
          <div className="gf-component-stat-box-value">{formatEconomicStrength(playerCountry.economicStrength)}</div>
        </div>
        <div className="gf-component-stat-box">
          <div className="gf-component-stat-box-label">補正後GDP</div>
          <div className="gf-component-stat-box-value">{formatEconomicStrength(effectiveGDP)}</div>
        </div>
        <div className="gf-component-stat-box">
          <div className="gf-component-stat-box-label">軍事維持費</div>
          <div className="gf-component-stat-box-value">{formatEconomicStrength(militaryBudget)}</div>
        </div>
        <div className="gf-component-stat-box">
          <div className="gf-component-stat-box-label">対GDP比</div>
          <div className="gf-component-stat-box-value">{currentRatio.toFixed(2)} %</div>
        </div>
      </div>

      {/* BoP */}
      <div className="gf-component-bop-container">
        <p className="gf-component-bop-title">
          財政状態: <span className="gf-component-bop-title-value">{currentLevel.name}</span>
        </p>

        <div className="gf-component-bop-track">
          <div className="gf-component-bop-fill"
            style={{ width: `${visualProgress}%` }}
          />

          {/* 各段階の区切り線とラベル */}
          {FINANCE_LEVELS.map((level, index) => {
            const maxIndex = FINANCE_LEVELS.length - 1;
            const leftPosition = (index / maxIndex) * 100; // 0%, 25%, 50%, 75%, 100%
            const isActive = currentLevel.id === level.id;

            // ラベルが端ではみ出さないように調整
            let transformX = 'translateX(-50%)';
            if (index === 0) transformX = 'translateX(0)';
            if (index === maxIndex) transformX = 'translateX(-100%)';

            return (
              <div key={level.id} style={{ position: 'absolute', left: `${leftPosition}%`, top: 0, height: '100%' }}>
                {/* 区切り線（バーの上に乗るマーカー） */}
                <div
                  className="gf-component-bop-marker"
                  style={{
                    background: isActive ? '#fff' : 'rgba(255, 255, 255, 0.3)'
                  }}
                />

                {/* 段階の名称と比率ラベル */}
                <div
                  className="gf-component-bop-label"
                  style={{
                    position: 'absolute',
                    top: '32px',
                    transform: transformX,
                    textAlign: index === 0 ? 'left' : (index === maxIndex ? 'right' : 'center'),
                    whiteSpace: 'nowrap',
                    color: isActive ? '#fff' : '#aaa',
                    fontWeight: isActive ? 'bold' : 'normal',
                    fontSize: '0.6rem',
                    textShadow: isActive ? '0 0 4px rgba(255,255,255,0.5)' : 'none',
                    transition: 'all 0.3s'
                  }}
                >
                  <div>{level.name}</div>
                  <div>({level.ratio}%)</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="gf-component-bop-details">
          <p className="gf-component-bop-details-buff">効果: {currentLevel.buff}</p>
          <p className="gf-component-bop-details-debuff">代償: {currentLevel.debuff}</p>
        </div>
      </div>

      {/* アクション群 */}
      <div className="gf-component-actions-container">
        <p className="gf-component-actions-title">軍事力調整</p>

        <div className="gf-component-actions-item-container">
          {ACTIONS.map(action => {
            const currentCount = playerCountry.financeActionCount || 0;
            // 政治力: 基礎値 ^ (1.1 ^ count)
            const basePPCost = action.cost.politicalPower || 0;
            const actualPPCost = basePPCost > 0
              ? Math.floor(Math.pow(basePPCost, Math.pow(1.1, currentCount)))
              : 0;

            // 装備品のコスト
            const actualMECost = action.cost.militaryEquipment || 0;

            // リソースが足りているかの判定
            const canAfford =
              playerCountry.politicalPower >= actualPPCost &&
              playerCountry.militaryEquipment >= actualMECost;

            return (
              <Tooltip text={action.description.ja} isBelow={false} key={action.name.ja}>
                <div className={`gf-component-actions-item ${!canAfford ? 'disabled' : ''}`}>
                  <div className="gf-component-actions-item-name">{action.name.ja}</div>
                  <div className="gf-component-actions-item-right-container">
                    <div className="gf-component-actions-item-cost-container">
                      {actualPPCost > 0 &&
                        <div className="gf-component-actions-item-cost-item">
                          <span className="gf-component-actions-item-cost-icon pp"></span>
                          {actualPPCost}
                        </div>
                      }
                      {actualMECost > 0 &&
                        <div className="gf-component-actions-item-cost-item">
                          <span className="gf-component-actions-item-cost-icon me"></span>
                          {actualMECost}
                        </div>
                      }
                    </div>
                    <div
                      className="gf-component-actions-item-button"
                      onClick={() => {
                        if (!canAfford) return;

                        const actionUpdates = action.effect(playerCountry);
                        // 更新
                        updateCountry(game.playerCountryId, {
                          ...actionUpdates,
                          politicalPower: playerCountry.politicalPower - actualPPCost,
                          militaryEquipment: playerCountry.militaryEquipment - actualMECost,
                          financeActionCount: currentCount + 1
                        });
                      }}
                    ></div>
                  </div>
                </div>
              </Tooltip>
            );
          })}
        </div>

      </div>
    </div>
  );
}