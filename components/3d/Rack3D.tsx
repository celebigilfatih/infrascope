'use client';

import React, { useRef, useState } from 'react';

interface Rack3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  name: string;
  type: string;
  maxUnits: number;
  isSelected?: boolean;
  onClick?: () => void;
}

export function Rack3D({ 
  position, 
  rotation = [0, 0, 0], 
  name: _name, 
  type: _type, 
  maxUnits, 
  isSelected, 
  onClick 
}: Rack3DProps) {
  const meshRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);

  // Standard rack dimensions (approximate in meters)
  // 1U = 1.75 inches = 0.04445 meters
  // 42U = 1.8669 meters
  const validMaxUnits = maxUnits || 42;
  const rackHeight = validMaxUnits * 0.04445;
  const rackWidth = 0.6; // 600mm
  const rackDepth = 1.0; // 1000mm

  return (
    <group position={position} rotation={rotation}>
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        {/* Rack Frame */}
        <boxGeometry args={[rackWidth, rackHeight, rackDepth]} />
        <meshStandardMaterial 
          color={isSelected ? '#3b82f6' : hovered ? '#2563eb' : '#000033'} 
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}
