// ts/pages/TopPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/TopPage.css";
import { Button } from '../components/Button';
import { useMappedTranslations } from "../modules/i18n";
import Credits from "../components/Credits";

export default function TopPage() {
  const navigate = useNavigate();

  const [isCreditsOpen, setIsCreditsOpen] = useState(false);

  const t = useMappedTranslations({
    credits: 'top.credits',
  });

  const handleCredits = () => {
    setIsCreditsOpen(true);
  };

  return (
    <div className="page fade-in">
      <img
        src="/assets/images/TopPage/title_logo.svg"
        alt="logo"
        className="title-logo-image"
      />
      <div className="top-button-container active">
        <Button text="New Game" onClick={() => navigate('/newgame')} data-se="metallic" />
        <Button text="Load Game" onClick={() => navigate('/load')} data-se="metallic" />
        <Button text="Options" onClick={() => navigate('/options')} data-se="metallic" />
        <Button text="Exit" onClick={() => navigate('/')} data-se="disabled" />
      </div>

      {/* credits */}
      <p
        className="top-page-credits"
        onClick={handleCredits}
        data-se="click"
      >
        {t.credits}
      </p>

      {isCreditsOpen && <Credits onClose={() => setIsCreditsOpen(false)} />}

      {/* version */}
      <p className="top-page-version">v{__APP_VERSION__}</p>

    </div>
  );
}