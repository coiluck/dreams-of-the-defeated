// ts/App.tsx
// App.tsx
import { Routes, Route } from "react-router-dom";
import LogoPage from "./pages/LogoPage";
import StartLayout from "./layouts/StartLayout";
import TopPage from "./pages/TopPage";
import NewGamePage from "./pages/NewGamePage";
import OptionsPage from "./pages/OptionsPage";

function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<LogoPage />} />
        <Route element={<StartLayout />}>
          <Route path="/top" element={<TopPage />} />
          <Route path="/newgame" element={<NewGamePage />} />
          {/* <Route path="/load" element={<LoadPage />} /> */}
          <Route path="/options" element={<OptionsPage />} />
        </Route>
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