// ts/modules/focus.ts
import { loadFocusTree, loadSpiritDefinition } from './nationalFocus';
import { CountryState, War, ActiveNationalSpirit } from './gameState';
import { applyDeclareWar, applyAllyJoinWar } from './wars';

// ─────────────────────────────────────────────────────────────────────────────
// NF 処理
// ─────────────────────────────────────────────────────────────────────────────

export const processCountryFocus = async (
  countryId: string,
  countries: Record<string, CountryState>,
  wars: Record<string, War>,
  currentTurn: number,
): Promise<{
  updatedCountries: Record<string, CountryState>;
  updatedWars: Record<string, War>;
  newEvents: string[];
}> => {
  let updatedCountries = { ...countries };
  let updatedWars      = { ...wars };
  const newEvents: string[] = [];
  const country = updatedCountries[countryId];

  if (!country.activeFocusId) return { updatedCountries, updatedWars, newEvents };

  const completedId = country.activeFocusId;
  const tree = await loadFocusTree(country.isPlayable ? country.slug : 'universal_tree');
  const focusNode = tree?.focuses.find(f => f.id === completedId);

  let updatedSpirits: ActiveNationalSpirit[] = [...(country.nationalSpirits || [])];

  let addPp    = 0;
  let addEcon  = 0;
  let addEquip = 0;
  let addMil   = 0;

  if (focusNode) {
    addPp    = focusNode.effects.politicalPower    || 0;
    addEcon  = focusNode.effects.economicStrength  || 0;
    addEquip = focusNode.effects.militaryEquipment || 0;
    addMil   = focusNode.effects.deployedMilitary  || 0;

    if (focusNode.effects.eventIds) {
      newEvents.push(...focusNode.effects.eventIds);
    }

    // 宣戦布告
    if (focusNode.effects.declareWar) {
      const targetId      = focusNode.effects.declareWar;
      const declareResult = applyDeclareWar(updatedWars, updatedCountries, countryId, targetId, currentTurn);
      updatedWars         = declareResult.updatedWars;
      updatedCountries    = declareResult.updatedCountries;

      if (focusNode.effects.callAllies) {
        const warId      = `war_${countryId}_${targetId}_${currentTurn}`;
        const allyResult = applyAllyJoinWar(updatedWars, updatedCountries, warId, countryId, targetId, currentTurn);
        updatedWars      = allyResult.updatedWars;
        updatedCountries = allyResult.updatedCountries;
      }
    }

    // 同盟締結
    if (focusNode.effects.formAlliance) {
      const allyTargetId = focusNode.effects.formAlliance;
      const cA = updatedCountries[countryId];
      const cB = updatedCountries[allyTargetId];
      if (cA && cB && !cA.allies.includes(allyTargetId)) {
        updatedCountries[countryId]    = { ...cA, allies: [...cA.allies, allyTargetId] };
        updatedCountries[allyTargetId] = { ...cB, allies: [...cB.allies, countryId] };
      }
    }

    // 同盟破棄
    if (focusNode.effects.breakAlliance) {
      const breakTargetId = focusNode.effects.breakAlliance;
      const cA = updatedCountries[countryId];
      const cB = updatedCountries[breakTargetId];
      if (cA) updatedCountries[countryId]     = { ...cA, allies: cA.allies.filter(id => id !== breakTargetId) };
      if (cB) updatedCountries[breakTargetId] = { ...cB, allies: cB.allies.filter(id => id !== countryId) };
    }

    // 国民精神処理
    if (focusNode.effects.nationalSpirits) {
      for (const spiritRef of focusNode.effects.nationalSpirits) {
        if (spiritRef.action === 'add') {
          let statsToApply = spiritRef.stats;
          if (!statsToApply || Object.keys(statsToApply).length === 0) {
            const def = await loadSpiritDefinition(spiritRef.id);
            statsToApply = def?.stats || {};
          }
          updatedSpirits.push({ id: spiritRef.id, stats: statsToApply });

        } else if (spiritRef.action === 'modify') {
          updatedSpirits = updatedSpirits.map(spirit => {
            if (spirit.id !== spiritRef.id) return spirit;
            const oldStats  = spirit.stats || {};
            const diffStats = spiritRef.stats || {};
            const newStats  = { ...oldStats };
            let key: keyof typeof diffStats;
            for (key in diffStats) {
              newStats[key] = (newStats[key] || 0) + (diffStats[key] || 0);
            }
            return { ...spirit, stats: newStats };
          });

        } else if (spiritRef.action === 'remove') {
          updatedSpirits = updatedSpirits.filter(s => s.id !== spiritRef.id);
        }
      }
    }

    // 国名変更
    if (focusNode.effects.renameCountry) {
      const patch = focusNode.effects.renameCountry;
      const current = updatedCountries[countryId];
      updatedCountries[countryId] = {
        ...current,
        name: { ...current.name, ...patch },
      };
    }
  }

  const latestCountry = updatedCountries[countryId];
  updatedCountries[countryId] = {
    ...latestCountry,
    politicalPower:    latestCountry.politicalPower   + addPp,
    economicStrength:  latestCountry.economicStrength + addEcon,
    militaryEquipment: Math.max(0, latestCountry.militaryEquipment + addEquip),
    deployedMilitary:  Math.max(0, latestCountry.deployedMilitary  + addMil),
    activeFocusId:      null,
    completedFocusIds: [...(country.completedFocusIds as string[]), completedId] as string[],
    nationalSpirits:   updatedSpirits,
  };

  return { updatedCountries, updatedWars, newEvents };
};

// ─────────────────────────────────────────────────────────────────────────────
// CPU NF 選択
// ─────────────────────────────────────────────────────────────────────────────

export const selectCpuFocus = async (country: CountryState): Promise<string | null> => {
  if (country.activeFocusId) return country.activeFocusId;

  const treeSlug = country.isPlayable ? country.slug : 'universal_tree';
  const tree     = await loadFocusTree(treeSlug);
  if (!tree) return null;

  const completed = new Set(country.completedFocusIds);

  const available = tree.focuses.filter(focus => {
    if (completed.has(focus.id)) return false;
    if (focus.prerequisites.length > 0 && !focus.prerequisites.every((pid: string) => completed.has(pid))) return false;
    if (focus.prerequisitesAny && focus.prerequisitesAny.length > 0 && !focus.prerequisitesAny.some((pid: string) => completed.has(pid))) return false;
    if (focus.mutuallyExclusive.length > 0 && focus.mutuallyExclusive.some((eid: string) => completed.has(eid))) return false;
    return true;
  });

  if (available.length === 0) return null;

  const chosen = available[Math.floor(Math.random() * available.length)];
  return chosen.id;
};