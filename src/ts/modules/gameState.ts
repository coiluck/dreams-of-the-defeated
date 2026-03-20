// ts/modules/gameState.ts
import { create } from 'zustand';
import { loadFocusTree, loadSpiritDefinition, ModifierStats } from './nationalFocus';

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
        frontActions: {},
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

    // 戦争処理
    // 後で書く

    const nfResult = await processPlayerFocus(playerCountryId, countries, wars, currentTurn);
    countries = nfResult.updatedCountries;
    wars = nfResult.updatedWars;
    pendingEvents = [...pendingEvents, ...nfResult.newEvents];

    // CPUのNF処理
    // 後で書く

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

const processPlayerFocus = async (
  playerCountryId: string,
  countries: Record<string, CountryState>,
  wars: Record<string, War>,
  currentTurn: number
) => {
  let updatedCountries = { ...countries };
  let updatedWars = { ...wars };
  const newEvents: string[] = [];
  const player = updatedCountries[playerCountryId];

  if (!player.activeFocusId) return { updatedCountries, updatedWars, newEvents };

  const completedId = player.activeFocusId;
  const tree = await loadFocusTree(player.slug);
  const focusNode = tree?.focuses.find(f => f.id === completedId);

  let updatedSpirits = [...(player.nationalSpirits || [])];

  if (focusNode) {
    // イベント
    if (focusNode.effects.eventIds) {
      newEvents.push(...focusNode.effects.eventIds);
    }

    // 戦争
    if (focusNode.effects.declareWar) {
      const targetId = focusNode.effects.declareWar;
      const result = applyDeclareWar(updatedWars, updatedCountries, playerCountryId, targetId, currentTurn);
      updatedWars = result.updatedWars;
      updatedCountries = result.updatedCountries; // 戦争中の国のパラメータも更新
    }

    // 国民精神処理
    if (focusNode.effects.nationalSpirits) {
      for (const spiritRef of focusNode.effects.nationalSpirits) {
        if (spiritRef.action === 'add') {
          // 追加
          updatedSpirits.push({ id: spiritRef.id, stats: spiritRef.stats || {} });
        } else if (spiritRef.action === 'modify') {
          // 更新
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

  const latestPlayer = updatedCountries[playerCountryId];

  updatedCountries[playerCountryId] = {
    ...latestPlayer,
    activeFocusId: null,
    completedFocusIds: [...(player.completedFocusIds as string[]), completedId] as string[],
    nationalSpirits: updatedSpirits,
  };

  return { updatedCountries, updatedWars, newEvents };
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
  const POLITICAL_POWER_INCREASE = 20;

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
    };
  });

  return updatedCountries;
};

export const FINANCE_LEVELS = [
  { id: 'finance_0', name: { ja: '緊縮財政', en: 'Austerity' }, ratio: 0, buff: { ja: '経済成長率 +10%, 政治力獲得倍率 +10%', en: 'Economic Growth +10%, Political Power Gain +10%' }, debuff: { ja: 'なし', en: 'None' }, stats: { economicStrengthRate: 10, politicalPowerRate: 10 } },
  { id: 'finance_1', name: { ja: '平和維持', en: 'Peacekeeping' }, ratio: 0.5, buff: { ja: '経済成長率 +10%', en: 'Economic Growth +10%' }, debuff: { ja: 'なし', en: 'None' }, stats: { economicStrengthRate: 10 } },
  { id: 'finance_2', name: { ja: '標準予算', en: 'Standard Budget' }, ratio: 2, buff: { ja: 'なし', en: 'None' }, debuff: { ja: 'なし', en: 'None' }, stats: {} },
  { id: 'finance_3', name: { ja: '軍拡財政', en: 'Rearmament' }, ratio: 5, buff: { ja: 'なし', en: 'None' }, debuff: { ja: '経済成長率 -20%', en: 'Economic Growth -20%' }, stats: { economicStrengthRate: -20 } },
  { id: 'finance_4', name: { ja: '総力戦体制', en: 'Total War' }, ratio: 10, buff: { ja: 'なし', en: 'None' }, debuff: { ja: '経済成長率 -40%, 政治力獲得倍率 -20%', en: 'Economic Growth -40%, Political Power Gain -20%' }, stats: { economicStrengthRate: -40, politicalPowerRate: -20 } },
];

// 財政状態を計算する共通関数
export const calculateFinanceStatus = (country: CountryState) => {
  const legMultiplier = 0.25 + (country.legitimacy / 400);
  const culMultiplier = 0.25 + (country.culturalUnity / 400);
  const totalMultiplier = legMultiplier + culMultiplier;
  const effectiveGDP = country.economicStrength * totalMultiplier;

  const C_BASE = 50000;
  const ALPHA = 0.7;
  const BETA = 2;
  const C_EQUIP = 4;
  const FIXED_COST = 20_000_000;

  const divisionCost = country.deployedMilitary * C_BASE * (1 + ALPHA * Math.pow(country.mechanizationRate, BETA));
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