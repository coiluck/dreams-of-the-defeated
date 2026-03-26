// ts/modules/store.ts
import { Store } from '@tauri-apps/plugin-store';

interface SettingsState {
  masterVolume: number;
  bgmVolume: number;
  seVolume: number;
  mainBgm: 'national' | 'custom';
  customBgm: string;
  screenSize: 'window' | 'fullscreen';
  language: 'ja' | 'en';
  autoSaveInterval: 'weekly' | 'monthly' | 'never';
  gameMode: 'easy' | 'normal';
}

const initialSettingsState: SettingsState = {
  masterVolume: 8,
  bgmVolume: 4,
  seVolume: 8,
  mainBgm: "national",
  customBgm: "Devine_Fencer",
  screenSize: 'window',
  language: 'ja',
  autoSaveInterval: 'never',
  gameMode: 'easy',
}

export const SettingState = structuredClone(initialSettingsState); // 初期化

let settingsStoreCache: Store | null = null;

async function getSettingsStore(): Promise<Store> {
  if (!settingsStoreCache) {
    settingsStoreCache = await Store.load('settings.json');

    // 初期値
    const existing = await settingsStoreCache.get<SettingsState>('settings');
    if (!existing) {
      console.log('初期値を設定');
      await settingsStoreCache.set('settings', initialSettingsState);
      await settingsStoreCache.save();
    }
  }
  return settingsStoreCache;
}

export async function saveSettingsData() {
  const store = await getSettingsStore();
  await store.set('settings', SettingState);
  await store.save();
}

import { bgm, se } from './music';

export async function applyStore() {
  const settingsStore = await getSettingsStore();
  const storedSettings = await settingsStore.get<SettingsState>('settings');
  if (storedSettings) Object.assign(SettingState, storedSettings);
  // musicに反映
  bgm.setMasterVolume(SettingState.masterVolume);
  bgm.setVolume(SettingState.bgmVolume);
  se.setMasterVolume(SettingState.masterVolume);
  se.setVolume(SettingState.seVolume);
}