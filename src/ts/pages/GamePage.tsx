// src/ts/pages/GamePage.tsx
import { useState, useCallback, useEffect } from "react";
import MapCanvas from "../components/Map";
import TopBar from "../components/TopBar";
import GameMenu from "../components/GameMenu";
import GameActions from "../components/GameActions";
import LoadingPage from "./LoadingPage";
import NextTurn from "../components/NextTurn";
import Event from "../components/Event";
import { useGameStore } from "../modules/gameState";
import CountryPanel from "../components/CountryPanel";
import { bgm } from "../modules/music";
import { SettingState } from "../modules/store";

export default function GamePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [isCountryPanelOpen, setIsCountryPanelOpen] = useState(false);
  const [showGame, setShowGame] = useState(false);

  // BGM再生
  useEffect(() => {
    bgm.setVolume(SettingState.bgmVolume);
    if (SettingState.mainBgm === 'auto') {
      bgm.startAuto();
    } else {
      bgm.startFixed(SettingState.customBgm);
    }
    return () => {
      bgm.stop();
      bgm.fadeOut(1.0);
    };
  }, []);

  // イベント表示待ち
  const pendingEvents = useGameStore((state) => state.game?.pendingEvents || []);

  const declareWar = useGameStore((state) => state.declareWar);
  const game = useGameStore((state) => state.game);

  const handleMapComplete = useCallback(() => {
    setIsMapLoaded(true);
  }, []);

  const handleLoadingFinish = useCallback(() => {
    setShowGame(true);
  }, []);

  const handleCountryClick = useCallback(
    (countryCode: string) => {
      // "Ocean" や null は無視
      if (!countryCode || countryCode === "Ocean") return;
      setIsCountryPanelOpen(true);
      setSelectedCountryId(countryCode);
    },
    []
  );

  const handleCountryPanelClose = useCallback(() => {
    setIsCountryPanelOpen(false);
  }, []);

  // 宣戦布告
  const handleDeclareWar = useCallback(
    (targetId: string) => {
      if (!game) return;
      declareWar(game.playerCountryId, targetId);
    },
    [game, declareWar]
  );

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
        <MapCanvas
          onLoadComplete={handleMapComplete}
          onCountryClick={handleCountryClick}
        />
        <GameActions />
        <NextTurn />
        {pendingEvents.map((eventId) => (
          <Event key={eventId} eventId={eventId} />
        ))}
      </div>

      <CountryPanel
        isOpen={isCountryPanelOpen}
        countryId={selectedCountryId ?? ''}
        onClose={handleCountryPanelClose}
        onDeclareWar={handleDeclareWar}
      />

      {isMenuOpen && (
        <GameMenu onClose={() => setIsMenuOpen(false)} />
      )}
    </div>
  );
}