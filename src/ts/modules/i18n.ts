// i18n.ts
import { SettingState } from './store';

type Lang = 'ja' | 'en';

interface TranslationData {
  [key: string]: TranslationItem;
}
interface TranslationItem {
  ja: string;
  en: string;
  [key: string]: string;
}

let translationData: TranslationData | null = null;

export async function loadTranslationData() {
  const response = await fetch('/assets/json/translation.json');
  if (!translationData) {
    translationData = await response.json() as TranslationData;
  }
  return translationData;
}

export async function getTranslatedText(key: string, params: string[]) {
  const translationRawData = await loadTranslationData()
  if (!translationRawData || !translationRawData[key]) {
    console.log(`Invalid translation key: ${key}`)
    return;
  }

  const lang = SettingState.language as Lang;
  let text = translationRawData[key][lang] || translationRawData[key]['ja'];

  // 変数部分は置き換え
  for (const paramText of params) {
    text = text.replace(/\$\{[^}]+\}/, paramText);
  }
  return text;
}

export async function applyTranslationsToDocument() {
  const data = await loadTranslationData();
  if (!data) return;
  const lang = SettingState.language as Lang;
  document.documentElement.lang = lang;

  const staticNodes = document.querySelectorAll('[data-translation]');
  staticNodes.forEach((el: Element) => {
    const key = el.getAttribute('data-translation');
    if (key && data[key]) {
      el.textContent = data[key][lang] || data[key]['ja'];
    } else {
      console.log(`Invalid translation key: ${key}`)
    }
  });
}