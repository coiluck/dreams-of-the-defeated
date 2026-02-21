// ts/pages/OptionsPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/OptionsPage.css";
import { Button } from '../components/Button';
import { DiamondButton } from '../components/DiamondButton';
import { getTranslatedText } from '../modules/i18n';
import { SettingState, saveSettingsData } from '../modules/store';
import { bgm, se } from '../modules/music';
import { getCurrentWindow } from '@tauri-apps/api/window';

type TabType = 'System' | 'Audio' | 'Gameplay';

export default function OptionsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('System');
  const [settings, setSettings] = useState({
    language: SettingState.language,
    screenSize: SettingState.screenSize,
    masterVolume: SettingState.masterVolume,
    bgmVolume: SettingState.bgmVolume,
    seVolume: SettingState.seVolume,
    mainBgm: SettingState.mainBgm,
    customBgm: SettingState.customBgm,
  });

  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadTranslations = async () => {
      const translationKeys = [
        // System
        'optionsSystemTitle',
        'optionsLanguageLabel',
        'optionsScreenSizeLabel',
        'optionsWindowMode',
        'optionsFullscreenMode',
        // Audio
        'optionsAudioTitle',
        'optionsMasterVolumeLabel',
        'optionsBgmVolumeLabel',
        'optionsSeVolumeLabel',
        'optionsMainBgmLabel',
        'optionsMainBgmDynamic',
        'optionsMainBgmFixed',
        // Gameplay
        'optionsGameplayTitle',
      ];
      const newTexts: Record<string, string> = {};
      for (const key of translationKeys) {
        const text = await getTranslatedText(key, []);
        newTexts[key] = text || key;
      }
      setTexts(newTexts);
    };
    loadTranslations();
  }, [settings.language]);

  // 言語設定
  const languageChange = async (lang: 'ja' | 'en') => {
    SettingState.language = lang;
    await saveSettingsData();
    setSettings(prev => ({ ...prev, language: lang }));
  };
  // 画面サイズ設定
  const ScreenSizeChange = async (size: 'window' | 'fullscreen') => {
    setSettings(prev => ({ ...prev, screenSize: size }));

    SettingState.screenSize = size;
    await saveSettingsData();

    const appWindow = getCurrentWindow();
    await appWindow.setFullscreen(size === 'fullscreen');
    console.log(`Screen size changed to ${size} and saved.`);
  };
  // master volume
  const MasterChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setSettings(prev => ({ ...prev, masterVolume: value }));
    bgm.setMasterVolume(value);
    se.setMasterVolume(value);
    // store更新
    SettingState.masterVolume = value;
    await saveSettingsData();
  };
  // bgm volume
  const BgmChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setSettings(prev => ({ ...prev, bgmVolume: value }));
    bgm.setVolume(value);
    // store更新
    SettingState.bgmVolume = value;
    await saveSettingsData();
  };
  // se volume
  const SeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setSettings(prev => ({ ...prev, seVolume: value }));
    se.setVolume(value);
    // store更新
    SettingState.seVolume = value;
    await saveSettingsData();
  };
  // main bgm
  const MainBgmChange = async (bgmType: 'national' | 'custom') => {
    setSettings(prev => ({ ...prev, mainBgm: bgmType }));
    SettingState.mainBgm = bgmType;
    await saveSettingsData();
  };
  // custom bgm
  const CustomBgmChange = async (bgmName: string) => {
    setSettings(prev => ({ ...prev, customBgm: bgmName }));
    SettingState.customBgm = bgmName;
    await saveSettingsData();
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'System':
        return (
          <>
            <h2>{texts['optionsSystemTitle']}</h2>

            <div className="options-list-container">
              {/* 言語設定 */}
              <div className="options-list-item system-language">
                <label>{texts['optionsLanguageLabel'] || 'Language'}:</label>
                <div className="options-button-container">
                  <button
                    onClick={() => languageChange('ja')}
                    className={settings.language === 'ja' ? 'options-button active' : 'options-button'}
                  >
                    日本語
                  </button>
                  <button
                    onClick={() => languageChange('en')}
                    className={settings.language === 'en' ? 'options-button active' : 'options-button'}
                  >
                    English
                  </button>
                </div>
              </div>

              {/* 画面サイズ設定 */}
              <div className="options-list-item">
                <label>{texts['optionsScreenSizeLabel']}:</label>
                <div className="options-button-container">
                  <button
                    onClick={() => ScreenSizeChange('window')}
                    className={settings.screenSize === 'window' ? 'options-button active' : 'options-button'}
                  >
                    {texts['optionsWindowMode']}
                  </button>
                  <button
                    onClick={() => ScreenSizeChange('fullscreen')}
                    className={settings.screenSize === 'fullscreen' ? 'options-button active' : 'options-button'}
                  >
                    {texts['optionsFullscreenMode']}
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      case 'Audio':
        return (
          <>
            <h2>{texts['optionsAudioTitle'] || '音声設定'}</h2>

            <div className="options-list-container">
              {/* master volume */}
              <div className="options-list-item master-volume">
                <label>{texts['optionsMasterVolumeLabel']}:</label>
                <div className="options-valueinput-container">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.2"
                    value={settings.masterVolume}
                    onChange={MasterChange}
                  />
                  <span className="options-value-text">{settings.masterVolume.toFixed(1)}</span>
                </div>
              </div>
              {/* bgm volume */}
              <div className="options-list-item bgm-volume">
                <label>{texts['optionsBgmVolumeLabel']}:</label>
                <div className="options-valueinput-container">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.bgmVolume}
                    onChange={BgmChange}
                  />
                  <span className="options-value-text">{settings.bgmVolume.toFixed(1)}</span>
                </div>
              </div>
              {/* se volume */}
              <div className="options-list-item se-volume">
                <label>{texts['optionsSeVolumeLabel']}:</label>
                <div className="options-valueinput-container">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.seVolume}
                    onChange={SeChange}
                  />
                  <span className="options-value-text">{settings.seVolume.toFixed(1)}</span>
                </div>
              </div>
              {/* main bgm */}
              <div className="options-list-item main-bgm">
                <label>{texts['optionsMainBgmLabel']}:</label>
                <div className="options-button-container main-bgm">
                  <button
                    onClick={() => MainBgmChange('national')}
                    className={settings.mainBgm === 'national' ? 'options-button active' : 'options-button'}
                  >
                    {texts['optionsMainBgmDynamic']}
                  </button>
                  <button
                    onClick={() => MainBgmChange('custom')}
                    className={settings.mainBgm === 'custom' ? 'options-button active' : 'options-button'}
                  >
                    {texts['optionsMainBgmFixed']}
                  </button>
                  <div className={`options-main-bgm-container ${settings.mainBgm === 'national' ? 'disabled' : ''}`}>
                    <label className="options-main-bgm-item">
                      <input
                        type="radio"
                        name="customBgm"
                        checked={settings.customBgm === 'Cultus'}
                        onChange={() => CustomBgmChange('Cultus')}
                      />
                      <span>Cultus</span>
                    </label>
                    <label className="options-main-bgm-item">
                      <input
                        type="radio"
                        name="customBgm"
                        checked={settings.customBgm === 'Dance_Macabre'}
                        onChange={() => CustomBgmChange('Dance_Macabre')}
                      />
                      <span>Dance Macabre</span>
                    </label>
                    <label className="options-main-bgm-item">
                      <input
                        type="radio"
                        name="customBgm"
                        checked={settings.customBgm === 'Devine_Fencer'}
                        onChange={() => CustomBgmChange('Devine_Fencer')}
                      />
                      <span>Devine Fencer</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      case 'Gameplay':
        return (
          <>
            <h2>{texts['optionsGameplayTitle'] || 'ゲーム設定'}</h2>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page fade-in options-page">
      <div className="options-main-container">
        <div className="options-tab-button-container">
          <DiamondButton
            text="System"
            className={activeTab === 'System' ? 'active' : ''}
            onClick={() => setActiveTab('System')}
          />
          <DiamondButton
            text="Audio"
            className={activeTab === 'Audio' ? 'active' : ''}
            onClick={() => setActiveTab('Audio')}
          />
          <DiamondButton
            text="Gameplay"
            className={activeTab === 'Gameplay' ? 'active' : ''}
            onClick={() => setActiveTab('Gameplay')}
          />
        </div>
        <div className="options-tab-content-container active" key={activeTab}>
          <div className="options-tab-content-scroll-area">
            {renderTabContent()}
          </div>
        </div>
      </div>

      <div className="options-back-button-container">
        <Button text="Back" onClick={() => navigate('/top')} />
      </div>
    </div>
  );
}