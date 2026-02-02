'use client';

import React, { useState } from 'react';
import { Text, Edges } from '@react-three/drei';

interface Device3D {
  id: string;
  name: string;
  type: string;
  rackUnitPosition: number | null;
  metadata?: any;
}

interface Rack3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  name: string;
  type: string;
  maxUnits: number;
  isSelected?: boolean;
  onClick?: () => void;
  devices?: Device3D[];
}

export function Rack3D({ 
  position, 
  rotation = [0, 0, 0], 
  name, 
  type: _type, 
  maxUnits, 
  isSelected, 
  onClick,
  devices = []
}: Rack3DProps) {
  const [hovered, setHovered] = useState(false);

  // Standard rack dimensions
  const validMaxUnits = maxUnits || 42;
  const unitHeight = 0.04445; // 1U = 1.75 inches = 44.45mm
  const rackHeight = validMaxUnits * unitHeight;
  const rackWidth = 0.6; // 600mm
  const rackDepth = 1.0; // 1000mm
  
  const innerWidth = rackWidth * 0.85;
  const innerDepth = rackDepth * 0.9;

  // Process devices and their heights
  const processedDevices = devices.map(d => ({
    ...d,
    uHeight: (d.metadata as any)?.unitHeight || 1
  }));

  return (
    <group position={position} rotation={rotation}>
      {/* Label above rack */}
      <Text
        position={[0, rackHeight / 2 + 0.4, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {name}
      </Text>

      {/* Main Rack Frame */}
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
          color={isSelected ? '#1e3a8a' : hovered ? '#2d2d2d' : '#111111'} 
          metalness={0.8}
          roughness={0.2}
          transparent={true}
          opacity={0.6}
        />
        
        {/* Wireframe edges */}
        <Edges 
          scale={1.0} 
          threshold={15} 
          color={isSelected ? '#3b82f6' : '#444444'} 
        />
      </mesh>

      {/* Internal Devices Rendering */}
      <group position={[0, -rackHeight / 2, 0]}>
        {processedDevices.map((device) => {
          if (!device.rackUnitPosition) return null;
          
          const pos = device.rackUnitPosition;
          const h = device.uHeight * unitHeight;
          const yPos = (pos - 1) * unitHeight + h / 2;
          
          const isNetwork = device.type.includes('SWITCH') || device.type.includes('FIREWALL');
          
          return (
            <group key={device.id} position={[0, yPos, 0]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[innerWidth, h * 0.95, innerDepth]} />
                <meshStandardMaterial 
                  color={isNetwork ? '#0ea5e9' : '#334155'} 
                  metalness={0.5}
                  roughness={0.5}
                />
              </mesh>
              
              {/* Device Label */}
              <Text
                position={[0, 0, innerDepth / 2 + 0.01]}
                fontSize={0.05}
                color="white"
                anchorX="center"
              >
                {device.name}
              </Text>

              {/* Status LED on device */}
              <mesh position={[innerWidth / 2 - 0.03, 0, innerDepth / 2 + 0.01]}>
                <sphereGeometry args={[0.01, 8, 8]} />
                <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Front Mesh Door (Semi-transparent) */}
      <mesh position={[0, 0, rackDepth / 2 + 0.01]}>
        <boxGeometry args={[rackWidth * 0.95, rackHeight * 0.98, 0.01]} />
        <meshStandardMaterial 
          color="#000000" 
          transparent 
          opacity={0.3} 
          metalness={0.9} 
          roughness={0.1}
        />
      </mesh>

      {/* Selected Indicator */}
      {isSelected && (
        <mesh position={[0, -rackHeight / 2 - 0.05, 0]}>
          <boxGeometry args={[rackWidth * 1.2, 0.02, rackDepth * 1.2]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
        </mesh>
      )}
    </group>
  );
}
