// src/ts/pages/LoadingPage.tsx
import { useState, useEffect, useRef } from "react";
import '../../css/LoadingPage.css';

interface LoadingPageProps {
  isLoaded: boolean;
  onFinish: () => void; // 追加: 演出終了を親に伝える
}

const MESSAGE_LIST = [
  "満州の利権を交渉中...",
  "民族運動を鎮圧中...",
  "帝国陸軍を展開中...",
  "植民地化侵略に抵抗中...",
  "シュルレアリストを粛清中...",
  "シヴァ神の教えを解釈中...",
  "花と手榴弾を補給中...",
  "バグダード鉄道を整備中...",
];

const BACKGROUND_IMAGE_LIST = [
  "/assets/images/LoadingPage/1.jpg",
  "/assets/images/LoadingPage/2.jpg",
  "/assets/images/LoadingPage/3.jpg",
];

export default function LoadingPage({ isLoaded, onFinish }: LoadingPageProps) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const animFrameRef = useRef<number | null>(null);

  const isLoadedRef = useRef(isLoaded);

  const [loadingMessage] = useState(() => {
    const randomIndex = Math.floor(Math.random() * MESSAGE_LIST.length);
    return MESSAGE_LIST[randomIndex];
  });
  const [backgroundImage] = useState(() => {
    const randomIndex = Math.floor(Math.random() * BACKGROUND_IMAGE_LIST.length);
    return BACKGROUND_IMAGE_LIST[randomIndex];
  });

  useEffect(() => { isLoadedRef.current = isLoaded; }, [isLoaded]);

  useEffect(() => {
    const PSEUDO_DURATION_MS = 3000;
    const startTime = performance.now();
    let finished = false;
    let timeoutId: number | null = null;

    const tick = (now: number) => {
      if (isLoadedRef.current) {
        // ロード完了時
        setDisplayProgress(100);

        // 100%になったら0.6秒待ってから親に完了を通知
        if (!finished) {
          finished = true;
          timeoutId = window.setTimeout(onFinish, 600);
        }
        return; // アニメーションループ終了
      }

      const elapsed = now - startTime;

      // 0〜1の割合
      const t = Math.min(1, elapsed / PSEUDO_DURATION_MS);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const pseudo = easeOut * 90;

      setDisplayProgress(Math.floor(pseudo));

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [onFinish]);

  return (
    <div className="loading-page">
      <div className="loading-background">
        <img src={backgroundImage} />
      </div>
      <div className="loading-main-container">
        <div className="loading-message-container">
          <p>{loadingMessage}</p>
        </div>
        <div className="loading-progress-bar-container">
          <div className="loading-progress-bar" style={{ width: `${displayProgress}%` }}></div>
        </div>
      </div>
    </div>
  );
}