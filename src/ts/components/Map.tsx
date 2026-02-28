import React, { useEffect, useRef, useState } from 'react';

// 定数
const POINT_SIZE = 4;
const BYTES_PER_POINT = 6;
const GRID_WIDTH = 720;
const GRID_HEIGHT = 492;

const MAP_WIDTH = GRID_WIDTH * POINT_SIZE;
const MAP_HEIGHT = GRID_HEIGHT * POINT_SIZE;

interface MapMeta {
  id_map: { [key: number]: string };
  colors: { [key: string]: string };
}

interface PointData {
  x: number;
  y: number;
  ownerId: number;
  occupyId: number;
}

interface MapProps {
  onLoadComplete: () => void;
}

const MapCanvas: React.FC<MapProps> = ({ onLoadComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // データ類
  const pointsRef = useRef<PointData[]>([]);
  const metaRef = useRef<MapMeta | null>(null);

  // 画像リソース
  const paperImageRef = useRef<HTMLImageElement | null>(null);

  // 【高速化の鍵】事前レンダリング用のCanvas
  // 毎回計算するのではなく、これに一度だけ描画して、あとはスタンプのように使い回す
  const landTerrainCanvasRef = useRef<HTMLCanvasElement | null>(null); // 地形用
  const countriesCanvasRef = useRef<HTMLCanvasElement | null>(null);   // 国の色塗り用

  const [resourcesLoaded, setResourcesLoaded] = useState(false);

  // ビューポート状態
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 1. データと画像のロード＆事前加工
  useEffect(() => {
    const loadResources = async () => {
      try {
        const [metaRes, binRes, paperImg, terrainImg] = await Promise.all([
          fetch('/assets/map/map_meta.json'),
          fetch('/assets/map/map_data.bin'),
          loadImage('/assets/images/Map/paper.jpg'),
          loadImage('/assets/images/Map/terrain.png')
        ]);

        const meta = await metaRes.json();
        metaRef.current = meta;

        const buffer = await binRes.arrayBuffer();
        const dataView = new DataView(buffer);
        const tempPoints: PointData[] = [];
        const count = buffer.byteLength / BYTES_PER_POINT;

        // 【チャンク処理の準備】
        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
        const CHUNK_SIZE = 3000; // 1回で処理するデータ数

        // --- A. バイナリデータのパース（チャンク処理） ---
        for (let i = 0; i < count; i += CHUNK_SIZE) {
          const end = Math.min(i + CHUNK_SIZE, count);
          for (let j = i; j < end; j++) {
            const off = j * BYTES_PER_POINT;
            tempPoints.push({
              x: dataView.getUint16(off, true),
              y: dataView.getUint16(off + 2, true),
              ownerId: dataView.getUint8(off + 4),
              occupyId: dataView.getUint8(off + 5),
            });
          }
          // メインスレッドを解放して画面を更新
          await yieldToMain();
        }

        pointsRef.current = tempPoints;
        paperImageRef.current = paperImg;

        // ----------------------------------------------------
        // 事前レンダリング処理
        // ----------------------------------------------------
        const terrainCanvas = document.createElement('canvas');
        terrainCanvas.width = MAP_WIDTH;
        terrainCanvas.height = MAP_HEIGHT;
        const tCtx = terrainCanvas.getContext('2d');

        const countriesCanvas = document.createElement('canvas');
        countriesCanvas.width = MAP_WIDTH;
        countriesCanvas.height = MAP_HEIGHT;
        const cCtx = countriesCanvas.getContext('2d');

        if (tCtx && cCtx) {
          // --- B. 国の色塗り・マスク処理（チャンク処理） ---
          for (let i = 0; i < tempPoints.length; i += CHUNK_SIZE) {
            const end = Math.min(i + CHUNK_SIZE, tempPoints.length);
            for (let j = i; j < end; j++) {
              const p = tempPoints[j];
              if (p.occupyId !== 0) { // 海以外
                const drawX = p.x * POINT_SIZE;
                const drawY = p.y * POINT_SIZE;

                // 地形用マスク
                tCtx.fillStyle = '#000000';
                tCtx.fillRect(drawX, drawY, POINT_SIZE, POINT_SIZE);

                // 国の色塗り
                const countryCode = meta.id_map[p.occupyId];
                cCtx.fillStyle = meta.colors[countryCode] || '#555';
                cCtx.fillRect(drawX, drawY, POINT_SIZE, POINT_SIZE);
              }
            }
            await yieldToMain();
          }

          // --- 2. 地形画像の合成 ---
          tCtx.globalCompositeOperation = 'source-in';
          tCtx.drawImage(terrainImg, 0, 0, MAP_WIDTH, MAP_HEIGHT);

          // Refに保存
          landTerrainCanvasRef.current = terrainCanvas;
          countriesCanvasRef.current = countriesCanvas;
        }

        setResourcesLoaded(true);
        onLoadComplete();

      } catch (e) {
        console.error("Failed to load resources", e);
      }
    };
    loadResources();
  }, []);

  const loadImage = (src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  };

  const constrainOffsetY = (newOffsetY: number, currentScale: number, canvasHeight: number): number => {
    const scaledMapHeight = MAP_HEIGHT * currentScale;
    if (scaledMapHeight < canvasHeight) return (canvasHeight - scaledMapHeight) / 2;
    const minYi = canvasHeight - scaledMapHeight;
    const maxYi = 0;
    return Math.max(minYi, Math.min(maxYi, newOffsetY));
  };

  // 2. 描画ロジック（ここが劇的に軽くなりました）
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !metaRef.current || !resourcesLoaded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 画面クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0f1e'; // 海の色
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scaledMapWidth = MAP_WIDTH * scale;
    const normalizedOffsetX = ((offset.x % scaledMapWidth) + scaledMapWidth) % scaledMapWidth;
    const numCopies = Math.ceil(canvas.width / scaledMapWidth) + 1;

    ctx.imageSmoothingEnabled = true;

    // ループ描画
    for (let copyIndex = 0; copyIndex < numCopies; copyIndex++) {
      const copyOffsetX = normalizedOffsetX + (copyIndex - 1) * scaledMapWidth;

      ctx.save();
      ctx.translate(copyOffsetX, offset.y);
      ctx.scale(scale, scale);

      // --- Layer 1: 地形画像 ---
      // 画像を1枚描画するだけ（超高速）
      if (landTerrainCanvasRef.current) {
        ctx.drawImage(
            landTerrainCanvasRef.current,
            -1, 0, MAP_WIDTH + 2, MAP_HEIGHT
        );
      }

      // --- Layer 2: 国の色 ---
      // 数万個のRectループをやめ、事前生成した画像を1枚描画するだけ（超高速）
      if (countriesCanvasRef.current) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.8;

        ctx.drawImage(
            countriesCanvasRef.current,
            -1, 0, MAP_WIDTH + 2, MAP_HEIGHT
        );

        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.restore();
    }

    // --- Layer 3: 紙テクスチャ ---
    if (paperImageRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.4;

        // パターン生成は負荷が低いのでここでもOKだが、最適化するならuseEffectで作成可
        // ここではコードの単純さを優先
        const pattern = ctx.createPattern(paperImageRef.current, 'repeat');
        if (pattern) {
            ctx.fillStyle = pattern;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.restore();
    }
  };

  useEffect(() => {
    requestAnimationFrame(draw);
  }, [offset, scale, resourcesLoaded]);

  // イベントハンドラ（変更なし）
  const handleWheel = (e: React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const minScaleY = canvas.height / MAP_HEIGHT;
    const limitMinScale = Math.max(0.1, minScaleY);
    const zoomSensitivity = 0.001;
    const rawNewScale = scale - e.deltaY * zoomSensitivity;
    const newScale = Math.max(limitMinScale, Math.min(10, rawNewScale));
    const worldX = (mouseX - offset.x) / scale;
    const worldY = (mouseY - offset.y) / scale;
    const newOffsetX = mouseX - worldX * newScale;
    let newOffsetY = mouseY - worldY * newScale;
    newOffsetY = constrainOffsetY(newOffsetY, newScale, canvas.height);
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const newOffsetX = e.clientX - dragStart.x;
      const rawNewOffsetY = e.clientY - dragStart.y;
      const constrainedOffsetY = constrainOffsetY(rawNewOffsetY, scale, canvas.height);
      setOffset({ x: newOffsetX, y: constrainedOffsetY });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas || !metaRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const rawWorldX = (clickX - offset.x) / scale;
    let targetGridX = Math.floor(rawWorldX / POINT_SIZE);
    targetGridX = ((targetGridX % GRID_WIDTH) + GRID_WIDTH) % GRID_WIDTH;
    const rawWorldY = (clickY - offset.y) / scale;
    const targetGridY = Math.floor(rawWorldY / POINT_SIZE);

    const hitPoint = pointsRef.current.find(p => p.x === targetGridX && p.y === targetGridY);

    if (hitPoint) {
      const countryCode = metaRef.current.id_map[hitPoint.occupyId];
      const ownerCode = metaRef.current.id_map[hitPoint.ownerId];
      console.log(`Clicked: Grid(${hitPoint.x}, ${hitPoint.y})`);
      console.log(`Owner: ${ownerCode}, Controller: ${countryCode}`);
    } else {
      console.log("Ocean / No Data");
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0f1e' }}>
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', display: 'block' }}
      />
      {/* ビネット効果 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          background: 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6) 100%)',
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8)'
        }}
      />
    </div>
  );
};

export default MapCanvas;