// src-tauri/src/wars_occupation.rs
//
// 侵攻結果をマップに反映するコマンド。
// advance_tiles の数値を元に、スコア関数でどのタイルを取るかを決定し、
// MapStore の occupy_id を更新して変更差分を返す。
//
// Score(t) = W_core * C(t) + W_smooth * S(t) + W_dir * (V_hat · u_hat_t)
//   W_core   = 3  (コア州判定)
//   W_smooth = 1  (隣接 attacker 数 = 戦線の滑らかさ)
//   W_dir    = 2  (方向ベクトル内積)

use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Deserialize, Serialize};
use tauri::State;
use rand::Rng;

use crate::map_store::{MapStore, coord_to_idx, neighbors4, GRID_WIDTH};

const W_CORE:   f32 = 3.0;
const W_SMOOTH: f32 = 1.0;
const W_DIR:    f32 = 2.0;
const W_RAND_MIN: f32 = 1.0;
const W_RAND_MAX: f32 = 6.0;

// ── 入出力型 ──────────────────────────────────────────────────────────────────

/// 1 戦線の侵攻指示
#[derive(Deserialize, Debug)]
pub struct FrontAdvanceCommand {
    pub front_id:      String,
    /// 正 → attacker_id が進む、負 → defender_id が進む
    pub advance_tiles: i32,
    /// プレイヤー側の国コード文字列（id_map で u8 に変換、失敗時は Err）
    pub attacker_id:   String,
    /// 敵側の国コード文字列
    pub defender_id:   String,
    /// get_war_fronts が返した attacker 視点の前線タイル座標。
    /// [x, y] の配列で渡す。この戦線スコープの BFS 起点として使う。
    pub front_tiles:   Vec<[u16; 2]>,
}

/// TS 側 pointsRef 更新・update_occupation 両用の変更差分
#[derive(Serialize, Debug, Clone)]
pub struct OccupyChangeSer {
    pub x:             u16,
    pub y:             u16,
    pub new_occupy_id: u8,
}

/// 1 戦線の処理結果
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

    // [問題3] 未知の国コードは即 Err を返す
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

        // 侵攻する側 / される側
        let (attacker, defender) = if cmd.advance_tiles > 0 {
            (attacker_num, defender_num)
        } else {
            (defender_num, attacker_num)
        };
        let steps = cmd.advance_tiles.unsigned_abs() as usize;

        // attacker のコアマスセット
        let empty_core: HashSet<usize> = HashSet::new();
        let attacker_cores = core_by_country.get(&attacker).unwrap_or(&empty_core);

        let scoped_front: HashSet<(u16, u16)> = cmd.front_tiles.iter()
            .map(|&[x, y]| (x, y))
            .collect();

        let front_tiles_for_advance: Vec<(u16, u16)> = if cmd.advance_tiles > 0 {
            // attacker が進む → attacker の前線タイルが起点
            scoped_front.iter().copied()
                .filter(|&(x, y)| points[coord_to_idx(x, y)].occupy_id == attacker)
                .collect()
        } else {
            // defender が進む → front_tiles（attacker 前線）の隣の 敵タイル タイルが起点
            let mut def_front: HashSet<(u16, u16)> = HashSet::new();
            for &(x, y) in &scoped_front {
                for (nx, ny) in neighbors4(x, y) {
                    // この時点で attacker 変数 = 敵国 u8、defender 変数 = プレイヤー u8 に swap 済み
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

        // ── [問題2] 重心を「戦線タイルから BFS で陸続きの領土」で計算 ─────────────
        //
        // attacker の重心: front_tiles_for_advance を BFS シードに、
        //                  attacker 占領の陸続きタイルを展開して重心を取る。
        // defender の重心: 上記の BFS で隣接した defender タイルをシードに、
        //                  defender 占領の陸続きタイルを展開して重心を取る。
        //
        // BFS は無制限に広げると遅くなるため、最大展開距離を設ける。
        const MAX_CENTROID_BFS_DEPTH: u32 = 40;

        let (ax, ay) = bfs_centroid(
            &front_tiles_for_advance,
            attacker,
            &points,
            MAX_CENTROID_BFS_DEPTH,
        );

        // defender の BFS シード: front_tiles の隣の defender タイル
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

        // V_hat: attacker 重心 → defender 重心
        let vx = wrap_delta(dx - ax, GRID_WIDTH as f32);
        let vy = dy - ay;
        let vlen = (vx * vx + vy * vy).sqrt().max(1e-6);
        let v_hat = (vx / vlen, vy / vlen);

        // ── step ループ ──────────────────────────────────────────────────────
        let mut dynamic_front: HashSet<(u16, u16)> = front_tiles_for_advance.iter().copied().collect();
        let mut changes: Vec<OccupyChangeSer> = Vec::new();

        for _ in 0..steps {
            // 候補: dynamic_front の隣接 defender タイル
            let mut candidates: HashMap<(u16, u16), f32> = HashMap::new();

            for &(fx, fy) in &dynamic_front {
                for (nx, ny) in neighbors4(fx, fy) {
                    let nb_idx = coord_to_idx(nx, ny);
                    if points[nb_idx].occupy_id != defender {
                        continue;
                    }
                    let score = score_tile(
                        nx, ny,
                        attacker,
                        attacker_cores,
                        &points,
                        v_hat,
                        &dynamic_front,
                    );
                    candidates.entry((nx, ny))
                        .and_modify(|s| { if score > *s { *s = score; } })
                        .or_insert(score);
                }
            }

            if candidates.is_empty() {
                // 戦線消滅 → 安全に終了
                break;
            }

            // 最高スコアのタイルを選択
            let best = *candidates.iter()
                .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
                .map(|(tile, _)| tile)
                .unwrap();

            // occupy 更新（owner_id は変更しない）
            let best_idx = coord_to_idx(best.0, best.1);
            points[best_idx].occupy_id = attacker;
            dynamic_front.insert(best);
            changes.push(OccupyChangeSer {
                x:             best.0,
                y:             best.1,
                new_occupy_id: attacker,
            });
        }

        all_results.push(FrontOccupyResult {
            front_id: cmd.front_id.clone(),
            changes,
        });
    }

    Ok(all_results)
}

// ── スコア関数 ────────────────────────────────────────────────────────────────

fn score_tile(
    x:              u16,
    y:              u16,
    attacker:       u8,
    attacker_cores: &HashSet<usize>,
    points:         &[crate::map_store::GridPoint],
    v_hat:          (f32, f32),
    dynamic_front:  &HashSet<(u16, u16)>,
) -> f32 {
    let idx = coord_to_idx(x, y);

    // C(t): コア判定
    let c = if attacker_cores.contains(&idx) { 1.0 } else { 0.0 };

    // S(t): 隣接する attacker タイルの数（dynamic_front で今ターン取得済みを含む）
    let s = neighbors4(x, y).iter()
        .filter(|&&(nx, ny)| {
            let ni = coord_to_idx(nx, ny);
            points[ni].occupy_id == attacker || dynamic_front.contains(&(nx, ny))
        })
        .count() as f32;

    // u_hat_t: 戦線重心 → 対象タイルの局所ベクトル
    let (front_cx, front_cy) = if dynamic_front.is_empty() {
        (x as f32, y as f32)
    } else {
        let &(ref_fx, ref_fy) = dynamic_front.iter().next().unwrap();
        let (dx_sum, dy_sum, fcount) = dynamic_front.iter()
            .fold((0f32, 0f32, 0usize), |(sdx, sdy, n), &(fx, fy)| {
                (
                    sdx + wrap_delta(fx as f32 - ref_fx as f32, GRID_WIDTH as f32),
                    sdy + (fy as f32 - ref_fy as f32),
                    n + 1
                )
            });

        let avg_x = ((ref_fx as f32 + dx_sum / fcount as f32) % GRID_WIDTH as f32 + GRID_WIDTH as f32) % GRID_WIDTH as f32;
        let avg_y = ref_fy as f32 + dy_sum / fcount as f32;
        (avg_x, avg_y)
    };

    let ux = wrap_delta(x as f32 - front_cx, GRID_WIDTH as f32);
    let uy = y as f32 - front_cy;
    let ulen = (ux * ux + uy * uy).sqrt().max(1e-6);
    let u_hat = (ux / ulen, uy / ulen);
    let dot = v_hat.0 * u_hat.0 + v_hat.1 * u_hat.1;

    // R(t): ランダム性
    let mut rng = rand::thread_rng();
    let rand_weight = rng.gen_range(W_RAND_MIN..=W_RAND_MAX);

    W_CORE * c + W_SMOOTH * s + W_DIR * dot + rand_weight
    // rondom以外は最大値3 * 1 + 4 * 1 + 2 * 1 = 9
}

// ── BFS 重心計算 ──────────────────────────────────────────────────────────────

/// seeds を起点に occupy_id == target の陸続きタイルを BFS で展開し、
/// 到達したタイル全体の重心を返す。深さ上限 max_depth で打ち切る。
fn bfs_centroid(
    seeds:     &[(u16, u16)],
    target:    u8,
    points:    &[crate::map_store::GridPoint],
    max_depth: u32,
) -> (f32, f32) {
    if seeds.is_empty() {
        return (0.0, 0.0);
    }

    let mut visited: HashSet<usize> = HashSet::new();
    let mut queue: VecDeque<(u16, u16, u32)> = VecDeque::new();

    // 地球儀計算のため、最初のシードを基準座標とする
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

    if count == 0 {
        return (ref_x, ref_y);
    }

    let avg_dx = sum_dx / count as f32;
    let avg_dy = sum_dy / count as f32;

    let final_x = ((ref_x + avg_dx) % GRID_WIDTH as f32 + GRID_WIDTH as f32) % GRID_WIDTH as f32;
    let final_y = ref_y + avg_dy;

    (final_x, final_y)
}

/// X 方向の東西ループにおける最短経路差分
#[inline]
fn wrap_delta(delta: f32, width: f32) -> f32 {
    let d = delta % width;
    if d > width / 2.0 {
        d - width
    } else if d < -width / 2.0 {
        d + width
    } else {
        d
    }
}