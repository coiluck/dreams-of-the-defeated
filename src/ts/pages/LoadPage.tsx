// src/ts/pages/LoadPage.tsx
import { useEffect, useState }  from 'react';
import { useNavigate }           from 'react-router-dom';
import { useGameStore, CountryState }          from '../modules/gameState';
import {
  listSaves,
  loadGame,
  deleteSave,
  formatSavedAt,
  type SaveMeta,
} from '../modules/saveGame';
import { Button } from '../components/Button';
import '../../css/LoadPage.css';
import { useMappedTranslations } from '../modules/i18n';
import ToolTip from '../components/ToolTip';
import { SettingState } from '../modules/store';

interface Props {
  mode:   'top-menu' | 'game-menu';
  onBack: () => void;
}

export default function LoadPage({ mode, onBack }: Props) {
  const navigate    = useNavigate();
  const language    = SettingState.language as 'ja' | 'en';
  const [saves,   setSaves]   = useState<SaveMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null); // ロード中 save_id

  const t = useMappedTranslations({
    noData: 'savePage.noData',
    deleteConfirm: 'loadPage.delete.confirm',
    delete: 'loadPage.delete',
    load: 'loadPage.load',
  });

  const refreshList = async () => {
    try {
      const list = await listSaves();
      setSaves(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshList(); }, []);

  const [countriesData, setCountriesData] = useState<Record<string, CountryState> | null>(null);
  useEffect(() => {
    fetch('/assets/json/countries.json')
      .then(res => res.json())
      .then((data: Record<string, CountryState>) => setCountriesData(data))
      .catch(() => {});
  }, []);

  const handleLoad = async (saveId: string) => {
    if (busy) return;
    setBusy(saveId);
    setError(null);
    try {
      const { gameState } = await loadGame(saveId);

      // Zustand ストアに注入
      // startGame は countriesData を受け取るが、ロード時はそのまま set したい。
      // useGameStore の内部 set を直接叩くため、一時的に resetGame → 手動 set。
      useGameStore.setState({ game: gameState, playerRequestedPeaceWarId: null });

      if (mode === 'top-menu' || mode === 'game-menu') {
        navigate('/game');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (saveId: string) => {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await deleteSave(saveId);
      await refreshList();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="page fade-in load-page">
      <div className={`load-page-header ${mode}`}> {/* modeはborder-bottomの色を切り替える */}
        <p className="load-page-title">Load Game</p>
      </div>

      {error && <p className="load-page-error">{error}</p>}

      {loading ? (
        <p className="load-page-loading">Loading...</p>
      ) : saves.length === 0 ? (
        <p className="load-page-empty">{t.noData}</p>
      ) : (
        <div className="load-page-item-container">
          {saves.map(meta => (
            <div key={meta.save_id} className="load-page-item">
              <div className="load-page-item-bg" />
              <div className="load-page-item-noise" />

              <div className="load-page-item-info">
                <span className="load-page-item-name">{meta.display_name}</span>
                <span className="load-page-item-date">{formatSavedAt(meta.saved_at)}</span>
                <span className="load-page-item-country">  {countriesData?.[meta.player_country_id]?.name[language] ?? meta.player_country_id}</span>
              </div>
              {busy !== meta.save_id ? (
                <div className="load-page-item-actions-container">
                  <ToolTip text={t.load}>
                    <div
                      className="load-page-item-action-icon load"
                      onClick={() => handleLoad(meta.save_id)}
                    />
                  </ToolTip>
                  <ToolTip text={t.delete}>
                    <div
                      className="load-page-item-action-icon delete"
                      onClick={() => handleDelete(meta.save_id)}
                    />
                  </ToolTip>
                </div>
              ) : (
                <div className="load-page-item-actions">
                  <div className="load-page-item-action-load">Loading...</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="load-page-footer">
        <Button text="Back" onClick={onBack} />
      </div>
    </div>
  );
}
