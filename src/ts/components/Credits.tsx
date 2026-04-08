import "./Credits.css";
import { SettingState } from "../modules/store";

interface CreditSection {
  label: { ja: string; en: string };
  items: string[];
}

const credits: CreditSection[] = [
  { label: { ja: "動画エフェクト", en: "Video Effects" }, items: ["みりんの動画素材"] },
  { label: { ja: "BGM", en: "BGM" }, items: ["Tak_mfk", "zippy", "なぐもりずの音楽室"] },
  { label: { ja: "SFX", en: "SFX" }, items: ["Pixabay"] },
  { label: { ja: "イラスト", en: "Illustrations" }, items: ["designed by freepik.com", "Font Awesome", "FREE SVG", "ICONPACKS", "イラストAC"] },
  { label: { ja: "地図加工元データ", en: "Map Data" }, items: ["National Earth"] },
];


export default function Credits({ onClose }: { onClose: () => void }) {

  const userLang = SettingState.language as 'ja' | 'en';

  return (
    <div className="page fade-in credits-page">
      <div className="credits-overlay" onClick={onClose}></div>

      <div className="credits-container-wrapper">
        <div className="credits-container">
          {credits.map((section) => (
            <div className="credits-section" key={section.label[userLang]}>
              <p className="credits-section-title">{section.label[userLang]}</p>
              <p className="credits-section-items">
                {section.items.map((item) => (
                  <span className="credits-section-item" key={item}>{item}</span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}