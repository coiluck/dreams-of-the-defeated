// ts/modules/gameState.ts
import { create } from 'zustand';
import { loadFocusTree, loadSpiritDefinition, ModifierStats } from './nationalFocus';

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

  // 国家方針 & 国民精神
  activeFocusId: NationalFocusId;       // 現在選択中の方針
  completedFocusIds: NationalFocusId[]; // 完了済み方針
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
  setNationalFocus: (countryId: string, focusId: NationalFocusId) => void;
  // 戦争開始・終結
  declareWar: (attackerId: string, defenderId: string) => void;
  endWar: (warId: string) => void;
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

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,

  startGame: async (playerCountryId, countriesData) => {
    const initializedCountries: Record<string, CountryState> = {};

    for (const [countryId, countryData] of Object.entries(countriesData)) {
      const nationalSpirits: ActiveNationalSpirit[] = [];

      // JSON側で定義されている古いプロパティ "NationalSpiritIds" の配列を取得
      const spiritIds: string[] = countryData.NationalSpiritIds || [];

      // YAMLから効果読み込み
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
      };

      delete (initializedCountries[countryId] as any).NationalSpiritIds;
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

  nextTurn: async () => {
    const state = get();
    if (!state.game) return;

    const { playerCountryId, countries } = state.game;
    const updatedCountries = { ...countries };

    // 戦争処理
    // 後で書く

    // プレイヤーのNF処理
    const player = updatedCountries[playerCountryId];
    if (player.activeFocusId) {
      const completedId = player.activeFocusId;

      const tree = await loadFocusTree(player.slug);
      const focusNode = tree?.focuses.find(f => f.id === completedId);

      let updatedSpirits = [...(player.nationalSpirits || [])];

      if (focusNode) {
        // イベント
        if (focusNode.effects.eventIds) {
          get().addPendingEvents(focusNode.effects.eventIds);
        }

        // 国民精神
        if (focusNode.effects.nationalSpirits) {
          for (const spiritRef of focusNode.effects.nationalSpirits) {
            if (spiritRef.action === 'add') {
              // 追加
              updatedSpirits.push({ id: spiritRef.id, stats: spiritRef.stats || {} });
            } else if (spiritRef.action === 'modify') {
              // 更新する
              updatedSpirits = updatedSpirits.map(spirit => {
                if (spirit.id === spiritRef.id) {
                  return {
                    ...spirit,
                    stats: { ...spirit.stats, ...(spiritRef.stats || {}) }
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

      updatedCountries[playerCountryId] = {
        ...player,
        activeFocusId: null,
        completedFocusIds: [
          ...(player.completedFocusIds as string[]),
          completedId,
        ] as NationalFocusId[],
        nationalSpirits: updatedSpirits,
      };
    }

    // CPUのNF処理
    // 後で書く

    // すべての国のパラメータを更新
    const ECONOMIC_GROWNTH_RATE = 0.05;
    const POLITICAL_POWER_INCREASE = 20;
    Object.keys(updatedCountries).forEach((id) => {
      const currentCountry = updatedCountries[id];

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
      };
    });

    // 日付を進める
    set((currentState) => {
      if (!currentState.game) return currentState;
      const nextMonth = currentState.game.currentMonth + 1;
      return {
        game: {
          ...currentState.game,
          countries: updatedCountries,
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