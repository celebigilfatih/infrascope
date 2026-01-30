/**
 * Formatting and text processing utilities
 */

/**
 * Format device name for display
 */
export function formatDeviceName(name: string): string {
  return name.toUpperCase().replace(/_/g, ' ');
}

/**
 * Format device status with color indicator
 */
export function getStatusColor(status: string): string {
  const statusMap: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
    MAINTENANCE: 'bg-yellow-100 text-yellow-800',
    DECOMMISSIONED: 'bg-red-100 text-red-800',
    UNKNOWN: 'bg-gray-100 text-gray-600',
    UP: 'bg-green-100 text-green-800',
    DOWN: 'bg-red-100 text-red-800',
    DORMANT: 'bg-yellow-100 text-yellow-800',
    RUNNING: 'bg-green-100 text-green-800',
    STOPPED: 'bg-gray-100 text-gray-800',
    DEGRADED: 'bg-orange-100 text-orange-800',
    FAILED: 'bg-red-100 text-red-800',
  };
  return statusMap[status] || 'bg-gray-100 text-gray-600';
}

/**
 * Format criticality level
 */
export function formatCriticality(level: string): string {
  const levelMap: Record<string, string> = {
    CRITICAL: 'Critical',
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low',
    INFORMATIONAL: 'Info',
  };
  return levelMap[level] || level;
}

/**
 * Get criticality color
 */
export function getCriticalityColor(level: string): string {
  const colorMap: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    LOW: 'bg-blue-100 text-blue-800',
    INFORMATIONAL: 'bg-gray-100 text-gray-600',
  };
  return colorMap[level] || 'bg-gray-100 text-gray-600';
}

/**
 * Get vendor logo path
 */
export function getVendorLogo(vendor?: string): string | null {
  if (!vendor) return null;
  
  const v = vendor.toLowerCase();
  
  if (v.includes('aruba')) return '/images/aruba-networks.svg';
  if (v.includes('cisco')) return '/images/cisco-2.svg';
  if (v.includes('dell')) return '/images/dell-technologies-logo.svg';
  if (v.includes('hp') || v.includes('hewlett')) return '/images/hp-proliant-servers.svg';
  if (v.includes('fortinet')) return '/images/fortinet-logo.svg';
  if (v.includes('ibm')) return '/images/ibm.svg';
  if (v.includes('juniper')) return '/images/juniper-networks.svg';
  if (v.includes('microsoft')) {
    if (v.includes('sql')) return '/images/microsoft-sql-server-1.svg';
    return '/images/microsoft-windows-22-1.svg';
  }
  if (v.includes('windows')) {
    if (v.includes('server')) return '/images/windows-server.svg';
    return '/images/microsoft-windows-22-1.svg';
  }
  if (v.includes('oracle')) return '/images/oracle-6.svg';
  if (v.includes('postgres')) return '/images/postgresql-inc.svg';
  if (v.includes('vmware')) return '/images/vmware.svg';
  
  return null;
}

/**
 * Format IP address with null safety
 */
export function formatIp(ip?: string): string {
  return ip || 'N/A';
}

/**
 * Format MAC address
 */
export function formatMac(mac?: string): string {
  if (!mac) return 'N/A';
  return mac.toUpperCase();
}

/**
 * Format date in user-friendly format
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format timestamp
 */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Truncate long text
 */
export function truncate(text: string, length: number = 50): string {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

/**
 * Format port number
 */
export function formatPort(port: number): string {
  const commonPorts: Record<number, string> = {
    22: 'SSH',
    80: 'HTTP',
    443: 'HTTPS',
    3306: 'MySQL',
    5432: 'PostgreSQL',
    6379: 'Redis',
    27017: 'MongoDB',
    3389: 'RDP',
    5900: 'VNC',
  };
  return commonPorts[port] ? `${port} (${commonPorts[port]})` : port.toString();
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
