'use client';

import { useState } from 'react';
import { Edges, Text, useCursor } from '@react-three/drei';
import { resolveRackDevices } from '@/lib/rack-capacity';
import type { LocationDevice } from '@/components/locations/types';

interface Rack3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  name: string;
  maxUnits: number;
  operationalStatus: string;
  utilization: number;
  isSelected?: boolean;
  isAutoPositioned?: boolean;
  displayMode: 'operation' | 'capacity';
  showDeviceDetails?: boolean;
  onClick?: () => void;
  devices?: LocationDevice[];
}

const UNIT_HEIGHT = 0.04445;
const RACK_WIDTH = 0.6;
const RACK_DEPTH = 1;

function capacityColor(utilization: number) {
  if (utilization >= 85) return '#dc2626';
  if (utilization >= 65) return '#d97706';
  return '#059669';
}

function deviceColor(type: string) {
  if (type.includes('SWITCH') || type.includes('ROUTER')) return '#0ea5e9';
  if (type.includes('FIREWALL')) return '#ef4444';
  if (type.includes('STORAGE')) return '#8b5cf6';
  if (type.includes('PDU') || type.includes('PATCH_PANEL')) return '#f59e0b';
  if (type.includes('VIRTUAL')) return '#22c55e';
  return '#334155';
}

function statusColor(status?: string) {
  if (status === 'ACTIVE') return '#10b981';
  if (status === 'MAINTENANCE') return '#f59e0b';
  if (status === 'INACTIVE' || status === 'DECOMMISSIONED') return '#64748b';
  return '#ef4444';
}

export function Rack3D({ position, rotation = [0, 0, 0], name, maxUnits, operationalStatus, utilization, isSelected, isAutoPositioned, displayMode, showDeviceDetails, onClick, devices = [] }: Rack3DProps) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const rackHeight = Math.max(1, maxUnits || 42) * UNIT_HEIGHT;
  const resolvedDevices = showDeviceDetails ? resolveRackDevices(maxUnits, devices) : [];
  const frameColor = displayMode === 'capacity'
    ? capacityColor(utilization)
    : operationalStatus === 'OPERATIONAL' ? '#1f2937' : operationalStatus === 'MAINTENANCE' ? '#92400e' : '#4b5563';
  const indicator = operationalStatus === 'OPERATIONAL' ? '#10b981' : operationalStatus === 'MAINTENANCE' ? '#f59e0b' : '#64748b';

  return (
    <group position={position} rotation={rotation}>
      <mesh
        castShadow
        receiveShadow
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => { event.stopPropagation(); onClick?.(); }}
      >
        <boxGeometry args={[RACK_WIDTH, rackHeight, RACK_DEPTH]} />
        <meshStandardMaterial color={frameColor} metalness={0.78} roughness={0.28} transparent opacity={displayMode === 'capacity' ? 0.82 : 0.68} />
        {(isSelected || hovered) && <Edges color={isSelected ? '#22c55e' : '#94a3b8'} threshold={15} />}
      </mesh>

      <mesh position={[0, 0, RACK_DEPTH / 2 + 0.008]}>
        <boxGeometry args={[RACK_WIDTH * 0.92, rackHeight * 0.97, 0.012]} />
        <meshStandardMaterial color="#020617" metalness={0.9} roughness={0.25} transparent opacity={0.34} />
      </mesh>

      {[-1, 1].map((side) => (
        <group key={side} position={[side * (RACK_WIDTH / 2 - 0.025), 0, RACK_DEPTH / 2 + 0.02]}>
          <mesh><boxGeometry args={[0.025, rackHeight * 0.94, 0.025]} /><meshStandardMaterial color="#64748b" metalness={0.9} /></mesh>
        </group>
      ))}

      <mesh position={[RACK_WIDTH / 2 - 0.055, rackHeight / 2 - 0.055, RACK_DEPTH / 2 + 0.035]}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshStandardMaterial color={indicator} emissive={indicator} emissiveIntensity={1.4} />
      </mesh>

      {displayMode === 'capacity' && (
        <mesh position={[0, -rackHeight / 2 + (rackHeight * utilization / 100) / 2, RACK_DEPTH / 2 + 0.025]}>
          <boxGeometry args={[RACK_WIDTH * 0.78, rackHeight * utilization / 100, 0.018]} />
          <meshStandardMaterial color={capacityColor(utilization)} emissive={capacityColor(utilization)} emissiveIntensity={0.18} />
        </mesh>
      )}

      {resolvedDevices.map(({ device, resolvedUnit, unitHeight, isAutoPositioned: auto, hasConflict }) => {
        if (!resolvedUnit) return null;
        const height = unitHeight * UNIT_HEIGHT;
        const y = -rackHeight / 2 + (resolvedUnit - 1) * UNIT_HEIGHT + height / 2;
        const color = hasConflict ? '#dc2626' : deviceColor(device.type);
        return (
          <group key={device.id} position={[0, y, 0]}>
            <mesh castShadow>
              <boxGeometry args={[RACK_WIDTH * 0.82, height * 0.92, RACK_DEPTH * 0.88]} />
              <meshStandardMaterial color={color} metalness={0.52} roughness={0.42} />
            </mesh>
            <Text position={[0, 0, RACK_DEPTH * 0.45]} fontSize={Math.min(0.045, height * 0.52)} color="#ffffff" anchorX="center" maxWidth={RACK_WIDTH * 0.72}>
              {device.name.length > 18 ? `${device.name.slice(0, 17)}…` : device.name}
            </Text>
            <mesh position={[RACK_WIDTH * 0.34, 0, RACK_DEPTH * 0.45]}>
              <sphereGeometry args={[0.011, 8, 8]} />
              <meshStandardMaterial color={statusColor(device.status)} emissive={statusColor(device.status)} emissiveIntensity={1.1} />
            </mesh>
            {auto && <mesh position={[-RACK_WIDTH * 0.35, 0, RACK_DEPTH * 0.45]}><boxGeometry args={[0.025, height * 0.5, 0.012]} /><meshStandardMaterial color="#fbbf24" /></mesh>}
          </group>
        );
      })}

      {(hovered || isSelected) && (
        <Text position={[0, rackHeight / 2 + 0.18, 0]} fontSize={0.12} color={isSelected ? '#22c55e' : '#e2e8f0'} anchorX="center" outlineWidth={0.008} outlineColor="#020617">
          {name}
        </Text>
      )}

      {isAutoPositioned && (
        <mesh position={[-RACK_WIDTH / 2 + 0.05, rackHeight / 2 - 0.05, RACK_DEPTH / 2 + 0.035]}>
          <boxGeometry args={[0.04, 0.04, 0.015]} /><meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.6} />
        </mesh>
      )}

      {isSelected && <mesh position={[0, -rackHeight / 2 - 0.025, 0]}><boxGeometry args={[RACK_WIDTH * 1.18, 0.025, RACK_DEPTH * 1.12]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.45} /></mesh>}
    </group>
  );
}
