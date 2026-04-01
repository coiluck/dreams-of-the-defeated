// src/ts/modules/saveGame.ts
//
// Tauri コマンド経由でゲームデータを保存・ロードするユーティリティ。
// ─────────────────────────────────────────────────────────────────────────────

import { invoke } from '@tauri-apps/api/core';
import type { GameState } from './gameState';

// ── 型 ───────────────────────────────────────────────────────────────────────

export interface SaveMeta {
  save_id:            string;
  display_name:       string;
  /** エポック秒文字列（Rust 側が生成） */
  saved_at:           string;
  turn:               number;
  year:               number;
  month:              number;
  player_country_id:  string;
}

export interface LoadResult {
  game_state_json: string;
  meta:            SaveMeta;
}

// ── デフォルトのセーブ名 ──────────────────────────────────────────────────────
// 例: "1932-01-JPN"

export function defaultSaveName(
  year: number,
  month: number,
  playerCountryId: string,
): string {
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}-${playerCountryId}`;
}

/** エポック秒 → "YYYY/MM/DD HH:mm" */
export function formatSavedAt(epochSeconds: string): string {
  const ms = Number(epochSeconds) * 1000;
  if (Number.isNaN(ms)) return epochSeconds;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── セーブ一覧取得 ────────────────────────────────────────────────────────────

export async function listSaves(): Promise<SaveMeta[]> {
  return invoke<SaveMeta[]>('list_saves');
}

// ── セーブ ────────────────────────────────────────────────────────────────────

export interface SaveOptions {
  /** 上書きする場合は既存の save_id を渡す。省略で新規作成。 */
  saveId?:     string;
  displayName: string;
}

export async function saveGame(
  game: GameState,
  opts: SaveOptions,
): Promise<string> {
  // GameState を JSON 文字列へ（Rust 側でそのままファイルに書く）
  const gameStateJson = JSON.stringify(game);

  const savedId = await invoke<string>('save_game', {
    req: {
      save_id:           opts.saveId ?? null,
      display_name:      opts.displayName,
      turn:              game.currentTurn,
      year:              game.currentYear,
      month:             game.currentMonth,
      player_country_id: game.playerCountryId,
      game_state_json:   gameStateJson,
    },
  });

  return savedId;
}

// ── ロード ────────────────────────────────────────────────────────────────────

export async function loadGame(saveId: string): Promise<{
  gameState: GameState;
  meta: SaveMeta;
}> {
  const result = await invoke<LoadResult>('load_game', { saveId });

  const gameState: GameState = JSON.parse(result.game_state_json);
  return { gameState, meta: result.meta };
}

// ── 削除 ──────────────────────────────────────────────────────────────────────

export async function deleteSave(saveId: string): Promise<void> {
  await invoke('delete_save', { saveId });
}

// ── リネーム ──────────────────────────────────────────────────────────────────

export async function renameSave(saveId: string, newName: string): Promise<void> {
  await invoke('rename_save', { saveId, newName });
}
