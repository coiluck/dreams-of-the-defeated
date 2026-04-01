// src-tauri/src/save_store.rs
//
// セーブ/ロードの仕組み
// ─────────────────────────────────────────────────────────────────────────────
// セーブ1件 = 3ファイル（同じ save_id で束ねる）
//   {save_dir}/{save_id}.meta.json  … 表示用メタ（名前・日時・ターン等）
//   {save_dir}/{save_id}.state.json … GameState JSON（countries / wars / turn …）
//   {save_dir}/{save_id}.map.bin    … マップ差分バイナリ
//
// マップ差分バイナリのフォーマット（5 bytes / changed point）
//   x        : u16 LE (2 bytes)
//   y        : u16 LE (2 bytes)
//   owner_id : u8     (1 byte)
//   occupy_id: u8     (1 byte)
// ─────────────────────────────────────────────────────────────────────────────

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use crate::map_store::{MapStore, coord_to_idx, GRID_WIDTH, GRID_HEIGHT};

const MAP_DIFF_BYTES_PER_POINT: usize = 6; // x(2) + y(2) + owner_id(1) + occupy_id(1)

// ── メタデータ ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveMeta {
    pub save_id:       String,
    pub display_name:  String,
    pub saved_at:      String,   // ISO 8601
    pub turn:          u32,
    pub year:          i32,
    pub month:         u8,
    pub player_country_id: String,
}

// ── コマンド: セーブ一覧 ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_saves(app: tauri::AppHandle) -> Result<Vec<SaveMeta>, String> {
    let dir = save_dir(&app)?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut metas: Vec<SaveMeta> = std::fs::read_dir(&dir)
        .map_err(|e| format!("read_dir failed: {e}"))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path  = entry.path();
            if path.extension()?.to_str()? != "json" { return None; }
            let stem = path.file_stem()?.to_str()?;
            if !stem.ends_with(".meta") { return None; }

            let text = std::fs::read_to_string(&path).ok()?;
            serde_json::from_str::<SaveMeta>(&text).ok()
        })
        .collect();

    // 新しい順にソート
    metas.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(metas)
}

// ── コマンド: セーブ ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SaveRequest {
    pub save_id:        Option<String>, // None なら新規 UUID
    pub display_name:   String,
    pub turn:           u32,
    pub year:           i32,
    pub month:          u8,
    pub player_country_id: String,
    pub game_state_json: String,        // JSON文字列のまま受け取る
}

#[tauri::command]
pub async fn save_game(
    req: SaveRequest,
    app: tauri::AppHandle,
    map_store: tauri::State<'_, MapStore>,
) -> Result<String, String> {
    let dir = save_dir(&app)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("create_dir_all failed: {e}"))?;

    // save_id: 上書きなら既存ID、新規なら UUID
    let save_id = req.save_id.unwrap_or_else(|| {
        // tauri 側では uuid クレートを使わず簡易生成
        use std::time::{SystemTime, UNIX_EPOCH};
        let t = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        format!("save_{t}")
    });

    // ── GameState JSON ────────────────────────────────────────────────────────
    let state_path = dir.join(format!("{save_id}.state.json"));
    std::fs::write(&state_path, &req.game_state_json)
        .map_err(|e| format!("write state failed: {e}"))?;

    // ── マップ差分バイナリ ─────────────────────────────────────────────────────
    // 初期バイナリ（map_data.bin）と現在のマップを比較し、変化したマスだけ書く。
    // ここでは初期値を「owner_id == occupy_id」と定義しない。
    // MapStore::load 時に読み込んだ original バイナリを別途持つ必要があるが、
    // 現状 MapStore は初期値を持たないため、全 GridPoint を dump する。
    // （差分最適化は TODO: initial_points を MapStore に追加する）
    let map_bin = {
        let points = map_store.points.read()
            .map_err(|e| format!("lock error: {e}"))?;

        let total = GRID_WIDTH as usize * GRID_HEIGHT as usize;
        let mut buf = Vec::with_capacity(total * MAP_DIFF_BYTES_PER_POINT);

        for p in points.iter() {
            buf.extend_from_slice(&p.x.to_le_bytes());
            buf.extend_from_slice(&p.y.to_le_bytes());
            buf.push(p.owner_id);
            buf.push(p.occupy_id);
        }
        buf
    };

    let map_path = dir.join(format!("{save_id}.map.bin"));
    std::fs::write(&map_path, &map_bin)
        .map_err(|e| format!("write map bin failed: {e}"))?;

    // ── メタデータ ─────────────────────────────────────────────────────────────
    let saved_at = {
        use std::time::{SystemTime, UNIX_EPOCH};
        // ISO8601 を簡易生成（chrono クレートなしで秒単位）
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        // YYYY-MM-DDTHH:MM:SSZ を手計算するのは煩雑なのでエポック秒文字列
        // フロント側で Date オブジェクトへ変換する
        format!("{secs}")
    };

    let meta = SaveMeta {
        save_id:           save_id.clone(),
        display_name:      req.display_name,
        saved_at,
        turn:              req.turn,
        year:              req.year,
        month:             req.month,
        player_country_id: req.player_country_id,
    };
    let meta_path = dir.join(format!("{save_id}.meta.json"));
    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("serialize meta failed: {e}"))?;
    std::fs::write(&meta_path, meta_json)
        .map_err(|e| format!("write meta failed: {e}"))?;

    Ok(save_id)
}

// ── コマンド: ロード ──────────────────────────────────────────────────────────

/// ロード後にフロント側でマップを全面再描画するための変更リスト。
/// 全マス（陸マスのみ owner_id != 0）を返す。
#[derive(Serialize, Clone)]
pub struct MapPointSer {
    pub x:         u16,
    pub y:         u16,
    pub owner_id:  u8,
    pub occupy_id: u8,
}

#[derive(Serialize)]
pub struct LoadResult {
    pub game_state_json: String,
    pub meta:            SaveMeta,
    /// ロード後の全陸マス状態。フロント側で registerMapUpdateCallback の形式に変換して
    /// マップを全面再描画するために使う。
    pub map_points:      Vec<MapPointSer>,
}

#[tauri::command]
pub async fn load_game(
    save_id: String,
    app: tauri::AppHandle,
    map_store: tauri::State<'_, MapStore>,
) -> Result<LoadResult, String> {
    let dir = save_dir(&app)?;

    // ── GameState JSON ────────────────────────────────────────────────────────
    let state_path = dir.join(format!("{save_id}.state.json"));
    let game_state_json = std::fs::read_to_string(&state_path)
        .map_err(|e| format!("read state failed: {e}"))?;

    // ── マップバイナリ → MapStore 反映 ────────────────────────────────────────
    let map_path = dir.join(format!("{save_id}.map.bin"));
    let map_bytes = std::fs::read(&map_path)
        .map_err(|e| format!("read map bin failed: {e}"))?;

    if map_bytes.len() % MAP_DIFF_BYTES_PER_POINT != 0 {
        return Err(format!(
            "map.bin size {} is not a multiple of {MAP_DIFF_BYTES_PER_POINT}",
            map_bytes.len()
        ));
    }

    {
        let mut points = map_store.points.write()
            .map_err(|e| format!("lock error: {e}"))?;

        for chunk in map_bytes.chunks_exact(MAP_DIFF_BYTES_PER_POINT) {
            let x         = u16::from_le_bytes([chunk[0], chunk[1]]);
            let y         = u16::from_le_bytes([chunk[2], chunk[3]]);
            let owner_id  = chunk[4];
            let occupy_id = chunk[5];
            let idx = coord_to_idx(x, y);
            if idx < points.len() {
                points[idx].owner_id  = owner_id;
                points[idx].occupy_id = occupy_id;
            }
        }
        // write ロックを drop してから rebuild_coast の read ロックを取得する
    }

    // ── メタ ──────────────────────────────────────────────────────────────────
    let meta_path = dir.join(format!("{save_id}.meta.json"));
    let meta_json = std::fs::read_to_string(&meta_path)
        .map_err(|e| format!("read meta failed: {e}"))?;
    let meta: SaveMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("parse meta failed: {e}"))?;

    // ── フロント再描画用: 全陸マスの現在状態を返す ───────────────────────────
    // owner_id == 0 は海マスなので除外（フロント側は陸マスのみ描画している）。
    let map_points: Vec<MapPointSer> = {
        let points = map_store.points.read()
            .map_err(|e| format!("lock error: {e}"))?;
        points.iter()
            .filter(|p| p.owner_id != 0 || p.occupy_id != 0)
            .map(|p| MapPointSer {
                x:         p.x,
                y:         p.y,
                owner_id:  p.owner_id,
                occupy_id: p.occupy_id,
            })
            .collect()
    };

    Ok(LoadResult { game_state_json, meta, map_points })
}

// ── コマンド: 削除 ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn delete_save(save_id: String, app: tauri::AppHandle) -> Result<(), String> {
    let dir = save_dir(&app)?;
    for ext in &["meta.json", "state.json", "map.bin"] {
        let path = dir.join(format!("{save_id}.{ext}"));
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("remove {ext} failed: {e}"))?;
        }
    }
    Ok(())
}

// ── コマンド: セーブ名変更 ────────────────────────────────────────────────────

#[tauri::command]
pub async fn rename_save(
    save_id: String,
    new_name: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let dir = save_dir(&app)?;
    let meta_path = dir.join(format!("{save_id}.meta.json"));
    let meta_json = std::fs::read_to_string(&meta_path)
        .map_err(|e| format!("read meta failed: {e}"))?;
    let mut meta: SaveMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("parse meta failed: {e}"))?;
    meta.display_name = new_name;
    let updated = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("serialize meta failed: {e}"))?;
    std::fs::write(&meta_path, updated)
        .map_err(|e| format!("write meta failed: {e}"))?;
    Ok(())
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

fn save_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app.path().app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {e}"))?;
    Ok(base.join("saves"))
}