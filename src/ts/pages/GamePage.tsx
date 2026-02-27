// src/ts/pages/GamePage.tsx
import { useState } from "react";
import MapCanvas from "../components/Map";
import TopBar from "../components/TopBar";
import GameMenu from "../components/GameMenu";

export default function GamePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div>
      <TopBar onMenuOpen={() => setIsMenuOpen(true)} />
      <MapCanvas />
      {isMenuOpen && (
        <GameMenu onClose={() => setIsMenuOpen(false)} />
      )}
    </div>
  );
}