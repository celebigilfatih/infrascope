'use client';

import React, { useRef, useEffect, useState } from 'react';

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
      case 'RACK_42U': return '#1e40af'; // Blue
      case 'RACK_45U': return '#7c3aed'; // Purple
      case 'CUSTOM': return '#059669'; // Green
      default: return '#374151'; // Gray
    }
  };

  const drawFloorPlan = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw data center floor with gradient
    const floorGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    floorGradient.addColorStop(0, '#0a0a1a');
    floorGradient.addColorStop(1, '#000033');
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid floor pattern (perspective grid)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
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
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    setScale(prev => Math.max(20, Math.min(150, prev + delta)));
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-gradient-to-b from-[#000022] to-[#000044] relative overflow-hidden">
      {/* Edit Mode Indicator */}
      {editMode && (
        <div className="absolute top-4 left-4 z-20 bg-yellow-500/90 backdrop-blur-md px-4 py-2 rounded-lg border border-yellow-600 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="text-xl">✏️</span>
            <span className="text-black font-bold text-sm">Düzenleme Modu</span>
          </div>
        </div>
      )}

      {/* Saving Indicator */}
      {saving && (
        <div className="absolute top-20 left-4 z-20 bg-blue-500/90 backdrop-blur-md px-4 py-2 rounded-lg border border-blue-600 shadow-xl">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
            <span className="text-white font-bold text-sm">Kaydediliyor...</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="absolute top-4 left-4 z-10 bg-gradient-to-r from-blue-950/95 to-blue-900/95 backdrop-blur-md p-4 rounded-lg border border-blue-700/50 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-2xl">🏢</span>
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">{room.name}</h3>
            <p className="text-blue-300 text-sm">Data Center Görünümü</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-blue-700/50 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-blue-400">📐</span>
              <span className="text-white">{roomWidth}m × {roomDepth}m</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-blue-400">🖥️</span>
              <span className="text-white">{room.racks?.length || 0} Kabinet</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 bg-blue-950/90 backdrop-blur-md p-3 rounded-lg border border-blue-800/50 space-y-2">
        <button
          onClick={() => setScale(prev => Math.min(150, prev + 10))}
          className="w-full px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          + Yakınlaştır
        </button>
        <button
          onClick={() => setScale(prev => Math.max(20, prev - 10))}
          className="w-full px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          - Uzaklaştır
        </button>
        <button
          onClick={() => {
            const canvasWidth = 1200;
            const canvasHeight = 600;
            const scaleX = (canvasWidth * 0.8) / roomWidth;
            const scaleY = (canvasHeight * 0.8) / roomDepth;
            const newScale = Math.min(scaleX, scaleY);
            const newOffsetX = (canvasWidth - roomWidth * newScale) / 2;
            const newOffsetY = (canvasHeight - roomDepth * newScale) / 2;
            setScale(newScale);
            setOffset({ x: newOffsetX, y: newOffsetY });
          }}
          className="w-full px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-800 text-sm"
        >
          Sıfırla
        </button>
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
        onWheel={handleWheel}
      />

      {/* Rack Details Panel */}
      {selectedRack && (
        <div className="absolute bottom-4 right-4 z-10 bg-blue-950/95 backdrop-blur-md p-4 rounded-xl border border-blue-800 shadow-2xl min-w-[300px]">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h4 className="text-white font-bold text-lg">{selectedRack.name}</h4>
              <p className="text-blue-300 text-xs mt-1">{editMode ? 'Sürükleyerek taşıyın' : 'Salt okunur'}</p>
            </div>
            <button
              onClick={() => setSelectedRack(null)}
              className="text-blue-300 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-300">Tip:</span>
              <span className="text-white font-medium">{selectedRack.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-300">Birim:</span>
              <span className="text-white font-medium">{selectedRack.maxUnits}U</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-300">Pozisyon:</span>
              <span className="text-white font-mono text-xs">
                X: {selectedRack.coordX?.toFixed(1) || '0.0'}m, 
                Z: {selectedRack.coordZ?.toFixed(1) || '0.0'}m
              </span>
            </div>
            {selectedRack.rotation !== null && selectedRack.rotation !== 0 && (
              <div className="flex justify-between">
                <span className="text-blue-300">Dönüş:</span>
                <span className="text-white font-medium">{selectedRack.rotation}°</span>
              </div>
            )}
          </div>
          
          {/* Devices List */}
          <div className="mt-4 pt-4 border-t border-blue-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-blue-300 text-xs font-bold flex items-center gap-1">
                <span>🖥️</span>
                <span>Cihazlar ({rackDevices.length})</span>
              </p>
              {loadingDevices && (
                <div className="animate-spin h-3 w-3 border-2 border-blue-400 border-t-transparent rounded-full"></div>
              )}
            </div>
            
            {rackDevices.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {rackDevices.map((device) => (
                  <div
                    key={device.id}
                    className="bg-blue-900/30 rounded p-2 border border-blue-800/50 hover:border-blue-600/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-white text-xs font-medium">{device.name}</p>
                        <p className="text-blue-400 text-[10px] mt-0.5">{device.type}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            device.status === 'ACTIVE'
                              ? 'bg-green-500/20 text-green-400'
                              : device.status === 'INACTIVE'
                              ? 'bg-gray-500/20 text-gray-400'
                              : device.status === 'MAINTENANCE'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {device.status === 'ACTIVE' ? 'Aktif' :
                           device.status === 'INACTIVE' ? 'Pasif' :
                           device.status === 'MAINTENANCE' ? 'Bakım' : 'Hata'}
                        </span>
                        {device.rackUnit && (
                          <span className="text-blue-300 text-[10px]">
                            {device.rackUnit}U
                          </span>
                        )}
                      </div>
                    </div>
                    {device.ipAddress && (
                      <p className="text-blue-300 text-[10px] mt-1 font-mono">
                        {device.ipAddress}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-blue-400 text-xs italic">Cihaz bulunamadı</p>
            )}
          </div>
          
          {editMode && (
            <div className="mt-4 pt-4 border-t border-blue-800">
              <p className="text-blue-300 text-xs mb-2 font-bold">Döndürme</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => rotateSelectedRack(-90)}
                  className="px-2 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-bold transition-colors"
                  title="90° sola döndür"
                >
                  ↺ 90°
                </button>
                <button
                  onClick={() => rotateSelectedRack(-45)}
                  className="px-2 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-bold transition-colors"
                  title="45° sola döndür"
                >
                  ↺ 45°
                </button>
                <button
                  onClick={() => rotateSelectedRack(45)}
                  className="px-2 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-bold transition-colors"
                  title="45° sağa döndür"
                >
                  ↻ 45°
                </button>
                <button
                  onClick={() => rotateSelectedRack(90)}
                  className="px-2 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-bold transition-colors"
                  title="90° sağa döndür"
                >
                  ↻ 90°
                </button>
              </div>
              <button
                onClick={() => rotateSelectedRack(180)}
                className="w-full mt-2 px-2 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs font-bold transition-colors"
                title="180° döndür"
              >
                ⇄ 180° Çevir
              </button>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="absolute bottom-4 left-4 z-10 bg-blue-950/80 backdrop-blur-md px-4 py-2 rounded-lg border border-blue-800/50">
        <p className="text-blue-200 text-xs">
          {editMode ? (
            <>
              <span className="font-bold text-yellow-400">✏️ Sürükle:</span> Kabineti taşı | 
              <span className="font-bold text-blue-300 ml-2">🔄 Fare Tekerleği:</span> Yakınlaştır/Uzaklaştır
            </>
          ) : (
            <>
              <span className="font-bold text-blue-300">🔄 Fare Tekerleği:</span> Yakınlaştır/Uzaklaştır | 
              <span className="font-bold text-blue-300 ml-2">👆 Sürükle:</span> Hareket ettir
            </>
          )}
        </p>
      </div>
    </div>
  );
}
