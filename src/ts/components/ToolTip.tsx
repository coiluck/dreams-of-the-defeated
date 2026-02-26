// src/ts/components/ToolTip.tsx
import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

interface TooltipProps {
  text: string;
  isBelow?: boolean;
  children: ReactNode;
}

export default function Tooltip({ text, isBelow = false, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const rawLeft = rect.left + rect.width / 2;
    const top = isBelow ? rect.bottom : rect.top;

    // 横はみ出しの補正
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 0;
    const half = tooltipWidth / 2;
    const margin = 8; // 端からの余白(px)
    const clampedLeft = Math.min(
      Math.max(rawLeft, half + margin),
      window.innerWidth - half - margin
    );

    setCoords({ top, left: clampedLeft });
  };

  // ツールチップが描画された直後にも位置補正を走らせる
  useEffect(() => {
    if (isVisible) {
      updatePosition();
    }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isVisible, isBelow]);

  const showTooltip = () => {
    updatePosition();
    setIsVisible(true);
  };
  const hideTooltip = () => setIsVisible(false);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onClick={showTooltip}
        className="tooltip-component-trigger"
      >
        {children}
      </div>

      {isVisible && text &&
        createPortal(
          <div
            ref={tooltipRef}
            className={`tooltip-component-container ${isBelow ? 'below' : 'above'}`}
            style={{ top: coords.top, left: coords.left }}
            dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }}
          />,
          document.body
        )}
    </>
  );
}