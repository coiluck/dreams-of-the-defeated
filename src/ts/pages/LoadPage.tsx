import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';

type PageMode = 'page' | 'game-menu';

interface LoadPageProps {
  mode?: PageMode;
  onBack?: () => void;
}

export default function LoadPage({ mode = 'page', onBack }: LoadPageProps) {
  const navigate = useNavigate();

  // 戻るボタン
  const handleBack = () => {
    if (mode === 'game-menu' && onBack) {
      onBack();
    } else {
      navigate('/top');
    }
  };

  return (
    <div>
      <h1>Load Page</h1>
      <Button text="Back" onClick={handleBack} data-se="disabled" />
    </div>
  );
}