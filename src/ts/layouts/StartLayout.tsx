// ts/layouts/StartLayout.tsx
import { Outlet } from "react-router-dom";
import "../../css/StartLayout.css";

export default function StartLayout() {
  return (
    <div className="start-layout">
      <img
        src="/src/assets/images/TopPage/background.jpg"
        alt="background"
        className="start-layout-bg-image"
      />

      <video
        className="start-layout-fire-video"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/assets/videos/sparks.mp4" type="video/mp4" />
      </video>

      <audio
        autoPlay
        loop
        id="start-layout-bgm-player"
        src="/src/assets/audio/main_theme.mp3"
      />

      <div className="start-layout-content-layer">
        <Outlet />
      </div>
    </div>
  );
}