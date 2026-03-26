// src-tauri/src/wars_occupation.rs
//
// Score(t) = W_core * C(t) + W_smooth * S(t) + W_dir * (V_hat · u_hat_t)
// タイル選択: ソフトマックスサンプリング  P(t) ∝ exp(score(t) / T)
//   T = SOFTMAX_TEMP（大きいほどランダム、小さいほど決定的）

use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Deserialize, Serialize};
use tauri::State;
use rand::Rng;

use crate::map_store::{MapStore, coord_to_idx, neighbors4, GRID_WIDTH};

const W_CORE:       f32 = 3.0;
const W_SMOOTH:     f32 = 1.5;
const W_DIR:        f32 = 2.0;
// スコアレンジ最大9に対してT=2.5。
// exp((9-0)/2.5) ≈ 36 倍の確率差 → 優良タイルが選ばれやすいが下位にも確率が乗る
const SOFTMAX_TEMP: f32 = 2.5;

// ── 入出力型 ──────────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct FrontAdvanceCommand {
    pub front_id:      String,
    pub advance_tiles: i32,
    pub attacker_id:   String,
    pub defender_id:   String,
    pub front_tiles:   Vec<[u16; 2]>,
}

#[derive(Serialize, Debug, Clone)]
pub struct OccupyChangeSer {
    pub x:             u16,
    pub y:             u16,
    pub new_occupy_id: u8,
}

#[derive(Serialize, Debug)]
pub struct FrontOccupyResult {
    pub front_id: String,
    pub changes:  Vec<OccupyChangeSer>,
}

// ── Tauri コマンド ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn advance_occupation(
    commands:  Vec<FrontAdvanceCommand>,
    map_store: State<MapStore>,
) -> Result<Vec<FrontOccupyResult>, String> {
    let mut points = map_store.points.write()
        .map_err(|e| format!("lock error: {e}"))?;
    let id_map = map_store.id_map.read()
        .map_err(|e| format!("lock error: {e}"))?;
    let core_by_country = map_store.core_by_country.read()
        .map_err(|e| format!("lock error: {e}"))?;

    let mut rng = rand::thread_rng();
    let mut all_results: Vec<FrontOccupyResult> = Vec::new();

    for cmd in &commands {
        let attacker_num = *id_map.get(&cmd.attacker_id)
            .ok_or_else(|| format!(
                "advance_occupation: unknown attacker_id '{}' in front '{}'",
                cmd.attacker_id, cmd.front_id
            ))?;
        let defender_num = *id_map.get(&cmd.defender_id)
            .ok_or_else(|| format!(
                "advance_occupation: unknown defender_id '{}' in front '{}'",
                cmd.defender_id, cmd.front_id
            ))?;

        if cmd.advance_tiles == 0 {
            all_results.push(FrontOccupyResult { front_id: cmd.front_id.clone(), changes: vec![] });
            continue;
        }

        let (attacker, defender) = if cmd.advance_tiles > 0 {
            (attacker_num, defender_num)
        } else {
            (defender_num, attacker_num)
        };
        let steps = cmd.advance_tiles.unsigned_abs() as usize;

        let empty_core: HashSet<usize> = HashSet::new();
        let attacker_cores = core_by_country.get(&attacker).unwrap_or(&empty_core);

        let scoped_front: HashSet<(u16, u16)> = cmd.front_tiles.iter()
            .map(|&[x, y]| (x, y))
            .collect();

        let front_tiles_for_advance: Vec<(u16, u16)> = if cmd.advance_tiles > 0 {
            scoped_front.iter().copied()
                .filter(|&(x, y)| points[coord_to_idx(x, y)].occupy_id == attacker)
                .collect()
        } else {
            let mut def_front: HashSet<(u16, u16)> = HashSet::new();
            for &(x, y) in &scoped_front {
                for (nx, ny) in neighbors4(x, y) {
                    if points[coord_to_idx(nx, ny)].occupy_id == attacker {
                        def_front.insert((nx, ny));
                    }
                }
            }
            def_front.into_iter().collect()
        };

        if front_tiles_for_advance.is_empty() {
            all_results.push(FrontOccupyResult { front_id: cmd.front_id.clone(), changes: vec![] });
            continue;
        }

        const MAX_CENTROID_BFS_DEPTH: u32 = 40;
        let (ax, ay) = bfs_centroid(&front_tiles_for_advance, attacker, &points, MAX_CENTROID_BFS_DEPTH);

        let defender_seeds: Vec<(u16, u16)> = {
            let mut seeds: HashSet<(u16, u16)> = HashSet::new();
            for &(x, y) in &scoped_front {
                for (nx, ny) in neighbors4(x, y) {
                    if points[coord_to_idx(nx, ny)].occupy_id == defender {
                        seeds.insert((nx, ny));
                    }
                }
            }
            seeds.into_iter().collect()
        };

        let (dx, dy) = if defender_seeds.is_empty() {
            bfs_centroid(&front_tiles_for_advance, defender, &points, MAX_CENTROID_BFS_DEPTH)
        } else {
            bfs_centroid(&defender_seeds, defender, &points, MAX_CENTROID_BFS_DEPTH)
        };

        let vx = wrap_delta(dx - ax, GRID_WIDTH as f32);
        let vy = dy - ay;
        let vlen = (vx * vx + vy * vy).sqrt().max(1e-6);
        let v_hat = (vx / vlen, vy / vlen);

        // 取得済みタイルの集合（S(t) の隣接判定に使う）
        let mut attacker_tiles: HashSet<(u16, u16)> = front_tiles_for_advance.iter().copied().collect();

        // ── active_border: 実際に敵タイルと隣接している attacker タイルのみ ──
        // dynamic_front 全体ではなくこの集合だけ走査することで O(N²) を回避する。
        let mut active_border: HashSet<(u16, u16)> = front_tiles_for_advance.iter().copied()
            .filter(|&(x, y)| {
                neighbors4(x, y).iter().any(|&(nx, ny)| {
                    points[coord_to_idx(nx, ny)].occupy_id == defender
                })
            })
            .collect();

        // ── 前線重心を1回だけ計算して固定（u_hat の基準点として使う） ─────────
        // 1ターン中に前線重心を毎ステップ再計算する必要はなく、
        // 計算コストも dynamic_front 全体走査で O(N) になるため初期値を使い回す。
        let front_centroid = centroid_of_set(&front_tiles_for_advance);

        // 候補マップを step をまたいで保持し差分更新する。
        // 初期状態: active_border の全隣接 defender タイルを一括スコアリング
        let mut candidate_map: HashMap<(u16, u16), f32> = HashMap::new();
        for &(fx, fy) in &active_border {
            for (nx, ny) in neighbors4(fx, fy) {
                let nb_idx = coord_to_idx(nx, ny);
                if points[nb_idx].occupy_id != defender { continue; }
                let score = score_tile(
                    nx, ny, attacker, attacker_cores, &points, v_hat,
                    &attacker_tiles, front_centroid,
                );
                candidate_map.entry((nx, ny))
                    .and_modify(|s| { if score > *s { *s = score; } })
                    .or_insert(score);
            }
        }

        let mut changes: Vec<OccupyChangeSer> = Vec::new();

        for _ in 0..steps {
            if candidate_map.is_empty() {
                break; // 戦線消滅 → 安全に終了
            }

            // ── ソフトマックスサンプリング ────────────────────────────────────
            let candidates: Vec<((u16, u16), f32)> = candidate_map.iter()
                .map(|(&tile, &score)| (tile, score))
                .collect();

            let max_score = candidates.iter().map(|(_, s)| *s).fold(f32::NEG_INFINITY, f32::max);
            let exp_scores: Vec<f32> = candidates.iter()
                .map(|(_, s)| ((s - max_score) / SOFTMAX_TEMP).exp())
                .collect();
            let total: f32 = exp_scores.iter().sum();

            let mut threshold = rng.gen::<f32>() * total;
            let mut chosen_idx = candidates.len() - 1;
            for (i, &e) in exp_scores.iter().enumerate() {
                threshold -= e;
                if threshold <= 0.0 { chosen_idx = i; break; }
            }

            let best = candidates[chosen_idx].0;
            let best_idx = coord_to_idx(best.0, best.1);
            points[best_idx].occupy_id = attacker;

            // ── 差分更新 ─────────────────────────────────────────────────────
            // 1. best を attacker_tiles に追加し、候補から除外
            attacker_tiles.insert(best);
            candidate_map.remove(&best);

            // 2. best の隣の attacker タイルの active_border 状態を更新する。
            //    スコアの変動は「best に直接隣接する defender タイル」にのみ起きるため、
            //    ここでは active_border の整合性だけを保てばよく、スコア再計算は不要。
            for (nx, ny) in neighbors4(best.0, best.1) {
                let ni = coord_to_idx(nx, ny);
                if points[ni].occupy_id == attacker {
                    let still_border = neighbors4(nx, ny).iter().any(|&(nnx, nny)| {
                        points[coord_to_idx(nnx, nny)].occupy_id == defender
                    });
                    // 前線じゃなくなったらactive_borderから削除
                    if !still_border {
                        active_border.remove(&(nx, ny));
                    }
                }
            }

            // 3. best 自体を新しい active_border タイルとして追加し、
            //    best の隣の defender タイルを新たな候補として登録
            let best_is_border = neighbors4(best.0, best.1).iter().any(|&(nx, ny)| {
                points[coord_to_idx(nx, ny)].occupy_id == defender
            });
            if best_is_border {
                active_border.insert(best);
            }
            for (nx, ny) in neighbors4(best.0, best.1) {
                let ni = coord_to_idx(nx, ny);
                if points[ni].occupy_id == defender {
                    let score = score_tile(
                        nx, ny, attacker, attacker_cores, &points, v_hat,
                        &attacker_tiles, front_centroid,
                    );
                    candidate_map.entry((nx, ny))
                        .and_modify(|s| { if score > *s { *s = score; } })
                        .or_insert(score);
                }
            }

            changes.push(OccupyChangeSer { x: best.0, y: best.1, new_occupy_id: attacker });
        }

        all_results.push(FrontOccupyResult { front_id: cmd.front_id.clone(), changes });
    }

    Ok(all_results)
}

// ── スコア関数（乱数なし、max=9） ─────────────────────────────────────────────

/// * `attacker_tiles` - 今ターン取得済みも含む attacker 占領タイル全体（S の隣接判定用）
/// * `front_centroid` - ループ外で1回だけ計算した前線重心（u_hat の基準点）
fn score_tile(
    x:               u16,
    y:               u16,
    attacker:        u8,
    attacker_cores:  &HashSet<usize>,
    points:          &[crate::map_store::GridPoint],
    v_hat:           (f32, f32),
    attacker_tiles:  &HashSet<(u16, u16)>,
    front_centroid:  (f32, f32),
) -> f32 {
    let idx = coord_to_idx(x, y);

    // C(t): コア判定 [0, 1]
    let c = if attacker_cores.contains(&idx) { 1.0 } else { 0.0 };

    // S(t): 隣接する attacker タイル数 [0, 4]
    // attacker_tiles は今ターン取得済みタイルも含むので、
    // points[ni].occupy_id == attacker との OR は不要だが念のため両方チェック
    let s = neighbors4(x, y).iter()
        .filter(|&&(nx, ny)| {
            let ni = coord_to_idx(nx, ny);
            points[ni].occupy_id == attacker || attacker_tiles.contains(&(nx, ny))
        })
        .count() as f32;

    // u_hat_t: 前線重心（固定）→ 対象タイルのベクトル
    let (front_cx, front_cy) = front_centroid;
    let ux = wrap_delta(x as f32 - front_cx, GRID_WIDTH as f32);
    let uy = y as f32 - front_cy;
    let ulen = (ux * ux + uy * uy).sqrt().max(1e-6);
    let u_hat = (ux / ulen, uy / ulen);
    let dot = v_hat.0 * u_hat.0 + v_hat.1 * u_hat.1; // [-1, 1]

    W_CORE * c + W_SMOOTH * s + W_DIR * dot
    // 最大: 3 + 4 + 2 = 9
}

/// 座標集合の重心を計算（東西ループ対応）
fn centroid_of_set(tiles: &[(u16, u16)]) -> (f32, f32) {
    if tiles.is_empty() { return (0.0, 0.0); }
    let ref_x = tiles[0].0 as f32;
    let ref_y = tiles[0].1 as f32;
    let n = tiles.len() as f32;
    let sum_dx: f32 = tiles.iter().map(|&(x, _)| wrap_delta(x as f32 - ref_x, GRID_WIDTH as f32)).sum();
    let sum_dy: f32 = tiles.iter().map(|&(_, y)| y as f32 - ref_y).sum();
    let cx = ((ref_x + sum_dx / n) % GRID_WIDTH as f32 + GRID_WIDTH as f32) % GRID_WIDTH as f32;
    let cy = ref_y + sum_dy / n;
    (cx, cy)
}

// ── BFS 重心計算 ──────────────────────────────────────────────────────────────

fn bfs_centroid(
    seeds:     &[(u16, u16)],
    target:    u8,
    points:    &[crate::map_store::GridPoint],
    max_depth: u32,
) -> (f32, f32) {
    if seeds.is_empty() { return (0.0, 0.0); }

    let mut visited: HashSet<usize> = HashSet::new();
    let mut queue: VecDeque<(u16, u16, u32)> = VecDeque::new();
    let ref_x = seeds[0].0 as f32;
    let ref_y = seeds[0].1 as f32;
    let mut sum_dx = 0f32;
    let mut sum_dy = 0f32;
    let mut count = 0usize;

    for &(x, y) in seeds {
        let idx = coord_to_idx(x, y);
        if points[idx].occupy_id == target && visited.insert(idx) {
            queue.push_back((x, y, 0));
            sum_dx += wrap_delta(x as f32 - ref_x, GRID_WIDTH as f32);
            sum_dy += y as f32 - ref_y;
            count += 1;
        }
    }

    while let Some((cx, cy, depth)) = queue.pop_front() {
        if depth >= max_depth { continue; }
        for (nx, ny) in neighbors4(cx, cy) {
            let ni = coord_to_idx(nx, ny);
            if points[ni].occupy_id == target && visited.insert(ni) {
                queue.push_back((nx, ny, depth + 1));
                sum_dx += wrap_delta(nx as f32 - ref_x, GRID_WIDTH as f32);
                sum_dy += ny as f32 - ref_y;
                count += 1;
            }
        }
    }

    if count == 0 { return (ref_x, ref_y); }

    let final_x = ((ref_x + sum_dx / count as f32) % GRID_WIDTH as f32 + GRID_WIDTH as f32) % GRID_WIDTH as f32;
    let final_y = ref_y + sum_dy / count as f32;
    (final_x, final_y)
}

#[inline]
fn wrap_delta(delta: f32, width: f32) -> f32 {
    let d = delta % width;
    if d > width / 2.0 { d - width } else if d < -width / 2.0 { d + width } else { d }
}