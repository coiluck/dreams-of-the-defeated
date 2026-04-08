// ts/pages/LogoPage.tsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/LogoPage.css";

function LogoPage() {
  const navigate = useNavigate(); // 移動するための関数ゲット
  const [showText, setShowText] = useState(false);

  // 定数定義などはそのまま...
  const textTop = "KOKONE";
  const textBottom = "Project";
  const animationDelay = 0.07;

  const animationType = useMemo(() => {
    const logoAnimationArray = ['bounce', 'scale', 'jump'];
    return logoAnimationArray[Math.floor(Math.random() * logoAnimationArray.length)];
  }, []);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      setShowText(true);

      const totalAnimationTimeSec =
        (textTop.length * animationDelay + 0.2) +
        (textBottom.length - 1) * animationDelay +
        0.6;
      const totalWaitTimeMs = (totalAnimationTimeSec * 1000) + 500;

      // アニメーション完了後の処理
      const navTimer = setTimeout(() => {
        // ここで遷移
        navigate("/top");
      }, totalWaitTimeMs);

      return () => clearTimeout(navTimer);
    }, 1000);

    return () => clearTimeout(startTimer);
  }, [navigate, animationType, textTop.length, textBottom.length]);

  // 表示部分
  const renderAnimatedText = (text: string, delayStart: number) => {
    if (!showText) return null;
    return text.split('').map((char, index) => {
      const delay = (delayStart + index * animationDelay).toFixed(1);
      return (
        <span key={index} className={`animate-${animationType}`} style={{ animationDelay: `${delay}s` }}>
          {char}
        </span>
      );
    });
  };

  return (
    <div className="page">
      <div className="logo-container">
        <div className="logo-image-container">
          <img
            src="/assets/images/LogoPage/logo.svg"
            className={`logo-image ${showText ? "fade-in" : ""}`}
            style={{ opacity: showText ? undefined : 0 }}
          />
        </div>
        <div className="logo-text-container">
          <p id="logo-text-top">{renderAnimatedText(textTop, 0)}</p>
          <p id="logo-text-bottom">{renderAnimatedText(textBottom, textTop.length * animationDelay + 0.15)}</p>
        </div>
      </div>
    </div>
  );
}

export default LogoPage;