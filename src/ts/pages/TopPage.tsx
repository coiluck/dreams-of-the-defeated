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
        <Button text="New Game" onClick={() => navigate('/newgame')} />
        <Button text="Load Game" onClick={() => navigate('/')} />
        <Button text="Options" onClick={() => navigate('/')} />
        <Button text="Exit" onClick={() => navigate('/')} />
      </div>
    </div>
  );
}