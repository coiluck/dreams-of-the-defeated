// ts/components/GameNationalFocus.tsx
// src/ts/components/GameNationalFocus.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import './GameNationalFocus.css';
import { loadFocusTree, NationalFocusNode, NationalFocusTree, FocusEffect, FocusEventEffect } from '../modules/nationalFocus';
import { useGameStore, usePlayerCountry } from '../modules/gameState';
import { SettingState } from '../modules/store';

// グリッド定数
const COL_WIDTH = 110;
const ROW_HEIGHT = 130;
const NODE_W = 90;
const NODE_H = 72;
const PADDING_X = 20;
const PADDING_Y = 20;

type FocusStatus = 'completed' | 'active' | 'available' | 'locked' | 'excluded';

function getNodeX(col: number) {
  return PADDING_X + col * COL_WIDTH + COL_WIDTH / 2;
}
function getNodeY(row: number) {
  return PADDING_Y + row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

// アイコンSVGパス（インラインで定義）
const ICONS: Record<string, string> = {
  star:    'M12 2l2.9 8.9H23l-7.5 5.4 2.9 8.9L12 20 3.6 25.2l2.9-8.9L-1 11h8.1z M12 2l2.4 7.4H22l-7 5 2.7 8.2L12 17.8l-7.7 4.8 2.7-8.2-7-5h7.6z',
  sword:   'M20 4L4 20M8 8l8 8M15 5l4 4-10 10-4-4 10-10z',
  anchor:  'M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 6v14M5 10h14M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6',
  factory: 'M2 20V8l6 4V8l6 4V4h8v16H2zM10 20v-6h4v6',
  gear:    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9.9 4l-1.9-.3a8 8 0 0 0-.9-2.2l1.2-1.5-2.3-2.3-1.5 1.2a8 8 0 0 0-2.2-.9L14.1 4h-3.2l-.3 1.9a8 8 0 0 0-2.2.9L6.9 5.6 4.6 7.9l1.2 1.5a8 8 0 0 0-.9 2.2L3 11.9v3.2l1.9.3a8 8 0 0 0 .9 2.2l-1.2 1.5 2.3 2.3 1.5-1.2a8 8 0 0 0 2.2.9l.3 1.9h3.2l.3-1.9a8 8 0 0 0 2.2-.9l1.5 1.2 2.3-2.3-1.2-1.5a8 8 0 0 0 .9-2.2l1.9-.3v-3.2z',
  flame:   'M12 2s-4 4-4 8a4 4 0 0 0 8 0c0-4-4-8-4-8zm-2 8c0 1.1.9 2 2 2s2-.9 2-2',
  globe:   'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 0v20M2 12h20M4.9 6.4A14.4 14.4 0 0 0 12 8a14.4 14.4 0 0 0 7.1-1.6M4.9 17.6A14.4 14.4 0 0 1 12 16a14.4 14.4 0 0 1 7.1 1.6',
  'arrow-up':   'M12 4l-8 8h5v8h6v-8h5z',
  'arrow-down': 'M12 20l8-8h-5V4H9v8H4z',
};

function FocusIcon({ iconKey, size = 24, color = '#fff3f1' }: { iconKey: string; size?: number; color?: string }) {
  const d = ICONS[iconKey] || ICONS['star'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// ─── ラベル定義 ──────────────────────────────────────────────────────────────

const EFFECT_LABELS: Record<string, { ja: string; en: string }> = {
  politicalPower:    { ja: '政治力',   en: 'Political Power' },
  economicStrength:  { ja: '経済力',   en: 'Economic Strength' },
  militaryEquipment: { ja: '軍事備品', en: 'Military Equipment' },
  legitimacy:        { ja: '正統性',       en: 'Legitimacy' }
};

const MODIFIER_LABELS: Record<string, { ja: string; en: string }> = {
  legitimacy:           { ja: '正統性',       en: 'Legitimacy' },
  mechanizationRate:    { ja: '機械化率',     en: 'Mechanization Rate' },
  attackPower:          { ja: '攻撃力',       en: 'Attack Power' },
  defensePower:         { ja: '防御力',       en: 'Defense Power' },
  culturalUnity:        { ja: '文化的結束',   en: 'Cultural Unity' },
  politicalPowerRate:   { ja: '政治力増加率', en: 'Political Power Rate' },
  economicStrengthRate: { ja: '経済力増加率', en: 'Economic Strength Rate' },
};

// エフェクトをHTML文字列の行配列に変換
function buildEffectLines(effects: FocusEffect, lang: 'ja' | 'en'): string[] {
  const lines: string[] = [];

  const directEntries = (Object.entries(effects) as [string, unknown][])
    .filter(([key, val]) => key !== 'nationalSpirits' && key !== 'events' && typeof val === 'number') as [string, number][];

  if (directEntries.length > 0) {
    const header = lang === 'ja' ? '以下を獲得:' : 'Gain the following:';
    const rows = directEntries.map(([key, val]) => {
      const label = EFFECT_LABELS[key]?.[lang] ?? key;
      const color = val >= 0 ? '#4caf84' : '#e05555';
      const sign = val > 0 ? '+' : '';
      return `${label} <span style="color:${color}">${sign}${val}</span>`;
    });
    lines.push(header + '\n' + rows.join('\n'));
  }

  for (const spirit of effects.nationalSpirits ?? []) {
    const spiritName = spirit.name?.[lang] ?? spirit.id;
    let header: string;
    if (spirit.action === 'add') {
      header = lang === 'ja' ? `国民精神「${spiritName}」を獲得:` : `Gain national spirit "${spiritName}":`;
    } else if (spirit.action === 'modify') {
      header = lang === 'ja' ? `国民精神「${spiritName}」に以下の修正:` : `Modify national spirit "${spiritName}":`;
    } else {
      header = lang === 'ja' ? `国民精神「${spiritName}」を削除` : `Remove national spirit "${spiritName}"`;
    }
    const statRows = spirit.stats
      ? (Object.entries(spirit.stats) as [string, number][]).map(([key, val]) => {
          const label = MODIFIER_LABELS[key]?.[lang] ?? key;
          const color = val >= 0 ? '#4caf84' : '#e05555';
          const sign = val > 0 ? '+' : '';
          return `${label} <span style="color:${color}">${sign}${val}</span>`;
        })
      : [];
    lines.push(header + (statRows.length ? '\n' + statRows.join('\n') : ''));
  }

  for (const ev of effects.events ?? []) {
    lines.push(lang === 'ja' ? `イベント「${ev.name[lang]}」が発生する` : `Triggers event "${ev.name[lang]}"`);
  }

  return lines;
}

function FocusEffects({ effects, lang }: { effects: FocusEffect; lang: 'ja' | 'en' }) {
  const directEntries = (Object.entries(effects) as [string, unknown][])
    .filter(([key, val]) => key !== 'nationalSpirits' && key !== 'events' && typeof val === 'number') as [string, number][];
  const spirits = effects.nationalSpirits ?? [];
  const events = effects.events ?? [];

  return (
    <div className="gnf-detail-effects-section">
      {directEntries.length > 0 && (
        <div className="gnf-detail-effects">
          {directEntries.map(([key, val]) => (
            <span key={key} className={`gnf-effect-tag ${val >= 0 ? 'pos' : 'neg'}`}>
              {EFFECT_LABELS[key]?.[lang] ?? key}: {val > 0 ? '+' : ''}{val}
            </span>
          ))}
        </div>
      )}
      {spirits.map(spirit => (
        <div key={spirit.id} className="gnf-spirit-card">
          <div className="gnf-spirit-header">
            <span className={`gnf-spirit-action gnf-spirit-action--${spirit.action}`}>
              {spirit.action === 'add' ? (lang === 'ja' ? '取得' : 'Add') :
               spirit.action === 'modify' ? (lang === 'ja' ? '修正' : 'Modify') :
               (lang === 'ja' ? '削除' : 'Remove')}
            </span>
            <span className="gnf-spirit-name">{spirit.name?.[lang] ?? spirit.id}</span>
          </div>
          {spirit.stats && (
            <div className="gnf-spirit-stats">
              {(Object.entries(spirit.stats) as [string, number][]).map(([key, val]) => (
                <span key={key} className={`gnf-effect-tag gnf-effect-tag--small ${val >= 0 ? 'pos' : 'neg'}`}>
                  {MODIFIER_LABELS[key]?.[lang] ?? key}: {val > 0 ? '+' : ''}{val}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {events.map(ev => (
        <div key={ev.id} className="gnf-spirit-card gnf-event-card">
          <div className="gnf-spirit-header">
            <span className="gnf-spirit-action gnf-spirit-action--event">
              {lang === 'ja' ? 'イベント' : 'Event'}
            </span>
            <span className="gnf-spirit-name">{ev.name[lang]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function GameNationalFocus() {
  const game = useGameStore(s => s.game);
  const playerCountry = usePlayerCountry();
  const setNationalFocus = useGameStore(s => s.setNationalFocus);

  const [tree, setTree] = useState<NationalFocusTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<NationalFocusNode | null>(null);
  const [tooltip, setTooltip] = useState<{ node: NationalFocusNode; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // ドラッグ用
  const isDragging = useRef(false);
  const didDrag = useRef(false); // 3px以上動いたら「ドラッグ」とみなしてクリックを抑制
  const dragOrigin = useRef<{
    mouseX: number;
    mouseY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null);
  const [tooltipTop, setTooltipTop] = useState<number | null>(null);

  const tooltipRef = useCallback((node: HTMLDivElement | null) => {
    if (node && tooltip) {
      const tooltipWidth = node.offsetWidth;
      const tooltipHeight = node.offsetHeight;
      const half = tooltipWidth / 2;
      const margin = 8;
      const clampedLeft = Math.min(Math.max(tooltip.x, half + margin), window.innerWidth - half - margin);
      setTooltipLeft(clampedLeft);
      const baseTop = tooltip.y + NODE_H / 2 + 8;
      setTooltipTop(Math.max(margin, Math.min(baseTop, window.innerHeight - tooltipHeight - margin)));
    }
  }, [tooltip]);

  const lang = SettingState.language as 'ja' | 'en';

  useEffect(() => {
    if (!playerCountry) return;
    setLoading(true);
    loadFocusTree(playerCountry.slug).then(data => {
      setTree(data);
      setLoading(false);
    });
  }, [playerCountry?.slug]);

  // ─── ドラッグパン: mousedown ────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 左ボタンのみ
    const el = scrollAreaRef.current;
    if (!el) return;
    isDragging.current = true;
    didDrag.current = false;
    dragOrigin.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    e.preventDefault(); // テキスト選択を防ぐ
  }, []);

  // ─── ドラッグパン: mousemove / mouseup (window にバインド) ──────────────
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dragOrigin.current || !scrollAreaRef.current) return;
      const dx = e.clientX - dragOrigin.current.mouseX;
      const dy = e.clientY - dragOrigin.current.mouseY;
      // 3px を超えたら正式にドラッグ開始
      if (!didDrag.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        didDrag.current = true;
      }
      if (didDrag.current) {
        scrollAreaRef.current.scrollLeft = dragOrigin.current.scrollLeft - dx;
        scrollAreaRef.current.scrollTop  = dragOrigin.current.scrollTop  - dy;
        // ドラッグ中はツールチップを消す
        setTooltip(null);
        setTooltipLeft(null);
        setTooltipTop(null);
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
      dragOrigin.current = null;
      // didDrag は次の mousedown まで保持しておき、click イベントで参照する
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const getFocusStatus = useCallback((focus: NationalFocusNode): FocusStatus => {
    if (!playerCountry || !game) return 'locked';
    const completedIds = playerCountry.completedFocusIds as string[];
    const activeId = playerCountry.activeFocusId as string | null;
    if (completedIds.includes(focus.id)) return 'completed';
    if (activeId === focus.id) return 'active';
    if (focus.mutuallyExclusive.some(id => completedIds.includes(id) || id === activeId)) return 'excluded';
    const allMet = focus.prerequisites.every(id => completedIds.includes(id));
    const anyMet = !focus.prerequisitesAny?.length || focus.prerequisitesAny.some(id => completedIds.includes(id));
    return allMet && anyMet ? 'available' : 'locked';
  }, [playerCountry, game]);

  const handleNodeClick = (focus: NationalFocusNode) => {
    // ドラッグ操作だった場合はクリックを無視
    if (didDrag.current) return;
    const status = getFocusStatus(focus);
    if (status === 'available' && playerCountry) {
      setSelectedNode(prev => prev?.id === focus.id ? null : focus);
    } else {
      setSelectedNode(null);
    }
  };

  const handleStartFocus = () => {
    if (!selectedNode || !playerCountry) return;
    setNationalFocus(playerCountry.id, selectedNode.id as any);
    setSelectedNode(null);
  };

  if (loading) return <div className="gnf-loading">Loading...</div>;
  if (!tree)   return <div className="gnf-loading">— Focus tree not available —</div>;

  const maxCol = Math.max(...tree.focuses.map(f => f.col));
  const maxRow = Math.max(...tree.focuses.map(f => f.row));
  const svgWidth  = PADDING_X * 2 + (maxCol + 1) * COL_WIDTH;
  const svgHeight = PADDING_Y * 2 + (maxRow + 1) * ROW_HEIGHT;

  const connections: { from: NationalFocusNode; to: NationalFocusNode; type: 'prereq' | 'prereqAny' | 'exclusive' }[] = [];
  const seenExclusive = new Set<string>();

  tree.focuses.forEach(focus => {
    (focus.prerequisites || []).forEach(preId => {
      const pre = tree.focuses.find(f => f.id === preId);
      if (pre) connections.push({ from: pre, to: focus, type: 'prereq' });
    });
    (focus.prerequisitesAny || []).forEach(preId => {
      const pre = tree.focuses.find(f => f.id === preId);
      if (pre) connections.push({ from: pre, to: focus, type: 'prereqAny' });
    });
    (focus.mutuallyExclusive || []).forEach(exId => {
      const key = [focus.id, exId].sort().join('|');
      if (!seenExclusive.has(key)) {
        seenExclusive.add(key);
        const ex = tree.focuses.find(f => f.id === exId);
        if (ex) connections.push({ from: focus, to: ex, type: 'exclusive' });
      }
    });
  });

  return (
    <div className="gnf-container" ref={containerRef}>

      {/* ツリー本体 */}
      <div
        className="gnf-scroll-area"
        ref={scrollAreaRef}
        onMouseDown={handleMouseDown}
        style={{ cursor: 'grab' }}
      >
        <div style={{ position: 'relative', width: svgWidth, minHeight: svgHeight }}>

          {/* SVG接続線レイヤー */}
          <svg
            className="gnf-svg-layer"
            width={svgWidth}
            height={svgHeight}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            <defs>
              <marker id="arrow-prereq" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="rgba(200,200,200,0.5)" />
              </marker>
              <marker id="arrow-exclusive" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <circle cx="3" cy="3" r="2.5" fill="rgba(200,60,60,0.7)" />
              </marker>
            </defs>

            {connections.map((conn, i) => {
              const x1 = getNodeX(conn.from.col);
              const y1 = getNodeY(conn.from.row);
              const x2 = getNodeX(conn.to.col);
              const y2 = getNodeY(conn.to.row);

              if (conn.type === 'prereq' || conn.type === 'prereqAny') {
                const midY = (y1 + y2) / 2;
                const path = `M ${x1} ${y1 + NODE_H / 2} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2 - NODE_H / 2}`;
                const fromStatus = getFocusStatus(conn.from);
                const toStatus   = getFocusStatus(conn.to);
                const isActive   = fromStatus === 'completed' || fromStatus === 'active';
                const isDashed   = conn.type === 'prereqAny';
                return (
                  <g key={`conn-${i}`}>
                    <path
                      d={path} fill="none"
                      stroke={isActive ? 'rgba(206,174,68,0.7)' : 'rgba(100,100,100,0.5)'}
                      strokeWidth={isActive ? '2' : '1.5'}
                      strokeDasharray={isDashed ? '6 4' : 'none'}
                      markerEnd={isActive ? 'url(#arrow-prereq)' : undefined}
                    />
                    {isActive && toStatus === 'active' && (
                      <path d={path} fill="none" stroke="rgba(255,215,0,0.8)" strokeWidth="2" strokeDasharray="8 16" className="gnf-animated-line" />
                    )}
                  </g>
                );
              } else {
                const x1e = getNodeX(conn.from.col) + NODE_W / 2;
                const x2e = getNodeX(conn.to.col)   - NODE_W / 2;
                const midX = (x1e + x2e) / 2;
                const y = getNodeY(conn.from.row);
                return (
                  <g key={`conn-${i}`}>
                    <line x1={x1e} y1={y} x2={x2e} y2={y} stroke="rgba(200,60,60,0.6)" strokeWidth="1.5" strokeDasharray="3 3" />
                    <text x={midX} y={y + 5} textAnchor="middle" fill="rgba(200,60,60,0.8)" fontSize="12" fontFamily="Courier New">✕</text>
                  </g>
                );
              }
            })}
          </svg>

          {/* ノード */}
          {tree.focuses.map(focus => {
            const status = getFocusStatus(focus);
            const cx = getNodeX(focus.col);
            const cy = getNodeY(focus.row);
            const isSelected      = selectedNode?.id === focus.id;
            const isPrereqOf      = selectedNode?.prerequisites.includes(focus.id) ?? false;
            const isExclusiveWith = selectedNode?.mutuallyExclusive.includes(focus.id) ?? false;

            return (
              <div
                key={focus.id}
                className={[
                  'gnf-node',
                  `gnf-node--${status}`,
                  isSelected      ? 'gnf-node--selected'          : '',
                  isPrereqOf      ? 'gnf-node--highlight-prereq'  : '',
                  isExclusiveWith ? 'gnf-node--highlight-exclusive': '',
                ].filter(Boolean).join(' ')}
                style={{
                  position: 'absolute',
                  left: cx - NODE_W / 2,
                  top:  cy - NODE_H / 2,
                  width: NODE_W,
                  height: NODE_H,
                }}
                onClick={() => handleNodeClick(focus)}
                onMouseEnter={e => {
                  if (isDragging.current) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTooltip({ node: focus, x: rect.left + rect.width / 2, y: rect.top });
                }}
                onMouseLeave={() => {
                  setTooltip(null);
                  setTooltipLeft(null);
                  setTooltipTop(null);
                }}
              >
                <div className="gnf-node-icon">
                  <FocusIcon
                    iconKey={focus.icon}
                    size={22}
                    color={
                      status === 'completed' ? '#ffd700'
                      : status === 'active'    ? '#ffd700'
                      : status === 'available' ? '#fff3f1'
                      : status === 'excluded'  ? '#992222'
                      : '#555'
                    }
                  />
                </div>
                <div className="gnf-node-name">{focus.name[lang]}</div>
                {status === 'active' && (
                  <div className="gnf-node-progress-bar">
                    <div className="gnf-node-progress-fill" />
                  </div>
                )}
                {status === 'completed' && <div className="gnf-node-check">✓</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 選択時の詳細パネル */}
      {selectedNode && (
        <div className="gnf-detail-panel">
          <div className="gnf-detail-header">
            <FocusIcon iconKey={selectedNode.icon} size={18} color="#ffd700" />
            <span className="gnf-detail-title">{selectedNode.name[lang]}</span>
          </div>
          <p className="gnf-detail-desc">{selectedNode.description[lang]}</p>
          <FocusEffects effects={selectedNode.effects} lang={lang} />
          <button className="gnf-start-button" onClick={handleStartFocus}>
            {lang === 'ja' ? '方針を開始' : 'Start Focus'}
          </button>
        </div>
      )}

      {/* ツールチップ（ホバー時） */}
      {tooltip && !selectedNode && (() => {
        const lines = buildEffectLines(tooltip.node.effects, lang);
        return (
          <div
            ref={tooltipRef}
            className="gnf-tooltip"
            style={{
              position: 'fixed',
              left: tooltipLeft !== null ? tooltipLeft : tooltip.x,
              top:  tooltipTop  !== null ? tooltipTop  : tooltip.y + NODE_H / 2 + 8,
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          >
            <div className="gnf-tooltip-title">{tooltip.node.name[lang]}</div>
            {lines.length > 0 ? (
              <div className="gnf-tooltip-effects">
                {lines.map((block, i) => (
                  <div key={i} className="gnf-tooltip-effect-block">
                    {block.split('\n').map((row, j) => (
                      <div
                        key={j}
                        className={j === 0 ? 'gnf-tooltip-effect-header' : 'gnf-tooltip-effect-row'}
                        dangerouslySetInnerHTML={{ __html: row }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="gnf-tooltip-desc">{tooltip.node.description[lang]}</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}