// ts/modules/gameState.ts
import { create } from 'zustand';
import { loadSpiritDefinition } from './nationalFocus';
import { processWars, applyDeclareWar, applyAllyJoinWar, applyPlayerAcceptedCpuPeace, processCpuMilitaryBuild } from './wars';
import { processCountryFocus, selectCpuFocus } from './focus';
import { invoke } from '@tauri-apps/api/core';
import { SettingState } from './store';

// ─────────────────────────────────────────────────────────────────────────────
// 型定義（他モジュールから import される）
// ─────────────────────────────────────────────────────────────────────────────

export interface War {
  warId: string;
  attackerId: string;
  defenderId: string;
  startTurn: number;
  attackerAllies: string[];
  defenderAllies: string[];
}

export interface LocalizedName {
  ja: string;
  en: string;
}

import type { ModifierStats } from './nationalFocus';

export interface ActiveNationalSpirit {
  id: string;
  stats: ModifierStats;
}


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

  legitimacy: number;
  politicalPower: number;
  economicStrength: number;
  culturalUnity: number;

  deployedMilitary: number;
  militaryEquipment: number;
  mechanizationRate: number;

  financeActionCount: number;

  suzerainId: string | null;
  vassalIds: string[];
  activeWarIds: string[];
  frontActions?: Record<string, number>;
  allies: string[];

  activeFocusId: string | null;
  completedFocusIds: string[];
  nationalSpirits: ActiveNationalSpirit[];
  NationalSpiritIds?: string[];
}

export interface GameState {
  currentTurn: number;
  currentYear: number;
  currentMonth: number;
  playerCountryId: string;
  countries: Record<string, CountryState>;
  wars: Record<string, War>;
  pendingEvents: string[];
}

export interface EffectiveCountryStats {
  legitimacy: number;
  culturalUnity: number;
  mechanizationRate: number;
  attackPower: number;
  defensePower: number;
  politicalPowerRate: number;
  economicStrengthRate: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zustand ストア
// ─────────────────────────────────────────────────────────────────────────────

interface GameStore {
  game: GameState | null;
  /** プレイヤーが講和を要求している warId（null = 要求なし） */
  playerRequestedPeaceWarId: string | null;

  startGame:            (playerCountryId: string, countriesData: Record<string, CountryState>) => void;
  updateCountry:        (countryId: string, updates: Partial<CountryState>) => void;
  setNationalFocus:     (countryId: string, focusId: string) => void;
  declareWar:           (attackerId: string, defenderId: string, callAllies?: boolean) => void;
  endWar:               (warId: string) => void;
  setFrontAction:       (countryId: string, frontId: string, tacticIndex: number) => void;
  formAlliance:         (countryIdA: string, countryIdB: string) => void;
  breakAlliance:        (countryIdA: string, countryIdB: string) => void;
  makeVassal:           (suzerainId: string, vassalId: string) => void;
  grantIndependence:    (vassalId: string) => void;
  nextTurn:             () => Promise<void>;
  resetGame:            () => void;
  addPendingEvents:     (eventIds: string[]) => void;
  removePendingEvents:  (eventIds: string[]) => void;
  /** プレイヤーが講和を要求する（null を渡すとクリア） */
  requestPeace:         (warId: string | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// non playable 国のデフォルトパラメータ
// ─────────────────────────────────────────────────────────────────────────────

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
  1: { legitimacy: 40, politicalPower: 0, economicStrength: 2_000_000_000,   culturalUnity: 50, deployedMilitary: 10, militaryEquipment: 100,  mechanizationRate: 5  },
  2: { legitimacy: 40, politicalPower: 0, economicStrength: 10_000_000_000,  culturalUnity: 50, deployedMilitary: 15, militaryEquipment: 300,  mechanizationRate: 10 },
  3: { legitimacy: 40, politicalPower: 0, economicStrength: 40_000_000_000,  culturalUnity: 50, deployedMilitary: 30, militaryEquipment: 500,  mechanizationRate: 15 },
  4: { legitimacy: 40, politicalPower: 0, economicStrength: 80_000_000_000,  culturalUnity: 50, deployedMilitary: 40, militaryEquipment: 800,  mechanizationRate: 20 },
  5: { legitimacy: 50, politicalPower: 0, economicStrength: 100_000_000_000, culturalUnity: 60, deployedMilitary: 50, militaryEquipment: 1000, mechanizationRate: 25 },
  6: { legitimacy: 60, politicalPower: 0, economicStrength: 120_000_000_000, culturalUnity: 70, deployedMilitary: 70, militaryEquipment: 1200, mechanizationRate: 30 },
};

interface NonPlayableCountryData {
  id: string;
  name: LocalizedName;
  scale: number;
  isMilitaryRegime: boolean;
  suzerainId?: string;
  vassalIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ストア実装
// ─────────────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  playerRequestedPeaceWarId: null,

  // ── ゲーム開始 ─────────────────────────────────────────────────────────────
  startGame: async (playerCountryId, countriesData) => {
    const initializedCountries: Record<string, CountryState> = {};
    const nonPlayableCountriesData = await fetch('/assets/json/non_playable_countries.json')
      .then(res => res.json()) as Record<string, NonPlayableCountryData>;

    for (const [countryId, countryData] of Object.entries(countriesData)) {
      const nationalSpirits: ActiveNationalSpirit[] = [];
      const spiritIds: string[] = countryData.NationalSpiritIds || [];

      for (const spiritId of spiritIds) {
        const def = await loadSpiritDefinition(spiritId);
        nationalSpirits.push({ id: spiritId, stats: def?.stats || {} });
      }

      initializedCountries[countryId] = {
        ...countryData,
        nationalSpirits,
        allies:             countryData.allies ?? [],
        financeActionCount: 0,
        frontActions:       {},
      };
      delete initializedCountries[countryId].NationalSpiritIds;
    }

    for (const [countryId, npcData] of Object.entries(nonPlayableCountriesData)) {
      if (initializedCountries[countryId]) continue;

      const scale     = npcData.scale || 1;
      const baseStats = NON_PLAYABLE_COUNTRY_STATS[scale];
      const isMil     = npcData.isMilitaryRegime;

      const deployedMilitary  = isMil ? Math.floor(baseStats.deployedMilitary  * 1.5) : baseStats.deployedMilitary;
      const militaryEquipment = isMil ? Math.floor(baseStats.militaryEquipment * 1.5) : baseStats.militaryEquipment;
      const mechanizationRate = isMil ? Math.min(100, Math.floor(baseStats.mechanizationRate * 1.5)) : baseStats.mechanizationRate;

      initializedCountries[countryId] = {
        id:                 countryId,
        slug:               countryId.toLowerCase(),
        name:               npcData.name,
        flag:               '',
        government:         { ja: '', en: '' },
        leader:             { ja: '', en: '' },
        quote:              { ja: '', en: '' },
        description:        { ja: '', en: '' },
        isPlayable:         false,
        legitimacy:         baseStats.legitimacy,
        politicalPower:     baseStats.politicalPower,
        economicStrength:   baseStats.economicStrength,
        culturalUnity:      baseStats.culturalUnity,
        deployedMilitary,
        militaryEquipment,
        mechanizationRate,
        financeActionCount: 0,
        suzerainId:         npcData.suzerainId ?? null,
        vassalIds:          npcData.vassalIds ?? [],
        activeWarIds:       [],
        allies:             [],
        frontActions:       {},
        activeFocusId:      null,
        completedFocusIds:  [],
        nationalSpirits:    [],
      };
    }

    set({
      game: {
        currentTurn:     1,
        currentYear:     1932,
        currentMonth:    1,
        playerCountryId,
        countries:       initializedCountries,
        wars:            {},
        pendingEvents:   [],
      },
      playerRequestedPeaceWarId: null,
    });
  },

  updateCountry: (countryId, updates) => set(state => {
    if (!state.game) return state;
    return {
      game: {
        ...state.game,
        countries: {
          ...state.game.countries,
          [countryId]: { ...state.game.countries[countryId], ...updates },
        },
      },
    };
  }),

  setNationalFocus: (countryId, focusId) => set(state => {
    if (!state.game) return state;
    return {
      game: {
        ...state.game,
        countries: {
          ...state.game.countries,
          [countryId]: { ...state.game.countries[countryId], activeFocusId: focusId },
        },
      },
    };
  }),

  declareWar: (attackerId, defenderId, callAllies = false) => set(state => {
    if (!state.game) return state;
    const { updatedWars, updatedCountries } = applyDeclareWar(
      state.game.wars,
      state.game.countries,
      attackerId,
      defenderId,
      state.game.currentTurn,
    );

    if (!callAllies) {
      return { game: { ...state.game, countries: updatedCountries, wars: updatedWars } };
    }

    const { updatedWars: warsWithAllies, updatedCountries: countriesWithAllies } =
      applyAllyJoinWar(
        updatedWars,
        updatedCountries,
        `war_${attackerId}_${defenderId}_${state.game.currentTurn}`,
        attackerId,
        defenderId,
        state.game.currentTurn,
      );

    return { game: { ...state.game, countries: countriesWithAllies, wars: warsWithAllies } };
  }),

  endWar: (warId) => set(state => {
    if (!state.game) return state;
    const war = state.game.wars[warId];
    if (!war) return state;

    const countries = { ...state.game.countries };
    [war.attackerId, war.defenderId].forEach(id => {
      countries[id] = {
        ...countries[id],
        activeWarIds: countries[id].activeWarIds.filter(w => w !== warId),
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
            frontActions: { ...country.frontActions, [frontId]: tacticIndex },
          },
        },
      },
    };
  }),

  formAlliance: (countryIdA, countryIdB) => set(state => {
    if (!state.game) return state;
    const countries = { ...state.game.countries };
    const cA = countries[countryIdA];
    const cB = countries[countryIdB];
    if (!cA || !cB || cA.allies.includes(countryIdB)) return state;

    countries[countryIdA] = { ...cA, allies: [...cA.allies, countryIdB] };
    countries[countryIdB] = { ...cB, allies: [...cB.allies, countryIdA] };
    return { game: { ...state.game, countries } };
  }),

  breakAlliance: (countryIdA, countryIdB) => set(state => {
    if (!state.game) return state;
    const countries = { ...state.game.countries };
    const cA = countries[countryIdA];
    const cB = countries[countryIdB];
    if (!cA || !cB) return state;

    countries[countryIdA] = { ...cA, allies: cA.allies.filter(id => id !== countryIdB) };
    countries[countryIdB] = { ...cB, allies: cB.allies.filter(id => id !== countryIdA) };
    return { game: { ...state.game, countries } };
  }),

  makeVassal: (suzerainId, vassalId) => set(state => {
    if (!state.game) return state;
    const countries = { ...state.game.countries };
    countries[suzerainId] = {
      ...countries[suzerainId],
      vassalIds: [...countries[suzerainId].vassalIds, vassalId],
    };
    countries[vassalId] = { ...countries[vassalId], suzerainId };
    return { game: { ...state.game, countries } };
  }),

  grantIndependence: (vassalId) => set(state => {
    if (!state.game) return state;
    const vassal = state.game.countries[vassalId];
    if (!vassal.suzerainId) return state;

    const countries  = { ...state.game.countries };
    const suzerainId = vassal.suzerainId;
    countries[suzerainId] = {
      ...countries[suzerainId],
      vassalIds: countries[suzerainId].vassalIds.filter(id => id !== vassalId),
    };
    countries[vassalId] = { ...vassal, suzerainId: null };
    return { game: { ...state.game, countries } };
  }),

  requestPeace: (warId) => set({ playerRequestedPeaceWarId: warId }),

  // ── ターン進行 ─────────────────────────────────────────────────────────────
  nextTurn: async () => {
    const state = get();
    if (!state.game) return;

    let { countries, wars, pendingEvents } = state.game;
    const { playerCountryId, currentTurn } = state.game;
    const { playerRequestedPeaceWarId }    = state;

    // 戦争処理
    const {
      updatedCountries: warCountries,
      endedWarIds,
      cpuDeclaredWarIds, // ここでは空
      cpuRequestedPeaceWarId: cpuPeaceWarId,
      peaceNotifications,
      collapsedCountryIds,
    } = await processWars(
      countries,
      wars,
      playerCountryId,
      currentTurn,
      playerRequestedPeaceWarId,
    );
    countries = warCountries;

    // CPUの停戦要求
    let cpuPeaceAccepted = false;
    if (cpuPeaceWarId !== null) {
      const war = wars[cpuPeaceWarId];
      const cpuId = war?.attackerId === playerCountryId ? war.defenderId : war?.attackerId;
      const cpuName = countries[cpuId]?.name;
      const userLang = SettingState.language as 'ja' | 'en';
      const messageArray = {
        ja: `${cpuName.ja} より、現戦線に基づく停戦案が提示された。`,
        en: `According to official reports, ${cpuName.en} has proposed an armistice based on the current front lines.`,
      };
      const buttonLabelsArray = {
        ja: ['拒否', '受諾'],
        en: ['Reject', 'Accept'],
      };
      const result = await invoke<number>('show_dialog', {
        message: messageArray[userLang],
        buttonLabels: buttonLabelsArray[userLang],
      });
      cpuPeaceAccepted = result === 1;

      if (cpuPeaceAccepted && war) {
        await applyPlayerAcceptedCpuPeace(war, wars, cpuPeaceWarId);
        endedWarIds.push(cpuPeaceWarId);
      }
    }

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

    // 停戦通知
    for (const peaceNotification of peaceNotifications) {
      const enemyName = countries[peaceNotification.enemyId]?.name;
      const userLang = SettingState.language as 'ja' | 'en';
      const messageArray = {
        all_collapse: {
          ja: `${enemyName.ja} は国土の8割を占領されたことを受けて、全土降伏を申し出た。`,
          en: `${enemyName.en}, having lost 80% of its territory, has offered an unconditional surrender.`,
        },
        front_collapse: {
          ja: `${enemyName.ja} は我が国との戦線を失ったことを受けて、現在の戦線での講和を申し出た。`,
          en: `${enemyName.en}, having lost its front against us, has proposed a peace settlement along the current front lines.`,
        },
        player_peace: {
          ja: `${enemyName.ja} は我が国からの講和要求を受諾した。`,
          en: `${enemyName.en} has accepted our demand for peace.`,
        },
      };
      const message = messageArray[peaceNotification.reason][userLang];
      // 戻り値は不要
      await invoke<number>('show_dialog', {
        message,
        buttonLabels: ['OK'],
      });
    }

    // 講和が成立した場合 playerRequestedPeaceWarId をクリアする
    const peaceSettled =
      playerRequestedPeaceWarId !== null && endedWarIds.includes(playerRequestedPeaceWarId);

        // 消滅国の削除
    if (collapsedCountryIds.length > 0) {
      const collapsed = new Set(collapsedCountryIds);
      // countries から削除
      for (const deadId of collapsed) {
        const { [deadId]: _, ...rest } = countries;
        countries = rest;
      }
      // 生存国の allies / vassalIds / suzerainId から消滅国への参照を除去
      for (const countryId of Object.keys(countries)) {
        const c = countries[countryId];
        const cleanAllies   = c.allies.filter(id => !collapsed.has(id));
        const cleanVassals  = c.vassalIds.filter(id => !collapsed.has(id));
        const cleanSuzerain = c.suzerainId && collapsed.has(c.suzerainId) ? null : c.suzerainId;

        if (
          cleanAllies.length   !== c.allies.length   ||
          cleanVassals.length  !== c.vassalIds.length ||
          cleanSuzerain        !== c.suzerainId
        ) {
          countries[countryId] = {
            ...c,
            allies:    cleanAllies,
            vassalIds: cleanVassals,
            suzerainId: cleanSuzerain,
          };
        }
      }
    }

    // プレイヤー国のNF処理
    const warsBeforeNF = { ...wars };
    const nfResult = await processCountryFocus(playerCountryId, countries, wars, currentTurn);
    countries     = nfResult.updatedCountries;
    wars          = nfResult.updatedWars;
    pendingEvents = [...pendingEvents, ...nfResult.newEvents];

    // CPUのNF処理
    for (const countryId of Object.keys(countries)) {
      if (countryId === playerCountryId) continue;

      const nextFocusId = await selectCpuFocus(countries[countryId]);
      if (nextFocusId) {
        countries[countryId] = { ...countries[countryId], activeFocusId: nextFocusId };
      }

      const cpuResult = await processCountryFocus(countryId, countries, wars, currentTurn);
      countries = cpuResult.updatedCountries;
      wars      = cpuResult.updatedWars;
    }

    // CPUの自由な宣戦

    // CPUの軍拡
    for (const countryId of Object.keys(countries)) {
      if (countryId === playerCountryId) continue;

      const updates = processCpuMilitaryBuild(countries[countryId], wars);
      if (Object.keys(updates).length > 0) {
        countries[countryId] = { ...countries[countryId], ...updates };
      }
    }

    // ── NF処理後に新たに追加されたCPU→プレイヤー宣戦を検出 ──────────────────
    const allCpuDeclaredWarIds = [...cpuDeclaredWarIds];
    for (const [warId, war] of Object.entries(wars)) {
      if (
        !warsBeforeNF[warId] &&                      // NF処理前には存在しなかった
        war.attackerId !== playerCountryId &&
        war.defenderId === playerCountryId
      ) {
        allCpuDeclaredWarIds.push(warId);
      }
    }

    // ── CPU 宣戦布告通知 ─────────────────────────────────────────────
    for (const warId of allCpuDeclaredWarIds) {
      const war = wars[warId];
      if (!war) continue;
      const attackerName = countries[war.attackerId]?.name;
      const userLang = SettingState.language as 'ja' | 'en';
      const messageArray = {
        ja: `${attackerName.ja} によると、我が国への外交姿勢が宣戦布告となった。`,
        en: `According to official reports, ${attackerName.en} has issued a declaration of war against our nation.`,
      };
      const buttonLabelsArray = {
        ja: ['対処する'],
        en: ['OK'],
      };
      const message = messageArray[userLang];
      await invoke<number>('show_dialog', {
        message,
        buttonLabels: buttonLabelsArray[userLang],
      });
    }

    // 経済・政治力の更新
    countries = processEconomy(countries);

    // 戦線アクションのリセット
    Object.keys(countries).forEach(id => {
      countries[id] = { ...countries[id], frontActions: {} };
    });

    set(currentState => {
      if (!currentState.game) return currentState;
      const nextMonth = currentState.game.currentMonth + 1;
      return {
        game: {
          ...currentState.game,
          countries,
          wars,
          pendingEvents,
          currentTurn:  currentState.game.currentTurn + 1,
          currentYear:  nextMonth > 12 ? currentState.game.currentYear + 1 : currentState.game.currentYear,
          currentMonth: nextMonth > 12 ? 1 : nextMonth,
        },
        playerRequestedPeaceWarId: peaceSettled ? null : currentState.playerRequestedPeaceWarId,
      };
    });
  },

  resetGame: () => set({ game: null, playerRequestedPeaceWarId: null }),

  addPendingEvents: (eventIds: string[]) => set(state => {
    if (!state.game) return state;
    return {
      game: {
        ...state.game,
        pendingEvents: [...state.game.pendingEvents, ...eventIds],
      },
    };
  }),

  removePendingEvents: (eventIds: string[]) => set(state => {
    if (!state.game) return state;
    return {
      game: {
        ...state.game,
        pendingEvents: state.game.pendingEvents.filter(id => !eventIds.includes(id)),
      },
    };
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// 便利セレクタ
// ─────────────────────────────────────────────────────────────────────────────

export const usePlayerCountry = () => {
  return useGameStore(state => {
    if (!state.game) return null;
    return state.game.countries[state.game.playerCountryId];
  });
};

export const useCountry = (countryId: string) => {
  return useGameStore(state => state.game?.countries[countryId] ?? null);
};

// ─────────────────────────────────────────────────────────────────────────────
// 実効ステータス計算（wars.ts からも import される）
// ─────────────────────────────────────────────────────────────────────────────

export const calculateEffectiveStats = (country: CountryState): EffectiveCountryStats => {
  let legitimacy           = country.legitimacy;
  let culturalUnity        = country.culturalUnity;
  let mechanizationRate    = country.mechanizationRate;
  let attackPower          = 0;
  let defensePower         = 0;
  let politicalPowerRate   = 0;
  let economicStrengthRate = 0;

  country.nationalSpirits.forEach(spirit => {
    legitimacy           += spirit.stats.legitimacy           || 0;
    culturalUnity        += spirit.stats.culturalUnity        || 0;
    mechanizationRate    += spirit.stats.mechanizationRate    || 0;
    attackPower          += spirit.stats.attackPower          || 0;
    defensePower         += spirit.stats.defensePower         || 0;
    politicalPowerRate   += spirit.stats.politicalPowerRate   || 0;
    economicStrengthRate += spirit.stats.economicStrengthRate || 0;
  });

  return {
    legitimacy:        Math.max(0, Math.min(100, legitimacy)),
    culturalUnity:     Math.max(0, Math.min(100, culturalUnity)),
    mechanizationRate: Math.max(0, Math.min(100, mechanizationRate)),
    attackPower,
    defensePower,
    politicalPowerRate,
    economicStrengthRate,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 財政レベル
// ─────────────────────────────────────────────────────────────────────────────

export const FINANCE_LEVELS = [
  { id: 'finance_0', name: { ja: '緊縮財政',   en: 'Austerity'       }, ratio: 0,   buff: { ja: '経済成長率 +10%, 政治力獲得倍率 +10%', en: 'Economic Growth +10%, Political Power Rate +10%' }, debuff: { ja: 'なし', en: 'None' }, stats: { economicStrengthRate: 10, politicalPowerRate: 10 } },
  { id: 'finance_1', name: { ja: '平和維持',   en: 'Peacekeeping'    }, ratio: 0.5, buff: { ja: '経済成長率 +10%', en: 'Economic Growth +10%' }, debuff: { ja: 'なし', en: 'None' }, stats: { economicStrengthRate: 10 } },
  { id: 'finance_2', name: { ja: '標準予算',   en: 'Standard Budget' }, ratio: 2,   buff: { ja: 'なし', en: 'None' }, debuff: { ja: 'なし', en: 'None' }, stats: {} },
  { id: 'finance_3', name: { ja: '軍拡財政',   en: 'Rearmament'      }, ratio: 5,   buff: { ja: 'なし', en: 'None' }, debuff: { ja: '経済成長率 -20%', en: 'Economic Growth -20%' }, stats: { economicStrengthRate: -20 } },
  { id: 'finance_4', name: { ja: '総力戦体制', en: 'Total War'        }, ratio: 10,  buff: { ja: 'なし', en: 'None' }, debuff: { ja: '経済成長率 -40%, 政治力獲得倍率 -20%', en: 'Economic Growth -40%, Political Power Rate -20%' }, stats: { economicStrengthRate: -40, politicalPowerRate: -20 } },
];

export const calculateFinanceStatus = (country: CountryState) => {
  const stats = calculateEffectiveStats(country);

  const legMultiplier   = 0.25 + (stats.legitimacy    / 400);
  const culMultiplier   = 0.25 + (stats.culturalUnity / 400);
  const effectiveGDP    = country.economicStrength * (legMultiplier + culMultiplier);

  const C_BASE     = 75000;
  const ALPHA      = 0.7;
  const BETA       = 2;
  const C_EQUIP    = 500;
  const FIXED_COST = 20_000_000;

  const divisionCost   = country.deployedMilitary  * C_BASE  * (1 + ALPHA * Math.pow(stats.mechanizationRate, BETA));
  const equipmentCost  = country.militaryEquipment * C_EQUIP;
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

// ─────────────────────────────────────────────────────────────────────────────
// 経済処理（nextTurn 内部でのみ使用）
// ─────────────────────────────────────────────────────────────────────────────

function processEconomy(countries: Record<string, CountryState>): Record<string, CountryState> {
  const updatedCountries         = { ...countries };
  const ECONOMIC_GROWTH_RATE     = 0.05 / 12;
  const POLITICAL_POWER_INCREASE = 50;

  Object.keys(updatedCountries).forEach(id => {
    const currentCountry = updatedCountries[id];
    const { currentLevel } = calculateFinanceStatus(currentCountry);

    let updatedSpirits = (currentCountry.nationalSpirits || []).filter(
      spirit => !spirit.id.startsWith('finance_'),
    );
    updatedSpirits.push({ id: currentLevel.id, stats: currentLevel.stats });

    let totalPpRate   = 0;
    let totalEconRate = 0;
    (currentCountry.nationalSpirits || []).forEach(spirit => {
      totalPpRate   += spirit.stats.politicalPowerRate   || 0;
      totalEconRate += spirit.stats.economicStrengthRate || 0;
    });

    const actualPpIncrease   = POLITICAL_POWER_INCREASE * (1 + totalPpRate   / 100);
    const actualEconIncrease = currentCountry.economicStrength * ECONOMIC_GROWTH_RATE * (1 + totalEconRate / 100);

    updatedCountries[id] = {
      ...currentCountry,
      politicalPower:     Math.round(currentCountry.politicalPower + actualPpIncrease),
      economicStrength:   currentCountry.economicStrength + actualEconIncrease,
      financeActionCount: 0,
      nationalSpirits:    updatedSpirits,
    };
  });

  return updatedCountries;
}