'use client';

import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
} from '@react-three/drei';
import { Rack3D } from './Rack3D';

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  rackUnitPosition: number | null;
  vendor?: string | null;
  model?: string | null;
  metadata?: any;
}

interface Rack {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  coordX?: number | null;
  coordY?: number | null;
  coordZ?: number | null;
  rotation?: number | null;
  devices?: Device[];
}

interface Room {
  id: string;
  name: string;
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  racks?: Rack[];
}

interface Room3DProps {
  room: Room;
  onRackClick?: (rackId: string) => void;
}

export function Room3D({ room, onRackClick }: Room3DProps) {
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Catch any rendering errors
  React.useEffect(() => {
    const handler = (event: ErrorEvent) => {
      console.error('3D Room Error:', event.error);
      setError(event.error?.message || 'Unknown WebGL error');
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 font-bold flex-col gap-4 p-8">
        <p className="text-xl">3D Render Hatası</p>
        <p className="text-sm bg-black/40 p-4 rounded font-mono">{error}</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full text-blue-400 font-bold">
        Oda verisi geçersiz.
      </div>
    );
  }

  const width = room.width || 10;
  const depth = room.depth || 10;
  const height = room.height || 3;
  const racks = Array.isArray(room.racks) ? room.racks : [];
  const selectedRack = racks.find((rack) => rack.id === selectedRackId) || null;
  const totalDevices = racks.reduce((sum, rack) => sum + (rack.devices?.length || 0), 0);
  const unpositionedDevices = racks.reduce((sum, rack) => {
    return sum + (rack.devices?.filter((device) => !device.rackUnitPosition).length || 0);
  }, 0);

  return (
    <div className="w-full h-full bg-background rounded-xl overflow-hidden relative border border-border shadow-inner">
      <div className="absolute top-4 left-4 z-10 bg-card/80 backdrop-blur-md p-3 rounded-lg border border-border shadow-lg">
        <h3 className="text-foreground font-bold text-lg">{room.name} 3D Görünüm</h3>
        <p className="text-muted-foreground text-sm">{room.width || '?' }m x {room.depth || '?'}m x {room.height || '?'}m</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-md border border-border bg-background/80 px-2 py-1">{racks.length} kabinet</span>
          <span className="rounded-md border border-border bg-background/80 px-2 py-1">{totalDevices} cihaz</span>
          {unpositionedDevices > 0 && (
            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700">
              {unpositionedDevices} U atanmamış
            </span>
          )}
        </div>
      </div>

      <Canvas shadows>
        <color attach="background" args={["#f3f4f6"]} />
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[width, height * 2, depth]} fov={50} />
          <OrbitControls 
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 2.1} 
            target={[0, 0, 0]}
            enableDamping={true}
            dampingFactor={0.05}
          />

          {/* Lighting - Enhanced */}
          <ambientLight intensity={0.7} />
          <hemisphereLight intensity={0.5} groundColor="#444444" />
          <pointLight position={[width, height, depth]} intensity={0.8} castShadow />
          <directionalLight 
            position={[10, 20, 10]} 
            intensity={1.2} 
            castShadow 
            shadow-mapSize={[1024, 1024]}
          />

          {/* Room Floor - Light Gray */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[width * 3, depth * 3]} />
            <meshStandardMaterial color="#d1d5db" metalness={0.1} roughness={0.5} />
          </mesh>

          {/* Walls */}
          {/* Back Wall */}
          <mesh position={[0, height / 2, -depth / 2]} receiveShadow>
            <boxGeometry args={[width, height, 0.1]} />
            <meshStandardMaterial color="#1e293b" metalness={0.2} roughness={0.8} transparent opacity={0.3} />
          </mesh>
          {/* Left Wall */}
          <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
            <boxGeometry args={[depth, height, 0.1]} />
            <meshStandardMaterial color="#1e293b" metalness={0.2} roughness={0.8} transparent opacity={0.3} />
          </mesh>

          {/* Grid Helper - Adjusted for Light Floor */}
          <gridHelper args={[Math.max(width, depth) * 3, 20, "#9ca3af", "#d1d5db"]} position={[0, 0, 0]} />

          {/* Racks */}
          {racks.length > 0 && (
            (() => {
              // Auto-layout: centered grid, 2 columns, no overlapping
              const COLS = 2;
              const SPACING_X = 1.5; // spacing between column centers (rack width=0.6m + gap)
              const SPACING_Z = 2.0; // spacing between row centers (rack depth=1.0m + gap)
              const totalRows = Math.ceil(racks.length / COLS);
              const gridStartX = -((COLS - 1) * SPACING_X) / 2;
              const gridStartZ = -((totalRows - 1) * SPACING_Z) / 2;

              return racks.map((rack, index) => {
              const col = index % COLS;
              const row = Math.floor(index / COLS);
              const x = rack.coordX ?? (gridStartX + col * SPACING_X);
              const z = rack.coordZ ?? (gridStartZ + row * SPACING_Z);
              const y = rack.coordY ?? 0;
              const rotationY = (rack.rotation ?? 0) * (Math.PI / 180);

              // Calculate height offset (mesh is centered, so we move it up by half height)
              const rackHeightOffset = (rack.maxUnits * 0.04445) / 2;

              return (
                <Rack3D
                  key={rack.id}
                  position={[x, y + rackHeightOffset, z]}
                  rotation={[0, rotationY, 0]}
                  name={rack.name}
                  type={rack.type}
                  maxUnits={rack.maxUnits}
                  isSelected={selectedRackId === rack.id}
                  onClick={() => {
                    setSelectedRackId(rack.id);
                    onRackClick?.(rack.id);
                  }}
                  devices={rack.devices}
                />
              );
            });
            })()
          )}
        </Suspense>
      </Canvas>

      {racks.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="rounded-xl border border-dashed border-border bg-card/85 px-6 py-5 text-center shadow-xl backdrop-blur">
            <p className="font-bold text-foreground">Bu odada kabinet yok</p>
            <p className="mt-1 text-sm text-muted-foreground">Locations ağacından bu odaya kabinet ekleyin.</p>
          </div>
        </div>
      )}

      {selectedRack && (
        <div className="absolute bottom-4 left-4 z-10 w-80 rounded-xl border border-border bg-card/90 p-4 text-card-foreground shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{selectedRack.name}</p>
              <p className="text-xs text-muted-foreground">{selectedRack.maxUnits}U kabinet</p>
            </div>
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
              {selectedRack.devices?.length || 0} cihaz
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/60 p-2">
              <p className="text-muted-foreground">Pozisyonlu</p>
              <p className="text-lg font-bold">{selectedRack.devices?.filter((device) => device.rackUnitPosition).length || 0}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
              <p>U atanmamış</p>
              <p className="text-lg font-bold">{selectedRack.devices?.filter((device) => !device.rackUnitPosition).length || 0}</p>
            </div>
          </div>
          {(selectedRack.devices?.length || 0) > 0 ? (
            <div className="mt-3 max-h-36 space-y-1 overflow-y-auto pr-1">
              {selectedRack.devices!.map((device) => (
                <div key={device.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2 py-1.5 text-xs">
                  <span className="truncate font-medium">{device.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {device.rackUnitPosition ? `${device.rackUnitPosition}U` : 'U atanmamış'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              Bu kabinete cihaz eklenmemiş.
            </p>
          )}
        </div>
      )}

      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <div className="bg-card/90 backdrop-blur text-card-foreground p-4 rounded-xl border border-border shadow-xl text-xs">
          <p className="font-bold mb-2 text-primary uppercase tracking-widest text-[10px]">Kontroller</p>
          <div className="space-y-1">
            <p className="flex justify-between gap-4"><span>Sol Tık:</span> <span className="font-bold">Döndür</span></p>
            <p className="flex justify-between gap-4"><span>Sağ Tık:</span> <span className="font-bold">Kaydır</span></p>
            <p className="flex justify-between gap-4"><span>Tekerlek:</span> <span className="font-bold">Yakınlaştır</span></p>
            <p className="flex justify-between gap-4 pt-1 border-t border-border"><span>Kabinet:</span> <span className="font-bold">Seç</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
