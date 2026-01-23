'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, RotateCw, FlipVertical2, Loader2, X, Plus } from 'lucide-react';

interface Rack {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  coordX?: number | null;
  coordY?: number | null;
  coordZ?: number | null;
  rotation?: number | null;
}

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  ipAddress?: string | null;
  rackUnit?: number | null;
}

interface Room {
  id: string;
  name: string;
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  racks?: Rack[];
}

interface FloorPlanViewProps {
  room: Room;
  onUpdate?: () => void;
}

export function FloorPlanView({ room, onUpdate }: FloorPlanViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);
  const [rackDevices, setRackDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [hoveredRack, setHoveredRack] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingRack, setIsDraggingRack] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [editMode] = useState(true); // Always in edit mode
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const roomWidth = room.width || 10;
  const roomDepth = room.depth || 8;

  // Dynamic canvas size based on container
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 600 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width, height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  
  // Calculate scale to fit room with 10% padding
  const scaleX = (canvasSize.width * 0.8) / roomWidth;
  const scaleY = (canvasSize.height * 0.8) / roomDepth;
  const initialScale = Math.min(scaleX, scaleY);
  
  const [scale, setScale] = useState(initialScale);
  
  // Center the room on canvas
  const initialOffsetX = (canvasSize.width - roomWidth * initialScale) / 2;
  const initialOffsetY = (canvasSize.height - roomDepth * initialScale) / 2;
  const [offset, setOffset] = useState({ x: initialOffsetX, y: initialOffsetY });

  // Recalculate when canvas size changes
  useEffect(() => {
    const newScaleX = (canvasSize.width * 0.8) / roomWidth;
    const newScaleY = (canvasSize.height * 0.8) / roomDepth;
    const newScale = Math.min(newScaleX, newScaleY);
    setScale(newScale);
    const newOffsetX = (canvasSize.width - roomWidth * newScale) / 2;
    const newOffsetY = (canvasSize.height - roomDepth * newScale) / 2;
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [canvasSize, roomWidth, roomDepth]);

  // Fetch devices when rack is selected
  useEffect(() => {
    if (selectedRack) {
      fetchRackDevices(selectedRack.id);
    } else {
      setRackDevices([]);
    }
  }, [selectedRack]);

  const fetchRackDevices = async (rackId: string) => {
    setLoadingDevices(true);
    try {
      const response = await fetch(`/api/racks/${rackId}/devices`);
      if (response.ok) {
        const devices = await response.json();
        setRackDevices(devices);
      }
    } catch (error) {
      console.error('Failed to fetch rack devices:', error);
    } finally {
      setLoadingDevices(false);
    }
  };

  // Stock cabinet image URLs (we'll use colored rectangles for now, can be replaced with real images)
  const getCabinetColor = (type: string) => {
    switch (type) {
      case 'RACK_42U': return '#3b82f6'; // Theme Primary
      case 'RACK_45U': return '#60a5fa'; // Theme Primary Lighter
      case 'CUSTOM': return '#a855f7'; // Theme Purple
      default: return '#6b7280'; // Muted foreground
    }
  };

  const drawFloorPlan = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background color matching theme
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid floor pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    const gridSize = scale;
    const startX = offset.x % gridSize;
    const startY = offset.y % gridSize;
    
    // Vertical lines
    for (let x = startX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = startY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw room boundary with glow effect
    const roomPixelWidth = roomWidth * scale;
    const roomPixelDepth = roomDepth * scale;
    
    // Glow effect
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(offset.x, offset.y, roomPixelWidth, roomPixelDepth);
    ctx.shadowBlur = 0;

    // Draw racks with 3D isometric effect
    if (room.racks) {
      room.racks.forEach((rack) => {
        const x = offset.x + (rack.coordX || 0) * scale;
        const y = offset.y + (rack.coordZ || 0) * scale;
        const rackWidth = 1.2 * scale;  // Increased from 0.6 to 1.2 (double size)
        const rackDepth = 2.0 * scale;  // Increased from 1.0 to 2.0 (double size)
        const rotation = (rack.rotation || 0) * (Math.PI / 180);

        ctx.save();
        ctx.translate(x + rackWidth / 2, y + rackDepth / 2);
        ctx.rotate(rotation);

        const isSelected = selectedRack?.id === rack.id;
        const isHovered = hoveredRack === rack.id;

        // Draw 3D rack perspective
        // Back face (darker)
        ctx.fillStyle = 'rgba(10, 10, 30, 0.8)';
        ctx.fillRect(-rackWidth / 2 + 4, -rackDepth / 2 + 4, rackWidth - 8, rackDepth - 8);

        // Main rack body with gradient
        const rackGradient = ctx.createLinearGradient(-rackWidth / 2, -rackDepth / 2, -rackWidth / 2, rackDepth / 2);
        const baseColor = getCabinetColor(rack.type);
        rackGradient.addColorStop(0, baseColor);
        rackGradient.addColorStop(1, '#000033');
        ctx.fillStyle = rackGradient;
        ctx.fillRect(-rackWidth / 2, -rackDepth / 2, rackWidth, rackDepth);

        // Server rack front panel (multiple server slots)
        const slotCount = Math.min(rack.maxUnits || 42, 10);
        const slotHeight = (rackDepth - 10) / slotCount;
        
        for (let i = 0; i < slotCount; i++) {
          const slotY = -rackDepth / 2 + 5 + i * slotHeight;
          
          // Slot background
          ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 64, 175, 0.3)' : 'rgba(20, 50, 150, 0.2)';
          ctx.fillRect(-rackWidth / 2 + 3, slotY, rackWidth - 6, slotHeight - 1);
          
          // LED indicators
          ctx.fillStyle = Math.random() > 0.3 ? '#10b981' : '#ef4444';
          ctx.fillRect(-rackWidth / 2 + 6, slotY + 2, 3, 3);
          ctx.fillRect(-rackWidth / 2 + 11, slotY + 2, 3, 3);
        }

        // Rack border with glow on hover/select
        if (isSelected || isHovered) {
          ctx.shadowColor = isSelected ? '#fbbf24' : '#60a5fa';
          ctx.shadowBlur = 15;
        }
        ctx.strokeStyle = isSelected ? '#fbbf24' : isHovered ? '#60a5fa' : '#1e40af';
        ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 2;
        ctx.strokeRect(-rackWidth / 2, -rackDepth / 2, rackWidth, rackDepth);
        ctx.shadowBlur = 0;

        // Text should always be readable (counter-rotate if rack is upside down)
        // Check if rotation is close to 180 degrees (between 135 and 225 degrees)
        const rotationDegrees = (rack.rotation || 0);
        const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
        const needsFlip = normalizedRotation > 90 && normalizedRotation < 270;
        
        if (needsFlip) {
          // Counter-rotate text to keep it readable
          ctx.save();
          ctx.rotate(Math.PI);
        }

        // Rack label with background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(-rackWidth / 2, -rackDepth / 2 - 20, rackWidth, 18);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(12, scale / 8)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rack.name, 0, -rackDepth / 2 - 11);
        
        // Unit count badge
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(-rackWidth / 2, rackDepth / 2, rackWidth, 15);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(10, scale / 10)}px Arial`;
        ctx.fillText(`${rack.maxUnits}U`, 0, rackDepth / 2 + 7);

        if (needsFlip) {
          ctx.restore();
        }

        ctx.restore();
      });
    }

    // Draw data center info overlay
    ctx.fillStyle = 'rgba(0, 0, 50, 0.7)';
    ctx.fillRect(10, 10, 200, 80);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 200, 80);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`${room.name}`, 110, 30);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`Boyut: ${roomWidth}m x ${roomDepth}m`, 110, 50);
    ctx.fillText(`Kabinet: ${room.racks?.length || 0}`, 110, 70);

    // Draw scale indicator with modern style
    ctx.fillStyle = 'rgba(0, 0, 50, 0.7)';
    ctx.fillRect(20, canvas.height - 50, scale + 40, 30);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, canvas.height - 50, scale + 40, 30);
    
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(30, canvas.height - 35, scale, 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('1 metre', 30 + scale / 2, canvas.height - 23);
  };

  useEffect(() => {
    drawFloorPlan();
  }, [room, scale, offset, selectedRack, hoveredRack]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if clicked on a rack
    let clickedRack: Rack | null = null;
    if (room.racks && editMode) {
      for (const rack of room.racks) {
        const x = offset.x + (rack.coordX || 0) * scale;
        const y = offset.y + (rack.coordZ || 0) * scale;
        const width = 1.2 * scale;  // Updated to match new size
        const depth = 2.0 * scale;  // Updated to match new size

        if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + depth) {
          clickedRack = rack;
          break;
        }
      }
    }

    if (clickedRack && editMode) {
      setSelectedRack(clickedRack);
      setIsDraggingRack(true);
      setDragStart({ 
        x: mouseX - (offset.x + (clickedRack.coordX || 0) * scale), 
        y: mouseY - (offset.y + (clickedRack.coordZ || 0) * scale) 
      });
    } else {
      setIsDragging(true);
      setDragStart({ x: mouseX - offset.x, y: mouseY - offset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDraggingRack && selectedRack && editMode) {
      // Drag rack - update position in real-time
      const newX = (mouseX - dragStart.x - offset.x) / scale;
      const newZ = (mouseY - dragStart.y - offset.y) / scale;
      
      // Update the rack temporarily for visual feedback
      if (room.racks) {
        const rackIndex = room.racks.findIndex(r => r.id === selectedRack.id);
        if (rackIndex !== -1) {
          room.racks[rackIndex].coordX = Math.max(0, Math.min(roomWidth - 1.2, newX));  // Updated bounds
          room.racks[rackIndex].coordZ = Math.max(0, Math.min(roomDepth - 2.0, newZ));  // Updated bounds
          drawFloorPlan();
        }
      }
    } else if (isDragging) {
      setOffset({
        x: mouseX - dragStart.x,
        y: mouseY - dragStart.y
      });
    } else {
      // Check hover
      let hovered: string | null = null;
      if (room.racks) {
        for (const rack of room.racks) {
          const x = offset.x + (rack.coordX || 0) * scale;
          const y = offset.y + (rack.coordZ || 0) * scale;
          const width = 1.2 * scale;  // Updated to match new size
          const depth = 2.0 * scale;  // Updated to match new size

          if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + depth) {
            hovered = rack.id;
            break;
          }
        }
      }
      setHoveredRack(hovered);
    }
  };

  const handleMouseUp = async () => {
    if (isDraggingRack && selectedRack && editMode) {
      // Save rack position to database
      await saveRackPosition(selectedRack);
    }
    setIsDragging(false);
    setIsDraggingRack(false);
  };

  const saveRackPosition = async (rack: Rack) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/racks/${rack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordX: rack.coordX,
          coordZ: rack.coordZ,
          rotation: rack.rotation
        })
      });
      if (response.ok && onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to save rack position:', error);
    } finally {
      setSaving(false);
    }
  };

  const rotateSelectedRack = async (degrees: number) => {
    if (!selectedRack) return;
    const newRotation = ((selectedRack.rotation || 0) + degrees) % 360;
    selectedRack.rotation = newRotation;
    drawFloorPlan();
    await saveRackPosition(selectedRack);
  };

  // Handle wheel events with non-passive listener to prevent browser warnings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -5 : 5;
      setScale(prev => Math.max(20, Math.min(150, prev + delta)));
    };

    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheelNative);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-background relative overflow-hidden">
      {/* Edit Mode Indicator */}
      {editMode && (
        <div className="absolute top-4 left-4 z-20 bg-primary/10 backdrop-blur-md px-4 py-2 rounded-lg border border-primary/20 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">✏️</span>
            <span className="text-primary font-bold text-sm">Düzenleme Modu</span>
          </div>
        </div>
      )}

      {/* Saving Indicator */}
      {saving && (
        <div className="absolute top-20 left-4 z-20 bg-primary/20 backdrop-blur-md px-4 py-2 rounded-lg border border-primary/30 shadow-xl">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-foreground font-bold text-sm">Kaydediliyor...</span>
          </div>
        </div>
      )}

      {/* Header Info Overlay */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-card/80 backdrop-blur-md px-6 py-3 rounded-full border border-border shadow-2xl flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-primary">📐</span>
          <span className="text-sm font-medium">{roomWidth}m × {roomDepth}m</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-primary">🖥️</span>
          <span className="text-sm font-medium">{room.racks?.length || 0} Kabinet</span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setScale(prev => Math.min(150, prev + 10))}
          className="rounded-lg shadow-lg"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setScale(prev => Math.max(20, prev - 10))}
          className="rounded-lg shadow-lg"
        >
          <X className="h-4 w-4 rotate-45" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            const canvasWidth = containerRef.current?.clientWidth || 1200;
            const canvasHeight = containerRef.current?.clientHeight || 600;
            const scaleX = (canvasWidth * 0.8) / roomWidth;
            const scaleY = (canvasHeight * 0.8) / roomDepth;
            const newScale = Math.min(scaleX, scaleY);
            const newOffsetX = (canvasWidth - roomWidth * newScale) / 2;
            const newOffsetY = (canvasHeight - roomDepth * newScale) / 2;
            setScale(newScale);
            setOffset({ x: newOffsetX, y: newOffsetY });
          }}
          className="rounded-lg shadow-lg"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className={`w-full h-full ${isDraggingRack && editMode ? 'cursor-grabbing' : isDragging ? 'cursor-move' : hoveredRack && editMode ? 'cursor-grab' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Rack Details Panel with Shadcn UI */}
      {selectedRack && (
        <Card className="absolute bottom-4 right-4 w-96 z-20 bg-card/95 backdrop-blur-md border-border shadow-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">{selectedRack.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {selectedRack.type}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {selectedRack.maxUnits}U
                  </Badge>
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mt-2 -mr-2"
                onClick={() => setSelectedRack(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Position Info */}
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1.5">
                <span className="text-sm text-muted-foreground">Pozisyon X:</span>
                <span className="text-sm font-mono font-medium">
                  {selectedRack.coordX?.toFixed(1) || '0.0'}m
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-sm text-muted-foreground">Pozisyon Z:</span>
                <span className="text-sm font-mono font-medium">
                  {selectedRack.coordZ?.toFixed(1) || '0.0'}m
                </span>
              </div>
              {selectedRack.rotation !== null && selectedRack.rotation !== 0 && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Dönüş:</span>
                  <Badge variant="secondary" className="text-xs">
                    {selectedRack.rotation}°
                  </Badge>
                </div>
              )}
            </div>

            {/* Devices List */}
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  🖥️ Cihazlar
                  <Badge variant="outline" className="text-xs">
                    {rackDevices.length}
                  </Badge>
                </h4>
                {loadingDevices && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>

              {rackDevices.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {rackDevices.map((device) => (
                    <Card key={device.id} className="p-3 hover:border-primary/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{device.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{device.type}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <Badge
                            variant={
                              device.status === 'ACTIVE'
                                ? 'success'
                                : device.status === 'INACTIVE'
                                ? 'outline'
                                : device.status === 'MAINTENANCE'
                                ? 'warning'
                                : 'destructive'
                            }
                            className="text-xs"
                          >
                            {device.status === 'ACTIVE' ? 'Aktif' :
                             device.status === 'INACTIVE' ? 'Pasif' :
                             device.status === 'MAINTENANCE' ? 'Bakım' : 'Hata'}
                          </Badge>
                          {device.rackUnit && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {device.rackUnit}U
                            </span>
                          )}
                        </div>
                      </div>
                      {device.ipAddress && (
                        <p className="text-xs text-muted-foreground font-mono mt-2">
                          {device.ipAddress}
                        </p>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-4">
                  Cihaz bulunamadı
                </p>
              )}
            </div>

            {/* Rotation Controls */}
            {editMode && (
              <div className="space-y-3 pt-3 border-t">
                <h4 className="text-sm font-semibold">Döndürme</h4>
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rotateSelectedRack(-90)}
                    title="90° sola döndür"
                    className="h-9"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rotateSelectedRack(-45)}
                    title="45° sola döndür"
                    className="h-9 text-xs"
                  >
                    ↺ 45°
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rotateSelectedRack(45)}
                    title="45° sağa döndür"
                    className="h-9 text-xs"
                  >
                    ↻ 45°
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rotateSelectedRack(90)}
                    title="90° sağa döndür"
                    className="h-9"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => rotateSelectedRack(180)}
                  title="180° döndür"
                  className="w-full"
                >
                  <FlipVertical2 className="h-4 w-4 mr-2" />
                  180° Çevir
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Help Text with Shadcn Card */}
      <Card className="absolute bottom-4 left-4 z-10 bg-card/80 backdrop-blur-md border-border">
        <CardContent className="p-3">
          <p className="text-sm text-muted-foreground">
            {editMode ? (
              <>
                <span className="font-semibold text-primary">✏️ Sürükle:</span> Kabineti taşı | 
                <span className="font-semibold text-primary ml-2">🔄 Fare Tekerleği:</span> Yakınlaştır/Uzaklaştır
              </>
            ) : (
              <>
                <span className="font-semibold text-primary">🔄 Fare Tekerleği:</span> Yakınlaştır/Uzaklaştır | 
                <span className="font-semibold text-primary ml-2">👆 Sürükle:</span> Hareket ettir
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
