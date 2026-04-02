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
import { invoke } from '@tauri-apps/api/core';

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
  const [busy,    setBusy]    = useState<string | null>(null);

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
      // game-menu モード（すでにゲーム画面にいる）:
      //   マップが生きていてコールバック登録済み。
      //   loadGame() → _mapLoadCallback → 全面再描画 の順で完了するので
      //   navigate はせず onBack() でメニューを閉じるだけ。
      //
      // top-menu モード（タイトル画面からロード）:
      //   navigate('/game') でマップを新規マウントさせ、
      //   Map.tsx の初期化内の syncCanvasFromRust() が
      //   Rust 側の最新状態（load_game 済み）を自動反映する。

      const { gameState } = await loadGame(saveId);

      useGameStore.setState({ game: gameState, playerRequestedPeaceWarId: null });

      if (mode === 'game-menu') {
        onBack();
      } else {
        navigate('/game');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (saveId: string) => {
    const result = await invoke<number>('show_dialog', {
      message: `${t.deleteConfirm}`,
      buttonLabels: ['Cancel', 'OK'],
    });
    if (result && result === 1) {
      // resultは押したボタンのindex
      try {
        await deleteSave(saveId);
        await refreshList();
      } catch (e) {
        setError(String(e));
      }
    }
  };

  return (
    <div className="page fade-in load-page">
      <div className={`load-page-header ${mode}`}>
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
                <span className="load-page-item-country">
                  {countriesData?.[meta.player_country_id]?.name[language] ?? meta.player_country_id}
                </span>
              </div>
              {busy !== meta.save_id ? (
                <div className="load-page-item-actions-container">
                  <ToolTip text={t.load}>
                    <div
                      className="load-page-item-action-icon load"
                      onClick={() => handleLoad(meta.save_id)}
                      data-se="metallic"
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
        <Button text="Back" onClick={onBack} data-se="disabled"/>
      </div>
    </div>
  );
}