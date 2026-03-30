// ts/modules/wars.ts
import { invoke } from '@tauri-apps/api/core';
import { CountryState, War, calculateEffectiveStats } from './gameState';
import { SettingState } from './store';
import { TACTIC_ACTIONS } from '../components/GameWar';

// ─────────────────────────────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────────────────────────────

export interface FrontInfo {
  front_id: string;
  name: { ja: string; en: string };
  tile_count: number;
  region_id: number;
  supply: number;
  front_tiles: [number, number][];
}

interface FrontAdvanceResult {
  front_id: string;
  advance_tiles: number;
  phase_log: unknown[];
}

export interface OccupyChange {
  x: number;
  y: number;
  new_occupy_id: number;
}

interface FrontOccupyResult {
  front_id: string;
  changes: OccupyChange[];
}

interface CollapseCheckResult {
  collapsed: boolean;
  total_owner_tiles: number;
  enemy_occupied_tiles: number;
  occupation_ratio: number;
}

interface WarTileBalance {
  attacker_gains: number;
  defender_gains: number;
  net_balance: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// マップ更新コールバック
// ─────────────────────────────────────────────────────────────────────────────

type MapUpdateCallback = (changes: OccupyChange[]) => void;
let _mapUpdateCallback: MapUpdateCallback | null = null;

export function registerMapUpdateCallback(cb: MapUpdateCallback): void {
  _mapUpdateCallback = cb;
}

// ─────────────────────────────────────────────────────────────────────────────
// 個別講和の CPU トリガー追跡
// ─────────────────────────────────────────────────────────────────────────────

const cpuPeaceTrigger: Record<string, { minusTurns: number; lastCooldownTurn: number }> = {};

const CPU_PEACE_CONSECUTIVE_TURNS = 5;
const CPU_PEACE_COOLDOWN_TURNS    = 5;

// ─────────────────────────────────────────────────────────────────────────────
// 敵 AI アクション決定
// ─────────────────────────────────────────────────────────────────────────────

async function decideEnemyActions(
  enemy: CountryState,
  opponent: CountryState,
): Promise<Record<string, number>> {
  const actions: Record<string, number> = {};

  let enemyFronts: FrontInfo[] = [];
  try {
    enemyFronts = await invoke<FrontInfo[]>('get_war_fronts', {
      war: {
        player_id:          enemy.id,
        enemy_ids:          [opponent.id],
        supply_buffs:       {},
        mechanization_rate: enemy.mechanizationRate ?? 0,
      },
    });
  } catch {
    return actions;
  }

  if (enemyFronts.length === 0) return actions;

  let availablePP    = enemy.politicalPower;
  let availableEquip = enemy.militaryEquipment;

  // フェーズ1: 補給が80%以下の戦線に「補給の改善」(index=4)
  const lowSupplyFronts = enemyFronts
    .filter(f => f.supply <= 0.8)
    .sort((a, b) => a.supply - b.supply);

  const logisticCost     = TACTIC_ACTIONS[4].cost;
  const logisticFrontIds = new Set<string>();

  for (const front of lowSupplyFronts) {
    if (availablePP >= logisticCost.politicalPower && availableEquip >= logisticCost.militaryEquipment) {
      actions[front.front_id] = 4;
      logisticFrontIds.add(front.front_id);
      availablePP    -= logisticCost.politicalPower;
      availableEquip -= logisticCost.militaryEquipment;
    } else {
      break;
    }
  }

  // フェーズ2: 防御陣地の構築への切り替え評価
  const entrenchCost = TACTIC_ACTIONS[3].cost;
  const ppDiff    = entrenchCost.politicalPower    - logisticCost.politicalPower;
  const equipDiff = entrenchCost.militaryEquipment - logisticCost.militaryEquipment;

  for (const frontId of logisticFrontIds) {
    if (availablePP + ppDiff < 0 || availableEquip + equipDiff < 0) continue;
    const front = enemyFronts.find(f => f.front_id === frontId);
    if (!front) continue;
    if (front.supply > 0.5) {
      actions[frontId] = 3;
      availablePP    -= ppDiff;
      availableEquip -= equipDiff;
    }
  }

  // フェーズ3: 「積極的攻勢」を最も効果的な戦線1つに割り当て
  const aggressiveCost = TACTIC_ACTIONS[1].cost;
  if (availablePP >= aggressiveCost.politicalPower && availableEquip >= aggressiveCost.militaryEquipment) {
    const bestFront = enemyFronts.reduce<FrontInfo | null>(
      (best, f) => f.tile_count > (best?.tile_count ?? 0) ? f : best,
      null,
    );
    if (bestFront) {
      actions[bestFront.front_id] = 1;
    }
  }

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// 優先順位1: 強制全土降伏
// ─────────────────────────────────────────────────────────────────────────────

async function checkAndApplyCollapses(
  wars: Record<string, War>,
  _countries: Record<string, CountryState>,
): Promise<{
  endedWarIds: string[];
  occupyChanges: OccupyChange[];
  collapsedIds: Set<string>;
}> {
  const endedWarIds:   string[]       = [];
  const occupyChanges: OccupyChange[] = [];
  const collapsedIds:  Set<string>    = new Set();

  for (const [warId, war] of Object.entries(wars)) {
    if (endedWarIds.includes(warId)) continue;

    const sides: [string, string][] = [
      [war.attackerId, war.defenderId],
      [war.defenderId, war.attackerId],
    ];

    for (const [loserId, winnerId] of sides) {
      if (collapsedIds.has(loserId)) continue;

      let check: CollapseCheckResult;
      try {
        check = await invoke<CollapseCheckResult>('check_total_collapse', { countryId: loserId });
      } catch {
        continue;
      }

      if (!check.collapsed) continue;

      collapsedIds.add(loserId);

      let changes: OccupyChange[] = [];
      try {
        changes = await invoke<OccupyChange[]>('apply_collapse', {
          input: { loser_id: loserId, winner_ids: [winnerId] },
        });
      } catch (e) {
        console.error('[checkAndApplyCollapses] apply_collapse error:', e);
      }

      occupyChanges.push(...changes);

      for (const [wid, w] of Object.entries(wars)) {
        if (!endedWarIds.includes(wid) &&
            (w.attackerId === loserId || w.defenderId === loserId)) {
          endedWarIds.push(wid);
        }
      }

      break;
    }
  }

  return { endedWarIds, occupyChanges, collapsedIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// 優先順位2: 強制講和（戦線消滅）
// ─────────────────────────────────────────────────────────────────────────────

async function applyForcedPeace(war: War): Promise<OccupyChange[]> {
  return applyPeaceSettlement(war.attackerId, war.defenderId, false, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// 優先順位3: 個別講和
// ─────────────────────────────────────────────────────────────────────────────

async function applySeparatePeace(
  war: War,
  wars: Record<string, War>,
): Promise<OccupyChange[]> {
  const defenderOtherEnemies = getOtherEnemies(war.defenderId, war.warId, wars);
  return applyPeaceSettlement(war.attackerId, war.defenderId, true, defenderOtherEnemies);
}

function getOtherEnemies(
  countryId: string,
  excludeWarId: string,
  wars: Record<string, War>,
): string[] {
  const enemies: string[] = [];
  for (const [wid, w] of Object.entries(wars)) {
    if (wid === excludeWarId) continue;
    if (w.attackerId === countryId) enemies.push(w.defenderId);
    if (w.defenderId === countryId) enemies.push(w.attackerId);
  }
  return enemies;
}

async function evaluateCpuPeaceTrigger(
  warId: string,
  war: War,
  currentTurn: number,
): Promise<boolean> {
  if (!cpuPeaceTrigger[warId]) {
    cpuPeaceTrigger[warId] = { minusTurns: 0, lastCooldownTurn: 0 };
  }

  const tracker = cpuPeaceTrigger[warId];

  if (currentTurn - tracker.lastCooldownTurn < CPU_PEACE_COOLDOWN_TURNS) return false;

  let balance: WarTileBalance;
  try {
    balance = await invoke<WarTileBalance>('get_war_tile_balance', {
      attackerId: war.attackerId,
      defenderId: war.defenderId,
    });
  } catch {
    return false;
  }

  if (balance.net_balance < 0) {
    tracker.minusTurns += 1;
  } else {
    tracker.minusTurns = 0;
  }

  if (tracker.minusTurns >= CPU_PEACE_CONSECUTIVE_TURNS) {
    tracker.minusTurns       = 0;
    tracker.lastCooldownTurn = currentTurn;
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 共通: Rust apply_peace_settlement 呼び出し
// ─────────────────────────────────────────────────────────────────────────────

async function applyPeaceSettlement(
  attackerId: string,
  defenderId: string,
  cleanupEnclaves: boolean,
  defenderOtherEnemies: string[],
): Promise<OccupyChange[]> {
  try {
    return await invoke<OccupyChange[]>('apply_peace_settlement', {
      input: {
        attacker_id:            attackerId,
        defender_id:            defenderId,
        cleanup_enclaves:       cleanupEnclaves,
        defender_other_enemies: defenderOtherEnemies,
      },
    });
  } catch (e) {
    console.error('[applyPeaceSettlement] error:', e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// メインエントリ: processWars
// ─────────────────────────────────────────────────────────────────────────────

export async function processWars(
  countries: Record<string, CountryState>,
  wars: Record<string, War>,
  playerCountryId: string,
  currentTurn: number,
  playerRequestedPeaceWarId: string | null = null,
): Promise<{
  updatedCountries: Record<string, CountryState>;
  endedWarIds: string[];
}> {
  let updatedCountries = { ...countries };
  const endedWarIds: string[] = [];
  const gameMode = SettingState.gameMode;

  const collapsedFrontWarIds = new Set<string>();

  // ══════════════════════════════════════════════════════════════════════════
  // フェーズ1: 侵攻処理
  // ══════════════════════════════════════════════════════════════════════════
  for (const [warId, war] of Object.entries(wars)) {
    const attackerCountry = updatedCountries[war.attackerId];
    const defenderCountry = updatedCountries[war.defenderId];

    if (!attackerCountry || !defenderCountry) continue;

    if (warId === playerRequestedPeaceWarId) {
      console.log(`戦争 ${warId} は講和交渉中のため、このターンの戦闘を停止します（休戦）。`);
      continue;
    }

    // 1. アクションの取得・決定
    let attackerFrontActions: Record<string, number> =
      war.attackerId === playerCountryId ? (attackerCountry.frontActions ?? {}) : {};
    let defenderFrontActions: Record<string, number> =
      war.defenderId === playerCountryId ? (defenderCountry.frontActions ?? {}) : {};

    if (gameMode === 'normal') {
      if (war.attackerId !== playerCountryId) {
        attackerFrontActions = await decideEnemyActions(attackerCountry, defenderCountry);
      }
      if (war.defenderId !== playerCountryId) {
        defenderFrontActions = await decideEnemyActions(defenderCountry, attackerCountry);
      }
    }

    // 2. 戦線の取得（Attacker 視点）
    let attackerFronts: FrontInfo[] = [];
    try {
      attackerFronts = await invoke<FrontInfo[]>('get_war_fronts', {
        war: {
          player_id:          attackerCountry.id,
          enemy_ids:          [defenderCountry.id],
          supply_buffs:       {},
          mechanization_rate: attackerCountry.mechanizationRate ?? 0,
        },
      });
    } catch (e) {
      console.error('get_war_fronts error:', e);
      continue;
    }

    const prevFrontCount = attackerFronts.length;
    if (prevFrontCount === 0) continue;

    const attackerTotalTiles = Math.max(attackerFronts.reduce((s, f) => s + f.tile_count, 0), 1);

    // 3. 敵（Defender）視点の戦線と補給マップを取得
    let defenderFronts: FrontInfo[] = [];
    try {
      defenderFronts = await invoke<FrontInfo[]>('get_war_fronts', {
        war: {
          player_id:          defenderCountry.id,
          enemy_ids:          [attackerCountry.id],
          supply_buffs:       {},
          mechanization_rate: defenderCountry.mechanizationRate ?? 0,
        },
      });
    } catch { /* 無視 */ }

    const defenderTotalTiles = Math.max(defenderFronts.reduce((s, f) => s + f.tile_count, 0), 1);

    const defenderSupplyMap: Record<string, number> = {};
    for (const f of defenderFronts) {
      defenderSupplyMap[f.front_id]              = f.supply;
      defenderSupplyMap[`region_${f.region_id}`] = f.supply;
    }

    // 4. 侵攻計算
    const effectiveAttackerStats = calculateEffectiveStats(attackerCountry);
    const effectiveDefenderStats = calculateEffectiveStats(defenderCountry);

    const advanceInput = {
      player_id:                  attackerCountry.id,
      player_deployed_military:   attackerCountry.deployedMilitary || 0,
      player_total_tiles:         attackerTotalTiles,
      player_mechanization_rate:  effectiveAttackerStats.mechanizationRate || 0,
      player_spirit_attack_buff:  1.0 + (effectiveAttackerStats.attackPower  / 100),
      player_spirit_defence_buff: 1.0 + (effectiveAttackerStats.defensePower / 100),

      enemy_id:                   defenderCountry.id,
      enemy_deployed_military:    defenderCountry.deployedMilitary || 0,
      enemy_total_tiles:          defenderTotalTiles,
      enemy_mechanization_rate:   effectiveDefenderStats.mechanizationRate || 0,
      enemy_spirit_attack_buff:   1.0 + (effectiveDefenderStats.attackPower  / 100),
      enemy_spirit_defence_buff:  1.0 + (effectiveDefenderStats.defensePower / 100),

      fronts: attackerFronts.map(f => ({
        front_id:      f.front_id,
        tile_count:    f.tile_count,
        region_id:     f.region_id,
        player_supply: f.supply,
        enemy_supply:  defenderSupplyMap[f.front_id]
                    ?? defenderSupplyMap[`region_${f.region_id}`]
                    ?? 0.5,
      })),

      player_front_actions: attackerFrontActions,
      enemy_front_actions:  defenderFrontActions,
    };

    let advanceResults: FrontAdvanceResult[] = [];
    try {
      advanceResults = await invoke<FrontAdvanceResult[]>('calc_advance', { input: advanceInput });
    } catch (e) {
      console.error('calc_advance error:', e);
      continue;
    }

    // 5. マップへ反映
    const occupyCommands = advanceResults.map(r => {
      const frontInfo = attackerFronts.find(f => f.front_id === r.front_id);
      return {
        front_id:      r.front_id,
        advance_tiles: r.advance_tiles,
        attacker_id:   attackerCountry.id,
        defender_id:   defenderCountry.id,
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

    const allChanges: OccupyChange[] = occupyResults.flatMap(r => r.changes);
    if (allChanges.length > 0 && _mapUpdateCallback) {
      _mapUpdateCallback(allChanges);
    }

    // 6. 侵攻後の戦線数を確認（戦線消滅の記録のみ）
    let currentFronts: FrontInfo[] = [];
    try {
      currentFronts = await invoke<FrontInfo[]>('get_war_fronts', {
        war: {
          player_id:          attackerCountry.id,
          enemy_ids:          [defenderCountry.id],
          supply_buffs:       {},
          mechanization_rate: attackerCountry.mechanizationRate ?? 0,
        },
      });
    } catch { /* 無視 */ }

    if (prevFrontCount > 0 && currentFronts.length === 0) {
      collapsedFrontWarIds.add(warId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // フェーズ2: 講和判定
  // 優先順位: 強制全土降伏 > 強制講和（戦線消滅）> 個別講和
  // ══════════════════════════════════════════════════════════════════════════

  // 優先順位1: 強制全土降伏
  const { endedWarIds: collapseEndedIds, occupyChanges: collapseChanges, collapsedIds } =
    await checkAndApplyCollapses(wars, updatedCountries);

  if (collapseChanges.length > 0 && _mapUpdateCallback) {
    _mapUpdateCallback(collapseChanges);
  }
  endedWarIds.push(...collapseEndedIds);

  // 優先順位2 & 3
  for (const [warId, war] of Object.entries(wars)) {
    if (endedWarIds.includes(warId)) continue;
    if (collapsedIds.has(war.attackerId) || collapsedIds.has(war.defenderId)) continue;

    const isPlayerInvolved =
      war.attackerId === playerCountryId || war.defenderId === playerCountryId;

    // 優先順位2: 強制講和（戦線消滅）
    if (collapsedFrontWarIds.has(warId)) {
      console.log(`[War: ${warId}] 戦線消滅 → 強制講和`);
      const changes = await applyForcedPeace(war);
      if (changes.length > 0 && _mapUpdateCallback) _mapUpdateCallback(changes);
      endedWarIds.push(warId);
      delete cpuPeaceTrigger[warId];
      continue;
    }

    // 優先順位3-a: プレイヤーからの講和要求
    if (isPlayerInvolved && playerRequestedPeaceWarId === warId) {
      console.log(`[War: ${warId}] プレイヤーが個別講和を要求`);
      const changes = await applySeparatePeace(war, wars);
      if (changes.length > 0 && _mapUpdateCallback) _mapUpdateCallback(changes);
      endedWarIds.push(warId);
      delete cpuPeaceTrigger[warId];
      continue;
    }

    // 優先順位3-b: CPU 連続劣勢による講和要求
    if (!isPlayerInvolved) {
      const triggered = await evaluateCpuPeaceTrigger(warId, war, currentTurn);
      if (triggered) {
        console.log(`[War: ${warId}] CPU が個別講和を要求（5ターン連続劣勢）`);
        const changes = await applySeparatePeace(war, wars);
        if (changes.length > 0 && _mapUpdateCallback) _mapUpdateCallback(changes);
        endedWarIds.push(warId);
        delete cpuPeaceTrigger[warId];
        continue;
      }
    }
  }

  return { updatedCountries, endedWarIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// 宣戦布告
// ─────────────────────────────────────────────────────────────────────────────

export function applyDeclareWar(
  wars: Record<string, War>,
  countries: Record<string, CountryState>,
  attackerId: string,
  defenderId: string,
  currentTurn: number,
): { updatedWars: Record<string, War>; updatedCountries: Record<string, CountryState> } {
  const warId = `war_${attackerId}_${defenderId}_${currentTurn}`;

  const alreadyAtWar = Object.values(wars).some(
    w =>
      (w.attackerId === attackerId && w.defenderId === defenderId) ||
      (w.attackerId === defenderId && w.defenderId === attackerId),
  );

  if (alreadyAtWar || !countries[attackerId] || !countries[defenderId]) {
    return { updatedWars: wars, updatedCountries: countries };
  }

  const newWar: War = {
    warId,
    attackerId,
    defenderId,
    startTurn:      currentTurn,
    attackerAllies: countries[attackerId].allies,
    defenderAllies: countries[defenderId].allies,
  };

  let updatedWars: Record<string, War> = { ...wars, [warId]: newWar };
  let updatedCountries: Record<string, CountryState> = {
    ...countries,
    [attackerId]: {
      ...countries[attackerId],
      activeWarIds: [...countries[attackerId].activeWarIds, warId],
    },
    [defenderId]: {
      ...countries[defenderId],
      activeWarIds: [...countries[defenderId].activeWarIds, warId],
    },
  };

  // 防御側の同盟国のみ自動参戦させる
  for (const allyId of countries[defenderId].allies) {
    if (allyId === attackerId || !updatedCountries[allyId]) continue; // 攻撃側自身・すでに交戦中の国を除く

    const allyAlreadyAtWar = Object.values(updatedWars).some(
      w =>
        (w.attackerId === allyId && w.defenderId === attackerId) ||
        (w.attackerId === attackerId && w.defenderId === allyId),
    );
    if (allyAlreadyAtWar) continue;

    const allyWarId = `war_${allyId}_${attackerId}_${currentTurn}`;
    const allyWar: War = {
      warId:          allyWarId,
      attackerId:     allyId,
      defenderId:     attackerId,
      startTurn:      currentTurn,
      attackerAllies: updatedCountries[allyId].allies,
      defenderAllies: updatedCountries[attackerId].allies,
    };

    updatedWars = { ...updatedWars, [allyWarId]: allyWar };
    updatedCountries = {
      ...updatedCountries,
      [allyId]: {
        ...updatedCountries[allyId],
        activeWarIds: [...updatedCountries[allyId].activeWarIds, allyWarId],
      },
      [attackerId]: {
        ...updatedCountries[attackerId],
        activeWarIds: [...updatedCountries[attackerId].activeWarIds, allyWarId],
      },
    };
  }

  return { updatedWars, updatedCountries };
}

// ─────────────────────────────────────────────────────────────────────────────
// 同盟参戦
// ─────────────────────────────────────────────────────────────────────────────

export function applyAllyJoinWar(
  wars: Record<string, War>,
  countries: Record<string, CountryState>,
  originalWarId: string,
  attackerKey: string,
  defenderKey: string,
  currentTurn: number,
): { updatedWars: Record<string, War>; updatedCountries: Record<string, CountryState> } {
  let updatedWars      = { ...wars };
  let updatedCountries = { ...countries };

  const attacker = updatedCountries[attackerKey];
  const defender  = updatedCountries[defenderKey];
  if (!attacker || !defender) return { updatedWars, updatedCountries };

  for (const allyKey of attacker.allies) {
    if (allyKey === defenderKey || !updatedCountries[allyKey]) continue;
    const r  = applyDeclareWar(updatedWars, updatedCountries, allyKey, defenderKey, currentTurn);
    updatedWars      = r.updatedWars;
    updatedCountries = r.updatedCountries;
    console.log(`[Alliance] ${allyKey} joins war ${originalWarId} as attacker against ${defenderKey}`);
  }

  for (const allyKey of defender.allies) {
    if (allyKey === attackerKey || !updatedCountries[allyKey]) continue;
    const r  = applyDeclareWar(updatedWars, updatedCountries, allyKey, attackerKey, currentTurn);
    updatedWars      = r.updatedWars;
    updatedCountries = r.updatedCountries;
  }

  return { updatedWars, updatedCountries };
}