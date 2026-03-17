// ts/components/GameWar.tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core'; // ※Tauri v1なら '@tauri-apps/api/tauri'
import { usePlayerCountry, useGameStore } from '../modules/gameState';

interface FrontInfo {
  front_id: string;
  name: { ja: string; en: string };
  tile_count: number;
  region_id: number;
  supply: number;
}

export default function GameWar() {
  const playerCountry = usePlayerCountry();
  const wars = useGameStore((state) => state.game?.wars ?? {});
  // 💡 全国家のデータを取得できるように追加
  const countries = useGameStore((state) => state.game?.countries ?? {});

  const [fronts, setFronts] = useState<FrontInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerCountry || !playerCountry.activeWarIds || playerCountry.activeWarIds.length === 0) {
      setFronts([]);
      return;
    }

    // 💡 敵国のキー("germany"等)から、Rust用の3文字コード("DEU"等)に変換する
    const enemyCountryCodes = playerCountry.activeWarIds.map((warId) => {
      const war = wars[warId];
      const enemyKey = war.attackerId === playerCountry.slug ? war.defenderId : war.attackerId;
      // countries[enemyKey].id が "DEU" などの3文字コード
      return countries[enemyKey]?.id;
    }).filter(Boolean) as string[]; // undefined を除外

    const fetchFronts = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<FrontInfo[]>('get_war_fronts', {
          war: {
            player_id: playerCountry.id, // 自国も3文字コード("FRA"等)が渡っている前提
            enemy_ids: enemyCountryCodes, // 変換済みの ["DEU"] などを渡す
            supply_buffs: {},
            mechanization_rate: playerCountry.mechanizationRate
          }
        });
        setFronts(result);
      } catch (e: any) {
        setError(e.toString());
      } finally {
        setLoading(false);
      }
    };

    fetchFronts();
  }, [playerCountry, wars, countries]);

  if (!playerCountry) return null;

  if (playerCountry.activeWarIds.length === 0) {
    return (
      <div>
        <p>現在、交戦中の国家はありません。</p>
      </div>
    );
  }

  return (
    <div>
      <h3>🌍 進行中の戦線情報（デバッグ用）</h3>

      {loading && <p>戦線データを再計算中...</p>}
      {error && <p style={{ color: 'red' }}>エラーが発生しました: {error}</p>}

      {!loading && !error && fronts.length === 0 && (
        <p>敵国と陸続きの前線が存在しません（海を隔てているか、マップ上に存在しません）。</p>
      )}

      {!loading && fronts.length > 0 && (
        <ul>
          {fronts.map((front) => (
            <li key={front.front_id} style={{ marginBottom: '10px' }}>
              <strong>{front.name.ja}</strong> <small>({front.front_id})</small>
              <ul>
                <li>前線マス数: {front.tile_count} マス</li>
                <li>地域ID: {front.region_id}</li>
                <li>補給状況: {(front.supply * 100).toFixed(1)} %</li>
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}