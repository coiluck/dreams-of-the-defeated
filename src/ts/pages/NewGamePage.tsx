// ts/pages/NewGamePage.tsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "../../css/NewGamePage.css";
import { Button } from "../components/Button";
import { useGameStore, CountryState } from "../modules/gameState";
import { SettingState } from "../modules/store";
import { getTranslatedText } from "../modules/i18n";

export default function NewGamePage() {
  const navigate = useNavigate();
  const startGame = useGameStore(state => state.startGame);

  const [countriesData, setCountriesData] = useState<Record<string, CountryState>>({});
  const [translations, setTranslations] = useState({ ideology: '', leader: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const lang = SettingState.language as 'ja' | 'en';

  useEffect(() => {
    Promise.all([
      getTranslatedText('newGame.countryIdeology', []),
      getTranslatedText('newGame.countryLeader', []),
    ]).then(([ideology, leader]) => {
      setTranslations({ ideology: ideology || '', leader: leader || '' });
    });
  }, [lang]);

  useEffect(() => {
    fetch('/assets/json/countries.json')
      .then(res => res.json())
      .then((data: Record<string, CountryState>) => {
        setCountriesData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load country data:", err);
        setLoading(false);
      });
  }, []);

  const handleSelect = (id: string) => {
    // 同じ国をクリックしたら選択解除、違う国なら選択
    setSelectedId(prev => prev === id ? null : id);
    console.log(`Selected country: ${id}`);
  };

  const handleStartGame = () => {
    if (selectedId) {
      // Zustandのストアに初期データを渡してゲーム開始
      startGame(selectedId, countriesData);
      console.log(`Start game as ${selectedId}`);
      navigate('/game');
    }
  };

  const countriesArray = Object.values(countriesData);
  const selectedCountry = selectedId ? countriesData[selectedId] : null;

  if (loading) {
    return <div className="page fade-in new-game-page">Loading...</div>;
  }

  return (
    <div className="page fade-in new-game-page">

      {/* 国一覧 */}
      <div className="new-game-cards-container">
        {countriesArray.map((country) => (
          <div
            key={country.id}
            className={`new-game-country-card ${selectedId === country.slug ? 'active' : ''}`}
            onClick={() => handleSelect(country.slug)}
          >
            <div className="new-game-flag-container">
              <img src={country.flag} className="new-game-flag-image" />
              <div className="new-game-flag-overlay"></div>
            </div>
            <h2 className="new-game-country-name">{country.slug.toUpperCase()}</h2>
          </div>
        ))}
      </div>

      {/* description */}
      <div className="new-game-description-container">
        {selectedCountry ? (
          <div key={selectedCountry.id} className="new-game-description-panel active">
            <div className="new-game-panel-content">
              <div className="new-game-panel-header">
                <h3>{selectedCountry.name[lang]}</h3>
                <div className="new-game-panel-metadata">
                  <span className="new-game-panel-metadata-item">
                    <span className="new-game-panel-metadata-item-label">
                      {translations.ideology}:
                    </span>
                    <span className="new-game-panel-metadata-item-value">{selectedCountry.government[lang]}</span>
                  </span>
                  <span className="new-game-panel-metadata-item">
                    <span className="new-game-panel-metadata-item-label">
                      {translations.leader}:
                    </span>
                    <span className="new-game-panel-metadata-item-value">{selectedCountry.leader[lang]}</span>
                  </span>
                </div>
              </div>
              <blockquote className="new-game-flavor-quote">
                "{selectedCountry.quote[lang]}"
              </blockquote>
              <p className="new-game-description-text">
                {selectedCountry.description[lang]}
              </p>
            </div>
          </div>
        ) : (
          <div className="new-game-description-placeholder">
            <p>Select a nation to view details</p>
          </div>
        )}
      </div>

      {/* フッターボタン */}
      <div className="new-game-button-container">
        <Button text="BACK" onClick={() => navigate('/top')} />
        <Button
          text="START GAME"
          onClick={handleStartGame}
          className={!selectedId ? 'disabled' : ''}
        />
      </div>
    </div>
  );
}