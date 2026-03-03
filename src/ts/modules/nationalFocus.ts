// ts/modules/nationalFocus.ts

export interface FocusEffect {
  politicalPower?: number;
  economicStrength?: number;
  militaryEquipment?: number;
  nationalSpirits?: NationalSpiritEffect[];
  events?: FocusEventEffect[];          // ★追加
}

export interface NationalSpiritEffect {
  id: string;
  action: 'add' | 'modify' | 'remove';
  name?: { ja: string; en: string };
  stats?: ModifierStats;
}

export interface FocusEventEffect {
  id: string;
  name: { ja: string; en: string };
}

export interface ModifierStats {
  legitimacy?: number;
  mechanizationRate?: number;
  attackPower?: number;
  defensePower?: number;
  culturalUnity?: number;
  politicalPowerRate?: number;
  economicStrengthRate?: number;
}

export interface NationalFocusNode {
  id: string;
  col: number;
  row: number;
  icon: string;
  name: { ja: string; en: string };
  description: { ja: string; en: string };
  prerequisites: string[];
  prerequisitesAny?: string[];           // ★追加: いずれか一つで可
  mutuallyExclusive: string[];
  effects: FocusEffect;
}

export interface NationalFocusTree {
  countryId: string;
  focuses: NationalFocusNode[];
}

const focusTreeCache: Record<string, NationalFocusTree> = {};

export async function loadFocusTree(countryId: string): Promise<NationalFocusTree | null> {
  if (focusTreeCache[countryId]) return focusTreeCache[countryId];
  try {
    const res = await fetch(`/assets/json/focus/${countryId}.json`);
    if (!res.ok) return null;
    const data: NationalFocusTree = await res.json();
    focusTreeCache[countryId] = data;
    return data;
  } catch (e) {
    console.warn(`Focus tree not found for: ${countryId}`, e);
    return null;
  }
}