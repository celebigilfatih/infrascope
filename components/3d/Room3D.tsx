'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Rack3D } from './Rack3D';
import { calculateRackCapacity } from '@/lib/rack-capacity';
import { computeRoomRackPositions, RACK_DEPTH_METERS, RACK_WIDTH_METERS } from '@/lib/room-layout';
import type { LocationRack, LocationRoom } from '@/components/locations/types';

export type CameraPreset = 'isometric' | 'front' | 'top';

interface Room3DProps {
  room: LocationRoom;
  selectedRackId?: string | null;
  onRackClick?: (rackId: string) => void;
  visibleRackIds?: Set<string>;
  displayMode?: 'operation' | 'capacity';
  cameraPreset?: CameraPreset;
  cameraRequestKey?: number;
}

function CameraController({ width, depth, height, preset, requestKey, focusedRack }: { width: number; depth: number; height: number; preset: CameraPreset; requestKey: number; focusedRack?: { x: number; z: number; height: number } }) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const maxDimension = Math.max(width, depth);
    if (focusedRack) {
      camera.position.set(focusedRack.x + 2.4, Math.max(2.2, focusedRack.height * 1.2), focusedRack.z + 2.4);
      controls.current?.target.set(focusedRack.x, focusedRack.height / 2, focusedRack.z);
    } else if (preset === 'top') {
      camera.position.set(0, maxDimension * 1.25 + height, 0.01);
      controls.current?.target.set(0, 0, 0);
    } else if (preset === 'front') {
      camera.position.set(0, Math.max(2.2, height * 0.8), depth * 0.9 + maxDimension * 0.65);
      controls.current?.target.set(0, height * 0.35, 0);
    } else {
      camera.position.set(width * 0.8 + 3, Math.max(4, height * 1.8), depth * 0.8 + 3);
      controls.current?.target.set(0, height * 0.25, 0);
    }
    camera.updateProjectionMatrix();
    controls.current?.update();
    invalidate();
  }, [camera, depth, focusedRack, height, invalidate, preset, requestKey, width]);

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.06} minDistance={1.2} maxDistance={Math.max(width, depth) * 3.5} maxPolarAngle={Math.PI / 2.03} onChange={() => invalidate()} />;
}

export function Room3D({ room, selectedRackId, onRackClick, visibleRackIds, displayMode = 'operation', cameraPreset = 'isometric', cameraRequestKey = 0 }: Room3DProps) {
  const [isDark, setIsDark] = useState(false);
  const width = Math.max(2, room.width || 10);
  const depth = Math.max(2, room.depth || 8);
  const height = Math.max(2.2, room.height || 3);
  const racks = room.racks || [];
  const positions = useMemo(() => computeRoomRackPositions(racks, width, depth), [racks, width, depth]);
  const selectedRack = racks.find((rack) => rack.id === selectedRackId);
  const selectedPosition = selectedRack ? positions.get(selectedRack.id) : undefined;
  const focusedRack = selectedRack && selectedPosition ? {
    x: selectedPosition.x + RACK_WIDTH_METERS / 2 - width / 2,
    z: selectedPosition.z + RACK_DEPTH_METERS / 2 - depth / 2,
    height: selectedRack.maxUnits * 0.04445,
  } : undefined;

  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background" role="img" aria-label={`${room.name} üç boyutlu sistem odası görünümü`}>
      <Canvas
        shadows={racks.length <= 60}
        dpr={[1, 1.5]}
        frameloop="demand"
        performance={{ min: 0.5 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[isDark ? '#07090d' : '#edf0f3']} />
        <fog attach="fog" args={[isDark ? '#07090d' : '#edf0f3', Math.max(width, depth) * 1.4, Math.max(width, depth) * 3.4]} />
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault fov={46} near={0.1} far={500} />
          <CameraController width={width} depth={depth} height={height} preset={cameraPreset} requestKey={cameraRequestKey} focusedRack={focusedRack} />
          <ambientLight intensity={isDark ? 0.72 : 0.9} />
          <hemisphereLight intensity={0.55} color={isDark ? '#cbd5e1' : '#ffffff'} groundColor={isDark ? '#111827' : '#9ca3af'} />
          <directionalLight position={[width, height * 2.4, depth]} intensity={1.25} castShadow={racks.length <= 60} shadow-mapSize={[1024, 1024]} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[width, depth]} />
            <meshStandardMaterial color={isDark ? '#11151c' : '#d8dde3'} metalness={0.08} roughness={0.78} />
          </mesh>
          <gridHelper args={[Math.max(width, depth), Math.max(8, Math.round(Math.max(width, depth) * 2)), isDark ? '#334155' : '#94a3b8', isDark ? '#1e293b' : '#cbd5e1']} position={[0, 0.004, 0]} />
          <mesh position={[0, height / 2, -depth / 2]} receiveShadow><boxGeometry args={[width, height, 0.06]} /><meshStandardMaterial color={isDark ? '#1f2937' : '#cbd5e1'} transparent opacity={0.42} /></mesh>
          <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow><boxGeometry args={[depth, height, 0.06]} /><meshStandardMaterial color={isDark ? '#1f2937' : '#cbd5e1'} transparent opacity={0.42} /></mesh>

          {racks.map((rack: LocationRack) => {
            if (visibleRackIds && !visibleRackIds.has(rack.id)) return null;
            const rackPosition = positions.get(rack.id)!;
            const rackHeight = rack.maxUnits * 0.04445;
            const capacity = calculateRackCapacity(rack.maxUnits, rack.devices || []);
            const selected = rack.id === selectedRackId;
            return (
              <Rack3D
                key={rack.id}
                position={[rackPosition.x + RACK_WIDTH_METERS / 2 - width / 2, (rack.coordY || 0) + rackHeight / 2, rackPosition.z + RACK_DEPTH_METERS / 2 - depth / 2]}
                rotation={[0, (rack.rotation || 0) * Math.PI / 180, 0]}
                name={rack.name}
                maxUnits={rack.maxUnits}
                operationalStatus={rack.operationalStatus || 'OPERATIONAL'}
                utilization={capacity.utilization}
                isSelected={selected}
                isAutoPositioned={rackPosition.isAutoPositioned}
                displayMode={displayMode}
                showDeviceDetails={selected}
                devices={rack.devices}
                onClick={() => onRackClick?.(rack.id)}
              />
            );
          })}
        </Suspense>
      </Canvas>

      {racks.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-md border border-dashed border-border bg-background/90 px-6 py-5 text-center shadow-sm"><p className="font-medium">Bu odada kabinet yok</p><p className="mt-1 text-sm text-muted-foreground">Locations portföyünden kabinet ekleyin.</p></div></div>}
    </div>
  );
}
