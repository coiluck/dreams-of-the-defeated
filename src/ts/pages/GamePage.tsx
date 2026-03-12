// src/ts/pages/GamePage.tsx
import { useState, useCallback } from "react";
import MapCanvas from "../components/Map";
import TopBar from "../components/TopBar";
import GameMenu from "../components/GameMenu";
import GameActions from "../components/GameActions";
import LoadingPage from "./LoadingPage";
import NextTurn from "../components/NextTurn";
import Event from "../components/Event";
import { useGameStore } from "../modules/gameState";

export default function GamePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Mapのデータ準備が終わったか
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  // LoadingPageの演出が終わり、ゲーム画面を表示してよいか
  const [showGame, setShowGame] = useState(false);
  // イベント表示待ち
  const pendingEvents = useGameStore((state) => state.game?.pendingEvents || []);

  const handleMapComplete = useCallback(() => {
    setIsMapLoaded(true);
  }, []);

  const handleLoadingFinish = useCallback(() => {
    setShowGame(true);
  }, []);

  return (
    <div className="page">
      {/* 完了演出が終わるまで表示 */}
      {!showGame && (
        <LoadingPage
          isLoaded={isMapLoaded}
          onFinish={handleLoadingFinish}
        />
      )}

      {/* 裏でレンダリングを進めておく */}
      <div style={{ visibility: showGame ? 'visible' : 'hidden' }}>
        <TopBar onMenuOpen={() => setIsMenuOpen(true)} />
        <MapCanvas onLoadComplete={handleMapComplete} />
        <GameActions />
        <NextTurn />
        {pendingEvents.map((eventId) => (
          <Event key={eventId} eventId={eventId} />
        ))}
      </div>

      {isMenuOpen && (
        <GameMenu onClose={() => setIsMenuOpen(false)} />
      )}
    </div>
  );
}