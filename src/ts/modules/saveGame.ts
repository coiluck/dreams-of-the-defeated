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

/** Rust の MapPointSer に対応 */
export interface MapPoint {
  x:         number;
  y:         number;
  owner_id:  number;
  occupy_id: number;
}

export interface LoadResult {
  game_state_json: string;
  meta:            SaveMeta;
  /** ロード後の全陸マス状態。マップ全面再描画に使う。 */
  map_points:      MapPoint[];
}

// ── ロード後マップ再描画コールバック ──────────────────────────────────────────
//
// Map コンポーネントが「ロード完了時に全マスを再描画する」ためのコールバック。
// wars.ts の registerMapUpdateCallback（occupy_id のみ）とは別に、
// owner_id と occupy_id の両方を受け取れる口として用意する。
//
// 使い方（Map コンポーネント側）:
//   import { registerMapLoadCallback } from '../modules/saveGame';
//   registerMapLoadCallback((points) => {
//     // points: { x, y, owner_id, occupy_id }[] を受け取って全マス再描画
//   });

type MapLoadCallback = (points: MapPoint[]) => void;
let _mapLoadCallback: MapLoadCallback | null = null;

export function registerMapLoadCallback(cb: MapLoadCallback): void {
  _mapLoadCallback = cb;
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

  // Rust 側で MapStore を更新済みなので、フロント側のマップも全面再描画する。
  // _mapLoadCallback には owner_id と occupy_id の両方を渡すため、
  // 「occupyId=B && ownerId=A」（戦時中の占領）も正しく描画される。
  if (_mapLoadCallback && result.map_points.length > 0) {
    _mapLoadCallback(result.map_points);
  }

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