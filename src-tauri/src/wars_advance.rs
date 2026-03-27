// src-tauri/src/wars_advance.rs
//
// 1ターンの戦線侵攻量を計算する。
//
// アクション index（GameWar.tsx の TACTIC_ACTIONS と対応）:
//   0 = 何もしない      (効果なし)
//   1 = 積極的攻勢      (攻撃3回 / 防衛1回)
//   2 = 火力支援        (攻撃力 ×1.2)
//   3 = 防御陣地の構築  (防御力 ×1.2)
//   4 = 補給の改善      (supply_buff +20%)  ← wars_front.rs の supply_buffs に相当

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ── アクション index 定数 ────────────────────────────────────────────────────

const ACTION_STANDBY:            u8 = 0;
const ACTION_AGGRESSIVE_OFFENSE: u8 = 1;
const ACTION_FIRE_SUPPORT:       u8 = 2;
const ACTION_ENTRENCHMENT:       u8 = 3;
const ACTION_LOGISTIC_SUPPORT:   u8 = 4;

// ── 基礎値定数 ──────────────────────────────────────────────────────────────
const BASE_ATTACK:  f32 = 20.0;
const BASE_DEFENCE: f32 = 22.0;

// ── 入出力型 ──────────────────────────────────────────────────────────────────

/// Tauri コマンドへの入力
#[derive(Deserialize, Debug)]
pub struct AdvanceInput {
    // ── プレイヤー側 ──────────────────────────────────────────────
    pub player_id: String,
    /// 展開師団数
    pub player_deployed_military: f32,
    /// プレイヤーが参加している全戦争の全戦線タイル合計
    pub player_total_tiles: f32,
    /// 機械化率 0〜100
    pub player_mechanization_rate: f32,
    /// 国民精神・方針バフ（攻撃力倍率、1.0 基準）
    pub player_spirit_attack_buff:  f32,
    /// 国民精神・方針バフ（防御力倍率、1.0 基準）
    pub player_spirit_defence_buff: f32,

    // ── 敵国側 ────────────────────────────────────────────────────
    pub enemy_id:  String,
    pub enemy_deployed_military: f32,
    pub enemy_total_tiles: f32,
    pub enemy_mechanization_rate: f32,
    pub enemy_spirit_attack_buff:  f32,
    pub enemy_spirit_defence_buff: f32,

    // ── 各戦線の情報 ──────────────────────────────────────────────
    /// wars_front::get_war_fronts が返した戦線リスト
    pub fronts: Vec<FrontInfoInput>,

    // ── アクション（front_id → action index） ────────────────────
    /// プレイヤーのアクション
    pub player_front_actions: HashMap<String, u8>,
    /// 敵のアクション
    pub enemy_front_actions:  HashMap<String, u8>,
}

/// フロント情報（wars_front::FrontInfo の必要フィールドのみ）
#[derive(Deserialize, Debug, Clone)]
pub struct FrontInfoInput {
    pub front_id:   String,
    pub tile_count: u32,
    pub region_id:  u8,
    /// プレイヤー補給率（0.0〜1.0）
    pub player_supply: f32,
    /// 敵補給率（0.0〜1.0）
    pub enemy_supply: f32,
}

/// 1 戦線の侵攻結果
#[derive(Serialize, Debug)]
pub struct FrontAdvanceResult {
    pub front_id: String,
    /// 正 → プレイヤーが進んだマス数、負 → 敵が進んだマス数
    pub advance_tiles: i32,
    /// デバッグ用：各フェーズの P 値
    pub phase_log: Vec<PhaseLog>,
}

#[derive(Serialize, Debug)]
pub struct PhaseLog {
    pub phase:         u8,
    pub attacker:      String, // "player" or "enemy"
    pub attack_energy: f32,
    pub defence_energy: f32,
    pub power_ratio:   f32,
    pub p:             i32,
}

// ── Tauri コマンド ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn calc_advance(
    input: AdvanceInput,
) -> Result<Vec<FrontAdvanceResult>, String> {
    let mut results = Vec::new();

    for front in &input.fronts {
        let result = calc_front_advance(
            front,
            &input,
        );
        results.push(result);
    }

    Ok(results)
}

// ── 1 戦線の計算 ──────────────────────────────────────────────────────────────

fn calc_front_advance(
    front:       &FrontInfoInput,
    input:       &AdvanceInput,
) -> FrontAdvanceResult {
    // ── アクション取得 ───────────────────────────────────────────────────────
    let p_action = input.player_front_actions.get(&front.front_id).copied()
        .unwrap_or(ACTION_STANDBY);
    let e_action = input.enemy_front_actions.get(&front.front_id).copied()
        .unwrap_or(ACTION_STANDBY);

    // ── 補給バフ（補給の改善アクション: +0.10）───────────────────────────────
    let p_supply = (front.player_supply
        + if p_action == ACTION_LOGISTIC_SUPPORT { 0.20 } else { 0.0 })
        .clamp(0.40, 1.0);
    let e_supply = (front.enemy_supply
        + if e_action == ACTION_LOGISTIC_SUPPORT { 0.20 } else { 0.0 })
        .clamp(0.40, 1.0);

    // ── アクションバフ倍率 ──────────────────────────────────────────────────
    // 攻撃力倍率
    let p_attack_action_mult  = if p_action == ACTION_FIRE_SUPPORT  { 1.40 } else { 1.0 };
    let e_attack_action_mult  = if e_action == ACTION_FIRE_SUPPORT  { 1.40 } else { 1.0 };
    // 防御力倍率
    let p_defence_action_mult = if p_action == ACTION_ENTRENCHMENT  { 1.40 } else { 1.0 };
    let e_defence_action_mult = if e_action == ACTION_ENTRENCHMENT  { 1.40 } else { 1.0 };

    // ── 師団数補正（三乗根）────────────────────────────────────────────────
    // 各国が この戦線に割り当てた "実効師団数" ∝ deployedMilitary × (front_tiles / total_tiles)
    // ゼロ除算を防ぐため .max(1.0) を使用
    let p_total = input.player_total_tiles.max(1.0);
    let e_total = input.enemy_total_tiles.max(1.0);

    let p_division_correction = (input.player_deployed_military
        * (front.tile_count as f32 / p_total))
        .cbrt();
    let e_division_correction = (input.enemy_deployed_military
        * (front.tile_count as f32 / e_total))
        .cbrt();

    // ── 戦闘回数の決定 ──────────────────────────────────────────────────────
    // 通常: 攻撃側2回 / 防衛側2回 = 各陣営 2 回ずつ
    // 積極的攻勢: 攻撃側が 3 回 / 防衛側が 1 回
    let p_is_aggressive = p_action == ACTION_AGGRESSIVE_OFFENSE;
    let e_is_aggressive = e_action == ACTION_AGGRESSIVE_OFFENSE;
    let (p_atk, e_atk) = if p_is_aggressive && !e_is_aggressive {
        (3u8, 1u8)
    } else if e_is_aggressive && !p_is_aggressive {
        (1u8, 3u8)
    } else {
        // 両方または両方でない → 2:2（両方積極的攻勢は打ち消し合い）
        (2u8, 2u8)
    };

    // ── 戦線スケール ────────────────────────────────────────────────────────
    let scale = (front.tile_count as f32 * 0.05).max(1.0);

    // ── 各フェーズの計算 ────────────────────────────────────────────────────
    let mut p_total_p: i32 = 0; // player が攻撃役のフェーズの P 合計
    let mut e_total_p: i32 = 0; // enemy が攻撃役のフェーズの P 合計
    let mut phase_log: Vec<PhaseLog> = Vec::new();
    let mut phase_num = 0u8;

    // player 攻撃フェーズ
    for _ in 0..p_atk {
        phase_num += 1;
        let ae = attack_energy(
            BASE_ATTACK,
            p_supply,
            input.player_spirit_attack_buff * p_attack_action_mult,
            p_division_correction,
        );
        let de = defence_energy(
            BASE_DEFENCE,
            e_supply,
            input.enemy_spirit_defence_buff * e_defence_action_mult,
            e_division_correction,
        );
        let ratio = ae / de.max(0.001);
        let p = round_p(scale * ratio.powf(0.6) * 3.0 * (1.0 + input.player_mechanization_rate / 50.0));
        p_total_p += p;
        phase_log.push(PhaseLog {
            phase: phase_num,
            attacker: "player".to_string(),
            attack_energy: ae,
            defence_energy: de,
            power_ratio: ratio,
            p,
        });
    }

    // enemy 攻撃フェーズ
    for _ in 0..e_atk {
        phase_num += 1;
        let ae = attack_energy(
            BASE_ATTACK,
            e_supply,
            input.enemy_spirit_attack_buff * e_attack_action_mult,
            e_division_correction,
        );
        let de = defence_energy(
            BASE_DEFENCE,
            p_supply,
            input.player_spirit_defence_buff * p_defence_action_mult,
            p_division_correction,
        );
        let ratio = ae / de.max(0.001);
        let p = round_p(scale * ratio.powf(0.6) * 3.0 * (1.0 + input.enemy_mechanization_rate / 50.0));
        e_total_p += p;
        phase_log.push(PhaseLog {
            phase: phase_num,
            attacker: "enemy".to_string(),
            attack_energy: ae,
            defence_energy: de,
            power_ratio: ratio,
            p,
        });
    }

    // ── 最終侵攻量 ─────────────────────────────────────────────────────────
    // 正 → player が進んだ、負 → enemy が進んだ
    let advance_tiles = p_total_p - e_total_p;

    FrontAdvanceResult {
        front_id: front.front_id.clone(),
        advance_tiles,
        phase_log,
    }
}

// ── エネルギー計算ヘルパー ────────────────────────────────────────────────────

/// Attack Energy = 攻撃力 × 補給 × (国民精神・アクションバフ) × 師団数補正
#[inline]
fn attack_energy(
    base_attack:    f32,
    supply:         f32,
    spirit_and_action_buff: f32, // 1.0 = バフなし
    division_correction: f32,
) -> f32 {
    base_attack * supply * spirit_and_action_buff * division_correction
}

/// Defence Energy = 防御力 × 補給 × (国民精神・アクションバフ) × 師団数補正
#[inline]
fn defence_energy(
    base_defence:   f32,
    supply:         f32,
    spirit_and_action_buff: f32,
    division_correction: f32,
) -> f32 {
    base_defence * supply * spirit_and_action_buff * division_correction
}

/// P = Round(Scale × ratio^0.6 × 3.0 × (1 + mechanization_rate / 50.0))
#[inline]
fn round_p(raw: f32) -> i32 {
    raw.round() as i32
}