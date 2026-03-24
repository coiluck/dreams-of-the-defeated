import json
import os

def main():
    # パスの設定
    base_dir = os.path.dirname(os.path.abspath(__file__))
    map_meta_path = os.path.join(base_dir, "map_meta.json")
    out_json_dir = os.path.abspath(os.path.join(base_dir, "..", "json"))
    out_json_path = os.path.join(out_json_dir, "non_playable_countries.json")

    # 1. map_meta.json の読み込み
    try:
        with open(map_meta_path, 'r', encoding='utf-8') as f:
            map_meta = json.load(f)
    except FileNotFoundError:
        print(f"エラー: {map_meta_path} が見つかりません。")
        return

    # map_metaに登録されているIDのセットを作成
    map_ids = set(map_meta.get("id_map", {}).values())
    map_ids.discard("Ocean")
    # 除外リスト: playable countries
    exclude_ids = {"FRA", "DEU", "GBR", "RUS", "CHN", "IND"}
    map_ids -= exclude_ids

    # 2. non_playable_countries.json の読み込み（存在しない場合は空辞書）
    npc_data = {}
    if os.path.exists(out_json_path):
        with open(out_json_path, 'r', encoding='utf-8') as f:
            try:
                npc_data = json.load(f)
                # もしリスト型で保存されていた場合は辞書型に変換
                if isinstance(npc_data, list):
                    npc_data = {item["id"]: item for item in npc_data if "id" in item}
            except json.JSONDecodeError:
                print("警告: 既存の non_playable_countries.json が不正な形式です。新規作成として扱います。")

    # 3. 削除のチェック (npc_data にあって map_meta にないもの)
    current_npc_ids = set(npc_data.keys())
    obsolete_ids = current_npc_ids - map_ids

    for obs_id in obsolete_ids:
        ja_name = npc_data[obs_id].get("name", {}).get("ja", obs_id)
        print(f"\n警告: map_meta.json に存在しない国コードが見つかりました: {obs_id} ({ja_name})")

        while True:
            ans = input(f"この国 ({ja_name}) を non_playable_countries.json から削除しますか？ (y/n): ").strip().lower()
            if ans in ['y', 'yes']:
                del npc_data[obs_id]
                print(f"-> {ja_name} を削除しました。")
                break
            elif ans in ['n', 'no']:
                print(f"-> {ja_name} を保持します。")
                break
            else:
                print("y または n で入力してください。")

    # 4. 追加のチェック (map_meta にあって npc_data にないもの)
    new_ids = map_ids - set(npc_data.keys())

    for new_id in sorted(new_ids):
        print(f"\n--- 新規国コードの追加: {new_id} ---")
        ja_name = input("日本語の国名: ").strip()
        en_name = input("英語の国名: ").strip()

        # 規模の入力 (1〜6)
        scale = 1
        while True:
            scale_str = input("国の規模 (1〜6): ").strip()
            if scale_str.isdigit() and 1 <= int(scale_str) <= 6:
                scale = int(scale_str)
                break
            print("エラー: 1から6の整数で入力してください。")

        # 軍事政権フラグの入力 (y/n)
        is_military = False
        while True:
            mil_str = input("軍事政権ですか？ (y/n): ").strip().lower()
            if mil_str in ['y', 'yes']:
                is_military = True
                break
            elif mil_str in ['n', 'no']:
                is_military = False
                break
            print("エラー: y または n で入力してください。")

        # データの登録
        npc_data[new_id] = {
            "id": new_id,
            "name": { "ja": ja_name, "en": en_name },
            "scale": scale,
            "isMilitaryRegime": is_military
        }
        print(f"-> {ja_name} ({new_id}) を追加しました。")

    # 出力先ディレクトリが存在しない場合は作成
    os.makedirs(out_json_dir, exist_ok=True)

    # 5. JSONファイルへ書き出し
    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump(npc_data, f, indent=2, ensure_ascii=False)

    print("\n non_playable_countries.json の更新が完了しました！")

if __name__ == "__main__":
    main()