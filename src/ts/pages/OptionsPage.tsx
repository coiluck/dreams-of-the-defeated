// ts/pages/OptionsPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/OptionsPage.css";
import { Button } from '../components/Button';
import { DiamondButton } from '../components/DiamondButton';
import { getTranslatedText } from '../modules/i18n';
import { SettingState, saveSettingsData } from '../modules/store';

type TabType = 'System' | 'Audio' | 'Gameplay';

export default function OptionsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('System');
  const [settings, setSettings] = useState({
    language: SettingState.language,
    screenSize: SettingState.screenSize,
  });

  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadTranslations = async () => {
      const translationKeys = [
        'systemTitle',
        'audioTitle',
        'gameplayTitle',
        'languageLabel', 'screenSizeLabel',
        'windowMode', 'fullscreenMode',
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
    console.log(`Screen size changed to ${size} and saved.`);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'System':
        return (
          <>
            <h2>{texts['systemTitle']}</h2>

            <div className="options-list-container">
              {/* 言語設定 */}
              <div className="options-list-item system-language">
                <label>{texts['languageLabel'] || 'Language'}:</label>
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
                <label>{texts['screenSizeLabel']}:</label>
                <div className="options-button-container">
                  <button
                    onClick={() => ScreenSizeChange('window')}
                    className={settings.screenSize === 'window' ? 'options-button active' : 'options-button'}
                  >
                    {texts['windowMode']}
                  </button>
                  <button
                    onClick={() => ScreenSizeChange('fullscreen')}
                    className={settings.screenSize === 'fullscreen' ? 'options-button active' : 'options-button'}
                  >
                    {texts['fullscreenMode']}
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      case 'Audio':
        return (
          <>
            <h2>{texts['audioTitle'] || '音声設定'}</h2>
          </>
        );
      case 'Gameplay':
        return (
          <>
            <h2>{texts['gameplayTitle'] || 'ゲーム設定'}</h2>
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
          {renderTabContent()}
        </div>
      </div>

      <div className="options-back-button-container">
        <Button text="Back" onClick={() => navigate('/top')} />
      </div>
    </div>
  );
}