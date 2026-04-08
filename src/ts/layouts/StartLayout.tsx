// ts/layouts/StartLayout.tsx
import { Outlet } from "react-router-dom";
import "../../css/StartLayout.css";
import { bgm } from '../modules/music';
import { useEffect } from 'react';
import { SettingState } from '../modules/store';

export default function StartLayout() {
  useEffect(() => {
    // 画面表示時
    bgm.setVolume(SettingState.bgmVolume);
    bgm.play("The_Final_Sovereign");
    // 画面遷移時
    return () => {
      bgm.fadeOut(1.0);
    };
  }, []);
  return (
    <div className="start-layout">
      <img
        src="/assets/images/TopPage/background.jpg"
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

      <div className="start-layout-content-layer">
        <Outlet />
      </div>
    </div>
  );
}