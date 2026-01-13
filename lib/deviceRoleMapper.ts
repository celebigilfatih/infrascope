export type DeviceRole = 'core' | 'distribution' | 'access' | 'compute' | 'storage' | 'other';

export const getDeviceRole = (type: string, name: string): DeviceRole => {
  const upperType = type.toUpperCase();
  const upperName = name.toUpperCase();

  if (upperType === 'SWITCH' || upperType === 'ROUTER') {
    if (upperName.includes('CORE')) return 'core';
    if (upperName.includes('DIST')) return 'distribution';
    return 'access';
  }

  if (upperType === 'PHYSICAL_SERVER' || upperType === 'VIRTUAL_MACHINE') {
    return 'compute';
  }

  if (upperType === 'STORAGE') {
    return 'storage';
  }

  return 'other';
};

export const getDevicePositionWeight = (role: DeviceRole): { x: number; y: number } => {
  switch (role) {
    case 'core': return { x: 0.5, y: 0.1 };
    case 'distribution': return { x: 0.5, y: 0.4 };
    case 'access': return { x: 0.5, y: 0.7 };
    case 'compute': return { x: 0.2, y: 0.9 };
    case 'storage': return { x: 0.8, y: 0.9 };
    case 'other': return { x: 0.5, y: 0.9 };
    default: return { x: 0.5, y: 0.5 };
  }
};
