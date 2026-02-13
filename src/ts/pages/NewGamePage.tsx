// ts/pages/NewGamePage.tsx
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "../../css/NewGamePage.css";
import { Button } from "../components/Button";

interface CountryData {
  id: string;
  name_en: string;
  name_ja: string;
  flagImage: string;
  leader: string;
  ideology: string;
  quote: string;
  description: string;
}

// 国データ配列
const countries: CountryData[] = [
  {
    id: 'germany',
    name_en: 'GERMANY',
    name_ja: 'ドイツ帝国',
    flagImage: '/assets/images/CountryFlags/germany.png',
    leader: '[Vacant]',
    ideology: '父権的専制主義',
    quote: '鉄と秩序が世界を回す',
    description: '欧州の覇者。「勝者の病」に侵されている。ミッテルアフリカと東欧衛星国を従える超大国だが、広すぎる領土の維持費とフランスからの狂気の電波に悩まされている。',
  },
  {
    id: 'france',
    name_en: 'FRANCE',
    name_ja: 'ルミナス・フランス',
    flagImage: '/assets/images/CountryFlags/france.svg',
    leader: 'G. Apollinaire',
    ideology: '超現実的神秘主義',
    quote: '理性は我々を裏切った。',
    description: '敗戦と屈辱的な講和条約により理性を放棄した国家。破壊神シヴァとカリ・ユガの概念を誤読し、前衛芸術と神秘主義が融合した「超現実主義的神秘主義」体制を敷く。',
  },
  {
    id: 'britain',
    name_en: 'BRITAIN',
    name_ja: 'イギリス',
    flagImage: '/assets/images/CountryFlags/uk.png',
    leader: 'Prime Minister',
    ideology: '議会制民主主義',
    quote: 'Splendid Isolation 2.0',
    description: '大陸不干渉を貫く海洋帝国。ドイツとは同盟関係にあるが、経済的には冷戦状態。狂気のフランスと秘密裏に接触し、対独包囲網を再構築するか、孤立を守るかの岐路に立つ。',
  },
  {
    id: 'russia',
    name_en: 'RUSSIA',
    name_ja: 'ロシア帝国',
    flagImage: '/assets/images/CountryFlags/russia.png',
    leader: 'P. Wrangel',
    ideology: '軍事独裁',
    quote: '東洋への絶望と回帰',
    description: '四肢をもがれた元大国。ヴランゲル将軍率いる軍事政権が統治するが、農民反乱とアイデンティティの喪失に苦しむ。「ユーラシア主義」と「正教原理主義」が混沌としている。',
  },
  {
    id: 'china',
    name_en: 'CHINA',
    name_ja: '清朝',
    flagImage: '/assets/images/CountryFlags/qing.png',
    leader: 'Kang Youwei',
    ideology: '立憲的君主制',
    quote: '辛うじて生き残った老人',
    description: '康有為による立憲君主制への改革が進むが、南部共和派と軍閥の離反に苦しむ。満州を侵食する日本と、経済的支配を強めるドイツ、二つの虎の間で揺れ動く。',
  },
  {
    id: 'india',
    name_en: 'INDIA',
    name_ja: 'インド',
    flagImage: '/assets/images/CountryFlags/india.svg',
    leader: 'Council of Ministers',
    ideology: '連邦制',
    quote: '眠れる巨象は目覚めない',
    description: '1857年の勝利以来独立を保つが、カースト制度と藩王国の利権争いで停滞中。フランスからの「歪んだヒンドゥーイズム」の逆輸入という文化侵略を受けている。',
  }
];

export default function NewGamePage() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    // 同じ国をクリックしたら選択解除、違う国なら選択
    setSelectedId(prev => prev === id ? null : id);
  };

  const selectedCountry = countries.find(c => c.id === selectedId);

  return (
    <div className="page fade-in new-game-page">

      {/* 国一覧 */}
      <div className="new-game-cards-container">
        {countries.map((country) => (
          <div
            key={country.id}
            className={`new-game-country-card ${selectedId === country.id ? 'active' : ''}`}
            onClick={() => handleSelect(country.id)}
          >
            <div className="new-game-flag-container">
              <img src={country.flagImage} className="new-game-flag-image" />
              <div className="new-game-flag-overlay"></div>
            </div>
            <h2 className="new-game-country-name">{country.name_en}</h2>
          </div>
        ))}
      </div>

      {/* description */}
      <div className="new-game-description-container">
        {selectedCountry ? (
          <div key={selectedCountry.id} className="new-game-description-panel active">
            <div className="new-game-panel-content">
              <div className="new-game-panel-header">
                <h3>{selectedCountry.name_ja}</h3>
                <div className="new-game-panel-metadata">
                  <span className="new-game-panel-metadata-item">
                    <span className="new-game-panel-metadata-item-label">国家理念:</span>
                    <span className="new-game-panel-metadata-item-value">{selectedCountry.ideology}</span>
                  </span>
                  <span className="new-game-panel-metadata-item">
                    <span className="new-game-panel-metadata-item-label">国家指導者:</span>
                    <span className="new-game-panel-metadata-item-value">{selectedCountry.leader}</span>
                  </span>
                </div>
              </div>
              <blockquote className="new-game-flavor-quote">
                "{selectedCountry.quote}"
              </blockquote>
              <p className="new-game-description-text">
                {selectedCountry.description}
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
          onClick={() => console.log(`Start game as ${selectedId}`)}
          className={!selectedId ? 'disabled' : ''}
        />
      </div>
    </div>
  );
}