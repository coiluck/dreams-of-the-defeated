// ts/App.tsx
// App.tsx
import { Routes, Route, useNavigate } from "react-router-dom";
import LogoPage from "./pages/LogoPage";
import StartLayout from "./layouts/StartLayout";
import TopPage from "./pages/TopPage";
import NewGamePage from "./pages/NewGamePage";
import OptionsPage from "./pages/OptionsPage";
import GamePage from "./pages/GamePage";
import LoadPage from "./pages/LoadPage";

function App() {
  const navigate = useNavigate();
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<LogoPage />} />
        <Route element={<StartLayout />}>
          <Route path="/top" element={<TopPage />} />
          <Route path="/newgame" element={<NewGamePage />} />
          <Route path="/load" element={<LoadPage mode="top-menu" onBack={() => {navigate('/top')}} />} />
          <Route path="/options" element={<OptionsPage />} />
        </Route>
        <Route path="/game" element={<GamePage />} />
      </Routes>
      {/* ボタン用のフィルター */}
      <svg style={{ width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <filter id="button-grunge-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

export default App;