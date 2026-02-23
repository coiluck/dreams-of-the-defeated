// ts/modules/gameState.ts
import { create } from 'zustand';

// 国家方針のフォーカスツリー
export type NationalFocusId =
  | 'military_expansion'
  | 'economic_reform'
  | 'cultural_revival'
  | 'industrialization'
  | null;

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

  // 基礎パラメータ
  legitimacy: number;        // 正統性
  politicalPower: number;    // 政治力
  economicStrength: number;  // 経済力
  culturalUnity: number;     // 文化的統一性

  // 軍事パラメータ
  deployedMilitary: number;  // 展開中の軍事力 (師団数など)
  militaryEquipment: number; // 軍事備品 (在庫量)
  mechanizationRate: number; // 機械化率 (0〜100%)

  // 外交状態
  suzerainId: string | null;         // 宗主国ID (null = 独立)
  vassalIds: string[];               // 属国IDリスト
  activeWarIds: string[];            // 参加中の戦争IDリスト

  // 国家方針
  activeFocusId: NationalFocusId;    // 現在選択中の方針
  completedFocusIds: NationalFocusId[]; // 完了済み方針
  focusProgressTurn: number;         // 方針開始ターン
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
  // ターン待ち状態
  isPaused: boolean;
}

// Zustandストア
interface GameStore {
  game: GameState | null;
  // ゲーム開始
  startGame: (playerCountryId: string, countriesData: Record<string, CountryState>) => void;
  // パラメータ更新（汎用）
  updateCountry: (countryId: string, updates: Partial<CountryState>) => void;
  // 国家方針セット
  setNationalFocus: (countryId: string, focusId: NationalFocusId) => void;
  // 戦争開始・終結
  declareWar: (attackerId: string, defenderId: string) => void;
  endWar: (warId: string) => void;
  // 属国化・独立
  makeVassal: (suzerainId: string, vassalId: string) => void;
  grantIndependence: (vassalId: string) => void;
  // ターン進行
  nextTurn: () => void;
  // リセット
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set/*, get*/) => ({
  game: null,

  startGame: (playerCountryId, countriesData) => set({
    game: {
      currentTurn: 1,
      currentYear: 1920,
      currentMonth: 1,
      playerCountryId,
      countries: countriesData,
      wars: {},
      isPaused: false,
    }
  }),

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
            focusProgressTurn: state.game.currentTurn,
          }
        }
      }
    };
  }),

  declareWar: (attackerId, defenderId) => set(state => {
    if (!state.game) return state;
    const warId = `war_${attackerId}_${defenderId}_${state.game.currentTurn}`;
    const newWar: War = { warId, attackerId, defenderId, startTurn: state.game.currentTurn };

    const countries = { ...state.game.countries };
    countries[attackerId] = {
      ...countries[attackerId],
      activeWarIds: [...countries[attackerId].activeWarIds, warId]
    };
    countries[defenderId] = {
      ...countries[defenderId],
      activeWarIds: [...countries[defenderId].activeWarIds, warId]
    };

    return {
      game: {
        ...state.game,
        countries,
        wars: { ...state.game.wars, [warId]: newWar }
      }
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

  nextTurn: () => set(state => {
    if (!state.game) return state;
    const nextMonth = state.game.currentMonth + 1;
    return {
      game: {
        ...state.game,
        currentTurn: state.game.currentTurn + 1,
        currentYear: nextMonth > 12 ? state.game.currentYear + 1 : state.game.currentYear,
        currentMonth: nextMonth > 12 ? 1 : nextMonth,
      }
    };
  }),

  resetGame: () => set({ game: null }),
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