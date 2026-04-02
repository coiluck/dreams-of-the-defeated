// ts/pages/TopPage.tsx
import { useNavigate } from "react-router-dom";
import "../../css/TopPage.css";
import { Button } from '../components/Button';

export default function TopPage() {
  const navigate = useNavigate();

  return (
    <div className="page fade-in">
      <img
        src="/src/assets/images/TopPage/title_logo.svg"
        alt="logo"
        className="title-logo-image"
      />
      <div className="top-button-container active">
        <Button text="New Game" onClick={() => navigate('/newgame')} data-se="metallic" />
        <Button text="Load Game" onClick={() => navigate('/load')} data-se="metallic" />
        <Button text="Options" onClick={() => navigate('/options')} data-se="metallic" />
        <Button text="Exit" onClick={() => navigate('/')} data-se="disabled" />
      </div>

      {/* version */}
      <p className="top-page-version">v{__APP_VERSION__}</p>
    </div>
  );
}