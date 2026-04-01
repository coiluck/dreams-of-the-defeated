import React, { useEffect, useRef, useState } from 'react';
import { registerMapUpdateCallback } from '../modules/wars';
import { registerMapLoadCallback, type MapPoint } from '../modules/saveGame';
import { invoke } from "@tauri-apps/api/core";

// 定数
const POINT_SIZE = 4;
const BYTES_PER_POINT = 7; // x:u16, y:u16, owner:u8, occupy:u8, region:u8
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
  regionId: number;
}

interface OccupyChange {
  x: number;
  y: number;
  new_occupy_id: number;
  new_owner_id?: number;
}

interface MapProps {
  onLoadComplete: () => void;
  onCountryClick: (countryCode: string) => void;
}

const MapCanvas: React.FC<MapProps> = ({ onLoadComplete, onCountryClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pointsRef = useRef<PointData[]>([]);
  const metaRef = useRef<MapMeta | null>(null);

  const paperImageRef = useRef<HTMLImageElement | null>(null);
  const landTerrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const countriesCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 再描画トリガー用
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [renderTick, setRenderTick] = useState(0);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  // ドラッグ判定用
  const dragDistanceRef = useRef(0);

  // ── 占領変更の適用 ────────────────────────────────────────────────────────
  // gameState.ts からコールバックとして呼ばれ、
  // pointsRef と countriesCanvas を更新してから再描画をトリガーする。
  const applyOccupyChanges = (changes: OccupyChange[]) => {
    if (!metaRef.current || !countriesCanvasRef.current) return;
    const meta = metaRef.current;
    const cCtx = countriesCanvasRef.current.getContext('2d');
    if (!cCtx) return;

    for (const change of changes) {
      const idx = change.y * GRID_WIDTH + change.x;
      if (pointsRef.current[idx]) {
        pointsRef.current[idx].occupyId = change.new_occupy_id;
        if (change.new_owner_id !== undefined) {
          pointsRef.current[idx].ownerId = change.new_owner_id;
        }
      }

      // countriesCanvas を部分更新
      const drawX = change.x * POINT_SIZE;
      const drawY = change.y * POINT_SIZE;

      if (change.new_occupy_id === 0) {
        cCtx.clearRect(drawX, drawY, POINT_SIZE, POINT_SIZE);
      } else {
        const countryCode = meta.id_map[change.new_occupy_id];
        cCtx.fillStyle = meta.colors[countryCode] || '#555';
        cCtx.fillRect(drawX, drawY, POINT_SIZE, POINT_SIZE);
      }
    }

    // 再描画トリガー
    setRenderTick(t => t + 1);
  };

  // ── Rust の現在状態でキャンバスを全面再描画する ────────────────────────────
  // ロード時・ニューゲーム時など pointsRef が Rust と乖離した後に呼ぶ。
  const syncCanvasFromRust = async (tempPoints: PointData[]) => {
    try {
      // [owner_id, occupy_id, owner_id, occupy_id, ...] のフラットな Uint8Array
      const stateData = await invoke<Uint8Array | number[]>('get_map_state');
      for (let i = 0; i < tempPoints.length; i++) {
        tempPoints[i].ownerId  = stateData[i * 2];
        tempPoints[i].occupyId = stateData[i * 2 + 1];
      }
    } catch (e) {
      console.error("Failed to sync map state from Rust:", e);
    }
  };

  // ── countriesCanvas を pointsRef の現在状態から全面再描画する ────────────
  const rebuildCountriesCanvas = async (
    tempPoints: PointData[],
    meta: MapMeta,
    cCtx: CanvasRenderingContext2D,
  ) => {
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
    const CHUNK_SIZE = 3000;

    cCtx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    for (let i = 0; i < tempPoints.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, tempPoints.length);
      for (let j = i; j < end; j++) {
        const p = tempPoints[j];
        if (p.occupyId !== 0) {
          const countryCode = meta.id_map[p.occupyId];
          cCtx.fillStyle = meta.colors[countryCode] || '#555';
          cCtx.fillRect(p.x * POINT_SIZE, p.y * POINT_SIZE, POINT_SIZE, POINT_SIZE);
        }
      }
      await yieldToMain();
    }
  };

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

        const totalPoints = GRID_WIDTH * GRID_HEIGHT;
        const tempPoints: PointData[] = new Array(totalPoints);

        for (let i = 0; i < totalPoints; i++) {
          const x = i % GRID_WIDTH;
          const y = Math.floor(i / GRID_WIDTH);
          tempPoints[i] = { x, y, ownerId: 0, occupyId: 0, regionId: 0 };
        }

        const count = buffer.byteLength / BYTES_PER_POINT;
        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
        const CHUNK_SIZE = 3000;

        for (let i = 0; i < count; i += CHUNK_SIZE) {
          const end = Math.min(i + CHUNK_SIZE, count);
          for (let j = i; j < end; j++) {
            const off = j * BYTES_PER_POINT;
            const x        = dataView.getUint16(off,     true);
            const y        = dataView.getUint16(off + 2, true);
            const ownerId  = dataView.getUint8 (off + 4);
            const occupyId = dataView.getUint8 (off + 5);
            const regionId = dataView.getUint8 (off + 6);
            const idx = y * GRID_WIDTH + x;
            tempPoints[idx] = { x, y, ownerId, occupyId, regionId };
          }
          await yieldToMain();
        }

        // Rust 側の現在状態（セーブロード済みかもしれない）で上書き
        // owner_id と occupy_id の両方を同期する
        await syncCanvasFromRust(tempPoints);

        pointsRef.current = tempPoints;

        paperImageRef.current = paperImg;

        const terrainCanvas = document.createElement('canvas');
        terrainCanvas.width = MAP_WIDTH;
        terrainCanvas.height = MAP_HEIGHT;
        const tCtx = terrainCanvas.getContext('2d');

        const countriesCanvas = document.createElement('canvas');
        countriesCanvas.width = MAP_WIDTH;
        countriesCanvas.height = MAP_HEIGHT;
        const cCtx = countriesCanvas.getContext('2d');

        if (tCtx && cCtx) {
          // terrainCanvas（地形マスク）は owner_id で描く（地形は変わらない）
          for (let i = 0; i < tempPoints.length; i += CHUNK_SIZE) {
            const end = Math.min(i + CHUNK_SIZE, tempPoints.length);
            for (let j = i; j < end; j++) {
              const p = tempPoints[j];
              if (p.ownerId !== 0) {
                tCtx.fillStyle = '#000000';
                tCtx.fillRect(p.x * POINT_SIZE, p.y * POINT_SIZE, POINT_SIZE, POINT_SIZE);
              }
            }
            await yieldToMain();
          }

          tCtx.globalCompositeOperation = 'source-in';
          tCtx.drawImage(terrainImg, 0, 0, MAP_WIDTH, MAP_HEIGHT);

          landTerrainCanvasRef.current = terrainCanvas;
          countriesCanvasRef.current = countriesCanvas;

          // countriesCanvas は occupy_id ベースで描く
          await rebuildCountriesCanvas(tempPoints, meta, cCtx);
        }

        setResourcesLoaded(true);
        onLoadComplete();

      } catch (e) {
        console.error("Failed to load resources", e);
      }
    };
    loadResources();
  }, []);

  // ── セーブロード後の全面再描画 ────────────────────────────────────────────
  // saveGame.ts の loadGame() から呼ばれる。
  // Rust 側で MapStore が更新済みの状態で map_points（全陸マス）が渡ってくるので、
  // pointsRef と countriesCanvas を一括更新して再描画をトリガーする。
  const applyMapLoad = async (mapPoints: MapPoint[]) => {
    if (!metaRef.current || !countriesCanvasRef.current) return;
    const meta = metaRef.current;
    const cCtx = countriesCanvasRef.current.getContext('2d');
    if (!cCtx) return;

    // pointsRef を更新（owner_id と occupy_id の両方）
    for (const mp of mapPoints) {
      const idx = mp.y * GRID_WIDTH + mp.x;
      if (pointsRef.current[idx]) {
        pointsRef.current[idx].ownerId  = mp.owner_id;
        pointsRef.current[idx].occupyId = mp.occupy_id;
      }
    }

    // countriesCanvas を全面クリアして再描画
    cCtx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
    const CHUNK_SIZE = 3000;
    const pts = pointsRef.current;

    for (let i = 0; i < pts.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, pts.length);
      for (let j = i; j < end; j++) {
        const p = pts[j];
        if (p.occupyId !== 0) {
          const countryCode = meta.id_map[p.occupyId];
          cCtx.fillStyle = meta.colors[countryCode] || '#555';
          cCtx.fillRect(p.x * POINT_SIZE, p.y * POINT_SIZE, POINT_SIZE, POINT_SIZE);
        }
      }
      await yieldToMain();
    }

    setRenderTick(t => t + 1);
  };

  // コールバック登録（ロード完了後に有効化）
  useEffect(() => {
    if (!resourcesLoaded) return;
    registerMapUpdateCallback(applyOccupyChanges);
    registerMapLoadCallback(applyMapLoad);
    return () => {
      registerMapUpdateCallback(() => {});
      registerMapLoadCallback(() => {});
    };
  }, [resourcesLoaded]);

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
    return Math.max(canvasHeight - scaledMapHeight, Math.min(0, newOffsetY));
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !metaRef.current || !resourcesLoaded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scaledMapWidth = MAP_WIDTH * scale;
    const normalizedOffsetX = ((offset.x % scaledMapWidth) + scaledMapWidth) % scaledMapWidth;
    const numCopies = Math.ceil(canvas.width / scaledMapWidth) + 1;

    ctx.imageSmoothingEnabled = true;

    for (let copyIndex = 0; copyIndex < numCopies; copyIndex++) {
      const copyOffsetX = normalizedOffsetX + (copyIndex - 1) * scaledMapWidth;

      ctx.save();
      ctx.translate(copyOffsetX, offset.y);
      ctx.scale(scale, scale);

      if (landTerrainCanvasRef.current) {
        ctx.drawImage(landTerrainCanvasRef.current, -1, 0, MAP_WIDTH + 2, MAP_HEIGHT);
      }

      if (countriesCanvasRef.current) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.8;
        ctx.drawImage(countriesCanvasRef.current, -1, 0, MAP_WIDTH + 2, MAP_HEIGHT);
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.restore();
    }

    if (paperImageRef.current) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.4;
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
  }, [offset, scale, resourcesLoaded, renderTick]);

  const handleWheel = (e: React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const minScaleY = canvas.height / MAP_HEIGHT;
    const limitMinScale = Math.max(0.1, minScaleY);
    const rawNewScale = scale - e.deltaY * 0.001;
    const newScale = Math.max(limitMinScale, Math.min(10, rawNewScale));
    const worldX = (mouseX - offset.x) / scale;
    const worldY = (mouseY - offset.y) / scale;
    const newOffsetX = mouseX - worldX * newScale;
    const newOffsetY = constrainOffsetY(mouseY - worldY * newScale, newScale, canvas.height);
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragDistanceRef.current = 0;
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    dragDistanceRef.current += Math.abs(e.movementX) + Math.abs(e.movementY);
    setOffset({
      x: e.clientX - dragStart.x,
      y: constrainOffsetY(e.clientY - dragStart.y, scale, canvas.height),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = (e: React.MouseEvent) => {
    if (dragDistanceRef.current > 5) return;
    if (isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas || !metaRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const rawWorldX = (e.clientX - rect.left - offset.x) / scale;
    const rawWorldY = (e.clientY - rect.top  - offset.y) / scale;

    let targetGridX = Math.floor(rawWorldX / POINT_SIZE);
    targetGridX = ((targetGridX % GRID_WIDTH) + GRID_WIDTH) % GRID_WIDTH;
    const targetGridY = Math.floor(rawWorldY / POINT_SIZE);

    const idx = targetGridY * GRID_WIDTH + targetGridX;
    const hitPoint = pointsRef.current[idx];

    if (!hitPoint || hitPoint.occupyId === 0) {
      return;
    }

    const countryCode = metaRef.current.id_map[hitPoint.occupyId];
    if (countryCode) {
      onCountryClick(countryCode);
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
      <div
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
          background: 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6) 100%)',
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8)',
        }}
      />
    </div>
  );
};

export default MapCanvas;