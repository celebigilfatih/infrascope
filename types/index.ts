/**
 * InfraScope Type Definitions
 * Centralized types for the application frontend and shared utilities.
 */

// ============================================================================
// 1. ORGANIZATIONAL STRUCTURE
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  code: string;
  description?: string;
  buildings?: Building[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  organizationId: string;
  organization?: Organization;
  floors?: Floor[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Floor {
  id: string;
  name: string;
  floorNumber: number;
  buildingId: string;
  building?: Building;
  rooms?: Room[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  floorId: string;
  floor?: Floor;
  capacity?: number;
  racks?: Rack[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================================================
// 2. RACK & UNIT MANAGEMENT
// ============================================================================

export type RackType = 'RACK_42U' | 'RACK_45U' | 'CUSTOM';
export type RackStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type UnitSide = 'FRONT' | 'REAR';

export interface Rack {
  id: string;
  name: string;
  type: RackType;
  maxUnits: number;
  roomId: string;
  room?: Room;
  position?: string;
  operationalStatus: RackStatus;
  devices?: Device[];
  units?: RackUnit[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface RackUnit {
  id: string;
  position: number;
  rackId: string;
  rack?: Rack;
  deviceId?: string;
  device?: Device;
  side: UnitSide;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================================================
// 3. DEVICE INVENTORY
// ============================================================================

export type DeviceType = 
  | 'PHYSICAL_SERVER' | 'VIRTUAL_HOST' | 'VIRTUAL_MACHINE' 
  | 'FIREWALL' | 'SWITCH' | 'ROUTER' 
  | 'COMPUTER' | 'LAPTOP' | 'STORAGE' 
  | 'PDU' | 'PATCH_PANEL' | 'PRINTER' | 'CAMERA' | 'OTHER';

export type DeviceCriticality = 
  | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export type DeviceStatus = 
  | 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED' | 'UNKNOWN';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  vendor?: string;
  model?: string;
  serialNumber?: string;
  assetTag?: string;
  firmwareVersion?: string;
  operatingSystem?: string;
  criticality: DeviceCriticality;
  status: DeviceStatus;
  rackId?: string;
  rack?: Rack;
  rackUnitPosition?: number;
  parentDeviceId?: string;
  parentDevice?: Device;
  childDevices?: Device[];
  networkInterfaces?: NetworkInterface[];
  switchPorts?: SwitchPort[];
  services?: Service[];
  dependencies?: Dependency[];
  metadata?: any;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================================================
// 4. NETWORK CONFIGURATION
// ============================================================================

export type InterfaceType = 'ETHERNET' | 'FIBER' | 'WIRELESS' | 'SERIAL' | 'MANAGEMENT' | 'OTHER';
export type NetworkStatus = 'UP' | 'DOWN' | 'DORMANT' | 'UNKNOWN';

export interface NetworkInterface {
  id: string;
  name: string;
  type: InterfaceType;
  ipv4?: string;
  ipv6?: string;
  macAddress?: string;
  deviceId: string;
  device?: Device;
  status: NetworkStatus;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type PortType = 'ACCESS' | 'TRUNK' | 'HYBRID' | 'MANAGEMENT' | 'UPLINK';
export type Duplex = 'FULL' | 'HALF' | 'AUTO';

export interface SwitchPort {
  id: string;
  name: string;
  portType: PortType;
  vlanId?: number;
  nativeVlan?: number;
  allowedVlans?: string;
  status: NetworkStatus;
  speed?: string;
  duplex?: Duplex;
  switchDeviceId: string;
  switchDevice?: Device;
  connectedToId?: string;
  networkInterface?: NetworkInterface;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type ConnectionType = 'ETHERNET' | 'FIBER' | 'SERIAL' | 'MANAGEMENT' | 'WAN';

export interface NetworkConnection {
  id: string;
  name?: string;
  type: ConnectionType;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourceInterfaceId?: string;
  targetInterfaceId?: string;
  status: NetworkStatus;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================================================
// 4.1. INTER-BUILDING CONNECTIVITY
// ============================================================================

export type BuildingConnectionType = 
  | 'FIBER_SINGLE_MODE' | 'FIBER_MULTI_MODE' 
  | 'CAT5E' | 'CAT6' | 'CAT6A' | 'CAT7' | 'CAT8' 
  | 'WIRELESS' | 'MICROWAVE' | 'LEASED_LINE' | 'MPLS' | 'VPN' | 'OTHER';

export type RecordingMethod = 'AUTO' | 'MANUAL';
export type BuildingConnectionStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'PLANNED' | 'DECOMMISSIONED';

export interface BuildingConnection {
  id: string;
  name?: string;
  connectionType: BuildingConnectionType;
  recordingMethod: RecordingMethod;
  sourceBuildingId: string;
  sourceBuilding?: Building;
  destBuildingId: string;
  destBuilding?: Building;
  status: BuildingConnectionStatus;
  bandwidth?: string;
  distance?: number;
  fiberType?: string;
  cableSpecs?: string;
  provider?: string;
  circuitId?: string;
  installDate?: string | Date;
  notes?: string;
  metadata?: any;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================================================
// 5. SERVICES & APPLICATIONS
// ============================================================================

export type ServiceType = 
  | 'WEB_SERVER' | 'DATABASE' | 'DNS' | 'DHCP' | 'LDAP' | 'MONITORING' 
  | 'BACKUP' | 'FILE_SERVER' | 'MAIL_SERVER' | 'PROXY' | 'VPN' 
  | 'LOAD_BALANCER' | 'STORAGE' | 'CONTAINER_ORCHESTRATION' | 'OTHER';

export type ServiceStatus = 'RUNNING' | 'STOPPED' | 'DEGRADED' | 'FAILED' | 'UNKNOWN';
export type Protocol = 'TCP' | 'UDP' | 'BOTH';

export interface Application {
  id: string;
  name: string;
  vendor?: string;
  version?: string;
  installPath?: string;
  licenseKey?: string;
  services?: Service[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Service {
  id: string;
  name: string;
  type: ServiceType;
  displayName?: string;
  description?: string;
  status: ServiceStatus;
  port: number;
  protocol: Protocol;
  deviceId: string;
  device?: Device;
  applicationId?: string;
  application?: Application;
  criticality: DeviceCriticality;
  dependencies?: Dependency[];
  metadata?: any;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================================================
// 6. DEPENDENCY & IMPACT ANALYSIS (CMDB)
// ============================================================================

export type DependencyType = 
  | 'DEPENDS_ON' | 'REQUIRES' | 'PROVIDES' | 'SUPPORTS' 
  | 'COMMUNICATES_WITH' | 'DEPLOYED_ON' | 'HOSTED_ON' | 'CONNECTED_TO';

export interface Dependency {
  id: string;
  sourceServiceId: string;
  sourceService?: Service;
  targetDeviceId: string;
  targetDevice?: Device;
  type: DependencyType;
  criticality: DeviceCriticality;
  description?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ============================================================================
// 7. API RESPONSES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
