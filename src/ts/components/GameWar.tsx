// ts/components/GameWar.tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerCountry, useGameStore, calculateEffectiveStats } from '../modules/gameState';
import { getTranslatedText } from '../modules/i18n';
import { SettingState } from '../modules/store';
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

// 侵攻計算結果
interface FrontAdvanceResult {
  front_id: string;
  advance_tiles: number;
  phase_log: {
    phase: number;
    attacker: string;
    attack_energy: number;
    defence_energy: number;
    power_ratio: number;
    p: number;
  }[];
}

// UI翻訳テキスト
interface GameWarTranslations {
  noWar: string;
  warInfo: string;
  attacker: string;
  defender: string;
  sueForPeace: string;
  frontInfo: string;
  recalculating: string;
  noFrontline: string;
  frontTileCount: string;
  supply: string;
  predictedAdvance: string;
  calculating: string;
  tacticAction: string;
  costInsufficient: string;
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
    value: 20,
    description: {
      ja: '攻撃力が1.2倍になります。',
      en: 'Increases attack power by 1.2x.'
    },
  },
  {
    name: { ja: '防御陣地の構築', en: 'Entrenchment' },
    effect: { ja: '防御力', en: 'Defensive Strength' },
    cost: { politicalPower: 50, militaryEquipment: 100 },
    value: 20,
    description: {
      ja: '防御力が1.2倍になります。',
      en: 'Increases defensive strength by 1.2x.'
    },
  },
  {
    name: { ja: '補給の改善', en: 'Logistical Support' },
    effect: { ja: '補給', en: 'Supply Level' },
    cost: { politicalPower: 50, militaryEquipment: 100 },
    value: 20,
    description: {
      ja: '補給状況が改善されます。このターンは戦線の補給値にそのまま20を足した値が適用されます',
      en: 'Improves the logistical situation. Adds a flat +20 bonus to the frontline supply value for the current turn.'
    },
  },
]


// ── 合計戦線マス数の取得 ──────────────────────────────────────────────────────
//
// ある国が参加している全戦争・全敵国を対象に get_war_fronts を呼び出し、
// 返ってきた全フロントのタイル数を合算する。
//
// 引数:
//   countryId          … 補給を受ける側の country.id（数値コード文字列）
//   countrySlug        … wars テーブルの attackerId / defenderId と照合するキー
//   activeWarIds       … その国が参加中の戦争 ID 一覧
//   wars               … ゲーム全体の戦争マップ
//   countries          … ゲーム全体の国家マップ
//   mechanizationRate  … 補給計算に使う機械化率
//
async function fetchTotalFrontTiles(
  countryId: string,
  countrySlug: string,
  activeWarIds: string[],
  wars: Record<string, { attackerId: string; defenderId: string }>,
  countries: Record<string, { id: string; slug: string }>,
  mechanizationRate: number,
): Promise<number> {
  // 全戦争の敵国 ID を重複なく列挙する
  const enemyIds: string[] = [];
  for (const warId of activeWarIds) {
    const war = wars[warId];
    if (!war) continue;
    const enemySlug = war.attackerId === countrySlug ? war.defenderId : war.attackerId;
    const enemyId   = countries[enemySlug]?.id;
    if (enemyId && !enemyIds.includes(enemyId)) {
      enemyIds.push(enemyId);
    }
  }

  if (enemyIds.length === 0) return 1; // ゼロ除算防止

  try {
    const fronts = await invoke<FrontInfo[]>('get_war_fronts', {
      war: {
        player_id: countryId,
        enemy_ids: enemyIds,       // 全敵国を一括指定 → Rust 側が全前線を返す
        supply_buffs: {},
        mechanization_rate: mechanizationRate,
      },
    });
    const total = fronts.reduce((sum, f) => sum + f.tile_count, 0);
    return Math.max(total, 1); // ゼロ除算防止
  } catch {
    return 1;
  }
}

// ── 敵フロントの補給を取得 ────────────────────────────────────────────────────
//
// 現在表示中の戦争について、敵視点で get_war_fronts を呼び出して補給率を取得する。
// 戻り値: front_id → supply のマップ
//
async function fetchEnemySupply(
  enemyId: string,
  playerIds: string[],       // 敵から見たプレイヤー（自国）を敵として渡す
  enemyMechanizationRate: number,
): Promise<Record<string, number>> {
  try {
    const fronts = await invoke<FrontInfo[]>('get_war_fronts', {
      war: {
        player_id: enemyId,
        enemy_ids: playerIds,
        supply_buffs: {},
        mechanization_rate: enemyMechanizationRate,
      },
    });
    // front_id の命名規則は region_id と連番ベースのため、
    // 敵視点と自国視点で同一の front_id になる保証がない。
    // そのため region_id をキーにして照合用マップも作り、
    // フロントの region_id ベースの平均補給率を返す。
    const map: Record<string, number> = {};
    for (const f of fronts) {
      map[f.front_id] = f.supply;
      // region_id ベースのフォールバックキーも登録
      map[`region_${f.region_id}`] = f.supply;
    }
    return map;
  } catch {
    return {};
  }
}

export default function GameWar() {
  const playerCountry = usePlayerCountry();
  const playerCountryId = useGameStore((state) => state.game?.playerCountryId);
  const wars = useGameStore((state) => state.game?.wars ?? {});
  const countries = useGameStore((state) => state.game?.countries ?? {});
  const effectivePlayerStats = playerCountry ? calculateEffectiveStats(playerCountry) : null;
  const mechanizationRate = effectivePlayerStats?.mechanizationRate; // 国民精神の機械化率を使用
  const setFrontAction = useGameStore((state) => state.setFrontAction);

  const [selectedWarId, setSelectedWarId] = useState<string | null>(null);
  const [fronts, setFronts] = useState<FrontInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanceResults, setAdvanceResults] = useState<Record<string, number>>({});

  const lang = SettingState.language as 'ja' | 'en';

  // 翻訳
  const [t, setT] = useState<GameWarTranslations>({
    noWar: '',
    warInfo: '',
    attacker: '',
    defender: '',
    sueForPeace: '',
    frontInfo: '',
    recalculating: '',
    noFrontline: '',
    frontTileCount: '',
    supply: '',
    predictedAdvance: '',
    calculating: '',
    tacticAction: '',
    costInsufficient: '',
  });
  useEffect(() => {
    Promise.all([
      getTranslatedText('gameWar.noWar'),
      getTranslatedText('gameWar.warInfo'),
      getTranslatedText('gameWar.attacker'),
      getTranslatedText('gameWar.defender'),
      getTranslatedText('gameWar.sueForPeace'),
      getTranslatedText('gameWar.frontInfo'),
      getTranslatedText('gameWar.recalculating'),
      getTranslatedText('gameWar.noFrontline'),
      getTranslatedText('gameWar.frontTileCount'),
      getTranslatedText('gameWar.supply'),
      getTranslatedText('gameWar.predictedAdvance'),
      getTranslatedText('gameWar.calculating'),
      getTranslatedText('gameWar.tacticAction'),
      getTranslatedText('gameWar.costInsufficient'),
    ]).then(([
      noWar,
      warInfo,
      attacker,
      defender,
      sueForPeace,
      frontInfo,
      recalculating,
      noFrontline,
      frontTileCount,
      supply,
      predictedAdvance,
      calculating,
      tacticAction,
      costInsufficient,
    ]) => {
      setT({
        noWar:            noWar            ?? '',
        warInfo:          warInfo          ?? '',
        attacker:         attacker         ?? '',
        defender:         defender         ?? '',
        sueForPeace:      sueForPeace      ?? '',
        frontInfo:        frontInfo        ?? '',
        recalculating:    recalculating    ?? '',
        noFrontline:      noFrontline      ?? '',
        frontTileCount:   frontTileCount   ?? '',
        supply:           supply           ?? '',
        predictedAdvance: predictedAdvance ?? '',
        calculating:      calculating      ?? '',
        tacticAction:     tacticAction     ?? '',
        costInsufficient: costInsufficient ?? '',
      });
    });
  }, [lang]);

  // 初期選択
  useEffect(() => {
    if (playerCountry?.activeWarIds?.length && !selectedWarId) {
      setSelectedWarId(playerCountry.activeWarIds[0]);
    }
    if (!playerCountry?.activeWarIds?.length) {
      setSelectedWarId(null);
    }
  }, [playerCountry?.activeWarIds]);

  // 戦線データ取得（自国視点）
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
            mechanization_rate: effectivePlayerStats?.mechanizationRate ?? 0,
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

  // ── 侵攻計算 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerCountry || fronts.length === 0 || !selectedWarId) return;
    const war = wars[selectedWarId];
    if (!war) return;

    const enemyKey = war.attackerId === playerCountry.slug ? war.defenderId : war.attackerId;
    const enemyCountry = countries[enemyKey];
    if (!enemyCountry) return;

    const fetchAdvancePreview = async () => {
      try {
        // 合計戦線マス数
        const [playerTotalTiles, enemyTotalTiles] = await Promise.all([
          fetchTotalFrontTiles(
            playerCountry.id,
            playerCountry.slug,
            playerCountry.activeWarIds ?? [],
            wars,
            countries,
            playerCountry.mechanizationRate ?? 0,
          ),
          fetchTotalFrontTiles(
            enemyCountry.id,
            enemyCountry.slug,
            enemyCountry.activeWarIds ?? [],
            wars,
            countries,
            enemyCountry.mechanizationRate ?? 0,
          ),
        ]);

        // 敵側の補給
        const enemySupplyMap = await fetchEnemySupply(
          enemyCountry.id,
          [playerCountry.id],
          enemyCountry.mechanizationRate ?? 0,
        );

        const effectiveEnemyStats = calculateEffectiveStats(enemyCountry);

        // 国民精神バフ
        const playerAttackBuff = 1.0 + (effectivePlayerStats!.attackPower / 100);
        const playerDefenceBuff = 1.0 + (effectivePlayerStats!.defensePower / 100);
        const enemyAttackBuff = 1.0 + (effectiveEnemyStats.attackPower / 100);
        const enemyDefenceBuff = 1.0 + (effectiveEnemyStats.defensePower / 100);

        // フロントごとの敵補給率
        const resolveEnemySupply = (front: FrontInfo): number => {
          return (
            enemySupplyMap[front.front_id] ??
            enemySupplyMap[`region_${front.region_id}`] ??
            0.5
          );
        };

        // calc_advance へ渡す
        const input = {
          player_id: playerCountry.id,
          player_deployed_military: playerCountry.deployedMilitary || 0,
          player_total_tiles: playerTotalTiles,
          player_mechanization_rate: effectivePlayerStats!.mechanizationRate || 0,
          player_spirit_attack_buff: playerAttackBuff,
          player_spirit_defence_buff: playerDefenceBuff,

          enemy_id: enemyCountry.id,
          enemy_deployed_military: enemyCountry.deployedMilitary || 0,
          enemy_total_tiles: enemyTotalTiles,
          enemy_mechanization_rate: effectiveEnemyStats.mechanizationRate || 0,
          enemy_spirit_attack_buff: enemyAttackBuff,
          enemy_spirit_defence_buff: enemyDefenceBuff,

          fronts: fronts.map((f) => ({
            front_id:     f.front_id,
            tile_count:   f.tile_count,
            region_id:    f.region_id,
            player_supply: f.supply,
            enemy_supply:  resolveEnemySupply(f),
          })),

          player_front_actions: playerCountry.frontActions || {},
          enemy_front_actions:  enemyCountry.frontActions  || {},
        };

        const results = await invoke<FrontAdvanceResult[]>('calc_advance', { input });

        const newResults: Record<string, number> = {};
        results.forEach((r) => {
          newResults[r.front_id] = r.advance_tiles;
          console.log(r.front_id, r.advance_tiles, r.phase_log);
        });
        setAdvanceResults(newResults);

      } catch (err) {
        console.error('Failed to calculate advance preview:', err);
      }
    };

    fetchAdvancePreview();
  }, [fronts, playerCountry?.frontActions, selectedWarId, wars, countries]);

  if (!playerCountry) return null;

  if (!playerCountry.activeWarIds || playerCountry.activeWarIds.length === 0) {
    return (
      <div>
        <p>{t.noWar}</p>
      </div>
    );
  }

  const selectedWar = selectedWarId ? wars[selectedWarId] : null;

  // 国名はデータ側に ja/en が存在するので lang で直接引く
  const getCountryName = (slug: string) => countries[slug]?.name?.[lang] ?? slug;

  const getWarTitle = (warId: string) => {
    const war = wars[warId];
    if (!war) return warId;
    const warTitle = {
      ja: '戦争',
      en: ' War',
    }
    return `${getCountryName(war.attackerId)}・${getCountryName(war.defenderId)}${warTitle[lang]}`;
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
          <p className="gw-component-title">{t.warInfo}</p>
          <div className="gw-component-countries-container">
            <div className="gw-component-country-item">
              <div className="gw-component-country-item-title attack">⚔ {t.attacker}</div>
              <div className="gw-component-country-item-name">{getCountryName(selectedWar.attackerId)}</div>
            </div>

            <div className="gw-component-country-item-vs">VS</div>

            <div className="gw-component-country-item">
              <div className="gw-component-country-item-title defense">🛡 {t.defender}</div>
              <div className="gw-component-country-item-name">{getCountryName(selectedWar.defenderId)}</div>
            </div>
          </div>
          <button className="gw-component-peace-button">{t.sueForPeace}
            <div className="gw-component-peace-button-image" />
            <div className="gw-component-peace-button-value">80</div>
          </button>

          {/* 戦線情報 */}
          <p className="gw-component-title">{t.frontInfo}</p>
          <div>

            {loading && <p>{t.recalculating}</p>}
            {error && <p style={{ color: 'red' }}>{error}</p>}

            {!loading && !error && fronts.length === 0 && (
              <p>{t.noFrontline}</p>
            )}

            {!loading && fronts.length > 0 && (
              <div className="gw-component-fronts-container">
                {fronts.map((front) => {
                  const currentTacticIndex = playerCountry.frontActions?.[front.front_id] ?? 0;
                  const selectedTactic = TACTIC_ACTIONS[currentTacticIndex];
                  const predictedAdvance = advanceResults[front.front_id];

                  return (
                    <div key={front.front_id} className="gw-component-front-item">
                      <p className="gw-component-front-item-name">{front.name[lang]}</p>
                      <div className="gw-component-front-item-content">
                        <div className="gw-component-front-item-details">
                          <p>{t.frontTileCount}: {front.tile_count}</p>
                          <p>{t.supply}: {(front.supply * 100).toFixed(1)} %</p>
                        </div>

                        {/* 予想侵攻量 */}
                        <div className="gw-component-front-item-actions-prediction">
                          <p className="gw-component-front-item-actions-prediction-title">{t.predictedAdvance}</p>
                          <div className="gw-component-front-item-actions-prediction-value">
                            {predictedAdvance !== undefined ? (
                              <span style={{ color: predictedAdvance > 0 ? '#4caf84' : (predictedAdvance < 0 ? '#e07070' : 'inherit') }}>
                                {predictedAdvance > 0 ? `+${predictedAdvance}` : predictedAdvance}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>{t.calculating}</span>
                            )}
                          </div>
                        </div>

                        {/* 戦術作戦 */}
                        <div className="gw-component-front-item-actions-tactic">
                          <p className="gw-component-front-item-actions-tactic-title">{t.tacticAction}</p>
                          <select
                            className="gw-component-front-item-actions-tactic-select"
                            value={currentTacticIndex}
                            onChange={(e) => updateFrontTactic(front.front_id, Number(e.target.value))}
                          >
                            {TACTIC_ACTIONS.map((tactic, idx) => {
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
                                  {tactic.name[lang]}
                                  {!canAfford ? ` (${t.costInsufficient})` : ''}
                                </option>
                              );
                            })}
                          </select>
                          <div className="gw-component-front-item-actions-tactic-details">
                            <span className="gw-component-front-item-actions-tactic-details-item">
                              <span className="gw-component-front-item-actions-icon pp"></span>: {selectedTactic.cost.politicalPower > 0
                                ? <span style={{ color: '#e07070' }}>-{selectedTactic.cost.politicalPower}</span>
                                : <span style={{ opacity: 0.5 }}>0</span>
                              }
                            </span>
                            <span className="gw-component-front-item-actions-tactic-details-item">
                              <span className="gw-component-front-item-actions-icon me"></span>: {selectedTactic.cost.militaryEquipment > 0
                                ? <span style={{ color: '#e07070' }}>-{selectedTactic.cost.militaryEquipment}</span>
                                : <span style={{ opacity: 0.5 }}>0</span>
                              }
                            </span>
                            {selectedTactic.value !== undefined && (
                              <span className="gw-component-front-item-actions-tactic-details-item">
                                {selectedTactic.effect[lang]}{' '}
                                <span style={{ color: '#4caf84' }}>+{selectedTactic.value}%</span>
                              </span>
                            )}
                          </div>
                          {selectedTactic.description && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '0.25rem' }}>
                              {selectedTactic.description[lang]}
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