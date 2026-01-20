'use client';

import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
} from '@react-three/drei';
import { Rack3D } from './Rack3D';

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

  return (
    <div className="w-full h-[600px] bg-[#000022] rounded-xl overflow-hidden relative border border-blue-900 shadow-inner">
      <div className="absolute top-4 left-4 z-10 bg-blue-950/40 backdrop-blur-md p-3 rounded-lg border border-blue-800/50">
        <h3 className="text-white font-bold text-lg">{room.name} 3D Görünüm</h3>
        <p className="text-blue-300 text-sm">{room.width || '?' }m x {room.depth || '?'}m x {room.height || '?'}m</p>
      </div>

      <Canvas 
        shadows={false}
        gl={{ 
          antialias: false,
          alpha: false,
          powerPreference: 'default'
        }}
      >
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[width, height * 2, depth]} fov={50} />
          <OrbitControls 
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 2.1} 
            target={[0, 0, 0]}
            enableDamping={false}
          />

          {/* Lighting - Simplified */}
          <ambientLight intensity={0.9} />
          <directionalLight position={[10, 10, 10]} intensity={0.8} />

          {/* Room Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[width * 2, depth * 2]} />
            <meshStandardMaterial color="#000044" />
          </mesh>

          {/* Grid for reference - Simplified manual grid */}
          {/* <gridHelper args={[Math.max(width, depth) * 2, 20, "#1e3a8a", "#172554"]} position={[0, 0, 0]} /> */}

          {/* Racks */}
          {room.racks && Array.isArray(room.racks) && room.racks.map((rack) => {
            // Default to grid layout if no coordinates provided
            const x = rack.coordX ?? 0;
            const y = rack.coordY ?? 0;
            const z = rack.coordZ ?? 0;
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
              />
            );
          })}
        </Suspense>
      </Canvas>

      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <div className="bg-blue-950/80 backdrop-blur text-white p-4 rounded-xl border border-blue-800 shadow-xl text-xs">
          <p className="font-bold mb-2 text-blue-400 uppercase tracking-widest text-[10px]">Kontroller</p>
          <div className="space-y-1 text-blue-100">
            <p className="flex justify-between gap-4"><span>Sol Tık:</span> <span className="font-bold">Döndür</span></p>
            <p className="flex justify-between gap-4"><span>Sağ Tık:</span> <span className="font-bold">Kaydır</span></p>
            <p className="flex justify-between gap-4"><span>Tekerlek:</span> <span className="font-bold">Yakınlaştır</span></p>
            <p className="flex justify-between gap-4 pt-1 border-t border-blue-800"><span>Kabinet:</span> <span className="font-bold">Seç</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
