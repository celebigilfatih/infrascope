'use client';

import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { Text, Edges } from '@react-three/drei';

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
  name, 
  type: _type, 
  maxUnits, 
  isSelected, 
  onClick 
}: Rack3DProps) {
  const [hovered, setHovered] = useState(false);

  // Standard rack dimensions
  const validMaxUnits = maxUnits || 42;
  const rackHeight = validMaxUnits * 0.04445;
  const rackWidth = 0.6; // 600mm
  const rackDepth = 1.0; // 1000mm

  return (
    <group position={position} rotation={rotation}>
      {/* Label above rack */}
      <Text
        position={[0, rackHeight / 2 + 0.4, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {name}
      </Text>

      {/* Main Rack Body */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[rackWidth, rackHeight, rackDepth]} />
        <meshStandardMaterial 
          color={isSelected ? '#1e3a8a' : hovered ? '#2d2d2d' : '#1a1a1a'} 
          metalness={0.9}
          roughness={0.1}
        />
        
        {/* Outline when hovered or selected */}
        {(isSelected || hovered) && (
          <Edges 
            scale={1.01} 
            threshold={15} 
            color={isSelected ? '#3b82f6' : '#60a5fa'} 
          />
        )}
      </mesh>

      {/* Front Panel (Door) */}
      <mesh position={[0, 0, rackDepth / 2 + 0.01]} castShadow>
        <boxGeometry args={[rackWidth * 0.9, rackHeight * 0.95, 0.02]} />
        <meshStandardMaterial 
          color="#0f172a" 
          metalness={0.8} 
          roughness={0.2} 
          transparent 
          opacity={0.8}
        />
      </mesh>

      {/* LED Status Light */}
      <mesh position={[rackWidth / 2 - 0.05, rackHeight / 2 - 0.1, rackDepth / 2 + 0.02]}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshStandardMaterial 
          color={isSelected ? '#fbbf24' : '#10b981'} 
          emissive={isSelected ? '#fbbf24' : '#10b981'} 
          emissiveIntensity={2} 
        />
      </mesh>
    </group>
  );
}
