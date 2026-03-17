import json
import struct
import random

INPUT_FILE   = './CountryData.geojson'
OUTPUT_BIN   = './map_data.bin'
OUTPUT_META  = './map_meta.json'
OUTPUT_CORES = './map_cores.json'

# ── バイナリフォーマット: 7 bytes / point ──────────────────────────────────────
# col_index  : u16  (2 bytes)  x
# row_index  : u16  (2 bytes)  y
# owner_id   : u8   (1 byte)   領有国 ID  (0 = 海 / 未定義)
# occupy_id  : u8   (1 byte)   占領国 ID  (0 = 海、初期値は owner と同値)
# region_id  : u8   (1 byte)   地域 ID    (0 = null / 海)
# ─────────────────────────────────────────────────────────────────────────────
# core は別ファイル map_cores.json に分離。
# is_coast は Rust 側で隣接マスから計算するため bin には持たない。
BYTES_PER_POINT = 7

REGION_TABLE: dict[str, int] = {
    "africa_central":   1,
    "africa_east":      2,
    "africa_north":     3,
    "africa_sahel":     4,
    "africa_south":     5,
    "africa_west":      6,
    "america_central":  7,
    "america_north":    8,
    "america_south":    9,
    "antarctica":      10,
    "asia_central":    11,
    "asia_east":       12,
    "asia_south":      13,
    "asia_southEast":  14,
    "asia_west":       15,
    "europe_east":     16,
    "europe_north":    17,
    "europe_south":    18,
    "europe_west":     19,
    "oceania":         20,
}


def main() -> None:
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features: list[dict] = data.get('features', [])

    # ── 国コード → 数値 ID テーブル ──────────────────────────────────────────
    country_codes: set[str] = set()
    for feat in features:
        code = feat.get('properties', {}).get('ADM0_A3')
        if code:
            country_codes.add(code)

    # 1 始まりで連番 (0 = 海 / 未定義)
    country_to_id: dict[str, int] = {
        code: i for i, code in enumerate(sorted(country_codes), start=1)
    }

    # ── 国ごとのランダム色 ────────────────────────────────────────────────────
    country_colors: dict[str, str] = {
        code: "#{:06x}".format(random.randint(0, 0xFFFFFF))
        for code in country_codes
    }

    # ── バイナリ & cores 生成 ─────────────────────────────────────────────────
    binary_data = bytearray()
    # cores: [{"x": int, "y": int, "core": [str, ...]}, ...]  ※ core が空のマスは除外
    cores_list: list[dict] = []
    skipped = 0

    for feat in features:
        p = feat.get('properties', {})

        col = int(p.get('col_index', 0))
        row = int(p.get('row_index', 0))

        owner_code = p.get('ADM0_A3') or None
        owner_id   = country_to_id.get(owner_code, 0) if owner_code else 0

        # 初期 occupy = owner
        occupy_id = owner_id

        region_str = p.get('region_name') or ''
        region_num = REGION_TABLE.get(region_str, 0)

        try:
            packed = struct.pack('<HHBBB', col, row, owner_id, occupy_id, region_num)
            assert len(packed) == BYTES_PER_POINT
            binary_data.extend(packed)
        except (struct.error, AssertionError) as e:
            print(f"[SKIP] id={p.get('id', '?')} - {e}")
            skipped += 1
            continue

        # core フィールドの処理
        # 値の例: null / "" / "FRA" / "FRA, DEU"
        raw_core = p.get('core') or ''
        if raw_core.strip():
            core_ids = [c.strip() for c in raw_core.split(',') if c.strip()]
            if core_ids:
                cores_list.append({"x": col, "y": row, "core": core_ids})

    # ── ファイル書き出し ──────────────────────────────────────────────────────
    with open(OUTPUT_BIN, 'wb') as f:
        f.write(binary_data)

    id_map_out = {v: k for k, v in country_to_id.items()}
    id_map_out[0] = "Ocean"  # 0 = 海 / 未定義

    meta = {
        "id_map":          id_map_out,  # num → code
        "colors":          country_colors,                              # code → hex
        "region_map":      {v: k for k, v in REGION_TABLE.items()},   # num → str
        "bytes_per_point": BYTES_PER_POINT,
    }
    with open(OUTPUT_META, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_CORES, 'w', encoding='utf-8') as f:
        json.dump(cores_list, f, indent=2, ensure_ascii=False)

    total = len(features) - skipped
    print(f"Conversion complete.")
    print(f"  Points      : {total:,}  (skipped: {skipped})")
    print(f"  Bin size    : {len(binary_data):,} bytes  ({BYTES_PER_POINT} bytes/point)")
    print(f"  Core entries: {len(cores_list):,}")
    print(f"  Countries   : {len(country_codes)}")
    print(f"  Regions     : {len(REGION_TABLE)}")


if __name__ == "__main__":
    main()