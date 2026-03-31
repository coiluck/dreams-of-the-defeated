import { Button } from '../components/Button';

export default function SavePage({ onBack }: { onBack: () => void }) {

  const saveData = null;
  const saveName = '';

  return (
    <div>
      <h1>Save Page</h1>
      <Button text="Back" onClick={onBack} data-se="disabled" />
    </div>
  );
}