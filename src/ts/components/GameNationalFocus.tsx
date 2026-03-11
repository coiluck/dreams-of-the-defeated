// ts/components/GameNationalFocus.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import './GameNationalFocus.css';
import {
  loadFocusTree,
  resolveFocusEffect,
  NationalFocusNode,
  NationalFocusTree,
  ResolvedFocusEffect,
  ResolvedSpiritEffect,
  ResolvedEventEffect,
} from '../modules/nationalFocus';
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
  flame:   'M11.1758045,11.5299649 C11.7222481,10.7630248 11.6612694,9.95529555 11.2823626,8.50234466 C10.5329929,5.62882187 10.8313891,4.05382867 13.4147321,2.18916004 L14.6756139,1.27904986 L14.9805807,2.80388386 C15.3046861,4.42441075 15.8369398,5.42670671 17.2035766,7.35464078 C17.2578735,7.43122022 17.2578735,7.43122022 17.3124108,7.50814226 C19.2809754,10.2854144 20,11.9596204 20,15 C20,18.6883517 16.2713564,22 12,22 C7.72840879,22 4,18.6888043 4,15 C4,14.9310531 4.00007066,14.9331427 3.98838852,14.6284506 C3.89803284,12.2718054 4.33380946,10.4273676 6.09706666,8.43586022 C6.46961415,8.0150872 6.8930834,7.61067534 7.36962714,7.22370749 L8.42161802,6.36945926 L8.9276612,7.62657706 C9.30157948,8.55546878 9.73969716,9.28566491 10.2346078,9.82150804 C10.6537848,10.2753538 10.9647401,10.8460665 11.1758045,11.5299649 Z M7.59448531,9.76165711 C6.23711779,11.2947332 5.91440928,12.6606068 5.98692012,14.5518252 C6.00041903,14.9039019 6,14.8915108 6,15 C6,17.5278878 8.78360021,20 12,20 C15.2161368,20 18,17.527472 18,15 C18,12.4582072 17.4317321,11.1350292 15.6807305,8.66469725 C15.6264803,8.58818014 15.6264803,8.58818014 15.5719336,8.51124844 C14.5085442,7.0111098 13.8746802,5.96758691 13.4553336,4.8005211 C12.7704786,5.62117775 12.8107447,6.43738988 13.2176374,7.99765534 C13.9670071,10.8711781 13.6686109,12.4461713 11.0852679,14.31084 L9.61227259,15.3740546 L9.50184911,13.5607848 C9.43129723,12.4022487 9.16906461,11.6155508 8.76539217,11.178492 C8.36656566,10.7466798 8.00646835,10.2411426 7.68355027,9.66278925 C7.65342985,9.69565638 7.62374254,9.72861259 7.59448531,9.76165711 Z',
  globe:   'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 0v20M2 12h20M4.9 6.4A14.4 14.4 0 0 0 12 8a14.4 14.4 0 0 0 7.1-1.6M4.9 17.6A14.4 14.4 0 0 1 12 16a14.4 14.4 0 0 1 7.1 1.6',
  'arrow-up':   'M12 4l-8 8h5v8h6v-8h5z',
  'arrow-down': 'M12 20l8-8h-5V4H9v8H4z',
  shield:       'M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z',
  bolt:         'M13 2L3 14h7v8l11-12h-7L13 2z',
  document:     'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z',
  cross:        'M19 10h-5V5h-4v5H5v4h5v5h4v-5h5v-4z',
  flag:         'M5 21V4h9l1 2h6v10h-8l-1-2H7v7H5z',
  crown:        'M5 16h14l1-10-4 4-4-6-4 6-4-4 1 10zM5 18h14v2H5v-2z',
};

function FocusIcon({ iconKey, size = 24, color = '#fff3f1' }: { iconKey: string; size?: number; color?: string }) {
  const d = ICONS[iconKey] || ICONS['star'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// 翻訳用ラベル
const LABELS: Record<string, { ja: string; en: string }> = {
  // 基本リソース
  politicalPower:    { ja: '政治力',    en: 'Political Power' },
  economicStrength:  { ja: '経済力',    en: 'Economic Strength' },
  militaryEquipment: { ja: '軍事備品',  en: 'Military Equipment' },
  deployedMilitary:  { ja: '展開兵力',  en: 'Deployed Forces' },
  // NF効果のパラメータ
  legitimacy:           { ja: '正統性',       en: 'Legitimacy' },
  mechanizationRate:    { ja: '機械化率',     en: 'Mechanization Rate' },
  attackPower:          { ja: '攻撃力',       en: 'Attack Power' },
  defensePower:         { ja: '防御力',       en: 'Defense Power' },
  culturalUnity:        { ja: '文化的統合度',   en: 'Cultural Unity' },
  politicalPowerRate:   { ja: '政治力増加率', en: 'Political Power Rate' },
  economicStrengthRate: { ja: '経済力増加率', en: 'Economic Strength Rate' },
};

// エフェクトをHTML文字列の行配列に変換
function buildEffectLines(effects: ResolvedFocusEffect, lang: 'ja' | 'en'): string[] {
  const lines: string[] = [];

  // 直接追加
  const directEntries = (Object.entries(effects) as [string, unknown][])
    .filter(([key, val]) => key !== 'nationalSpirits' && key !== 'events' && typeof val === 'number') as [string, number][];

  if (directEntries.length > 0) {
    const header = lang === 'ja' ? '以下を獲得:' : 'Gain the following:';
    const rows = directEntries.map(([key, val]) => {
      const label = LABELS[key]?.[lang] ?? key;
      const color = val >= 0 ? '#4caf84' : '#e05555';
      const sign = val > 0 ? '+' : '';
      return `${label} <span style="color:${color}">${sign}${val}</span>`;
    });
    lines.push(header + '\n' + rows.join('\n'));
  }

  // 国民精神
  for (const spirit of effects.nationalSpirits ?? []) {
    let header: string;
    if (spirit.action === 'add') {
      header = lang === 'ja' ? `国民精神「${spirit.name[lang]}」を獲得:` : `Gain national spirit "${spirit.name[lang]}":`;
    } else if (spirit.action === 'modify') {
      header = lang === 'ja' ? `国民精神「${spirit.name[lang]}」に以下の修正:` : `Modify national spirit "${spirit.name[lang]}":`;
    } else {
      header = lang === 'ja' ? `国民精神「${spirit.name[lang]}」を削除` : `Remove national spirit "${spirit.name[lang]}"`;
    }

    const statRows = Object.entries(spirit.action === 'modify' ? (spirit.modifyStats ?? {}) : spirit.stats).map(([key, val]) => {
      const label = LABELS[key]?.[lang] ?? key;
      const color = val >= 0 ? '#4caf84' : '#e05555';
      const sign = val > 0 ? '+' : '';
      return `${label} <span style="color:${color}">${sign}${val}</span>`;
    });
    lines.push(header + (statRows.length ? '\n' + statRows.join('\n') : ''));
  }

  // イベント
  for (const ev of effects.events ?? []) {
    lines.push(lang === 'ja' ? `イベント「${ev.title[lang]}」が発生する` : `Triggers event "${ev.title[lang]}"`);
  }

  return lines;
}

function FocusEffects({ effects, lang }: { effects: ResolvedFocusEffect; lang: 'ja' | 'en' }) {
  const directEntries = (Object.entries(effects) as [string, unknown][])
    .filter(([key, val]) => key !== 'nationalSpirits' && key !== 'events' && typeof val === 'number') as [string, number][];

  return (
    <div className="gnf-detail-effects-section">
      {directEntries.length > 0 && (
        <div className="gnf-detail-effects">
          {directEntries.map(([key, val]) => (
            <span key={key} className={`gnf-effect-tag ${val >= 0 ? 'pos' : 'neg'}`}>
              {LABELS[key]?.[lang] ?? key}: {val > 0 ? '+' : ''}{val}
            </span>
          ))}
        </div>
      )}
      {effects.nationalSpirits.map((spirit: ResolvedSpiritEffect) => (
        <div key={spirit.id} className="gnf-spirit-card">
          <div className="gnf-spirit-header">
            <span className={`gnf-spirit-action gnf-spirit-action--${spirit.action}`}>
              {spirit.action === 'add'    ? (lang === 'ja' ? '取得: ' : 'Add: ')    :
               spirit.action === 'modify' ? (lang === 'ja' ? '修正: ' : 'Modify: ') :
                                            (lang === 'ja' ? '削除: ' : 'Remove: ')}
            </span>
            <span className="gnf-spirit-name">{spirit.name[lang]}</span>
          </div>
          {spirit.description[lang] && (
            <p className="gnf-spirit-description">{spirit.description[lang]}</p>
          )}
          {Object.keys(spirit.action === 'modify' ? (spirit.modifyStats ?? {}) : spirit.stats).length > 0 && (
            <div className="gnf-spirit-stats">
              {(Object.entries(spirit.action === 'modify' ? (spirit.modifyStats ?? {}) : spirit.stats) as [string, number][]).map(([key, val]) => (
                <span key={key} className={`gnf-effect-tag gnf-effect-tag--small ${val >= 0 ? 'pos' : 'neg'}`}>
                  {LABELS[key]?.[lang] ?? key}: {val > 0 ? '+' : ''}{val}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {effects.events.map((ev: ResolvedEventEffect) => (
        <div key={ev.id} className="gnf-spirit-card gnf-event-card">
          <div className="gnf-spirit-header">
            <span className="gnf-spirit-action gnf-spirit-action--event">
              {lang === 'ja' ? 'イベント' : 'Event'}
            </span>
            <span>: </span>
            <span className="gnf-spirit-name">{ev.title[lang]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// main
export default function GameNationalFocus() {
  const game = useGameStore(s => s.game);
  const playerCountry = usePlayerCountry();
  const setNationalFocus = useGameStore(s => s.setNationalFocus);

  const [tree, setTree] = useState<NationalFocusTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<NationalFocusNode | null>(null);
  const [selectedResolved, setSelectedResolved] = useState<ResolvedFocusEffect | null>(null);
  const [tooltip, setTooltip] = useState<{ node: NationalFocusNode; resolved: ResolvedFocusEffect; x: number; y: number } | null>(null);
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
  const resolvedCache = useRef<Record<string, ResolvedFocusEffect>>({});

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

  const getResolved = useCallback(async (focus: NationalFocusNode): Promise<ResolvedFocusEffect> => {
    if (resolvedCache.current[focus.id]) return resolvedCache.current[focus.id];
    const resolved = await resolveFocusEffect(focus.effects);
    resolvedCache.current[focus.id] = resolved;
    return resolved;
  }, []);

  const handleNodeClick = async (focus: NationalFocusNode) => {
    if (didDrag.current) return;
    if (playerCountry) {
      if (selectedNode?.id === focus.id) {
        setSelectedNode(null);
        setSelectedResolved(null);
      } else {
        const resolved = await getResolved(focus);
        setSelectedNode(focus);
        setSelectedResolved(resolved);
      }
    } else {
      setSelectedNode(null);
      setSelectedResolved(null);
    }
  };

  const handleMouseEnter = async (focus: NationalFocusNode, e: React.MouseEvent) => {
    if (isDragging.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const resolved = await getResolved(focus);
    setTooltip({ node: focus, resolved, x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (didDrag.current) return;
    const target = e.target as HTMLElement;
    // クリックされた要素がノードでない場合のみ選択解除
    if (!target.closest('.gnf-node')) {
      setSelectedNode(null);
      setSelectedResolved(null);
    }
  }, []);

  const handleStartFocus = () => {
    if (!selectedNode || !playerCountry || !game) return;
    setNationalFocus(game.playerCountryId, selectedNode.id as any);
    setSelectedNode(null);
    setSelectedResolved(null);
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
        onClick={handleBackgroundClick}
        style={{ cursor: 'grab' }}
      >
        <div style={{ position: 'relative', width: svgWidth, minHeight: svgHeight }}>

          {/* 接続線 */}
          <svg
            className="gnf-svg-layer"
            width={svgWidth}
            height={svgHeight}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            <defs>
              <marker id="arrow-prereq" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#777777" />
              </marker>
              <marker id="arrow-prereq-active" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#BFA141" />
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
                      stroke={isActive ? '#A58C38' : '#444444'}
                      strokeWidth={isActive ? '2' : '1.5'}
                      strokeDasharray={isDashed ? '6 4' : 'none'}
                      markerEnd={isActive ? 'url(#arrow-prereq-active)' : 'url(#arrow-prereq)'}
                    />
                    {isActive && toStatus === 'active' && (
                      <path d={path} fill="none" stroke="#ffd700" strokeWidth="2" strokeDasharray="8 16" className="gnf-animated-line" />
                    )}
                  </g>
                );
              } else {
                const isLeftToRight = x1 <= x2;
                const x1e = isLeftToRight ? x1 + NODE_W / 2 : x1 - NODE_W / 2;
                const x2e = isLeftToRight ? x2 - NODE_W / 2 : x2 + NODE_W / 2;
                const midX = (x1e + x2e) / 2;
                const y = getNodeY(conn.from.row);

                return (
                  <g key={`conn-${i}`}>
                    <line x1={x1e} y1={y} x2={x2e} y2={y} stroke="#962A2A" strokeWidth="1.5" strokeDasharray="3 3" />
                    <text x={midX} y={y + 4} textAnchor="middle" fill="#962A2A" fontSize="12" fontFamily="Courier New">✕</text>
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
                  isExclusiveWith ? 'gnf-node--highlight-exclusive' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  position: 'absolute',
                  left: cx - NODE_W / 2,
                  top:  cy - NODE_H / 2,
                  width: NODE_W,
                  height: NODE_H,
                }}
                onClick={() => handleNodeClick(focus)}
                onMouseEnter={e => handleMouseEnter(focus, e)}
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
      {selectedNode && selectedResolved && (
          <div className="gnf-detail-panel">
            <div className="gnf-detail-header">
              <div className="gnf-detail-header-title">
                <FocusIcon iconKey={selectedNode.icon} size={18} color="#ffd700" />
                <span className="gnf-detail-title">{selectedNode.name[lang]}</span>
              </div>

              {(() => {
                const status = getFocusStatus(selectedNode);
                if (status === 'active') {
                  return <button className="gnf-start-button" disabled>{lang === 'ja' ? '進行中' : 'In Progress'}</button>;
                }
                if (status === 'completed') {
                  return <button className="gnf-start-button" disabled>{lang === 'ja' ? '完了済み' : 'Completed'}</button>;
                }
                if (status === 'available') {
                  return <button className="gnf-start-button" onClick={handleStartFocus}>{lang === 'ja' ? '方針を開始' : 'Start Focus'}</button>;
                }
                // locked, excluded の場合
                return <button className="gnf-start-button" disabled>{lang === 'ja' ? '取得不可' : 'Unavailable'}</button>;
              })()}

            </div>
            <p className="gnf-detail-desc">{selectedNode.description[lang]}</p>

            <FocusEffects effects={selectedResolved} lang={lang} />
          </div>
      )}

      {/* ツールチップ（ホバー時） */}
      {tooltip && !selectedNode && (() => {
        const lines = buildEffectLines(tooltip.resolved, lang);
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