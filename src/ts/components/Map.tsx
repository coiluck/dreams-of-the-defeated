import React, { useEffect, useRef, useState } from 'react';

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

interface MapProps {
  onLoadComplete: () => void;
}

const MapCanvas: React.FC<MapProps> = ({ onLoadComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pointsRef = useRef<PointData[]>([]);
  const metaRef = useRef<MapMeta | null>(null);

  const paperImageRef = useRef<HTMLImageElement | null>(null);
  const landTerrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const countriesCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [resourcesLoaded, setResourcesLoaded] = useState(false);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
        const CHUNK_SIZE = 3000;

        for (let i = 0; i < count; i += CHUNK_SIZE) {
          const end = Math.min(i + CHUNK_SIZE, count);
          for (let j = i; j < end; j++) {
            const off = j * BYTES_PER_POINT;
            tempPoints.push({
              x:        dataView.getUint16(off,     true),
              y:        dataView.getUint16(off + 2, true),
              ownerId:  dataView.getUint8 (off + 4),
              occupyId: dataView.getUint8 (off + 5),
              regionId: dataView.getUint8 (off + 6),
            });
          }
          await yieldToMain();
        }

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
          for (let i = 0; i < tempPoints.length; i += CHUNK_SIZE) {
            const end = Math.min(i + CHUNK_SIZE, tempPoints.length);
            for (let j = i; j < end; j++) {
              const p = tempPoints[j];
              if (p.occupyId !== 0) {
                const drawX = p.x * POINT_SIZE;
                const drawY = p.y * POINT_SIZE;

                tCtx.fillStyle = '#000000';
                tCtx.fillRect(drawX, drawY, POINT_SIZE, POINT_SIZE);

                const countryCode = meta.id_map[p.occupyId];
                cCtx.fillStyle = meta.colors[countryCode] || '#555';
                cCtx.fillRect(drawX, drawY, POINT_SIZE, POINT_SIZE);
              }
            }
            await yieldToMain();
          }

          tCtx.globalCompositeOperation = 'source-in';
          tCtx.drawImage(terrainImg, 0, 0, MAP_WIDTH, MAP_HEIGHT);

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
  }, [offset, scale, resourcesLoaded]);

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
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: constrainOffsetY(e.clientY - dragStart.y, scale, canvas.height),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas || !metaRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const rawWorldX = (e.clientX - rect.left - offset.x) / scale;
    const rawWorldY = (e.clientY - rect.top  - offset.y) / scale;

    let targetGridX = Math.floor(rawWorldX / POINT_SIZE);
    targetGridX = ((targetGridX % GRID_WIDTH) + GRID_WIDTH) % GRID_WIDTH;
    const targetGridY = Math.floor(rawWorldY / POINT_SIZE);

    const hitPoint = pointsRef.current.find(p => p.x === targetGridX && p.y === targetGridY);

    if (!hitPoint || hitPoint.occupyId === 0) {
      console.log(`Clicked: Grid(${targetGridX}, ${targetGridY}) → Ocean`);
      return;
    }

    const ownerCode  = metaRef.current.id_map[hitPoint.ownerId]  ?? 'Unknown';
    const occupyCode = metaRef.current.id_map[hitPoint.occupyId] ?? 'Unknown';
    console.log(`Clicked: Grid(${hitPoint.x}, ${hitPoint.y})`);
    console.log(`Owner: ${ownerCode}, Controller: ${occupyCode}, Region: ${hitPoint.regionId}`);
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