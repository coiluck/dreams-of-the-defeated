// src/ts/pages/SavePage.tsx
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from 'react';
import { useGameStore }        from '../modules/gameState';
import {
  listSaves,
  saveGame,
  deleteSave,
  renameSave,
  defaultSaveName,
  formatSavedAt,
  type SaveMeta,
} from '../modules/saveGame';
import { Button } from '../components/Button';
import '../../css/SavePage.css';
import ToolTip from '../components/ToolTip';
import { useMappedTranslations } from '../modules/i18n';
import { SettingState } from '../modules/store';

interface Props {
  onBack: () => void;
}

export default function SavePage({ onBack }: Props) {
  const game = useGameStore(s => s.game);
  const language = SettingState.language as 'ja' | 'en';
  const [saves,       setSaves]       = useState<SaveMeta[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  /** 上書き対象のスロット（null = 新規） */
  const [targetId,    setTargetId]    = useState<string | null>(null);
  /** セーブ名入力 */
  const [inputName,   setInputName]   = useState('');
  /** リネーム中のスロット */
  const [renamingId,  setRenamingId]  = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const t = useMappedTranslations({
    overwrite: 'savePage.overwrite',
    noData: 'savePage.noData',
    deleteConfirm: 'savePage.delete.confirm',
    delete: 'savePage.delete',
    rename: 'savePage.rename',
  });

  // ── セーブ一覧を読み込む ────────────────────────────────────────────────
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

  // ── 新規セーブボタン押下 → 入力欄を開く ────────────────────────────────
  const startNewSave = () => {
    if (!game) return;
    setTargetId(null);
    setInputName(defaultSaveName(game.currentYear, game.currentMonth, game.playerCountryId));
  };

  // ── 上書きボタン押下 ────────────────────────────────────────────────────
  const startOverwrite = (meta: SaveMeta) => {
    setTargetId(meta.save_id);
    setInputName(meta.display_name);
  };

  // ── 実際にセーブ実行 ────────────────────────────────────────────────────
  const execSave = async () => {
    if (!game || !inputName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await saveGame(game, {
        saveId:      targetId ?? undefined,
        displayName: inputName.trim(),
      });
      setTargetId(null);
      setInputName('');
      await refreshList();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── 削除 ────────────────────────────────────────────────────────────────
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

  // ── リネーム確定 ────────────────────────────────────────────────────────
  const execRename = async () => {
    if (!renamingId || !renameInput.trim()) return;
    try {
      await renameSave(renamingId, renameInput.trim());
      setRenamingId(null);
      await refreshList();
    } catch (e) {
      setError(String(e));
    }
  };

  if (!game) return null;

  // ── 入力欄が開いているか ─────────────────────────────────────────────────
  const isInputOpen = inputName !== '' || targetId !== null;

  return (
    <div className="page fade-in save-page">
      <div className="save-page-header">
        <p className="save-page-title">Save Game</p>
        {!isInputOpen && <Button text="+ New Save" onClick={startNewSave} data-se="click" />}
      </div>

      {error && <p className="save-page-error">{error}</p>}

      {/* 新規セーブ入力欄 */}
      <div className="save-page-new">
        {isInputOpen && (
          <div className="save-page-input-container">
            <input
              className="save-page-input"
              type="text"
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && execSave()}
              autoFocus
            />
            <div className="save-page-input-buttons">
              <div className="save-page-input-button cancel" onClick={() => { setTargetId(null); setInputName(''); }} data-se="click">Cancel</div>
              <div className="save-page-input-button ok" onClick={execSave} data-se="click">{saving ? 'Saving...' : targetId ? 'Overwrite' : 'Save'}</div>
            </div>
          </div>
        )}
      </div>

      {/* セーブ一覧 */}
      {loading ? (
        <p className="save-page-loading">Loading...</p>
      ) : saves.length === 0 ? (
        <p className="save-page-empty">{t.noData}</p>
      ) : (
        <ul className="save-page-item-container">
          {saves.map(meta => (
            <div key={meta.save_id} className="save-page-item">
              <div className="save-page-item-bg" />
              <div className="save-page-item-noise" />

              <div className="save-page-item-info">
                {renamingId === meta.save_id ? (
                  <div className="save-page-input-container">
                    <input
                      className="save-page-input"
                      type="text"
                      value={renameInput}
                      onChange={e => setRenameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && execRename()}
                      autoFocus
                    />
                    <div className="save-page-input-buttons">
                      <div className="save-page-input-button cancel" onClick={() => setRenamingId(null)} data-se="click">Cancel</div>
                      <div className="save-page-input-button ok" onClick={execRename} data-se="click">OK</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="save-page-item-name">{meta.display_name}</span>
                    <span className="save-page-item-date">{formatSavedAt(meta.saved_at)}</span>
                    <span className="save-page-item-country">{game.countries[meta.player_country_id].name[language]}</span>
                  </>
                )}
              </div>
              {renamingId !== meta.save_id && (
                <div className="save-page-item-actions-container">
                  <div
                    className="save-page-item-action-overwrite"
                    onClick={() => startOverwrite(meta)}
                    data-se="click"
                  >
                    {t.overwrite}
                  </div>
                  <div className="save-page-item-action-icon-container">
                    <ToolTip text={t.rename}>
                      <div
                        className="save-page-item-action-icon rename"
                        onClick={() => { setRenamingId(meta.save_id); setRenameInput(meta.display_name); }}
                        data-se="click"
                      />
                    </ToolTip>
                    <ToolTip text={t.delete}>
                      <div
                        className="save-page-item-action-icon delete"
                        onClick={() => handleDelete(meta.save_id)}
                        data-se="click"
                      />
                    </ToolTip>
                  </div>
                </div>
              )}
            </div>
          ))}
        </ul>
      )}

      <div className="save-page-footer">
        <Button text="Back" onClick={onBack} data-se="disabled" />
      </div>
    </div>
  );
}
