// src-tauri/src/map_store.rs

use std::collections::{HashMap, HashSet};
use std::sync::RwLock;
use arrayvec::ArrayVec;

const BYTES_PER_POINT: usize = 7;

// ── グリッドサイズ定数 ────────────────────────────────────────────────────────
// run.py / Map.tsx の GRID_WIDTH / GRID_HEIGHT と合わせること。
pub const GRID_WIDTH:  u16 = 720;
pub const GRID_HEIGHT: u16 = 492;

// ── グリッド 1 マスの構造体 ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct GridPoint {
    pub x:         u16,
    pub y:         u16,
    pub owner_id:  u8,
    pub occupy_id: u8,
    pub region_id: u8,
}

// ── 座標 ↔ 1 次元インデックス変換 ────────────────────────────────────────────
// HashMap<(u16,u16), _> の代わりに Vec の線形インデックスを使う。

/// (x, y) → Vec インデックス
#[inline]
pub fn coord_to_idx(x: u16, y: u16) -> usize {
    y as usize * GRID_WIDTH as usize + x as usize
}

/// 上下左右の近傍座標を返す（最大4要素、端では要素数が減る）。
/// X は東西ループ（地球儀）、Y は端のマスを含まない。
pub fn neighbors4(x: u16, y: u16) -> ArrayVec<(u16, u16), 4> {
    let mut nb = ArrayVec::new();
    // X: 東西ループ
    nb.push((if x == 0 { GRID_WIDTH - 1 } else { x - 1 }, y));
    nb.push((if x == GRID_WIDTH - 1 { 0 } else { x + 1 }, y));
    // Y: 端では追加しない（自分自身を返さない）
    if y > 0               { nb.push((x, y - 1)); }
    if y < GRID_HEIGHT - 1 { nb.push((x, y + 1)); }
    nb
}

// ── Tauri Managed State ──────────────────────────────────────────────────────

pub struct MapStore {
    /// グリッドデータ本体。インデックスは coord_to_idx(x, y) で引く。
    /// HashMap ではなく Vec で O(1) アクセス。
    /// occupy_id の変更があるため RwLock で保護。
    pub points: RwLock<Vec<GridPoint>>,
    /// 起動時バイナリから読み込んだ初期状態のスナップショット。
    /// reset_map コマンドで points をこの状態に戻す。
    pub initial_points: Vec<GridPoint>,

    /// 国コード → 数値 ID
    pub id_map: RwLock<HashMap<String, u8>>,
    /// 数値 ID → 国コード
    pub id_map_rev: RwLock<HashMap<u8, String>>,

    /// country_id → そのコアマスのインデックス集合
    ///  (x,y) の Vec インデックスの HashSet。
    pub core_by_country: RwLock<HashMap<u8, HashSet<usize>>>,

    ///  海岸マスのインデックス集合を起動時に一度だけ計算して保持。
    /// 地形はゲーム中に変化しないため RwLock ではなく不変フィールド。
    pub coast_indices: HashSet<usize>,
}

impl MapStore {
    pub fn load(bin_path: &str, meta_path: &str, cores_path: &str) -> Result<Self, String> {
        // ── バイナリ ─────────────────────────────────────────────────────────
        let bytes = std::fs::read(bin_path)
            .map_err(|e| format!("Failed to read {bin_path}: {e}"))?;

        if bytes.len() % BYTES_PER_POINT != 0 {
            return Err(format!(
                "Binary size {} is not a multiple of {BYTES_PER_POINT}",
                bytes.len()
            ));
        }

        let total = GRID_WIDTH as usize * GRID_HEIGHT as usize;
        let mut points: Vec<GridPoint> = (0..total)
            .map(|i| {
                let x = (i % GRID_WIDTH as usize) as u16;
                let y = (i / GRID_WIDTH as usize) as u16;
                GridPoint { x, y, owner_id: 0, occupy_id: 0, region_id: 0 }
            })
            .collect();

        for chunk in bytes.chunks_exact(BYTES_PER_POINT) {
            let x         = u16::from_le_bytes([chunk[0], chunk[1]]);
            let y         = u16::from_le_bytes([chunk[2], chunk[3]]);
            let owner_id  = chunk[4];
            let occupy_id = chunk[5];
            let region_id = chunk[6];
            let idx = coord_to_idx(x, y);
            points[idx] = GridPoint { x, y, owner_id, occupy_id, region_id };
        }

        // ── メタデータ ───────────────────────────────────────────────────────
        let meta_str = std::fs::read_to_string(meta_path)
            .map_err(|e| format!("Failed to read {meta_path}: {e}"))?;
        let meta: serde_json::Value = serde_json::from_str(&meta_str)
            .map_err(|e| format!("Failed to parse meta JSON: {e}"))?;

        let mut id_map:     HashMap<String, u8> = HashMap::new();
        let mut id_map_rev: HashMap<u8, String> = HashMap::new();

        if let Some(obj) = meta["id_map"].as_object() {
            for (num_str, code_val) in obj {
                if let (Ok(num), Some(code)) = (num_str.parse::<u8>(), code_val.as_str()) {
                    id_map.insert(code.to_string(), num);
                    id_map_rev.insert(num, code.to_string());
                }
            }
        }

        // ── 海岸を起動時に計算して保持 ───────────────
        // 陸マス(owner_id != 0)のうち、4近傍にowner_id==0のマスがあるものを海岸とする。
        let coast_indices: HashSet<usize> = points.iter()
            .filter(|p| p.owner_id != 0)
            .filter(|p| {
                neighbors4(p.x, p.y)
                    .iter()
                    .any(|&(nx, ny)| points[coord_to_idx(nx, ny)].owner_id == 0)
            })
            .map(|p| coord_to_idx(p.x, p.y))
            .collect();

        // ── cores ────────────────────────────────────────────────────────────
        let cores_str = std::fs::read_to_string(cores_path)
            .map_err(|e| format!("Failed to read {cores_path}: {e}"))?;
        let cores_json: Vec<serde_json::Value> = serde_json::from_str(&cores_str)
            .map_err(|e| format!("Failed to parse cores JSON: {e}"))?;

        // core_by_countryは Vec インデックスで持つ。
        let mut core_by_country: HashMap<u8, HashSet<usize>> = HashMap::new();

        for entry in &cores_json {
            let x = entry["x"].as_u64().unwrap_or(0) as u16;
            let y = entry["y"].as_u64().unwrap_or(0) as u16;
            let idx = coord_to_idx(x, y);
            let empty = vec![];
            let codes: Vec<&str> = entry["core"]
                .as_array()
                .unwrap_or(&empty)
                .iter()
                .filter_map(|v| v.as_str())
                .collect();

            for code in codes {
                if let Some(&num) = id_map.get(code) {
                    core_by_country.entry(num).or_default().insert(idx);
                }
            }
        }

        // initial_points は points を RwLock に move する前にクローンしておく
        let initial_points = points.clone();

        Ok(MapStore {
            points:          RwLock::new(points),
            initial_points,
            id_map:          RwLock::new(id_map),
            id_map_rev:      RwLock::new(id_map_rev),
            core_by_country: RwLock::new(core_by_country),
            coast_indices,
        })
    }
}

// ── 占領状態の差分更新コマンド ────────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct OccupyChange {
    pub x:             u16,
    pub y:             u16,
    pub new_occupy_id: u8,
}

#[tauri::command]
pub fn update_occupation(
    changes: Vec<OccupyChange>,
    map_store: tauri::State<MapStore>,
) -> Result<(), String> {
    let mut points = map_store.points.write()
        .map_err(|e| format!("lock error: {e}"))?;

    for change in changes {
        let idx = coord_to_idx(change.x, change.y);
        if idx < points.len() {
            points[idx].occupy_id = change.new_occupy_id;
        }
    }
    Ok(())
}

// ── コマンド: マップを初期状態に戻す ────────────────────────────────────────────
#[tauri::command]
pub fn reset_map(map_store: tauri::State<MapStore>) -> Result<(), String> {
    let mut points = map_store.points.write().map_err(|e| e.to_string())?;
    *points = map_store.initial_points.clone();
    Ok(())
}

#[tauri::command]
pub fn get_map_state(map_store: tauri::State<MapStore>) -> Result<Vec<u8>, String> {
    let points = map_store.points.read().map_err(|e| e.to_string())?;
    // 通信量を極限まで減らすため、全マスの owner_id と occupy_id だけを返す (約700KB)
    let mut buf = Vec::with_capacity(points.len() * 2);
    for p in points.iter() {
        buf.push(p.owner_id);
        buf.push(p.occupy_id);
    }
    Ok(buf)
}