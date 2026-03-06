// ts/modules/nationalFocus.ts

// spirits/*.yaml の型
export interface SpiritDefinition {
  id: string;
  name: { ja: string; en: string };
  description: { ja: string; en: string };
  stats: ModifierStats;
}

// events/*.yaml の型
export interface EventDefinition {
  id: string;
  img_path?: string | null;
  title: { ja: string; en: string };
  content: { ja: string; en: string };
  buttons: EventButton[];
}
export interface EventButton {
  text: { ja: string; en: string };
  hover: { ja: string; en: string } | null;
  effects?: CountryEffects | null;
}

// eventのボタン挙動で変化できるパラメータ
export interface CountryEffects {
  legitimacy?: number;
  politicalPower?: number;
  economicStrength?: number;
  culturalUnity?: number;
  deployedMilitary?: number;
  militaryEquipment?: number;
  mechanizationRate?: number;
}

// NF JSON型定義
export interface NationalFocusNode {
  id: string;
  col: number;
  row: number;
  icon: string;
  name: { ja: string; en: string };
  description: { ja: string; en: string };
  prerequisites: string[];
  prerequisitesAny?: string[];
  mutuallyExclusive: string[];
  effects: FocusEffect;
}
export interface FocusEffect {
  politicalPower?: number;
  economicStrength?: number;
  militaryEquipment?: number;
  nationalSpirits?: NationalSpiritRef[];
  eventIds?: string[];
}
//NF JSON内の国民精神参照
export interface NationalSpiritRef {
  id: string;
  action: 'add' | 'modify' | 'remove';
  // 上書きする場合のみ指定
  stats?: ModifierStats;
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

export interface NationalFocusTree {
  countryId: string;
  focuses: NationalFocusNode[];
}

// ─── 解決済み型（UI表示用） ───────────────────────────────────────────────────

/**
 * YAMLを解決した国民精神（表示用）。
 * stats は YAML定義 + NF JSON上書きをマージ済み。
 */
export interface ResolvedSpiritEffect {
  id: string;
  action: 'add' | 'modify' | 'remove';
  name: { ja: string; en: string };
  description: { ja: string; en: string };
  /** マージ済みstats */
  stats: ModifierStats;
}

/**
 * YAMLを解決したイベント（表示用）。
 */
export interface ResolvedEventEffect {
  id: string;
  img_path?: string | null;
  title: { ja: string; en: string };
  content: { ja: string; en: string };
  buttons: EventButton[];
}

/** UI表示に使う解決済みエフェクト */
export interface ResolvedFocusEffect {
  politicalPower?: number;
  economicStrength?: number;
  militaryEquipment?: number;
  nationalSpirits: ResolvedSpiritEffect[];
  events: ResolvedEventEffect[];
}

// ─── キャッシュ ──────────────────────────────────────────────────────────────

const focusTreeCache: Record<string, NationalFocusTree> = {};
const spiritCache: Record<string, SpiritDefinition> = {};
const eventCache: Record<string, EventDefinition> = {};

// ─── YAML読み込みユーティリティ ──────────────────────────────────────────────

// YAMLテキストをパース
async function parseYaml<T>(text: string): Promise<T | null> {
  try {
    const yaml = await import('js-yaml');
    // 環境によって export default の扱われ方が違うため、両対応する
    const loadFn = yaml.load || (yaml as any).default?.load;
    return loadFn(text) as T;
  } catch (e) {
    console.error('yaml parse error', e);
    return null;
  }
}

// ─── 個別ローダー ─────────────────────────────────────────────────────────────

export async function loadSpiritDefinition(id: string): Promise<SpiritDefinition | null> {
  if (spiritCache[id]) return spiritCache[id];
  try {
    const res = await fetch(`/assets/yaml/spirits/${id}.yaml`);
    if (!res.ok) return null;
    const text = await res.text();
    const data = await parseYaml<SpiritDefinition>(text);
    if (!data) return null;
    spiritCache[id] = data;
    return data;
  } catch (e) {
    console.warn(`Spirit definition not found: ${id}`, e);
    return null;
  }
}

export async function loadEventDefinition(id: string): Promise<EventDefinition | null> {
  if (eventCache[id]) return eventCache[id];
  try {
    const res = await fetch(`/assets/yaml/events/${id}.yaml`);
    if (!res.ok) return null;
    const text = await res.text();
    const data = await parseYaml<EventDefinition>(text);
    if (!data) return null;
    eventCache[id] = data;
    return data;
  } catch (e) {
    console.warn(`Event definition not found: ${id}`, e);
    return null;
  }
}

// ─── NF ツリー読み込み ────────────────────────────────────────────────────────

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

// yamlから取得
export async function resolveFocusEffect(effects: FocusEffect): Promise<ResolvedFocusEffect> {
  // 国民精神を並列解決
  const resolvedSpirits: ResolvedSpiritEffect[] = await Promise.all(
    (effects.nationalSpirits ?? []).map(async (ref): Promise<ResolvedSpiritEffect> => {
      const def = await loadSpiritDefinition(ref.id);
      return {
        id: ref.id,
        action: ref.action,
        name: def?.name ?? { ja: ref.id, en: ref.id },
        description: def?.description ?? { ja: '', en: '' },
        // YAML定義のstatsをベースに、NF JSONのstats（上書き）をマージ
        stats: { ...(def?.stats ?? {}), ...(ref.stats ?? {}) },
      };
    })
  );

  // イベントを並列解決
  const resolvedEvents: ResolvedEventEffect[] = await Promise.all(
    (effects.eventIds ?? []).map(async (id): Promise<ResolvedEventEffect> => {
      const def = await loadEventDefinition(id);
      if (!def) {
        return {
          id: id,
          img_path: '',
          title: { ja: id, en: id },
          content: { ja: '', en: '' },
          buttons: [],
        };
      }
      return {
        id: def.id ?? id,
        img_path: def.img_path ?? '',
        title: def.title ?? { ja: id, en: id },
        content: def.content ?? { ja: '', en: '' },
        buttons: def.buttons ?? [],
      };
    })
  );

  return {
    politicalPower: effects.politicalPower,
    economicStrength: effects.economicStrength,
    militaryEquipment: effects.militaryEquipment,
    nationalSpirits: resolvedSpirits,
    events: resolvedEvents,
  };
}