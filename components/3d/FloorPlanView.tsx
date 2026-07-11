'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { calculateRackCapacity } from '@/lib/rack-capacity';
import { computeRoomRackPositions, RACK_DEPTH_METERS, RACK_WIDTH_METERS } from '@/lib/room-layout';
import type { LocationRack, LocationRoom } from '@/components/locations/types';

interface FloorPlanViewProps {
  room: LocationRoom;
  onUpdate?: () => void | Promise<void>;
  selectedRackId?: string | null;
  onRackClick?: (rackId: string) => void;
  editMode?: boolean;
}

interface Point { x: number; y: number }

const SNAP_METERS = 0.25;

function footprint(rack: LocationRack) {
  const normalized = (((rack.rotation || 0) % 360) + 360) % 360;
  const rotated = normalized >= 45 && normalized < 135 || normalized >= 225 && normalized < 315;
  return rotated
    ? { width: RACK_DEPTH_METERS, depth: RACK_WIDTH_METERS }
    : { width: RACK_WIDTH_METERS, depth: RACK_DEPTH_METERS };
}

function overlaps(a: { x: number; z: number; width: number; depth: number }, b: { x: number; z: number; width: number; depth: number }) {
  const gap = 0.08;
  return !(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.z + a.depth + gap <= b.z || b.z + b.depth + gap <= a.z);
}

export function FloorPlanView({ room, onUpdate, selectedRackId, onRackClick, editMode = false }: FloorPlanViewProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ rackId: string; startPointer: Point; startPosition: { x: number; z: number } } | null>(null);
  const [racks, setRacks] = useState<LocationRack[]>(() => (room.racks || []).map((rack) => ({ ...rack })));
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 700 });
  const [scale, setScale] = useState(60);
  const [offset, setOffset] = useState<Point>({ x: 80, y: 80 });
  const [panning, setPanning] = useState<{ start: Point; offset: Point } | null>(null);
  const [savingRackId, setSavingRackId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const roomWidth = Math.max(2, room.width || 10);
  const roomDepth = Math.max(2, room.depth || 8);

  useEffect(() => setRacks((room.racks || []).map((rack) => ({ ...rack }))), [room.racks]);

  const fitView = useCallback(() => {
    const nextScale = Math.max(18, Math.min(120, Math.min((canvasSize.width - 100) / roomWidth, (canvasSize.height - 100) / roomDepth)));
    setScale(nextScale);
    setOffset({ x: (canvasSize.width - roomWidth * nextScale) / 2, y: (canvasSize.height - roomDepth * nextScale) / 2 });
  }, [canvasSize, roomDepth, roomWidth]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setCanvasSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { fitView(); }, [fitView]);

  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const positions = useMemo(() => computeRoomRackPositions(racks, roomWidth, roomDepth), [racks, roomDepth, roomWidth]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(canvasSize.width * ratio);
    canvas.height = Math.round(canvasSize.height * ratio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = isDark ? '#07090d' : '#edf0f3';
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const grid = scale * SNAP_METERS;
    context.strokeStyle = isDark ? 'rgba(148,163,184,.12)' : 'rgba(71,85,105,.13)';
    context.lineWidth = 1;
    for (let x = offset.x % grid; x < canvasSize.width; x += grid) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvasSize.height); context.stroke(); }
    for (let y = offset.y % grid; y < canvasSize.height; y += grid) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvasSize.width, y); context.stroke(); }

    context.fillStyle = isDark ? '#11151c' : '#d8dde3';
    context.strokeStyle = isDark ? '#475569' : '#94a3b8';
    context.lineWidth = 2;
    context.fillRect(offset.x, offset.y, roomWidth * scale, roomDepth * scale);
    context.strokeRect(offset.x, offset.y, roomWidth * scale, roomDepth * scale);

    racks.forEach((rack) => {
      const position = positions.get(rack.id)!;
      const size = footprint(rack);
      const x = offset.x + position.x * scale;
      const y = offset.y + position.z * scale;
      const width = size.width * scale;
      const depth = size.depth * scale;
      const selected = rack.id === selectedRackId;
      const capacity = calculateRackCapacity(rack.maxUnits, rack.devices || []);
      const statusColor = rack.operationalStatus === 'OPERATIONAL' ? '#10b981' : rack.operationalStatus === 'MAINTENANCE' ? '#f59e0b' : '#64748b';

      context.fillStyle = isDark ? '#1f2937' : '#334155';
      context.strokeStyle = selected ? '#22c55e' : statusColor;
      context.lineWidth = selected ? 3 : 2;
      context.fillRect(x, y, width, depth);
      context.strokeRect(x, y, width, depth);
      context.fillStyle = statusColor;
      context.fillRect(x + width - 8, y + 4, 4, 4);

      const barWidth = Math.max(0, (width - 8) * capacity.utilization / 100);
      context.fillStyle = capacity.utilization >= 85 ? '#dc2626' : capacity.utilization >= 65 ? '#d97706' : '#059669';
      context.fillRect(x + 4, y + depth - 7, barWidth, 3);

      context.fillStyle = '#ffffff';
      context.font = '600 11px Inter, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(rack.name.length > 14 ? `${rack.name.slice(0, 13)}…` : rack.name, x + width / 2, y + depth / 2 - 5, Math.max(20, width - 8));
      context.font = '10px Inter, sans-serif';
      context.fillStyle = '#cbd5e1';
      context.fillText(`${capacity.usedUnits}/${capacity.totalUnits}U`, x + width / 2, y + depth / 2 + 9);

      if (position.isAutoPositioned) {
        context.fillStyle = '#fbbf24';
        context.beginPath(); context.arc(x + 6, y + 6, 3, 0, Math.PI * 2); context.fill();
      }
    });

    context.fillStyle = isDark ? '#cbd5e1' : '#475569';
    context.font = '12px Inter, sans-serif';
    context.textAlign = 'left';
    context.fillText(`${roomWidth} m`, offset.x, offset.y - 10);
  }, [canvasSize, isDark, offset, positions, racks, roomDepth, roomWidth, scale, selectedRackId]);

  useEffect(() => { draw(); }, [draw]);

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hitRack = (point: Point) => [...racks].reverse().find((rack) => {
    const position = positions.get(rack.id)!;
    const size = footprint(rack);
    const x = offset.x + position.x * scale;
    const y = offset.y + position.z * scale;
    return point.x >= x && point.x <= x + size.width * scale && point.y >= y && point.y <= y + size.depth * scale;
  });

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointer(event);
    const rack = hitRack(point);
    if (rack) {
      onRackClick?.(rack.id);
      if (editMode) {
        const position = positions.get(rack.id)!;
        dragRef.current = { rackId: rack.id, startPointer: point, startPosition: { x: position.x, z: position.z } };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (!editMode) setPanning({ start: point, offset });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointer(event);
    if (dragRef.current) {
      const drag = dragRef.current;
      const rack = racks.find((item) => item.id === drag.rackId)!;
      const size = footprint(rack);
      const rawX = drag.startPosition.x + (point.x - drag.startPointer.x) / scale;
      const rawZ = drag.startPosition.z + (point.y - drag.startPointer.y) / scale;
      const x = Math.max(0, Math.min(roomWidth - size.width, Math.round(rawX / SNAP_METERS) * SNAP_METERS));
      const z = Math.max(0, Math.min(roomDepth - size.depth, Math.round(rawZ / SNAP_METERS) * SNAP_METERS));
      const candidate = { x, z, width: size.width, depth: size.depth };
      const collision = racks.some((other) => {
        if (other.id === rack.id) return false;
        const otherPosition = positions.get(other.id)!;
        const otherSize = footprint(other);
        return overlaps(candidate, { x: otherPosition.x, z: otherPosition.z, width: otherSize.width, depth: otherSize.depth });
      });
      if (!collision) setRacks((current) => current.map((item) => item.id === rack.id ? { ...item, coordX: x, coordZ: z } : item));
    } else if (panning) {
      setOffset({ x: panning.offset.x + point.x - panning.start.x, y: panning.offset.y + point.y - panning.start.y });
    }
  };

  const onPointerUp = async (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(null);
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const rack = racks.find((item) => item.id === drag.rackId);
    if (!rack || (rack.coordX === drag.startPosition.x && rack.coordZ === drag.startPosition.z)) return;
    setSavingRackId(rack.id);
    try {
      const response = await fetch(`/api/racks/${rack.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coordX: rack.coordX, coordZ: rack.coordZ, rotation: rack.rotation || 0 }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || 'Kabinet konumu kaydedilemedi');
      await onUpdate?.();
    } catch (saveError) {
      setRacks((current) => current.map((item) => item.id === drag.rackId ? { ...item, coordX: drag.startPosition.x, coordZ: drag.startPosition.z } : item));
      toast({ title: 'Konum kaydedilemedi', description: saveError instanceof Error ? saveError.message : 'Kabinet eski konumuna alındı.', variant: 'destructive' });
    } finally { setSavingRackId(null); }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); setScale((current) => Math.max(15, Math.min(160, current + (event.deltaY > 0 ? -5 : 5)))); };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1 rounded-md border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((value) => Math.min(160, value + 10))} aria-label="Planı yakınlaştır"><Plus className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((value) => Math.max(15, value - 10))} aria-label="Planı uzaklaştır"><Minus className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fitView} aria-label="Planı ekrana sığdır"><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {editMode && <div className="absolute bottom-3 left-3 z-20 rounded-md border border-primary/30 bg-background/90 px-3 py-2 text-xs font-medium text-primary shadow-sm backdrop-blur">Yerleşim düzenleme açık · 25 cm grid</div>}
      {savingRackId && <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-2 text-xs shadow-sm"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Kaydediliyor</div>}
      <canvas ref={canvasRef} className={editMode ? 'touch-none cursor-crosshair' : 'touch-none cursor-grab active:cursor-grabbing'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} role="img" aria-label={`${room.name} iki boyutlu kabinet yerleşim planı`} />
    </div>
  );
}
