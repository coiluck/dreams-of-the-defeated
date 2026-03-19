// ts/components/GameWar.tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerCountry, useGameStore } from '../modules/gameState';
import './GameWar.css';

interface FrontInfo {
  front_id: string;
  name: { ja: string; en: string };
  tile_count: number;
  region_id: number;
  supply: number;
}

type TacticAction = {
  name: { ja: string; en: string };
  effect: { ja: string; en: string };
  cost: { politicalPower: number; militaryEquipment: number };
  value?: number;
  description?: { ja: string; en: string };
}

export const TACTIC_ACTIONS: TacticAction[] = [
  {
    name: { ja: '何もしない', en: 'Standby' },
    effect: { ja: '効果なし', en: 'None' },
    cost: { politicalPower: 0, militaryEquipment: 0 }
  },
  {
    name: { ja: '積極的攻勢', en: 'Aggressive Offensive' },
    effect: { ja: '攻撃機会', en: 'Combat Engagements' },
    cost: { politicalPower: 100, militaryEquipment: 200 },
    value: 1,
    description: {
      ja: '各ターンごとに4回の戦闘を行います。通常は攻撃側2回・防御側2回ですが、攻撃側を3回にします',
      en: 'Increases the number of offensive engagements. Shifts the standard 4 combat phases per turn (2 attacker, 2 defender) to grant 3 attacks to the attacking side.'
    },
  },
  {
    name: { ja: '火力支援', en: 'Fire Support' },
    effect: { ja: '攻撃力', en: 'Firepower' },
    cost: { politicalPower: 50, militaryEquipment: 400 },
    value: 10,
    description: {
      ja: '攻撃力が1.1倍になります。',
      en: 'Increases attack power by 1.1x.'
    },
  },
  {
    name: { ja: '防御陣地の構築', en: 'Entrenchment' },
    effect: { ja: '防御力', en: 'Defensive Strength' },
    cost: { politicalPower: 50, militaryEquipment: 100 },
    value: 10,
    description: {
      ja: '防御力が1.1倍になります。',
      en: 'Increases defensive strength by 1.1x.'
    },
  },
  {
    name: { ja: '補給の改善', en: 'Logistical Support' },
    effect: { ja: '補給', en: 'Supply Level' },
    cost: { politicalPower: 50, militaryEquipment: 100 },
    value: 10,
    description: {
      ja: '補給状況が改善されます。このターンは戦線の補給値にそのまま10を足した値が適用されます',
      en: 'Improves the logistical situation. Adds a flat +10 bonus to the frontline supply value for the current turn.'
    },
  },
]

export default function GameWar() {
  const playerCountry = usePlayerCountry();
  const playerCountryId = useGameStore((state) => state.game?.playerCountryId);
  const wars = useGameStore((state) => state.game?.wars ?? {});
  const countries = useGameStore((state) => state.game?.countries ?? {});
  const mechanizationRate = playerCountry?.mechanizationRate; // useEffectの依存配列
  const setFrontAction = useGameStore((state) => state.setFrontAction);

  const [selectedWarId, setSelectedWarId] = useState<string | null>(null);
  const [fronts, setFronts] = useState<FrontInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初期選択
  useEffect(() => {
    if (playerCountry?.activeWarIds?.length && !selectedWarId) {
      setSelectedWarId(playerCountry.activeWarIds[0]);
    }
    if (!playerCountry?.activeWarIds?.length) {
      setSelectedWarId(null);
    }
  }, [playerCountry?.activeWarIds]);

  // 戦線データ取得
  useEffect(() => {
    if (!playerCountry || !selectedWarId) {
      setFronts([]);
      return;
    }

    const war = wars[selectedWarId];
    if (!war) return;

    const enemyKey = war.attackerId === playerCountry.slug ? war.defenderId : war.attackerId;
    const enemyCode = countries[enemyKey]?.id;
    if (!enemyCode) return;

    const fetchFronts = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<FrontInfo[]>('get_war_fronts', {
          war: {
            player_id: playerCountry.id,
            enemy_ids: [enemyCode],
            supply_buffs: {},
            mechanization_rate: playerCountry.mechanizationRate,
          },
        });
        setFronts(result);
      } catch (e: any) {
        setError(e.toString());
      } finally {
        setLoading(false);
      }
    };

    fetchFronts();
  }, [selectedWarId, wars, mechanizationRate]);

  if (!playerCountry) return null;

  if (!playerCountry.activeWarIds || playerCountry.activeWarIds.length === 0) {
    return (
      <div>
        <p>現在、交戦中の国家はありません。</p>
      </div>
    );
  }

  const selectedWar = selectedWarId ? wars[selectedWarId] : null;

  const getCountryName = (slug: string) => countries[slug]?.name?.ja ?? slug;

  const getWarTitle = (warId: string) => {
    const war = wars[warId];
    if (!war) return warId;
    return `${getCountryName(war.attackerId)}・${getCountryName(war.defenderId)}戦争`;
  };

  // 全戦線の戦術コスト合計
  const totalTacticCost = Object.values(playerCountry.frontActions || {}).reduce(
    (acc, tacticIndex) => {
      const tactic = TACTIC_ACTIONS[tacticIndex];
      return {
        politicalPower: acc.politicalPower + tactic.cost.politicalPower,
        militaryEquipment: acc.militaryEquipment + tactic.cost.militaryEquipment,
      };
    },
    { politicalPower: 0, militaryEquipment: 0 }
  );

  const updateFrontTactic = (frontId: string, tacticIndex: number) => {
    if (!playerCountryId) return;
    setFrontAction(playerCountryId, frontId, tacticIndex);
  };

  return (
    <div className="gw-component-container">
      {/* 戦争タブ */}
      <div className="gw-component-tabs-container">
        {playerCountry.activeWarIds.map((warId) => (
          <button
            key={warId}
            onClick={() => setSelectedWarId(warId)}
            style={{
              padding: '.5rem 1rem',
              fontWeight: selectedWarId === warId ? 'bold' : 'normal',
              borderBottom: selectedWarId === warId ? '2px solid #ceae44' : 'none',
            }}
          >
            {getWarTitle(warId)}
          </button>
        ))}
      </div>

      {selectedWar && (
        <>
          {/* 参加国 */}
          <p className="gw-component-title">戦争情報</p>
          <div className="gw-component-countries-container">
            <div className="gw-component-country-item">
              <div className="gw-component-country-item-title attack">⚔ 攻撃側</div>
              <div className="gw-component-country-item-name">{getCountryName(selectedWar.attackerId)}</div>
            </div>

            <div className="gw-component-country-item-vs">VS</div>

            <div className="gw-component-country-item">
              <div className="gw-component-country-item-title defense">🛡 防御側</div>
              <div className="gw-component-country-item-name">{getCountryName(selectedWar.defenderId)}</div>
            </div>
          </div>
          <button className="gw-component-peace-button">講和を打診
            <div className="gw-component-peace-button-image" />
            <div className="gw-component-peace-button-value">80</div>
          </button>

          {/* 戦線情報 */}
          <p className="gw-component-title">戦線情報</p>
          <div>

            {loading && <p>戦線データを再計算中...</p>}
            {error && <p style={{ color: 'red' }}>エラー: {error}</p>}

            {!loading && !error && fronts.length === 0 && (
              <p>敵国と陸続きの前線が存在しません。</p>
            )}

            {!loading && fronts.length > 0 && (
              <div className="gw-component-fronts-container">
                {fronts.map((front) => {
                  const currentTacticIndex = playerCountry.frontActions?.[front.front_id] ?? 0;
                  const selectedTactic = TACTIC_ACTIONS[currentTacticIndex];

                  return (
                    <div key={front.front_id} className="gw-component-front-item">
                      <p className="gw-component-front-item-name">{front.name.ja}</p>
                      <div className="gw-component-front-item-content">
                        <div className="gw-component-front-item-details">
                          <p>前線マス数: {front.tile_count} マス</p>
                          <p>補給: {(front.supply * 100).toFixed(1)} %</p>
                        </div>

                        {/* 配置兵力 */}
                        <div className="gw-component-front-item-actions-force">
                          <p className="gw-component-front-item-actions-force-title">配置兵力</p>
                          <div className="gw-component-front-item-actions-control">
                            後で消す
                          </div>
                        </div>

                        {/* 戦術作戦 */}
                        <div className="gw-component-front-item-actions-tactic">
                          <p className="gw-component-front-item-actions-tactic-title">戦術作戦</p>
                          <select
                            className="gw-component-front-item-actions-tactic-select"
                            value={currentTacticIndex}
                            onChange={(e) => updateFrontTactic(front.front_id, Number(e.target.value))}
                          >
                            {TACTIC_ACTIONS.map((tactic, idx) => {
                              // コスト計算の判定
                              const availablePP =
                                playerCountry.politicalPower
                                - totalTacticCost.politicalPower
                                + selectedTactic.cost.politicalPower;
                              const availableEquip =
                                playerCountry.militaryEquipment
                                - totalTacticCost.militaryEquipment
                                + selectedTactic.cost.militaryEquipment;

                              const canAfford =
                                tactic.cost.politicalPower <= availablePP &&
                                tactic.cost.militaryEquipment <= availableEquip;

                              return (
                                <option key={idx} value={idx} disabled={!canAfford}>
                                  {tactic.name.ja}
                                  {!canAfford ? ' (コスト不足)' : ''}
                                </option>
                              );
                            })}
                          </select>
                          <div className="gw-component-front-item-actions-tactic-details">
                            <span>
                              政治力: {selectedTactic.cost.politicalPower > 0
                                ? <span style={{ color: '#e07070' }}>-{selectedTactic.cost.politicalPower}</span>
                                : <span style={{ opacity: 0.5 }}>0</span>
                              }
                            </span>
                            <span>
                              装備: {selectedTactic.cost.militaryEquipment > 0
                                ? <span style={{ color: '#e07070' }}>-{selectedTactic.cost.militaryEquipment}</span>
                                : <span style={{ opacity: 0.5 }}>0</span>
                              }
                            </span>
                            {selectedTactic.value !== undefined && (
                              <span>
                                {selectedTactic.effect.ja}{' '}
                                <span style={{ color: '#4caf84' }}>+{selectedTactic.value}%</span>
                              </span>
                            )}
                          </div>
                          {selectedTactic.description && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '0.25rem' }}>
                              {selectedTactic.description.ja}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}