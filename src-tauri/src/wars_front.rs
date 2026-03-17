// src-tauri/src/wars_front.rs
use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::map_store::{MapStore, coord_to_idx, neighbors4};
use crate::wars_logistics::calc_supply;

const FRONT_CONNECT_RADIUS: i32 = 2;

// ── 地域表示名 ────────────────────────────────────────────────────────────────

fn region_display(region_id: u8, lang: &str) -> &'static str {
    let (ja, en) = match region_id {
      1  => ("中央アフリカ", "Central Africa"),
      2  => ("東アフリカ",   "East Africa"),
      3  => ("北アフリカ",   "North Africa"),
      4  => ("サヘル",       "Sahel"),
      5  => ("南部アフリカ", "Southern Africa"),
      6  => ("西アフリカ",   "West Africa"),
      7  => ("中央アメリカ", "Central America"),
      8  => ("北アメリカ",   "North America"),
      9  => ("南アメリカ",   "South America"),
      10 => ("南極",         "Antarctica"),
      11 => ("中央アジア",   "Central Asia"),
      12 => ("東アジア",     "East Asia"),
      13 => ("南アジア",     "South Asia"),
      14 => ("東南アジア",   "Southeast Asia"),
      15 => ("西アジア",     "West Asia"),
      16 => ("東ヨーロッパ", "Eastern Europe"),
      17 => ("北ヨーロッパ", "Northern Europe"),
      18 => ("南ヨーロッパ", "Southern Europe"),
      19 => ("西ヨーロッパ", "Western Europe"),
      20 => ("オセアニア",   "Oceania"),
      _  => ("不明",         "Unknown"),
    };
    if lang == "en" { en } else { ja }
}

fn to_roman(n: usize) -> &'static str {
    match n {
        1 => "I", 2 => "II", 3 => "III", 4 => "IV", 5 => "V",
        6 => "VI", 7 => "VII", 8 => "VIII", 9 => "IX", 10 => "X",
        _ => "?",
    }
}

// ── 入出力型 ──────────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct WarInput {
    /// 自国の国コード
    pub player_id: String,
    /// 敵国コードのリスト（複数国・連合国対応）
    pub enemy_ids: Vec<String>,
    /// front_id → 補給バフ整数 %（補給強化アクション適用時に渡す）
    pub supply_buffs: HashMap<String, i32>,
    pub mechanization_rate: f32,
}

#[derive(Serialize, Debug, Clone)]
pub struct LocalizedName {
    pub ja: String,
    pub en: String,
}

#[derive(Serialize, Debug)]
pub struct FrontInfo {
    pub front_id:   String,
    pub name:       LocalizedName,
    /// 前線マス数（戦線の長さ）
    pub tile_count: u32,
    /// 代表 region_id（数値）
    pub region_id:  u8,
    /// 補給率 0.00〜1.00
    pub supply:     f32,
}

// ── Tauri コマンド ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_war_fronts(
    war: WarInput,
    map_store: State<MapStore>,
) -> Result<Vec<FrontInfo>, String> {
    let points      = map_store.points.read().map_err(|e| e.to_string())?;
    let id_map      = map_store.id_map.read().map_err(|e| e.to_string())?;
    let core_by_country = map_store.core_by_country.read().map_err(|e| e.to_string())?;

    let player_num = *id_map.get(&war.player_id)
        .ok_or_else(|| format!("Unknown country: {}", war.player_id))?;

    let enemy_nums: HashSet<u8> = war.enemy_ids.iter()
        .filter_map(|id| id_map.get(id).copied())
        .collect();

    if enemy_nums.is_empty() {
        return Ok(vec![]);
    }

    // ── 海岸セットを一度だけ計算（logistics でも使い回す）────────────────────
    let coast_set = &map_store.coast_indices;

    // ── 前線マス抽出 ─────────────────────────────────────────────────────────
    let border_tiles: Vec<(u16, u16)> = points.iter()
        .filter(|p| p.occupy_id == player_num)
        .filter(|p| {
            neighbors4(p.x, p.y)
                .iter()
                .any(|&(nx, ny)| {
                    let idx = coord_to_idx(nx, ny);
                    enemy_nums.contains(&points[idx].occupy_id)
                })
        })
        .map(|p| (p.x, p.y))
        .collect();

    if border_tiles.is_empty() {
        return Ok(vec![]);
    }

    // ── BFS 連結成分で戦線に分割 ─────────────────────────────────────────────
    let border_set: HashSet<(u16, u16)> = border_tiles.iter().copied().collect();
    let mut visited:    HashSet<(u16, u16)>    = HashSet::new();
    let mut raw_fronts: Vec<Vec<(u16, u16)>>   = Vec::new();

    for &start in &border_tiles {
        if visited.contains(&start) { continue; }

        let mut component = Vec::new();
        let mut queue     = VecDeque::new();
        queue.push_back(start);
        visited.insert(start);

        while let Some((cx, cy)) = queue.pop_front() {
            component.push((cx, cy));
            for dx in -FRONT_CONNECT_RADIUS..=FRONT_CONNECT_RADIUS {
                for dy in -FRONT_CONNECT_RADIUS..=FRONT_CONNECT_RADIUS {
                    if dx == 0 && dy == 0 { continue; }
                    // X: 東西ループ、Y: クランプ（neighbors4と同じルール）
                    let nx = (cx as i32 + dx)
                        .rem_euclid(crate::map_store::GRID_WIDTH as i32) as u16;
                    let ny = (cy as i32 + dy)
                        .clamp(0, crate::map_store::GRID_HEIGHT as i32 - 1) as u16;
                    if border_set.contains(&(nx, ny)) && !visited.contains(&(nx, ny)) {
                        visited.insert((nx, ny));
                        queue.push_back((nx, ny));
                    }
                }
            }
        }
        raw_fronts.push(component);
    }

    // ── 各戦線の代表 region_id（多数決）─────────────────────────────────────
    let front_regions: Vec<u8> = raw_fronts.iter().map(|tiles| {
        let mut counts: HashMap<u8, usize> = HashMap::new();
        for &(x, y) in tiles {
            let r = points[coord_to_idx(x, y)].region_id;
            if r != 0 { *counts.entry(r).or_insert(0) += 1; }
        }
        counts.into_iter().max_by_key(|(_, c)| *c).map(|(r, _)| r).unwrap_or(0)
    }).collect();

    // ── 案 C: 戦線名（地域名、同地域複数なら第 N 戦線）──────────────────────
    let mut region_total: HashMap<u8, usize> = HashMap::new();
    for &r in &front_regions {
        *region_total.entry(r).or_insert(0) += 1;
    }
    let mut region_seen: HashMap<u8, usize> = HashMap::new();

    let front_names: Vec<LocalizedName> = front_regions.iter().map(|&r| {
        let total = *region_total.get(&r).unwrap_or(&1);
        if total == 1 {
            LocalizedName {
                ja: format!("{}戦線",     region_display(r, "ja")),
                en: format!("{} Theater", region_display(r, "en")),
            }
        } else {
            let n = region_seen.entry(r).or_insert(0);
            *n += 1;
            LocalizedName {
                ja: format!("{}第{}戦線",       region_display(r, "ja"), n),
                en: format!("{} Theater {}",    region_display(r, "en"), to_roman(*n)),
            }
        }
    }).collect();

    // ── 補給計算 ─────────────────────────────────────────────────────────────
    // player のコアマスセットを core_by_country から取得
    let empty_core: HashSet<usize> = HashSet::new();
    let player_cores = core_by_country.get(&player_num).unwrap_or(&empty_core);

    let mut results: Vec<FrontInfo> = Vec::new();

    for (i, tiles) in raw_fronts.iter().enumerate() {
        let region_id = front_regions[i];
        let front_id  = format!("front_{}_{}", region_id, i);
        let buff      = war.supply_buffs.get(&front_id).copied().unwrap_or(0);

        let supply = calc_supply(
            tiles,
            &points,
            player_num,
            region_id,
            buff,
            war.mechanization_rate,
            Some(coast_set),
            Some(player_cores),
        );

        results.push(FrontInfo {
            front_id,
            name: front_names[i].clone(),
            tile_count: tiles.len() as u32,
            region_id,
            supply,
        });
    }

    Ok(results)
}