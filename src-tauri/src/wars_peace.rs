// src-tauri/src/wars_peace.rs
//
// 講和・降伏処理
//
// 提供コマンド:
//   check_total_collapse   - 強制全土降伏の判定（閾値: owner_id マスの8割が他国 occupy）
//   apply_collapse         - 崩壊した国の全領土を戦勝国に BFS 分割
//   apply_peace_settlement - 強制講和 / 個別講和の領土確定
//                            (飛び地清算オプション付き)

use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::map_store::{MapStore, GridPoint, coord_to_idx, neighbors4, GRID_WIDTH, GRID_HEIGHT};

// ─────────────────────────────────────────────────────────────────────────────
// 共通ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

/// 指定 occupy_id を持つマス数を数える
fn count_occupied_by(points: &[GridPoint], occupy_id: u8) -> usize {
    points.iter().filter(|p| p.occupy_id == occupy_id).count()
}

/// 指定 owner_id を持つ全マスのインデックス集合
fn owner_indices(points: &[GridPoint], owner_id: u8) -> Vec<usize> {
    points.iter()
        .enumerate()
        .filter(|(_, p)| p.owner_id == owner_id)
        .map(|(i, _)| i)
        .collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// 強制全土降伏チェック
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Debug)]
pub struct CollapseCheckResult {
    /// 崩壊したか
    pub collapsed: bool,
    /// owner マス総数
    pub total_owner_tiles: u32,
    /// 他国占領マス数
    pub enemy_occupied_tiles: u32,
    /// 他国占領率（0.0〜1.0）
    pub occupation_ratio: f32,
}

/// A国（`country_id`）の owner マスのうち自国以外が occupy している割合を返す。
/// 8割超なら collapsed=true。
#[tauri::command]
pub fn check_total_collapse(
    country_id: String,
    map_store:  State<MapStore>,
) -> Result<CollapseCheckResult, String> {
    let points = map_store.points.read().map_err(|e| e.to_string())?;
    let id_map = map_store.id_map.read().map_err(|e| e.to_string())?;

    let num = *id_map.get(&country_id)
        .ok_or_else(|| format!("Unknown country: {country_id}"))?;

    let total: u32 = points.iter()
        .filter(|p| p.owner_id == num)
        .count() as u32;

    if total == 0 {
        return Ok(CollapseCheckResult {
            collapsed: false,
            total_owner_tiles: 0,
            enemy_occupied_tiles: 0,
            occupation_ratio: 0.0,
        });
    }

    let enemy_occupied: u32 = points.iter()
        .filter(|p| p.owner_id == num && p.occupy_id != num)
        .count() as u32;

    let ratio = enemy_occupied as f32 / total as f32;

    Ok(CollapseCheckResult {
        collapsed: ratio > 0.8,
        total_owner_tiles: total,
        enemy_occupied_tiles: enemy_occupied,
        occupation_ratio: ratio,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 強制全土降伏 — 領土分割
// ─────────────────────────────────────────────────────────────────────────────

/// 戦勝国リスト（占領マス数の多い順で優先）
#[derive(Deserialize, Debug)]
pub struct CollapseApplyInput {
    /// 崩壊した国のコード
    pub loser_id: String,
    /// 戦勝国コードのリスト（全員）
    pub winner_ids: Vec<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct OccupyChangeSer {
    pub x:             u16,
    pub y:             u16,
    pub new_occupy_id: u8,
}

/// 崩壊した国の全領土を戦勝国に BFS 分割して変更リストを返す。
///
/// アルゴリズム:
///   1. 各戦勝国の「現占領マス（loser の owner 領域内）」をシードとする。
///   2. 距離 0 から同時 BFS（対象: loser の owner マスかつ loser の occupy マス）。
///   3. 先到達した戦勝国が取得。同距離ならシード数（占領マス数）の多い国を優先。
///   4. BFS 後に未割当マス（戦勝国が誰も占領していない loser owner マス）が残った場合、
///      最近傍割当で処理する。
#[tauri::command]
pub fn apply_collapse(
    input:     CollapseApplyInput,
    map_store: State<MapStore>,
) -> Result<Vec<OccupyChangeSer>, String> {
    let mut points = map_store.points.write().map_err(|e| e.to_string())?;
    let id_map     = map_store.id_map.read().map_err(|e| e.to_string())?;

    let loser_num = *id_map.get(&input.loser_id)
        .ok_or_else(|| format!("Unknown loser: {}", input.loser_id))?;

    let winner_nums: Vec<u8> = input.winner_ids.iter()
        .filter_map(|id| id_map.get(id).copied())
        .collect();

    if winner_nums.is_empty() {
        return Ok(vec![]);
    }

    // loser の owner かつ loser の occupy であるマスが分割対象
    let target_indices: HashSet<usize> = points.iter()
        .enumerate()
        .filter(|(_, p)| p.owner_id == loser_num && p.occupy_id == loser_num)
        .map(|(i, _)| i)
        .collect();

    // 戦勝国ごとのシード（loser owner 内で既に占領済みのマス）と占領数
    let mut seed_count: HashMap<u8, usize> = HashMap::new();
    let mut queue: VecDeque<(usize, u8)> = VecDeque::new(); // (idx, winner_num)
    let mut assigned: HashMap<usize, u8> = HashMap::new();

    for &wn in &winner_nums {
        let seeds: Vec<usize> = points.iter()
            .enumerate()
            .filter(|(_, p)| p.owner_id == loser_num && p.occupy_id == wn)
            .map(|(i, _)| i)
            .collect();
        let cnt = seeds.len();
        seed_count.insert(wn, cnt);
        for idx in seeds {
            if !assigned.contains_key(&idx) {
                assigned.insert(idx, wn);
                queue.push_back((idx, wn));
            }
        }
    }

    // 距離レイヤー管理 BFS（同距離競合は seed_count で解決）
    // 競合用: idx → (dist, winner)
    let mut dist_map: HashMap<usize, u32> = HashMap::new();
    for &idx in assigned.keys() {
        dist_map.insert(idx, 0);
    }

    while let Some((cur_idx, cur_winner)) = queue.pop_front() {
        let cur_dist = *dist_map.get(&cur_idx).unwrap_or(&0);
        let p = &points[cur_idx];
        for (nx, ny) in neighbors4(p.x, p.y) {
            let ni = coord_to_idx(nx, ny);
            if !target_indices.contains(&ni) { continue; }

            if let Some(&existing_dist) = dist_map.get(&ni) {
                if existing_dist < cur_dist + 1 { continue; }
                if existing_dist == cur_dist + 1 {
                    // 同距離競合: seed_count の多い方を採用
                    let existing_winner = assigned[&ni];
                    let cur_seeds = seed_count.get(&cur_winner).copied().unwrap_or(0);
                    let ex_seeds  = seed_count.get(&existing_winner).copied().unwrap_or(0);
                    if cur_seeds > ex_seeds {
                        assigned.insert(ni, cur_winner);
                        // dist は同じなので更新不要
                    }
                    continue;
                }
            }

            dist_map.insert(ni, cur_dist + 1);
            assigned.insert(ni, cur_winner);
            queue.push_back((ni, cur_winner));
        }
    }

    // BFS で未到達の孤立マスを最近傍（assigned 済みマス）で割当
    let unassigned: Vec<usize> = target_indices.iter()
        .filter(|i| !assigned.contains_key(i))
        .copied()
        .collect();

    if !unassigned.is_empty() {
        // 最大占領数の戦勝国をデフォルトとして使用
        let default_winner = *winner_nums.iter()
            .max_by_key(|&&wn| seed_count.get(&wn).copied().unwrap_or(0))
            .unwrap_or(&winner_nums[0]);

        // シンプルに全未割当を default_winner へ（孤島は稀なので許容）
        for idx in unassigned {
            assigned.insert(idx, default_winner);
        }
    }

    // 変更を points に反映し、差分リストを構築
    let mut changes: Vec<OccupyChangeSer> = Vec::new();

    for (idx, winner_num) in &assigned {
        let p = &mut points[*idx];
        // owner_id も変更（併合）
        p.owner_id  = *winner_num;
        p.occupy_id = *winner_num;
        changes.push(OccupyChangeSer { x: p.x, y: p.y, new_occupy_id: *winner_num });
    }

    // loser の owner だが戦勝国が既に占領していたマスも owner 変更
    let already_occupied: Vec<usize> = points.iter()
        .enumerate()
        .filter(|(_, p)| p.owner_id == loser_num && winner_nums.contains(&p.occupy_id))
        .map(|(i, _)| i)
        .collect();

    for idx in already_occupied {
        let p = &mut points[idx];
        let new_owner = p.occupy_id;
        p.owner_id = new_owner;
        changes.push(OccupyChangeSer { x: p.x, y: p.y, new_occupy_id: new_owner });
    }

    Ok(changes)
}

// ─────────────────────────────────────────────────────────────────────────────
// 強制講和 / 個別講和 — 領土確定
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct PeaceSettlementInput {
    /// 占領した側（勝者寄り）のコード
    pub attacker_id: String,
    /// 占領された側（敗者寄り）のコード
    pub defender_id: String,
    /// 飛び地清算を行うか（個別講和時 true）
    pub cleanup_enclaves: bool,
    /// 敗者が他に交戦している相手国コードリスト（飛び地判定に使用）
    pub defender_other_enemies: Vec<String>,
}

/// 講和確定処理:
///   - attacker が占領した defender owner マス → attacker に併合
///   - defender が占領した attacker owner マス → defender に併合
///   - cleanup_enclaves=true のとき、以下の「飛び地」を清算:
///       owner_id=敗者 && occupy_id=敗者 && 連結成分が
///       (海 | 敗者の他の本土 | 敗者の他の交戦敵) と接続不可
#[tauri::command]
pub fn apply_peace_settlement(
    input:     PeaceSettlementInput,
    map_store: State<MapStore>,
) -> Result<Vec<OccupyChangeSer>, String> {
    let mut points = map_store.points.write().map_err(|e| e.to_string())?;
    let id_map     = map_store.id_map.read().map_err(|e| e.to_string())?;

    let att_num = *id_map.get(&input.attacker_id)
        .ok_or_else(|| format!("Unknown attacker: {}", input.attacker_id))?;
    let def_num = *id_map.get(&input.defender_id)
        .ok_or_else(|| format!("Unknown defender: {}", input.defender_id))?;

    let other_enemy_nums: HashSet<u8> = input.defender_other_enemies.iter()
        .filter_map(|id| id_map.get(id).copied())
        .collect();

    let mut changes: Vec<OccupyChangeSer> = Vec::new();

    // ── 飛び地清算（占領確定より前に実施） ──────────────────────────────────
    if input.cleanup_enclaves {
        // 先に両方の候補と飛び地リストを計算する（途中の状態変更による干渉を防ぐため）

        // ① def の孤立地候補
        let def_candidates: HashSet<usize> = points.iter()
            .enumerate()
            .filter(|(_, p)| p.owner_id == def_num && p.occupy_id == def_num)
            .map(|(i, _)| i)
            .collect();

        let def_enclaves = find_isolated_components(
            &def_candidates,
            &points,
            def_num,  // この成分の国
            att_num,  // この成分を囲んでいる国
            &other_enemy_nums,
        );

        // ② att の孤立地候補
        let att_candidates: HashSet<usize> = points.iter()
            .enumerate()
            .filter(|(_, p)| p.owner_id == att_num && p.occupy_id == att_num)
            .map(|(i, _)| i)
            .collect();

        let empty_other_enemies: HashSet<u8> = HashSet::new();
        let att_enclaves = find_isolated_components(
            &att_candidates,
            &points,
            att_num,  // この成分の国
            def_num,  // この成分を囲んでいる国
            &empty_other_enemies,
        );

        // 判定が終わってから一気に書き換える
        for idx in def_enclaves {
            points[idx].owner_id  = att_num;
            points[idx].occupy_id = att_num;
            let p = &points[idx];
            changes.push(OccupyChangeSer { x: p.x, y: p.y, new_occupy_id: att_num });
        }

        for idx in att_enclaves {
            points[idx].owner_id  = def_num;
            points[idx].occupy_id = def_num;
            let p = &points[idx];
            changes.push(OccupyChangeSer { x: p.x, y: p.y, new_occupy_id: def_num });
        }
    }

    // ── 占領地の確定 ─────────────────────────────────────────────────────────
    let att_gains: Vec<usize> = points.iter()
        .enumerate()
        .filter(|(_, p)| p.owner_id == def_num && p.occupy_id == att_num)
        .map(|(i, _)| i)
        .collect();

    for idx in att_gains {
        points[idx].owner_id  = att_num;
        points[idx].occupy_id = att_num;
        let p = &points[idx];
        changes.push(OccupyChangeSer { x: p.x, y: p.y, new_occupy_id: att_num });
    }

    let def_gains: Vec<usize> = points.iter()
        .enumerate()
        .filter(|(_, p)| p.owner_id == att_num && p.occupy_id == def_num)
        .map(|(i, _)| i)
        .collect();

    for idx in def_gains {
        points[idx].owner_id  = def_num;
        points[idx].occupy_id = def_num;
        let p = &points[idx];
        changes.push(OccupyChangeSer { x: p.x, y: p.y, new_occupy_id: def_num });
    }

    Ok(changes)
}

/// candidate_set 内のマスを連結成分に分解し、
/// 「孤立した成分」（海・def 本土・def 他交戦敵と接続不可）のインデックスを返す。
fn find_isolated_components(
    candidate_set:    &HashSet<usize>,
    points:           &[GridPoint],
    def_num:          u8,
    att_num:         u8,
    other_enemy_nums: &HashSet<u8>,
) -> Vec<usize> {
    let mut visited: HashSet<usize> = HashSet::new();
    let mut isolated_indices: Vec<usize> = Vec::new();

    for &start in candidate_set {
        if visited.contains(&start) { continue; }

        // BFS で連結成分を収集
        let mut component: Vec<usize> = Vec::new();
        let mut queue: VecDeque<usize> = VecDeque::new();
        queue.push_back(start);
        visited.insert(start);
        let mut is_connected = false;
        let mut touches_attacker = false;

        while let Some(cur) = queue.pop_front() {
            component.push(cur);
            let p = &points[cur];

            for (nx, ny) in neighbors4(p.x, p.y) {
                let ni = coord_to_idx(nx, ny);
                let nb = &points[ni];

                // 接続チェック:
                if !candidate_set.contains(&ni) {
                    if nb.occupy_id == att_num {
                        // attacker に囲まれている → 飛び地候補
                        touches_attacker = true;
                    }
                    if nb.occupy_id == def_num && nb.owner_id != 0 {
                        // def の別本土と陸続き → 孤立していない
                        is_connected = true;
                    } else if other_enemy_nums.contains(&nb.occupy_id) {
                        // def の他交戦敵領土と接続 → 孤立していない
                        is_connected = true;
                    }
                }

                // candidate_set 内のマスに BFS 展開
                if candidate_set.contains(&ni) && !visited.contains(&ni) {
                    visited.insert(ni);
                    queue.push_back(ni);
                }
            }
        }

        // 孤立している（海や他接続なし）成分を飛び地として登録
        // 飛び地の最大サイズは10マス
        const ENCLAVE_MAX_SIZE: usize = 10;
        if !is_connected && touches_attacker && component.len() <= ENCLAVE_MAX_SIZE {
            isolated_indices.extend_from_slice(&component);
        }
    }

    isolated_indices
}

// ─────────────────────────────────────────────────────────────────────────────
// 個別講和トリガー: CPU の tile 収支チェック
// ─────────────────────────────────────────────────────────────────────────────

/// CPU が5ターン連続で tile 収支マイナスかどうかを JS 側から渡して判定するだけ。
/// Rust 側では純粋に「現在 attacker が占領している defender owner マス数」を返す。
#[derive(Serialize, Debug)]
pub struct WarTileBalance {
    /// attacker が占領している defender owner マス数（正なら attacker 優勢）
    pub attacker_gains: i32,
    /// defender が占領している attacker owner マス数
    pub defender_gains: i32,
    /// 差分（attacker_gains - defender_gains）。正 = attacker 優勢
    pub net_balance: i32,
}

#[tauri::command]
pub fn get_war_tile_balance(
    attacker_id: String,
    defender_id: String,
    map_store:   State<MapStore>,
) -> Result<WarTileBalance, String> {
    let points = map_store.points.read().map_err(|e| e.to_string())?;
    let id_map = map_store.id_map.read().map_err(|e| e.to_string())?;

    let att_num = *id_map.get(&attacker_id)
        .ok_or_else(|| format!("Unknown: {attacker_id}"))?;
    let def_num = *id_map.get(&defender_id)
        .ok_or_else(|| format!("Unknown: {defender_id}"))?;

    let att_gains = points.iter()
        .filter(|p| p.owner_id == def_num && p.occupy_id == att_num)
        .count() as i32;

    let def_gains = points.iter()
        .filter(|p| p.owner_id == att_num && p.occupy_id == def_num)
        .count() as i32;

    Ok(WarTileBalance {
        attacker_gains: att_gains,
        defender_gains: def_gains,
        net_balance: att_gains - def_gains,
    })
}
