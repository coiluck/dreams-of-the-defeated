// src-tauri/src/wars_logistics.rs
use std::collections::{HashMap, HashSet, VecDeque};
use crate::map_store::{GridPoint, coord_to_idx, neighbors4};

// ── 地域ごとの補給下限 ──────────────────────────────────────────────────────

pub fn region_min_supply(region_id: u8) -> f32 {
    match region_id {
        1  => 0.40, // africa_central
        2  => 0.50, // africa_east
        3  => 0.55, // africa_north
        4  => 0.40, // africa_sahel
        5  => 0.65, // africa_south
        6  => 0.50, // africa_west
        7  => 0.60, // america_central
        8  => 0.90, // america_north
        9  => 0.65, // america_south
        10 => 0.40, // antarctica
        11 => 0.50, // asia_central
        12 => 0.70, // asia_east
        13 => 0.65, // asia_south
        14 => 0.60, // asia_southEast
        15 => 0.60, // asia_west
        16 => 0.75, // europe_east
        17 => 0.80, // europe_north
        18 => 0.85, // europe_south
        19 => 0.90, // europe_west
        20 => 0.70, // oceania
        _  => 0.50, // default
    }
}

// ── is_coast 判定 ─────────────────────────────────────────────────────────────

/// 陸マスのうち4近傍に海マス(owner_id==0)があるものを海岸とみなす。
/// map_store.coast_indices と同じ形式（usize インデックス）を返す。
pub fn build_coast_set(points: &[GridPoint]) -> HashSet<usize> {
    points.iter()
        .filter(|p| p.owner_id != 0) // 陸マスのみ
        .filter(|p| {
            neighbors4(p.x, p.y)
                .iter()
                .any(|&(nx, ny)| {
                    let idx = coord_to_idx(nx, ny);
                    points.get(idx).map_or(true, |nb| nb.owner_id == 0)
                })
        })
        .map(|p| coord_to_idx(p.x, p.y))
        .collect()
}

// ── 補給計算メイン ────────────────────────────────────────────────────────────

/// 戦線マスの補給率を計算して返す。
///
/// # 引数
/// * `front_tiles`   - 前線マスの座標リスト
/// * `points`        - マップ全体のグリッドデータ
/// * `supply_owner`  - 補給を受ける側の occupy_id
/// * `region_id`     - 戦線の代表 region_id（補給下限取得に使用）
/// * `supply_buff`   - 補給強化バフ（整数 %、例: 30 → +0.30）
/// * `mechanization_rate` - 機械化率（0〜100）
/// * `coast_set`     - 事前計算済みの海岸マスセット（None なら内部で計算）
/// * `core_tiles`    - supply_owner のコアマス座標セット（map_store から取得）
///
/// # 戻り値
/// 最終補給率 (0.0〜1.0)
pub fn calc_supply(
    front_tiles:  &[(u16, u16)],
    points:       &[GridPoint],
    supply_owner: u8,
    region_id:    u8,
    supply_buff:  i32,
    mechanization_rate: f32,
    coast_set:    Option<&HashSet<usize>>,
    core_tiles:   Option<&HashSet<usize>>,
) -> f32 {
    let min_supply = region_min_supply(region_id);

    if front_tiles.is_empty() {
        return (min_supply + supply_buff as f32 / 100.0).clamp(0.0, 1.0);
    }

    // 海岸セット（引数で渡されなければここで計算）
    let owned_coast: HashSet<usize>;
    let coast_ref: &HashSet<usize> = match coast_set {
        Some(s) => s,
        None => {
            owned_coast = build_coast_set(points);
            &owned_coast
        }
    };

    // ── 補給源: 自国占領 かつ (海岸 or コアマス) ─────────────────────────────
    // BFS は usize インデックスで行う
    let mut dist_map: HashMap<usize, u32> = HashMap::new();
    let mut queue: VecDeque<usize>        = VecDeque::new();

    for p in points.iter().filter(|p| p.occupy_id == supply_owner) {
        let idx = coord_to_idx(p.x, p.y);
        let is_source = coast_ref.contains(&idx)
            || core_tiles.map_or(false, |ct| ct.contains(&idx));
        if is_source {
            dist_map.insert(idx, 0);
            queue.push_back(idx);
        }
    }

    // ── BFS で全陸マスの距離を計算 ───────────────────────────────────────────
    while let Some(cur_idx) = queue.pop_front() {
        let d = *dist_map.get(&cur_idx).unwrap();
        let p = &points[cur_idx];
        for (nx, ny) in neighbors4(p.x, p.y) {
            let nb_idx = coord_to_idx(nx, ny);
            if points[nb_idx].owner_id != 0 && !dist_map.contains_key(&nb_idx) {
                dist_map.insert(nb_idx, d + 1);
                queue.push_back(nb_idx);
            }
        }
    }

    // ── 前線マスの平均距離 → 補給率 ─────────────────────────────────────────
    let distances: Vec<u32> = front_tiles.iter()
        .filter_map(|&(x, y)| dist_map.get(&coord_to_idx(x, y)))
        .copied()
        .collect();

    let max_dist = 50.0 - (mechanization_rate * 0.2);

    let base_supply = if distances.is_empty() {
        min_supply // 補給源から到達不能
    } else {
        let avg_dist = distances.iter().sum::<u32>() as f32 / distances.len() as f32;
        let decay    = (avg_dist / max_dist).min(1.0);
        (1.0 - (1.0 - min_supply) * decay).max(min_supply)
    };

    // ── バフ適用 ─────────────────────────────────────────────────────────────
    (base_supply + supply_buff as f32 / 100.0).clamp(0.0, 1.0)
}