// ts/modules/gameState.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { loadFocusTree, loadSpiritDefinition, ModifierStats } from './nationalFocus';
import { SettingState } from './store';
import { TACTIC_ACTIONS } from '../components/GameWar';

// 戦争の状態
export interface War {
  warId: string;
  attackerId: string;
  defenderId: string;
  startTurn: number;
}

export interface LocalizedName {
  ja: string;
  en: string;
}

export interface ActiveNationalSpirit {
  id: string;
  stats: ModifierStats;
}

// 各国の状態
export interface CountryState {
  id: string;
  slug: string;
  name: LocalizedName;
  flag: string;
  government: LocalizedName;
  leader: LocalizedName;
  quote: LocalizedName;
  description: LocalizedName;
  isPlayable: boolean;

  // 基礎パラメータ
  legitimacy: number;        // 正統性
  politicalPower: number;    // 政治力
  economicStrength: number;  // 経済力
  culturalUnity: number;     // 文化的統一性

  // 軍事パラメータ
  deployedMilitary: number;  // 展開中の軍事力 (師団数など)
  militaryEquipment: number; // 軍事備品 (在庫量)
  mechanizationRate: number; // 機械化率 (0〜100%)

  // アクション管理
  financeActionCount: number;

  // 外交状態
  suzerainId: string | null;         // 宗主国ID (null = 独立)
  vassalIds: string[];               // 属国IDリスト
  activeWarIds: string[];            // 参加中の戦争IDリスト
  frontActions?: Record<string, number>; // 戦線ごとのアクション（index）

  // 国家方針 & 国民精神
  activeFocusId: string | null;       // 現在選択中の方針
  completedFocusIds: string[]; // 完了済み方針
  nationalSpirits: ActiveNationalSpirit[]; // 国民精神のidと効果量
  NationalSpiritIds?: string[];            // 初期からある国民精神idリスト
}

// ゲームの状態
export interface GameState {
  // メタ情報
  currentTurn: number;
  currentYear: number;
  currentMonth: number;
  playerCountryId: string;
  // 全国家データ
  countries: Record<string, CountryState>;
  // 戦争リスト
  wars: Record<string, War>;
  pendingEvents: string[]; // 表示待ちのイベントID
}

// Zustandストア
interface GameStore {
  game: GameState | null;
  // ゲーム開始
  startGame: (playerCountryId: string, countriesData: Record<string, CountryState>) => void;
  // パラメータ更新（汎用）
  updateCountry: (countryId: string, updates: Partial<CountryState>) => void;
  // 国家方針セット
  setNationalFocus: (countryId: string, focusId: string) => void;
  // 戦争開始・終結
  declareWar: (attackerId: string, defenderId: string) => void;
  endWar: (warId: string) => void;
  // 戦線アクション
  setFrontAction: (countryId: string, frontId: string, tacticIndex: number) => void;
  // 属国化・独立
  makeVassal: (suzerainId: string, vassalId: string) => void;
  grantIndependence: (vassalId: string) => void;
  // ターン進行
  nextTurn: () => Promise<void>;
  // リセット
  resetGame: () => void;
  // イベント表示
  addPendingEvents: (eventIds: string[]) => void;
  removePendingEvents: (eventIds: string[]) => void;
}

// non playableな国のパラメータ
// 開始時にマージする

interface NonPlayableCountryStatsByScale {
  legitimacy: number;
  politicalPower: number;
  economicStrength: number;
  culturalUnity: number;
  deployedMilitary: number;
  militaryEquipment: number;
  mechanizationRate: number;
}

const NON_PLAYABLE_COUNTRY_STATS: Record<number, NonPlayableCountryStatsByScale> = {
  1: {
    legitimacy: 40,
    politicalPower: 0,
    economicStrength: 2_000_000_000,
    culturalUnity: 50,
    deployedMilitary: 10,
    militaryEquipment: 100,
    mechanizationRate: 5,
  },
  2: {
    legitimacy: 40,
    politicalPower: 0,
    economicStrength: 10_000_000_000,
    culturalUnity: 50,
    deployedMilitary: 15,
    militaryEquipment: 300,
    mechanizationRate: 10,
  },
  3: {
    legitimacy: 40,
    politicalPower: 0,
    economicStrength: 40_000_000_000,
    culturalUnity: 50,
    deployedMilitary: 30,
    militaryEquipment: 500,
    mechanizationRate: 15,
  },
  4: {
    legitimacy: 40,
    politicalPower: 0,
    economicStrength: 80_000_000_000,
    culturalUnity: 50,
    deployedMilitary: 40,
    militaryEquipment: 800,
    mechanizationRate: 20,
  },
  5: {
    legitimacy: 50,
    politicalPower: 0,
    economicStrength: 100_000_000_000,
    culturalUnity: 60,
    deployedMilitary: 50,
    militaryEquipment: 1000,
    mechanizationRate: 25,
  },
  6: {
    legitimacy: 60,
    politicalPower: 0,
    economicStrength: 120_000_000_000,
    culturalUnity: 70,
    deployedMilitary: 70,
    militaryEquipment: 1200,
    mechanizationRate: 30,
  },
};

interface NonPlayableCountryData {
  id: string;
  name: LocalizedName;
  scale: number;
  isMilitaryRegime: boolean;
}

// ── 戦争処理の内部型 ──────────────────────────────────────────────────────────

interface FrontInfo {
  front_id: string;
  name: { ja: string; en: string };
  tile_count: number;
  region_id: number;
  supply: number;
  front_tiles: [number, number][]; // attacker側の前線タイル座標 [[x,y], ...]
}

interface FrontAdvanceResult {
  front_id: string;
  advance_tiles: number;
  phase_log: unknown[];
}

interface OccupyChange {
  x: number;
  y: number;
  new_occupy_id: number;
}

interface FrontOccupyResult {
  front_id: string;
  changes: OccupyChange[];
}

// Map.tsx の pointsRef を外部から更新するためのコールバック登録
type MapUpdateCallback = (changes: OccupyChange[]) => void;
let _mapUpdateCallback: MapUpdateCallback | null = null;

export function registerMapUpdateCallback(cb: MapUpdateCallback) {
  _mapUpdateCallback = cb;
}

// ── 敵AIのアクション決定 ──────────────────────────────────────────────────────

/**
 * ノーマル難易度での敵AIアクション決定。
 * 補給が低い戦線を優先して「補給の改善」、余ればコスト比較して「防御陣地の構築」、
 * 最後に最も攻勢効果が高い戦線を「積極的攻勢」に割り当てる。
 */
async function decideEnemyActions(
  enemy: CountryState,
  enemyKey: string,
  playerFronts: FrontInfo[],
  playerCountry: CountryState,
  playerCountryId: string,
  wars: Record<string, War>,
  countries: Record<string, CountryState>,
): Promise<Record<string, number>> {
  const actions: Record<string, number> = {};

  // 敵視点の戦線を取得
  let enemyFronts: FrontInfo[] = [];
  try {
    enemyFronts = await invoke<FrontInfo[]>('get_war_fronts', {
      war: {
        player_id: enemy.id,
        enemy_ids: [playerCountry.id],
        supply_buffs: {},
        mechanization_rate: enemy.mechanizationRate ?? 0,
      },
    });
  } catch {
    return actions;
  }

  if (enemyFronts.length === 0) return actions;

  let availablePP = enemy.politicalPower;
  let availableEquip = enemy.militaryEquipment;

  // ── フェーズ1: 補給が80%以下の戦線に「補給の改善」(index=4) ─────────────────
  // 予想侵攻量の多い順にソート（事前計算が重いためsupplyの低い順で代用）
  const lowSupplyFronts = enemyFronts
    .filter(f => f.supply <= 0.8)
    .sort((a, b) => a.supply - b.supply);

  const logisticCost = TACTIC_ACTIONS[4].cost;
  const logisticFrontIds = new Set<string>();

  for (const front of lowSupplyFronts) {
    if (availablePP >= logisticCost.politicalPower && availableEquip >= logisticCost.militaryEquipment) {
      actions[front.front_id] = 4; // 補給の改善
      logisticFrontIds.add(front.front_id);
      availablePP -= logisticCost.politicalPower;
      availableEquip -= logisticCost.militaryEquipment;
    } else {
      break;
    }
  }

  // ── フェーズ2: 「補給の改善」を「防御陣地の構築」に変更できるか評価 ──────────
  // 「防御陣地の構築」に変えても予想侵攻量が減らない（防御の方が有利）戦線を変更
  const entrenchCost = TACTIC_ACTIONS[3].cost;
  const ppDiff = entrenchCost.politicalPower - logisticCost.politicalPower;     // 50-50=0
  const equipDiff = entrenchCost.militaryEquipment - logisticCost.militaryEquipment; // 100-100=0

  for (const frontId of logisticFrontIds) {
    // コストの差分が払える場合のみ検討
    if (availablePP + ppDiff < 0 || availableEquip + equipDiff < 0) continue;

    // 防御陣地の構築の方が有利かどうかの簡易評価:
    // 補給の改善は supply+0.2 のバフ、防御陣地は defence×1.2
    // supply が 0.6 以下なら補給改善の方が大きいバフ（0.2/supply > 0.2 for supply<1）
    // supply が 0.8 に近いなら防御の方が相対的に有利
    const front = enemyFronts.find(f => f.front_id === frontId);
    if (!front) continue;

    // 防御優位の簡易判定: supply + 0.2 < 1.2 * supply → 1.2 > 1 + 0.2/supply → supply > 1
    // 実際は supply <= 0.8 なので、防御陣地の方が有利になるのは supply が比較的高い時
    // supply > 0.65 なら防御陣地に変更（経験的閾値）
    if (front.supply > 0.65) {
      actions[frontId] = 3; // 防御陣地の構築
      availablePP -= ppDiff;
      availableEquip -= equipDiff;
    }
  }

  // ── フェーズ3: 「積極的攻勢」を最も効果的な戦線1つに割り当て ────────────────
  const aggressiveCost = TACTIC_ACTIONS[1].cost;
  if (availablePP >= aggressiveCost.politicalPower && availableEquip >= aggressiveCost.militaryEquipment) {
    // 簡易評価: 最も tile_count が多い戦線（frontが大きいほど攻勢効果が高い傾向）
    const bestFront = enemyFronts.reduce((best, f) =>
      f.tile_count > (best?.tile_count ?? 0) ? f : best
    , null as FrontInfo | null);

    if (bestFront) {
      actions[bestFront.front_id] = 1; // 積極的攻勢
    }
  }

  return actions;
}

// ── 戦争処理メイン ────────────────────────────────────────────────────────────

/**
 * 1ターンの全戦争処理を行う。
 * - 各戦争について侵攻計算・マップ反映・講和条件チェックを行う。
 * - endWarを呼ぶ戦争IDを返す（nextTurnで処理）。
 */
export async function processWars(
  countries: Record<string, CountryState>,
  wars: Record<string, War>,
  playerCountryId: string,
): Promise<{
  updatedCountries: Record<string, CountryState>;
  endedWarIds: string[];
}> {
  let updatedCountries = { ...countries };
  const endedWarIds: string[] = [];
  const gameMode = SettingState.gameMode;

  for (const [warId, war] of Object.entries(wars)) {
    const attackerKey = war.attackerId;
    const defenderKey = war.defenderId;
    const attacker = updatedCountries[attackerKey];
    const defender = updatedCountries[defenderKey];
    if (!attacker || !defender) continue;

    // ── 1. プレイヤー側のアクションを取得 ──────────────────────────────────
    const isPlayerAttacker = attackerKey === playerCountryId;
    const playerKey = isPlayerAttacker ? attackerKey : defenderKey;
    const enemyKey = isPlayerAttacker ? defenderKey : attackerKey;
    const playerCountry = updatedCountries[playerKey];
    const enemyCountry = updatedCountries[enemyKey];

    const playerFrontActions: Record<string, number> = playerCountry.frontActions ?? {};

    // ── プレイヤー視点の戦線を取得 ─────────────────────────────────────────
    let playerFronts: FrontInfo[] = [];
    try {
      playerFronts = await invoke<FrontInfo[]>('get_war_fronts', {
        war: {
          player_id: playerCountry.id,
          enemy_ids: [enemyCountry.id],
          supply_buffs: {},
          mechanization_rate: playerCountry.mechanizationRate ?? 0,
        },
      });
    } catch (e) {
      console.error('get_war_fronts error:', e);
      continue;
    }

    const prevFrontCount = playerFronts.length;

    // ── 2. 敵AIのアクション決定 ────────────────────────────────────────────
    let enemyFrontActions: Record<string, number> = {};
    if (gameMode === 'normal') {
      enemyFrontActions = await decideEnemyActions(
        enemyCountry,
        enemyKey,
        playerFronts,
        playerCountry,
        playerKey,
        wars,
        updatedCountries,
      );
    }
    // easy の場合は enemyFrontActions = {} のまま（全て standby）

    // ── 3. 侵攻計算 ────────────────────────────────────────────────────────
    if (playerFronts.length === 0) continue;

    // 合計戦線マス数（このターン用の簡易計算）
    const playerTotalTiles = Math.max(
      playerFronts.reduce((s, f) => s + f.tile_count, 0), 1
    );

    // 敵視点の戦線補給
    let enemyFronts: FrontInfo[] = [];
    try {
      enemyFronts = await invoke<FrontInfo[]>('get_war_fronts', {
        war: {
          player_id: enemyCountry.id,
          enemy_ids: [playerCountry.id],
          supply_buffs: {},
          mechanization_rate: enemyCountry.mechanizationRate ?? 0,
        },
      });
    } catch { /* 取得失敗時は0.5フォールバック */ }

    const enemyTotalTiles = Math.max(
      enemyFronts.reduce((s, f) => s + f.tile_count, 0), 1
    );

    // 敵補給マップ（region_id ベースのフォールバック込み）
    const enemySupplyMap: Record<string, number> = {};
    for (const f of enemyFronts) {
      enemySupplyMap[f.front_id] = f.supply;
      enemySupplyMap[`region_${f.region_id}`] = f.supply;
    }

    const effectivePlayerStats = calculateEffectiveStats(playerCountry);
    const effectiveEnemyStats = calculateEffectiveStats(enemyCountry);

    const playerAttackBuff  = 1.0 + (effectivePlayerStats.attackPower  / 100);
    const playerDefenceBuff = 1.0 + (effectivePlayerStats.defensePower / 100);
    const enemyAttackBuff   = 1.0 + (effectiveEnemyStats.attackPower   / 100);
    const enemyDefenceBuff  = 1.0 + (effectiveEnemyStats.defensePower  / 100);

    const advanceInput = {
      player_id: playerCountry.id,
      player_deployed_military: playerCountry.deployedMilitary || 0,
      player_total_tiles: playerTotalTiles,
      player_mechanization_rate: effectivePlayerStats.mechanizationRate || 0,
      player_spirit_attack_buff: playerAttackBuff,
      player_spirit_defence_buff: playerDefenceBuff,

      enemy_id: enemyCountry.id,
      enemy_deployed_military: enemyCountry.deployedMilitary || 0,
      enemy_total_tiles: enemyTotalTiles,
      enemy_mechanization_rate: effectiveEnemyStats.mechanizationRate || 0,
      enemy_spirit_attack_buff: enemyAttackBuff,
      enemy_spirit_defence_buff: enemyDefenceBuff,

      fronts: playerFronts.map((f) => ({
        front_id:      f.front_id,
        tile_count:    f.tile_count,
        region_id:     f.region_id,
        player_supply: f.supply,
        enemy_supply:  enemySupplyMap[f.front_id]
                    ?? enemySupplyMap[`region_${f.region_id}`]
                    ?? 0.5,
      })),

      player_front_actions: playerFrontActions,
      enemy_front_actions:  enemyFrontActions,
    };

    let advanceResults: FrontAdvanceResult[] = [];
    try {
      advanceResults = await invoke<FrontAdvanceResult[]>('calc_advance', { input: advanceInput });
    } catch (e) {
      console.error('calc_advance error:', e);
      continue;
    }

    // ── 4. マップへ反映（Rust MapStore + Map.tsx pointsRef）──────────────────
    // attacker_id / defender_id は countries[key].id（数値コード文字列 → u8 はRust側が管理）
    // Rust の id_map で引けるよう string の id を渡す
    // advance_occupation は occupy_id の u8 を必要とするため、
    // wars_occupation.rs では FrontAdvanceCommand.attacker_id / defender_id を u8 で受け取る。
    // しかし TS から u8 の数値を直接知る手段がないため、
    // ここでは player/enemy の string id と advance_tiles を渡し、
    // Rust 側で id_map を引いて u8 に変換する設計に変更する必要がある。
    //
    // → wars_occupation.rs を文字列 ID 受け取りに修正して対応する。
    //   （下記コメントの通り、FrontAdvanceCommand を string id 版で定義）

    const occupyCommands = advanceResults.map((r) => {
      const frontInfo = playerFronts.find(f => f.front_id === r.front_id);
      return {
        front_id:      r.front_id,
        advance_tiles: r.advance_tiles,
        attacker_id:   playerCountry.id,
        defender_id:   enemyCountry.id,
        front_tiles:   frontInfo?.front_tiles ?? [],
      };
    });

    let occupyResults: FrontOccupyResult[] = [];
    try {
      occupyResults = await invoke<FrontOccupyResult[]>('advance_occupation', {
        commands: occupyCommands,
      });
    } catch (e) {
      console.error('advance_occupation error:', e);
      continue;
    }

    // Map.tsx の pointsRef を更新
    const allChanges: OccupyChange[] = occupyResults.flatMap(r => r.changes);
    if (allChanges.length > 0 && _mapUpdateCallback) {
      _mapUpdateCallback(allChanges);
    }

    // ── 5. 講和条件チェック ─────────────────────────────────────────────────
    // 5a. 戦線がこのターンで消えた場合
    // 再度 get_war_fronts を呼んで現在の戦線数を確認
    let currentFronts: FrontInfo[] = [];
    try {
      currentFronts = await invoke<FrontInfo[]>('get_war_fronts', {
        war: {
          player_id: playerCountry.id,
          enemy_ids: [enemyCountry.id],
          supply_buffs: {},
          mechanization_rate: playerCountry.mechanizationRate ?? 0,
        },
      });
    } catch { /* 無視 */ }

    if (prevFrontCount > 0 && currentFronts.length < prevFrontCount) {
      console.log('劣勢です');
    }

    // 5b. 無条件降伏チェック（コアタイルを全て失った or 占領タイル数が0）
    // Rust 側のマップデータをもとに判定するため、
    // 敵（enemy）がコアタイルを全て失ったか / 占領タイル0かを確認する
    // → get_war_fronts が空リストを返すことで占領タイル0は検出できる
    // コアタイルの喪失は別途 check_capitulation コマンドで判定するのが理想だが、
    // 現フェーズでは簡易的に「戦線が完全に消えた」＝「講和条件を満たした」とみなす
    if (currentFronts.length === 0 && prevFrontCount > 0) {
      console.log('講和条件を満たしました');
      endedWarIds.push(warId);
    }
  }

  return { updatedCountries, endedWarIds };
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,

  startGame: async (playerCountryId, countriesData) => {
    const initializedCountries: Record<string, CountryState> = {};
    const nonPlayableCountriesData = await fetch('/assets/json/non_playable_countries.json').then(res => res.json()) as Record<string, NonPlayableCountryData>;

    // playable countries
    for (const [countryId, countryData] of Object.entries(countriesData)) {
      const nationalSpirits: ActiveNationalSpirit[] = [];

      // JSON側で定義されている古いプロパティ "NationalSpiritIds" の配列を取得
      const spiritIds: string[] = countryData.NationalSpiritIds || [];

      // 初期国民精神の反映
      for (const spiritId of spiritIds) {
        const def = await loadSpiritDefinition(spiritId);
        nationalSpirits.push({
          id: spiritId,
          stats: def?.stats || {},
        });
      }

      // 新しい国データとして構築
      initializedCountries[countryId] = {
        ...countryData,
        nationalSpirits,
        financeActionCount: 0,
        frontActions: {},
      };

      delete initializedCountries[countryId].NationalSpiritIds;
    }

    // non playable countries
    for (const [countryId, npcData] of Object.entries(nonPlayableCountriesData)) {
      // もう追加されているならスキップ（countries.jsonに含まれている場合）
      if (initializedCountries[countryId]) continue;
      // scaleに応じた基礎ステータス
      const scale = npcData.scale || 1;
      const baseStats = NON_PLAYABLE_COUNTRY_STATS[scale];

      // 軍事政権の場合は軍事パラメータを1.5倍に
      const isMil = npcData.isMilitaryRegime;
      const deployedMilitary = isMil ? Math.floor(baseStats.deployedMilitary * 1.5) : baseStats.deployedMilitary;
      const militaryEquipment = isMil ? Math.floor(baseStats.militaryEquipment * 1.5) : baseStats.militaryEquipment;
      const mechanizationRate = isMil ? Math.min(100, Math.floor(baseStats.mechanizationRate * 1.5)) : baseStats.mechanizationRate;

      initializedCountries[countryId] = {
        id: countryId,
        slug: countryId.toLowerCase(),
        name: npcData.name,
        flag: '', // 後で書く
        government: { ja: '', en: '' }, // この辺はNewGamePageでしか使わないのでいらない
        leader: { ja: '', en: '' },
        quote: { ja: '', en: '' },
        description: { ja: '', en: '' },
        isPlayable: false,
        legitimacy: baseStats.legitimacy,
        politicalPower: baseStats.politicalPower,
        economicStrength: baseStats.economicStrength,
        culturalUnity: baseStats.culturalUnity,
        deployedMilitary,
        militaryEquipment,
        mechanizationRate,
        financeActionCount: 0,
        suzerainId: null,
        vassalIds: [],
        activeWarIds: [],
        frontActions: {},
        activeFocusId: null,
        completedFocusIds: [],
        nationalSpirits: [],
      };
    }

    set({
      game: {
        currentTurn: 1,
        currentYear: 1932,
        currentMonth: 1,
        playerCountryId,
        countries: initializedCountries,
        wars: {},
        pendingEvents: [],
      }
    });
  },

  updateCountry: (countryId, updates) => set(state => {
    if (!state.game) return state;
    return {
      game: {
        ...state.game,
        countries: {
          ...state.game.countries,
          [countryId]: { ...state.game.countries[countryId], ...updates }
        }
      }
    };
  }),

  setNationalFocus: (countryId, focusId) => set(state => {
    if (!state.game) return state;
    const country = state.game.countries[countryId];
    return {
      game: {
        ...state.game,
        countries: {
          ...state.game.countries,
          [countryId]: {
            ...country,
            activeFocusId: focusId,
          }
        }
      }
    };
  }),

  declareWar: (attackerId, defenderId) => set(state => {
    if (!state.game) return state;
    const { updatedWars, updatedCountries } = applyDeclareWar(
      state.game.wars,
      state.game.countries,
      attackerId,
      defenderId,
      state.game.currentTurn
    );
    return {
      game: { ...state.game, countries: updatedCountries, wars: updatedWars }
    };
  }),

  endWar: (warId) => set(state => {
    if (!state.game) return state;
    const war = state.game.wars[warId];
    if (!war) return state;

    const countries = { ...state.game.countries };
    [war.attackerId, war.defenderId].forEach(id => {
      countries[id] = {
        ...countries[id],
        activeWarIds: countries[id].activeWarIds.filter(w => w !== warId)
      };
    });

    const { [warId]: _, ...remainingWars } = state.game.wars;
    return { game: { ...state.game, countries, wars: remainingWars } };
  }),

  setFrontAction: (countryId, frontId, tacticIndex) => set(state => {
    if (!state.game) return state;
    const country = state.game.countries[countryId];
    return {
      game: {
        ...state.game,
        countries: {
          ...state.game.countries,
          [countryId]: {
            ...country,
            frontActions: {
              ...country.frontActions,
              [frontId]: tacticIndex
            }
          }
        }
      }
    };
  }),

  makeVassal: (suzerainId, vassalId) => set(state => {
    if (!state.game) return state;
    const countries = { ...state.game.countries };
    countries[suzerainId] = {
      ...countries[suzerainId],
      vassalIds: [...countries[suzerainId].vassalIds, vassalId]
    };
    countries[vassalId] = { ...countries[vassalId], suzerainId };
    return { game: { ...state.game, countries } };
  }),

  grantIndependence: (vassalId) => set(state => {
    if (!state.game) return state;
    const vassal = state.game.countries[vassalId];
    if (!vassal.suzerainId) return state;

    const countries = { ...state.game.countries };
    const suzerainId = vassal.suzerainId;
    countries[suzerainId] = {
      ...countries[suzerainId],
      vassalIds: countries[suzerainId].vassalIds.filter(id => id !== vassalId)
    };
    countries[vassalId] = { ...vassal, suzerainId: null };
    return { game: { ...state.game, countries } };
  }),

  nextTurn: async () => {
    const state = get();
    if (!state.game) return;

    let { countries, wars, pendingEvents } = state.game;
    const { playerCountryId, currentTurn } = state.game;

    // ── 戦争処理 ──────────────────────────────────────────────────────────
    const { updatedCountries: warCountries, endedWarIds } = await processWars(
      countries,
      wars,
      playerCountryId,
    );
    countries = warCountries;

    // 終結した戦争を除去
    let updatedWars = { ...wars };
    for (const warId of endedWarIds) {
      const war = updatedWars[warId];
      if (war) {
        [war.attackerId, war.defenderId].forEach(id => {
          if (countries[id]) {
            countries[id] = {
              ...countries[id],
              activeWarIds: countries[id].activeWarIds.filter(w => w !== warId),
            };
          }
        });
        const { [warId]: _, ...rest } = updatedWars;
        updatedWars = rest;
      }
    }
    wars = updatedWars;

    // プレイヤー国のNF処理
    const nfResult = await processCountryFocus(playerCountryId, countries, wars, currentTurn);
    countries = nfResult.updatedCountries;
    wars = nfResult.updatedWars;
    pendingEvents = [...pendingEvents, ...nfResult.newEvents];

    // CPUのNF処理
    for (const countryId of Object.keys(countries)) {
      if (countryId === playerCountryId) continue;

      let currentCountry = countries[countryId];

      // CPUのNF選択
      const nextFocusId = await selectCpuFocus(currentCountry);
      if (nextFocusId) {
        countries[countryId] = { ...countries[countryId], activeFocusId: nextFocusId };
      }

      // CPUのNF効果を適用
      const cpuResult = await processCountryFocus(countryId, countries, wars, currentTurn);
      countries = cpuResult.updatedCountries;
      wars = cpuResult.updatedWars;
      // イベントは使用しない
    }

    // 経済・政治力の更新
    countries = processEconomy(countries);

    // 戦線アクションのリセット
    Object.keys(countries).forEach(id => {
      countries[id] = {
        ...countries[id],
        frontActions: {}
      };
    });

    // 日付を進める
    set((currentState) => {
      if (!currentState.game) return currentState;
      const nextMonth = currentState.game.currentMonth + 1;
      return {
        game: {
          ...currentState.game,
          countries,
          wars,
          pendingEvents,
          currentTurn: currentState.game.currentTurn + 1,
          currentYear: nextMonth > 12 ? currentState.game.currentYear + 1 : currentState.game.currentYear,
          currentMonth: nextMonth > 12 ? 1 : nextMonth
        }
      };
    });
  },

  resetGame: () => set({ game: null }),

  addPendingEvents: (eventIds: string[]) => set(state => {
    if (!state.game) return state;
    return {
      game: {
        ...state.game,
        pendingEvents: [...state.game.pendingEvents, ...eventIds]
      }
    };
  }),

  removePendingEvents: (eventIds: string[]) => set(state => {
    if (!state.game) return state;
    return {
      game: {
        ...state.game,
        pendingEvents: state.game.pendingEvents.filter(id => !eventIds.includes(id))
      }
    };
  }),
}));

// 便利セレクタ
export const usePlayerCountry = () => {
  return useGameStore(state => {
    if (!state.game) return null;
    return state.game.countries[state.game.playerCountryId];
  });
};

export const useCountry = (countryId: string) => {
  return useGameStore(state => state.game?.countries[countryId] ?? null);
};

export const useIsAtWar = (countryId: string) => {
  return useGameStore(state => {
    const country = state.game?.countries[countryId];
    return (country?.activeWarIds.length ?? 0) > 0;
  });
};

const processCountryFocus = async (
  countryId: string,
  countries: Record<string, CountryState>,
  wars: Record<string, War>,
  currentTurn: number
) => {
  let updatedCountries = { ...countries };
  let updatedWars = { ...wars };
  const newEvents: string[] = [];
  const country = updatedCountries[countryId];

  if (!country.activeFocusId) return { updatedCountries, updatedWars, newEvents };

  const completedId = country.activeFocusId;
  let tree = null;
  if (country.isPlayable) {
    tree = await loadFocusTree(country.slug);
  } else {
    tree = await loadFocusTree('universal_tree');
  }

  const focusNode = tree?.focuses.find(f => f.id === completedId);

  let updatedSpirits = [...(country.nationalSpirits || [])];

  // NF完了時に直接付与されるリソース
  let addPp = 0;
  let addEcon = 0;
  let addEquip = 0;
  let addMil = 0;

  if (focusNode) {
    // リソース付与
    addPp = focusNode.effects.politicalPower || 0;
    addEcon = focusNode.effects.economicStrength || 0;
    addEquip = focusNode.effects.militaryEquipment || 0;
    addMil = focusNode.effects.deployedMilitary || 0;
    // イベント
    if (focusNode.effects.eventIds) {
      newEvents.push(...focusNode.effects.eventIds);
    }

    // 戦争
    if (focusNode.effects.declareWar) {
      const targetId = focusNode.effects.declareWar;
      const result = applyDeclareWar(updatedWars, updatedCountries, countryId, targetId, currentTurn);
      updatedWars = result.updatedWars;
      updatedCountries = result.updatedCountries; // 戦争中の国のパラメータも更新
    }

    // 国民精神処理
    if (focusNode.effects.nationalSpirits) {
      for (const spiritRef of focusNode.effects.nationalSpirits) {
        if (spiritRef.action === 'add') {
          // 追加
          let statsToApply = spiritRef.stats;
          if (!statsToApply || Object.keys(statsToApply).length === 0) {
            const def = await loadSpiritDefinition(spiritRef.id);
            statsToApply = def?.stats || {};
          }
          updatedSpirits.push({ id: spiritRef.id, stats: statsToApply });
        } else if (spiritRef.action === 'modify') {
          // 更新
          updatedSpirits = updatedSpirits.map(spirit => {
            if (spirit.id === spiritRef.id) {
              const oldStats = spirit.stats || {};
              const diffStats = spiritRef.stats || {};
              const newStats = { ...oldStats };

              // 各パラメータの差分（diffStats）を既存の値（newStats）に足し合わせる
              let key: keyof typeof diffStats;
              for (key in diffStats) {
                newStats[key] = (newStats[key] || 0) + (diffStats[key] || 0);
              }

              return {
                ...spirit,
                stats: newStats
              };
            }
            return spirit;
          });
        } else if (spiritRef.action === 'remove') {
          // 削除
          updatedSpirits = updatedSpirits.filter(s => s.id !== spiritRef.id);
        }
      }
    }
  }

  const latestCountry = updatedCountries[countryId];

  updatedCountries[countryId] = {
    ...latestCountry,
    politicalPower: latestCountry.politicalPower + addPp,
    economicStrength: latestCountry.economicStrength + addEcon,
    militaryEquipment: Math.max(0, latestCountry.militaryEquipment + addEquip),
    deployedMilitary: Math.max(0, latestCountry.deployedMilitary + addMil),
    activeFocusId: null,
    completedFocusIds: [...(country.completedFocusIds as string[]), completedId] as string[],
    nationalSpirits: updatedSpirits,
  };

  return { updatedCountries, updatedWars, newEvents };
};

// CPUが次に取得するNFのIDを返す関数（取得可能なものがない場合はnull）
const selectCpuFocus = async (country: CountryState): Promise<string | null> => {
  if (country.activeFocusId) return country.activeFocusId;

  const treeSlug = country.isPlayable ? country.slug : 'universal_tree';
  const tree = await loadFocusTree(treeSlug);
  if (!tree) return null;

  const completed = new Set(country.completedFocusIds);

  const available = tree.focuses.filter(focus => {
    if (completed.has(focus.id)) return false;
    if (focus.prerequisites.length > 0 && !focus.prerequisites.every(pid => completed.has(pid))) return false;
    if (focus.prerequisitesAny && focus.prerequisitesAny.length > 0 && !focus.prerequisitesAny.some(pid => completed.has(pid))) return false;
    if (focus.mutuallyExclusive.length > 0 && focus.mutuallyExclusive.some(eid => completed.has(eid))) return false;
    return true;
  });

  if (available.length === 0) return null;

  // ランダムに選択
  const chosen = available[Math.floor(Math.random() * available.length)];
  return chosen.id;
};

export const applyDeclareWar = (
  wars: Record<string, War>,
  countries: Record<string, CountryState>,
  attackerId: string,
  defenderId: string,
  currentTurn: number
) => {
  const warId = `war_${attackerId}_${defenderId}_${currentTurn}`;

  // 既に戦争中かチェック
  const alreadyAtWar = Object.values(wars).some(
    w => (w.attackerId === attackerId && w.defenderId === defenderId) ||
         (w.attackerId === defenderId && w.defenderId === attackerId)
  );

  if (alreadyAtWar || !countries[attackerId] || !countries[defenderId]) {
    return { updatedWars: wars, updatedCountries: countries };
  }

  const newWar: War = { warId, attackerId, defenderId, startTurn: currentTurn };

  return {
    updatedWars: { ...wars, [warId]: newWar },
    updatedCountries: {
      ...countries,
      [attackerId]: {
        ...countries[attackerId],
        activeWarIds: [...countries[attackerId].activeWarIds, warId]
      },
      [defenderId]: {
        ...countries[defenderId],
        activeWarIds: [...countries[defenderId].activeWarIds, warId]
      }
    }
  };
};

const processEconomy = (countries: Record<string, CountryState>) => {
  const updatedCountries = { ...countries };
  const ECONOMIC_GROWNTH_RATE = 0.05;
  const POLITICAL_POWER_INCREASE = 50;

  Object.keys(updatedCountries).forEach((id) => {
    const currentCountry = updatedCountries[id];
    const { currentLevel } = calculateFinanceStatus(currentCountry); // 財政状態

    // 古い財政バフを取り除き、新しいものを追加
    let updatedSpirits = (currentCountry.nationalSpirits || []).filter(
      spirit => !spirit.id.startsWith('finance_')
    );
    updatedSpirits.push({
      id: currentLevel.id,
      stats: currentLevel.stats
    });

    // バフ・デバフを集計
    let totalPpRate = 0;
    let totalEconRate = 0;

    (currentCountry.nationalSpirits || []).forEach((spirit) => {
      totalPpRate += spirit.stats.politicalPowerRate || 0;
      totalEconRate += spirit.stats.economicStrengthRate || 0;
    });

    // 増加量を計算
    const actualPpIncrease = POLITICAL_POWER_INCREASE * (1 + totalPpRate / 100);
    const actualEconIncrease = currentCountry.economicStrength * ECONOMIC_GROWNTH_RATE * (1 + totalEconRate / 100);

    const roundToTop3Digits = (value: number): number => {
      if (value === 0) return 0;
      const absValue = Math.abs(value);
      const digits = Math.floor(Math.log10(absValue)) + 1; // 桁数

      // 3桁以下
      if (digits <= 3) {
        return Math.round(value);
      } else {
        // 4桁以上
        const factor = Math.pow(10, digits - 3);
        return Math.round(value / factor) * factor;
      }
    };

    // 値を更新
    updatedCountries[id] = {
      ...currentCountry,
      politicalPower: Math.round(currentCountry.politicalPower + actualPpIncrease),
      economicStrength: roundToTop3Digits(currentCountry.economicStrength + actualEconIncrease),
      financeActionCount: 0,
      nationalSpirits: updatedSpirits,
    };
  });

  return updatedCountries;
};

export const FINANCE_LEVELS = [
  { id: 'finance_0', name: { ja: '緊縮財政', en: 'Austerity' }, ratio: 0, buff: { ja: '経済成長率 +10%, 政治力獲得倍率 +10%', en: 'Economic Growth +10%, Political Power Rate +10%' }, debuff: { ja: 'なし', en: 'None' }, stats: { economicStrengthRate: 10, politicalPowerRate: 10 } },
  { id: 'finance_1', name: { ja: '平和維持', en: 'Peacekeeping' }, ratio: 0.5, buff: { ja: '経済成長率 +10%', en: 'Economic Growth +10%' }, debuff: { ja: 'なし', en: 'None' }, stats: { economicStrengthRate: 10 } },
  { id: 'finance_2', name: { ja: '標準予算', en: 'Standard Budget' }, ratio: 2, buff: { ja: 'なし', en: 'None' }, debuff: { ja: 'なし', en: 'None' }, stats: {} },
  { id: 'finance_3', name: { ja: '軍拡財政', en: 'Rearmament' }, ratio: 5, buff: { ja: 'なし', en: 'None' }, debuff: { ja: '経済成長率 -20%', en: 'Economic Growth -20%' }, stats: { economicStrengthRate: -20 } },
  { id: 'finance_4', name: { ja: '総力戦体制', en: 'Total War' }, ratio: 10, buff: { ja: 'なし', en: 'None' }, debuff: { ja: '経済成長率 -40%, 政治力獲得倍率 -20%', en: 'Economic Growth -40%, Political Power Rate -20%' }, stats: { economicStrengthRate: -40, politicalPowerRate: -20 } },
];

// 財政状態を計算する共通関数
export const calculateFinanceStatus = (country: CountryState) => {
  const stats = calculateEffectiveStats(country);

  const legMultiplier = 0.25 + (stats.legitimacy / 400);
  const culMultiplier = 0.25 + (stats.culturalUnity / 400);
  const totalMultiplier = legMultiplier + culMultiplier;
  const effectiveGDP = country.economicStrength * totalMultiplier;

  const C_BASE = 75000;
  const ALPHA = 0.7;
  const BETA = 2;
  const C_EQUIP = 500;
  const FIXED_COST = 20_000_000;

  const divisionCost = country.deployedMilitary * C_BASE * (1 + ALPHA * Math.pow(stats.mechanizationRate, BETA));
  const equipmentCost = country.militaryEquipment * C_EQUIP;
  const militaryBudget = divisionCost + equipmentCost + FIXED_COST;

  const currentRatio = effectiveGDP > 0 ? (militaryBudget / effectiveGDP) * 100 : 0;

  let currentLevel = FINANCE_LEVELS[0];
  for (let i = FINANCE_LEVELS.length - 1; i >= 0; i--) {
    if (currentRatio >= FINANCE_LEVELS[i].ratio) {
      currentLevel = FINANCE_LEVELS[i];
      break;
    }
  }

  return { effectiveGDP, militaryBudget, currentRatio, currentLevel };
};


export interface EffectiveCountryStats {
  legitimacy: number;
  culturalUnity: number;
  mechanizationRate: number;
  attackPower: number;
  defensePower: number;
  politicalPowerRate: number;
  economicStrengthRate: number;
}

// 基礎値と国民精神のバフを合算
export const calculateEffectiveStats = (country: CountryState): EffectiveCountryStats => {
  let legitimacy = country.legitimacy;
  let culturalUnity = country.culturalUnity;
  let mechanizationRate = country.mechanizationRate;
  let attackPower = 0;
  let defensePower = 0;
  let politicalPowerRate = 0;
  let economicStrengthRate = 0;

  country.nationalSpirits.forEach(spirit => {
    legitimacy += spirit.stats.legitimacy || 0;
    culturalUnity += spirit.stats.culturalUnity || 0;
    mechanizationRate += spirit.stats.mechanizationRate || 0;
    attackPower += spirit.stats.attackPower || 0;
    defensePower += spirit.stats.defensePower || 0;
    politicalPowerRate += spirit.stats.politicalPowerRate || 0;
    economicStrengthRate += spirit.stats.economicStrengthRate || 0;
  });

  return {
    legitimacy: Math.max(0, Math.min(100, legitimacy)),
    culturalUnity: Math.max(0, Math.min(100, culturalUnity)),
    mechanizationRate: Math.max(0, Math.min(100, mechanizationRate)),
    attackPower,
    defensePower,
    politicalPowerRate,
    economicStrengthRate,
  };
};