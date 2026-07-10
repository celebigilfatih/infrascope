'use client';

import React, { useState } from 'react';
import { Text, Edges } from '@react-three/drei';

interface Device3D {
  id: string;
  name: string;
  type: string;
  rackUnitPosition: number | null;
  status?: string;
  vendor?: string | null;
  model?: string | null;
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

  const getDeviceColor = (type: string) => {
    if (type.includes('SWITCH') || type.includes('ROUTER')) return '#0ea5e9';
    if (type.includes('FIREWALL')) return '#ef4444';
    if (type.includes('STORAGE')) return '#8b5cf6';
    if (type.includes('PDU') || type.includes('PATCH_PANEL')) return '#f59e0b';
    if (type.includes('VIRTUAL')) return '#22c55e';
    return '#334155';
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return '#10b981';
      case 'MAINTENANCE':
        return '#f59e0b';
      case 'INACTIVE':
      case 'DECOMMISSIONED':
        return '#64748b';
      case 'ERROR':
      case 'DOWN':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  const shortenLabel = (value: string, max = 18) => {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  };

  const occupiedUnits = new Set<number>();
  const findNextFreeUnit = (height: number) => {
    for (let unit = 1; unit <= validMaxUnits; unit++) {
      let fits = true;
      for (let offset = 0; offset < height; offset++) {
        if (unit + offset > validMaxUnits || occupiedUnits.has(unit + offset)) {
          fits = false;
          break;
        }
      }
      if (fits) return unit;
    }
    return null;
  };

  const processedDevices = devices.map((device) => {
    const uHeight = Math.max(1, Math.min(validMaxUnits, (device.metadata as any)?.unitHeight || 1));
    const requestedUnit = Number.isInteger(device.rackUnitPosition) && device.rackUnitPosition
      ? Math.max(1, Math.min(validMaxUnits, device.rackUnitPosition))
      : null;
    const resolvedUnit = requestedUnit || findNextFreeUnit(uHeight) || 1;

    for (let offset = 0; offset < uHeight; offset++) {
      occupiedUnits.add(resolvedUnit + offset);
    }

    return {
      ...device,
      uHeight,
      resolvedUnit,
      isAutoPositioned: !requestedUnit,
    };
  });

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
          const pos = device.resolvedUnit;
          const h = device.uHeight * unitHeight;
          const yPos = (pos - 1) * unitHeight + h / 2;
          const deviceColor = getDeviceColor(device.type);
          const statusColor = getStatusColor(device.status);
          
          return (
            <group key={device.id} position={[0, yPos, 0]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[innerWidth, h * 0.95, innerDepth]} />
                <meshStandardMaterial 
                  color={deviceColor} 
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
                {shortenLabel(device.name)}
              </Text>

              {device.isAutoPositioned && (
                <Text
                  position={[0, -h * 0.22, innerDepth / 2 + 0.012]}
                  fontSize={0.035}
                  color="#fde68a"
                  anchorX="center"
                >
                  U atanmamış
                </Text>
              )}

              {/* Status LED on device */}
              <mesh position={[innerWidth / 2 - 0.03, 0, innerDepth / 2 + 0.01]}>
                <sphereGeometry args={[0.01, 8, 8]} />
                <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1} />
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
