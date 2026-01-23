'use client';

import React, { Suspense, useState, useEffect } from 'react';
import * as THREE from 'three';
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
    <div className="w-full h-full bg-background rounded-xl overflow-hidden relative border border-border shadow-inner">
      <div className="absolute top-4 left-4 z-10 bg-card/80 backdrop-blur-md p-3 rounded-lg border border-border shadow-lg">
        <h3 className="text-foreground font-bold text-lg">{room.name} 3D Görünüm</h3>
        <p className="text-muted-foreground text-sm">{room.width || '?' }m x {room.depth || '?'}m x {room.height || '?'}m</p>
      </div>

      <Canvas shadows>
        <color attach="background" args={["#0f172a"]} />
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

          {/* Room Floor - Gray Metallic */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[width * 3, depth * 3]} />
            <meshStandardMaterial color="#222222" metalness={0.8} roughness={0.2} />
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

          {/* Grid Helper - Adjusted for Gray Floor */}
          <gridHelper args={[Math.max(width, depth) * 3, 20, "#4f46e5", "#444444"]} position={[0, 0, 0]} />

          {/* Racks */}
          {room.racks && Array.isArray(room.racks) && room.racks.length > 0 ? (
            room.racks.map((rack, index) => {
              // Default to grid layout if no coordinates provided
              let x = rack.coordX ?? (index % 2) * 2;
              let z = rack.coordZ ?? Math.floor(index / 2) * 2.5;
              const y = rack.coordY ?? 0;
              const rotationY = (rack.rotation ?? 0) * (Math.PI / 180);

              // Clamp to room boundaries
              x = Math.max(-5, Math.min(5, x));
              z = Math.max(-4, Math.min(4, z));

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
            })
          ) : (
            // Placeholder racks when none exist
            <>
              <Rack3D
                position={[-2, 0.9, 0]}
                rotation={[0, 0, 0]}
                name="Demo-1"
                type="RACK_42U"
                maxUnits={42}
                isSelected={false}
                onClick={() => {}}
              />
              <Rack3D
                position={[2, 0.9, 0]}
                rotation={[0, 0, 0]}
                name="Demo-2"
                type="RACK_42U"
                maxUnits={42}
                isSelected={false}
                onClick={() => {}}
              />
              <Rack3D
                position={[-2, 0.9, 2.5]}
                rotation={[0, 0, 0]}
                name="Demo-3"
                type="RACK_45U"
                maxUnits={45}
                isSelected={false}
                onClick={() => {}}
              />
            </>
          )}
        </Suspense>
      </Canvas>

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
