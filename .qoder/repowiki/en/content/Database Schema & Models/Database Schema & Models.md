# Database Schema & Models

<cite>
**Referenced Files in This Document**
- [schema.prisma](file://prisma/schema.prisma)
- [initial_schema migration.sql](file://prisma/migrations/20260101220408_initial_schema/migration.sql)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [add_fortianalyzer migration.sql](file://prisma/migrations/20260203140035_add_fortianalyzer/migration.sql)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)
- [postgres-init.sql](file://docker/postgres-init.sql)
- [prisma.ts](file://lib/prisma.ts)
- [migrate_nms_db.sql](file://scripts/migrate_nms_db.sql)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [client.ts](file://lib/license/client.ts)
- [jwt.ts](file://lib/license/jwt.ts)
- [activate/route.ts](file://app/api/license/activate/route.ts)
- [validate/route.ts](file://app/api/license/validate/route.ts)
- [heartbeat/route.ts](file://app/api/license/heartbeat/route.ts)
- [status/route.ts](file://app/api/license/status/route.ts)
</cite>

## Update Summary
**Changes Made**
- Added comprehensive licensing infrastructure documentation including new Customer, License, LicenseActivation, and LicenseHeartbeat entities
- Documented license management APIs: activation, validation, heartbeat, and status endpoints
- Added license tier enumeration and status tracking mechanisms
- Included JWT token signing and verification for license validation
- Updated enterprise extension tables to include licensing capabilities
- Added audit capabilities for license management operations

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [License Management System](#license-management-system)
7. [Dependency Analysis](#dependency-analysis)
8. [Performance Considerations](#performance-considerations)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Conclusion](#conclusion)
11. [Appendices](#appendices)

## Introduction
This document provides comprehensive data model documentation for the InfraScope database schema. It details entity relationships across the hierarchical location structure (Organizations, Buildings, Floors, Rooms, Racks, and Units), Device entities with parent-child relationships for VMs and JSONB metadata, Network Interface, Switch Port, and Connection entities for network topology management, Application and Service entities with port/protocol tracking and dependency relationships, audit logs, health snapshots, enterprise extension tables, and the complete licensing infrastructure. It also documents primary/foreign keys, indexes, constraints, data validation rules, business logic enforcement, data lifecycle and retention considerations, migration strategies, and performance characteristics.

## Project Structure
InfraScope uses Prisma for schema definition and migrations. The schema is defined in a single Prisma schema file and applied through SQL migrations. The database initialization script sets up required Postgres extensions and schema permissions. A dedicated Prisma client singleton ensures consistent database access across the application. The licensing system includes JWT token management and comprehensive license validation workflows.

```mermaid
graph TB
subgraph "Schema Definition"
PRISMA["prisma/schema.prisma"]
end
subgraph "Migrations"
M1["20260101220408_initial_schema/migration.sql"]
M2["20260130053347_enterprise_extension/migration.sql"]
M3["20260203140035_add_fortianalyzer/migration.sql"]
M4["20260331134657_add_nms_integration/migration.sql"]
end
subgraph "Runtime"
INIT["docker/postgres-init.sql"]
CLIENT["lib/prisma.ts"]
JWT["lib/license/jwt.ts"]
CLIENTLIB["lib/license/client.ts"]
end
PRISMA --> M1
PRISMA --> M2
PRISMA --> M3
PRISMA --> M4
INIT --> PRISMA
CLIENT --> PRISMA
JWT --> CLIENTLIB
CLIENTLIB --> PRISMA
```

**Diagram sources**
- [schema.prisma](file://prisma/schema.prisma)
- [initial_schema migration.sql](file://prisma/migrations/20260101220408_initial_schema/migration.sql)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [add_fortianalyzer migration.sql](file://prisma/migrations/20260203140035_add_fortianalyzer/migration.sql)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)
- [postgres-init.sql](file://docker/postgres-init.sql)
- [prisma.ts](file://lib/prisma.ts)
- [jwt.ts](file://lib/license/jwt.ts)
- [client.ts](file://lib/license/client.ts)

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [prisma.ts](file://lib/prisma.ts)
- [postgres-init.sql](file://docker/postgres-init.sql)
- [jwt.ts](file://lib/license/jwt.ts)
- [client.ts](file://lib/license/client.ts)

## Core Components
This section outlines the primary entities and their relationships, focusing on the hierarchical location structure, device hierarchy, networking, applications/services, enterprise extensions, and the comprehensive licensing infrastructure.

- Hierarchical Location Structure
  - Organization: Top-level tenant container with unique constraints on name and code.
  - Building: Belongs to an Organization; unique per organization by name.
  - Floor: Belongs to a Building; unique per building by floor number.
  - Room: Belongs to a Floor; unique per floor by name; supports optional dimensions.
  - Rack: Belongs to a Room; unique per room by name; supports coordinates and rotation.
  - RackUnit: Occupies a position in a Rack with side FRONT/REAR; optional device assignment.

- Device Model
  - Device: Physical or virtual device with type, vendor/model, serial/asset tags, firmware, OS, criticality, status, and optional metadata JSONB.
  - Parent-Child: Devices can have a parentDeviceId forming a VM-to-host hierarchy.
  - Location: Optional rackId and rackUnitPosition linking to Rack and RackUnit.
  - Integrations: Fields for Zabbix host ID, VMware MOREF, Fortinet device ID, and NMS integration (nms_device_id, management IP, SNMP settings).
  - Relationships: Many-to-many-like via Relationship edges and Service dependencies.

- Networking
  - NetworkInterface: Interfaces on a Device with IPv4/IPv6/MAC, type, status, optional VLAN association.
  - SwitchPort: Ports on switch-type Devices with VLAN membership, speed/duplex, status, and optional connection to an Interface.
  - Connection: Logical connections between SwitchPort and optional source/target Interface.

- Applications and Services
  - Application: Installed software with vendor/version/install path/license.
  - Service: Running service on a Device with type, display name, description, status, port, protocol, criticality, optional metadata JSONB, and optional Application linkage.

- Dependencies
  - Dependency: Links a Service to a target Device with a typed relationship and criticality.

- Enterprise Extensions
  - VLAN/Subnet: Network segmentation with optional gateway/VRF.
  - Firewall Policies/Addresses: FortiGate policy and address objects.
  - VMware Clusters/Datastores: vSphere resource containers.
  - Relationships: Typed edges between devices (contains, connects, virtual runs on, VLAN member, etc.).
  - Capacity Metrics: Time-series for CPU/memory/disk usage.
  - VM Snapshots: Snapshot records for VMs.

- Observability and Alarms
  - AuditLog: Immutable audit trail with JSONB changes.
  - DeviceHealthSnapshot: Historical device status and metrics.
  - Alarm Management System: Comprehensive alarm definitions, events, cooldowns, cached events, notification DLQ, and whitelist.

- NMS Integration Tables
  - NmsInterface/NmsHealthMetric/NmsTopologyLink/NmsDiscoveryScan/NmsDiscoveredDevice/NmsDeviceMetric/NmsInterfaceMetric/NmsBackup: SNMP-based integration tables.

- **License Management System** *(Updated)*
  - Customer: License holder with company information, contact details, tier, and status.
  - License: License key with tier, limits, validity period, activation limit, and status tracking.
  - LicenseActivation: Tracks machine activations with usage data and status.
  - LicenseHeartbeat: Records periodic usage patterns and device/user counts.

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)
- [client.ts](file://lib/license/client.ts)

## Architecture Overview
The database architecture centers on a normalized relational schema with JSONB fields for flexible metadata and time-series tables for observability. Prisma manages schema evolution through migrations, while the application uses a singleton Prisma client for consistent access. The licensing system adds JWT-based token validation and comprehensive usage tracking capabilities.

```mermaid
erDiagram
ORGANIZATION ||--o{ BUILDING : "owns"
BUILDING ||--o{ FLOOR : "contains"
FLOOR ||--o{ ROOM : "contains"
ROOM ||--o{ RACK : "contains"
RACK ||--o{ RACK_UNIT : "occupies"
RACK_UNIT ||--o{ DEVICE : "hosts"
DEVICE ||--o{ NETWORK_INTERFACE : "has"
DEVICE ||--o{ SWITCH_PORT : "has"
DEVICE ||--o{ SERVICE : "runs"
DEVICE ||--o{ DEPENDENCY : "depends_on"
NETWORK_INTERFACE ||--o{ CONNECTION : "sources"
SWITCH_PORT ||--o{ CONNECTION : "sources"
CONNECTION ||--|| NETWORK_INTERFACE : "targets"
CONNECTION ||--|| SWITCH_PORT : "targets"
APPLICATION ||--o{ SERVICE : "installs"
SERVICE ||--o{ DEPENDENCY : "causes"
ORGANIZATION ||--o{ VLAN : "manages"
VLAN ||--o{ SUBNET : "contains"
VLAN ||--o{ NETWORK_INTERFACE : "members"
DEVICE ||--o{ FIREWALL_POLICY : "managed_by"
DEVICE ||--o{ FIREWALL_ADDRESS : "managed_by"
ORGANIZATION ||--o{ VMWARE_CLUSTER : "owns"
VMWARE_CLUSTER ||--o{ DEVICE : "hosts"
VMWARE_CLUSTER ||--o{ VMWARE_DATASTORE : "contains"
DEVICE ||--o{ RELATIONSHIP : "edge_source"
DEVICE ||--o{ RELATIONSHIP : "edge_target"
DEVICE ||--o{ NMS_INTERFACE : "monitors"
DEVICE ||--o{ NMS_HEALTH_METRIC : "metrics"
DEVICE ||--o{ NMS_TOPOLOGY_LINK : "discovers"
DEVICE ||--o{ NMS_DEVICE_METRIC : "metrics"
DEVICE ||--o{ NMS_INTERFACE_METRIC : "metrics"
DEVICE ||--o{ NMS_BACKUP : "backups"
CUSTOMER ||--o{ LICENSE : "holds"
LICENSE ||--o{ LICENSE_ACTIVATION : "activates"
LICENSE ||--o{ LICENSE_HEARTBEAT : "reports"
LICENSE_ACTIVATION ||--|| CUSTOMER : "belongs_to"
LICENSE_ACTIVATION ||--|| LICENSE : "belongs_to"
LICENSE_HEARTBEAT ||--|| LICENSE : "belongs_to"
```

**Diagram sources**
- [schema.prisma](file://prisma/schema.prisma)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)
- [client.ts](file://lib/license/client.ts)

## Detailed Component Analysis

### Hierarchical Location Entities
- Organization
  - Primary keys: id
  - Unique constraints: name, code
  - Relationships: buildings[], vlans[], subnets[], vmwareClusters[], vmwareDatastores[]
- Building
  - Primary key: id
  - Unique constraint: (organizationId, name)
  - Foreign key: organizationId -> organizations.id (Cascade)
  - Relationships: floors[]
- Floor
  - Primary key: id
  - Unique constraint: (buildingId, floorNumber)
  - Foreign key: buildingId -> buildings.id (Cascade)
  - Relationships: rooms[]
- Room
  - Primary key: id
  - Unique constraint: (floorId, name)
  - Foreign key: floorId -> floors.id (Cascade)
  - Relationships: racks[]
- Rack
  - Primary key: id
  - Unique constraint: (roomId, name)
  - Foreign key: roomId -> rooms.id (Cascade)
  - Relationships: units[], devices[]
- RackUnit
  - Primary key: id
  - Unique constraint: (rackId, position, side)
  - Foreign keys: rackId -> racks.id (Cascade), deviceId -> devices.id (Set Null)
  - Relationships: device?, rack

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [initial_schema migration.sql](file://prisma/migrations/20260101220408_initial_schema/migration.sql)

### Device Model and VM Hierarchy
- Device
  - Primary key: id
  - Indexes: rackId, parentDeviceId, zabbixHostId, vmwareMoref, vmwareClusterId, nmsDeviceId
  - Optional foreign keys: rackId -> racks.id (Set Null), parentDeviceId -> devices.id (Set Null)
  - JSONB: metadata
  - Integration fields: zabbixHostId, vmwareMoref, fortiDeviceId, nms_device_id, management_ip, snmp_* fields
  - Relationships: networkInterfaces[], switchPorts[], services[], dependencies[], vmwareCluster?, firewallPolicies[], firewallAddresses[], sourceRelationships[], targetRelationships[], nmsInterfaces[], nmsHealthMetrics[], nmsTopologyLinks[], nmsDeviceMetrics[], nmsInterfaceMetrics[], nmsBackups[]
- VM Parent-Child
  - VMs are Devices with optional vmHostId linking to a parent Device (hypervisor/host)
  - Optional vmwareClusterId links to VMwareCluster

```mermaid
classDiagram
class Device {
+string id
+string name
+DeviceType type
+string? vendor
+string? model
+string? serialNumber
+string? assetTag
+string? firmwareVersion
+string? operatingSystem
+DeviceCriticality criticality
+DeviceStatus status
+string? rackId
+int? rackUnitPosition
+string? parentDeviceId
+DateTime? supportDate
+int? healthScore
+Json? metadata
+string[] tags
+string? zabbixHostId
+string? vmwareMoref
+string? fortiDeviceId
+int? nmsDeviceId
+string? managementIp
+string? snmpCommunity
+string? snmpVersion
+int? snmpPort
+boolean pollingEnabled
+int? pollingInterval
+DateTime? lastPolledAt
+string? vmHostId
+string? vmwareClusterId
}
class Rack {
+string id
+string name
+RackType type
+int maxUnits
+string roomId
+string? position
+RackStatus operationalStatus
+float? coordX
+float? coordY
+float? coordZ
+float rotation
}
class RackUnit {
+string id
+int position
+string rackId
+string? deviceId
+UnitSide side
}
Device --> Rack : "located in"
Rack --> RackUnit : "contains"
Device --> Device : "parent/child (VM)"
```

**Diagram sources**
- [schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)

### Network Topology Entities
- NetworkInterface
  - Primary key: id
  - Unique constraint: (deviceId, name)
  - Foreign key: deviceId -> devices.id (Cascade)
  - Optional foreign key: vlanId -> vlans.id (Set Null)
  - Relationships: connections[], switchPorts[]
- SwitchPort
  - Primary key: id
  - Unique constraint: (switchDeviceId, name)
  - Foreign keys: switchDeviceId -> devices.id (Cascade), connectedToId -> network_interfaces.id (Set Null)
  - Relationships: connections[]
- Connection
  - Primary key: id
  - Foreign keys: sourcePortId -> switch_ports.id (Cascade), sourceInterfaceId -> network_interfaces.id (Cascade)
  - Optional foreign key: destPortId -> switch_ports.id (Set Null), destInterfaceId -> network_interfaces.id (Set Null)
  - Relationships: sourceInterface, sourcePort

```mermaid
sequenceDiagram
participant Dev as "Device"
participant NI as "NetworkInterface"
participant SP as "SwitchPort"
participant C as "Connection"
participant DNI as "Destination NetworkInterface"
Dev->>NI : "create interface"
Dev->>SP : "create port"
SP->>C : "create connection(sourcePort)"
NI->>C : "optionally connect to interface"
C->>DNI : "link to destination interface"
```

**Diagram sources**
- [schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)

### Applications, Services, and Dependencies
- Application
  - Primary key: id
  - Unique constraint: (name, version)
  - Relationships: services[]
- Service
  - Primary key: id
  - Unique constraint: (deviceId, port, protocol)
  - Foreign keys: deviceId -> devices.id (Cascade), applicationId -> applications.id (Set Null)
  - Indexes: deviceId, applicationId
  - JSONB: metadata
  - Relationships: dependencies[]
- Dependency
  - Primary key: id
  - Unique constraint: (sourceServiceId, targetDeviceId, type)
  - Foreign keys: sourceServiceId -> services.id (Cascade), targetDeviceId -> devices.id (Cascade)
  - Indexes: sourceServiceId, targetDeviceId

```mermaid
flowchart TD
A["Application"] --> S["Service"]
S --> D["Dependency"]
D --> T["Target Device"]
subgraph "Constraints"
U1["Unique: (deviceId, port, protocol)"]
U2["Unique: (sourceServiceId, targetDeviceId, type)"]
end
S --- U1
D --- U2
```

**Diagram sources**
- [schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)

### Enterprise Extensions: VLANs, Subnets, Firewall, VMware, Relationships
- VLAN
  - Primary key: id
  - Unique constraint: (organizationId, vlanId)
  - Foreign key: organizationId -> organizations.id (Cascade)
  - Relationships: subnets[], interfaces[]
- Subnet
  - Primary key: id
  - Unique constraint: (organizationId, cidr)
  - Foreign keys: organizationId -> organizations.id (Cascade), vlanId -> vlans.id (Set Null)
- FirewallPolicy
  - Primary key: id
  - Unique constraint: (deviceId, policyId)
  - Foreign key: deviceId -> devices.id (Cascade)
  - JSONB: srcAddresses, dstAddresses, services, metadata
  - Indexes: deviceId
- FirewallAddress
  - Primary key: id
  - Foreign key: deviceId -> devices.id (Cascade)
  - Indexes: deviceId
- VMwareCluster
  - Primary key: id
  - Indexes: organizationId
  - Relationships: hosts[], datastores[]
- VMwareDatastore
  - Primary key: id
  - Indexes: organizationId, clusterId
  - Foreign keys: organizationId -> organizations.id (Cascade), clusterId -> vmware_clusters.id (Set Null)
- Relationship
  - Primary key: id
  - Indexes: sourceDeviceId, targetDeviceId, relationshipType
  - JSONB: properties
  - Enum: relationshipType includes CONTAINS, CONNECTS_TO, VIRTUAL_RUNS_ON, CLUSTER_CONTAINS, VLAN_MEMBER, FIREWALL_POLICY, SERVICE_DEPENDENCY, HA_PAIR, UPLINK, SPANNING_TREE

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)

### Observability and Alarms
- AuditLog
  - Primary key: id
  - Indexes: entityId, timestamp
  - JSONB: changes
- DeviceHealthSnapshot
  - Primary key: id
  - Indexes: (deviceId, timestamp)
- Alarm Management Tables
  - AlarmDefinition, AlarmEvent, AlarmCooldown, AlarmCheckLog, CachedEvent, NotificationConfig, SystemConfig, NotificationDLQ, AlarmWhitelist
  - JSONB fields for flexible payloads
  - Indexes optimized for time-series and lookup performance

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)

### NMS Integration Tables
- NmsInterface
  - Primary key: id
  - Unique constraint: (nmsDeviceId, interfaceIndex)
  - Indexes: nmsDeviceId, admin_status, oper_status
- NmsHealthMetric
  - Primary key: id
  - Indexes: nmsDeviceId, collectedAt
- NmsTopologyLink
  - Primary key: id
  - Unique constraint: (nmsDeviceId, localInterface, remoteDeviceName)
  - Indexes: nmsDeviceId
- NmsDiscoveryScan
  - Primary key: id
  - Indexes: status, createdAt
- NmsDiscoveredDevice
  - Primary key: id
  - Unique constraint: (scanId, ipAddress)
  - Indexes: scanId, ipAddress
- NmsDeviceMetric
  - Primary key: id
  - Indexes: nmsDeviceId, metricType, collectedAt
- NmsInterfaceMetric
  - Primary key: id
  - Indexes: nmsDeviceId, interfaceIndex, collectedAt
- NmsBackup
  - Primary key: id
  - Indexes: nmsDeviceId, createdAt

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)

## License Management System

### Licensing Infrastructure Overview
The InfraScope licensing system provides comprehensive license management for both trial and commercial deployments. It includes customer management, license key validation, machine activation tracking, and periodic usage reporting.

### Core Licensing Entities

#### Customer Entity
- Represents the license holder with company and contact information
- Supports different tiers (TRIAL, STANDARD, ENTERPRISE)
- Tracks customer status (ACTIVE, INACTIVE, SUSPENDED)
- Links to multiple licenses and activations

#### License Entity
- Contains the license key with unique constraint
- Links to a Customer through foreign key relationship
- Defines license tier, device/user limits, and validity period
- Tracks activation limit and current status
- Maintains creation/update timestamps

#### LicenseActivation Entity
- Tracks individual machine activations for each license
- Uses composite unique constraint (licenseId, machineId)
- Stores machine identification, IP address, hostname, and version
- Maintains activation status and usage data JSONB field
- Records activation and last seen timestamps

#### LicenseHeartbeat Entity
- Records periodic usage reports from activated installations
- Tracks device and user counts, application version, and IP address
- Provides time-series data for license usage monitoring
- Supports license limit warnings and expiration tracking

```mermaid
classDiagram
class Customer {
+string id
+string companyName
+string contactName
+string email
+string? phone
+LicenseTier tier
+CustomerStatus status
+string? notes
+DateTime createdAt
+DateTime updatedAt
}
class License {
+string id
+string key
+string customerId
+LicenseTier tier
+int maxDevices
+int maxUsers
+DateTime validFrom
+DateTime validUntil
+LicenseStatus status
+int activationLimit
+DateTime createdAt
+DateTime updatedAt
}
class LicenseActivation {
+string id
+string licenseId
+string customerId
+string machineId
+DateTime activatedAt
+DateTime? lastSeenAt
+string? ipAddress
+string? hostname
+string? version
+ActivationStatus status
+Json? usageData
}
class LicenseHeartbeat {
+string id
+string licenseId
+string machineId
+int deviceCount
+int userCount
+string? appVersion
+string? ipAddress
+DateTime createdAt
}
Customer --> License : "holds"
License --> LicenseActivation : "activates"
License --> LicenseHeartbeat : "reports"
LicenseActivation --> Customer : "belongs_to"
LicenseActivation --> License : "belongs_to"
LicenseHeartbeat --> License : "belongs_to"
```

**Diagram sources**
- [schema.prisma](file://prisma/schema.prisma)
- [client.ts](file://lib/license/client.ts)

### License Management APIs

#### Activation Endpoint
- **POST /api/license/activate**
- Validates license key and machine ID
- Checks license status and activation limits
- Creates or updates license activation record
- Issues JWT token for subsequent validation
- Returns activation token and license state

#### Validation Endpoint
- **POST /api/license/validate**
- Validates existing license activation
- Checks license status, customer status, and expiry
- Updates last seen timestamp for active activations
- Reissues JWT token if expired or missing
- Returns validation status and license state

#### Heartbeat Endpoint
- **POST /api/license/heartbeat**
- Records periodic usage data from activated installations
- Updates activation last seen and usage data
- Generates warnings for approaching license limits
- Tracks device and user counts, application version
- Returns success status and warnings

#### Status Endpoint
- **GET /api/license/status**
- Provides current license status and usage statistics
- Used by administrative license management interface
- Combines license information with system usage metrics

### License Validation Workflow

```mermaid
sequenceDiagram
participant Client as "On-Premise Client"
participant Server as "License Server"
participant DB as "Database"
Client->>Server : POST /api/license/activate
Server->>DB : Validate license key
DB-->>Server : License details
Server->>DB : Check activation limits
Server->>DB : Create/Update activation
Server->>Server : Sign JWT token
Server-->>Client : Token + License State
loop Periodic Validation
Client->>Server : POST /api/license/validate
Server->>DB : Validate activation
DB-->>Server : Activation details
Server->>DB : Update last seen
Server-->>Client : Validation + Token (if needed)
end
loop Periodic Heartbeat
Client->>Server : POST /api/license/heartbeat
Server->>DB : Record heartbeat
Server->>DB : Update activation usage
Server-->>Client : Success + Warnings
end
```

**Diagram sources**
- [activate/route.ts](file://app/api/license/activate/route.ts)
- [validate/route.ts](file://app/api/license/validate/route.ts)
- [heartbeat/route.ts](file://app/api/license/heartbeat/route.ts)
- [client.ts](file://lib/license/client.ts)

### License Token Management
- Uses JWT (JSON Web Tokens) for secure license validation
- Tokens signed with HS256 algorithm using configurable secret
- Token expiration aligned with license expiry date
- Supports automatic token refresh and renewal
- Includes license metadata in token payload for offline validation

### License Tier Enumeration
- TRIAL: Limited functionality with grace period support
- STANDARD: Basic commercial license with standard limits
- ENTERPRISE: Full commercial license with enhanced limits

### License Status Tracking
- ACTIVE: License is valid and active
- EXPIRED: License has passed validity period
- REVOKED: License has been manually revoked
- SUSPENDED: License has been temporarily suspended

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [client.ts](file://lib/license/client.ts)
- [jwt.ts](file://lib/license/jwt.ts)
- [activate/route.ts](file://app/api/license/activate/route.ts)
- [validate/route.ts](file://app/api/license/validate/route.ts)
- [heartbeat/route.ts](file://app/api/license/heartbeat/route.ts)
- [status/route.ts](file://app/api/license/status/route.ts)

## Dependency Analysis
This section maps direct and indirect dependencies among entities, highlighting foreign keys and indexes that enforce referential integrity and enable efficient queries. The licensing system introduces new relationships between customers, licenses, activations, and heartbeats.

```mermaid
graph LR
ORG["organizations"] --> BLD["buildings"]
BLD --> FLR["floors"]
FLR --> RM["rooms"]
RM --> RCK["racks"]
RCK --> RU["rack_units"]
RU --> DEV["devices"]
DEV --> NI["network_interfaces"]
DEV --> SP["switch_ports"]
DEV --> SVC["services"]
DEV --> DEP["dependencies"]
NI --> CONN["connections"]
SP --> CONN
SVC --> APP["applications"]
DEV --> FW_P["firewall_policies"]
DEV --> FW_A["firewall_addresses"]
ORG --> VLAN["vlans"]
VLAN --> SUB["subnets"]
VLAN --> NI
ORG --> VMC["vmware_clusters"]
VMC --> DEV
VMC --> VMD["vmware_datastores"]
DEV --> REL["relationships"]
DEV --> NMS_INT["nms_interfaces"]
DEV --> NMS_HM["nms_health_metrics"]
DEV --> NMS_TL["nms_topology_links"]
DEV --> NMS_DM["nms_device_metrics"]
DEV --> NMS_IM["nms_interface_metrics"]
DEV --> NMS_BK["nms_backups"]
CUST["customers"] --> LIC["licenses"]
LIC --> LACT["license_activations"]
LIC --> LHB["license_heartbeats"]
LACT --> CUST
LACT --> LIC
LHB --> LIC
```

**Diagram sources**
- [schema.prisma](file://prisma/schema.prisma)
- [initial_schema migration.sql](file://prisma/migrations/20260101220408_initial_schema/migration.sql)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)
- [client.ts](file://lib/license/client.ts)

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [initial_schema migration.sql](file://prisma/migrations/20260101220408_initial_schema/migration.sql)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)
- [client.ts](file://lib/license/client.ts)

## Performance Considerations
- Indexes
  - Devices: rackId, parentDeviceId, zabbixHostId, vmwareMoref, vmwareClusterId, nmsDeviceId
  - NetworkInterfaces: deviceId, (deviceId, name)
  - SwitchPorts: switchDeviceId, (switchDeviceId, name)
  - Connections: sourcePortId, sourceInterfaceId
  - Services: deviceId, applicationId, (deviceId, port, protocol)
  - Dependencies: sourceServiceId, targetDeviceId
  - AuditLogs: entityId, timestamp
  - DeviceHealthSnapshots: (deviceId, timestamp)
  - Enterprise: vlans (organizationId, vlanId), subnets (organizationId, cidr), firewall_policies/deviceId, vmware_clusters/organizationId, vmware_datastores (organizationId, clusterId), vm_snapshots(vmId)
  - Relationships: sourceDeviceId, targetDeviceId, relationshipType
  - NMS: nms_interfaces (nmsDeviceId, interfaceIndex), nms_health_metrics (nmsDeviceId, collectedAt), nms_topology_links (nmsDeviceId), nms_device_metrics (nmsDeviceId, metricType, collectedAt), nms_interface_metrics (nmsDeviceId, interfaceIndex, collectedAt), nms_backups (nmsDeviceId)
  - Alarms: alarm_events (alarmId, createdAt, severity), cached_events (logtype, eventTime), notification_dlq (status, nextRetry), alarm_whitelist (alarmCode, enabled)
  - **License System**: licenses (customerId, status, key), license_activations (licenseId, machineId, status), license_heartbeats (licenseId, createdAt)
- JSONB Usage
  - metadata fields on Device, Service, AuditLog, FirewallPolicy, FirewallAddress, AlarmDefinition, AlarmEvent, CachedEvent, NotificationDLQ, AlarmWhitelist enable flexible schema evolution without altering core tables.
  - **License usageData JSONB field** stores dynamic usage statistics for each activation.
- Time-Series Optimization
  - Indexed composite keys on timestamps (e.g., device_health_snapshots, nms_health_metrics, nms_device_metrics, cached_events, license_heartbeats) support efficient range queries.
  - **License heartbeat indexing** enables efficient license usage trend analysis.
- Prisma Client
  - Singleton client configured to minimize logging overhead; adjust PRISMA_LOG_QUERIES for diagnostics.
- **JWT Token Management**
  - Efficient token validation reduces server load for license verification.
  - Token caching minimizes repeated server requests for license validation.

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [initial_schema migration.sql](file://prisma/migrations/20260101220408_initial_schema/migration.sql)
- [enterprise_extension migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [add_nms_integration migration.sql](file://prisma/migrations/20260331134657_add_nms_integration/migration.sql)
- [prisma.ts](file://lib/prisma.ts)
- [jwt.ts](file://lib/license/jwt.ts)

## Troubleshooting Guide
- Audit Trail
  - Use AuditLog to track entity changes; index on entityId and timestamp enables efficient lookups.
- Health Snapshots
  - DeviceHealthSnapshot provides historical status and metrics; composite index aids time-range queries.
- Alarm Suppression and Whitelist
  - The alarm detection engine checks whitelist entries and suppression rules; ensure integration configs are present and enabled.
- NMS Migration
  - The migration script inserts NMS switches into devices with unique nms_device_id; verify uniqueness and conflict resolution.
- Prisma Client
  - Ensure the singleton client is initialized and logging is disabled unless needed for diagnostics.
- **License System Troubleshooting**
  - **Activation Failures**: Check license key validity, customer status, and activation limits before attempting reactivation.
  - **Validation Errors**: Verify JWT token signature and expiration; ensure license server connectivity.
  - **Heartbeat Issues**: Monitor license_heartbeats table for missing reports; check network connectivity from client installations.
  - **Grace Period**: During server unavailability, system operates in grace mode with cached license state.
  - **Token Management**: Verify LICENSE_JWT_SECRET environment variable for proper JWT token signing and verification.

**Section sources**
- [schema.prisma](file://prisma/schema.prisma)
- [detection-engine.ts](file://lib/alarms/detection-engine.ts)
- [migrate_nms_db.sql](file://scripts/migrate_nms_db.sql)
- [prisma.ts](file://lib/prisma.ts)
- [client.ts](file://lib/license/client.ts)
- [jwt.ts](file://lib/license/jwt.ts)

## Conclusion
InfraScope's database schema combines a robust hierarchical location model, flexible Device metadata, comprehensive network topology management, enterprise-grade observability and alarm systems, and a sophisticated licensing infrastructure. Prisma-driven migrations maintain schema integrity, while JSONB fields and time-series tables accommodate evolving requirements. The licensing system provides comprehensive license management with JWT-based validation, machine activation tracking, and usage monitoring. Carefully designed indexes and constraints ensure performance and data consistency across the platform, supporting both trial and commercial deployment scenarios.

## Appendices

### Data Lifecycle and Retention Policies
- Time-series tables (DeviceHealthSnapshot, NmsHealthMetric, NmsDeviceMetric, NmsInterfaceMetric, CachedEvent, LicenseHeartbeat) should implement retention policies to manage growth. Recommended strategies:
  - Partitioning by time (monthly/quarterly) for CachedEvent, NMS metrics, and license heartbeats.
  - Archival jobs to move older data to cold storage.
  - Automated cleanup tasks to remove records older than 90–180 days based on compliance requirements.
  - **License data retention**: Consider 2-year retention for license_heartbeats and license_activations for audit purposes.
- Audit logs and alarm events can be retained per regulatory needs; consider compression and archival after initial review periods.

### Migration Strategies
- Incremental Migrations
  - Use Prisma migrations to evolve the schema safely; each migration defines enums, tables, indexes, and foreign keys.
  - **License system migrations**: New licensing tables are included in the main schema definition with appropriate foreign key relationships.
- Data Migration
  - Use SQL scripts (e.g., migrate_nms_db.sql) to seed or transform data during environment setup.
  - **Legacy license data**: Existing license information can be migrated to new licensing tables during system upgrade.
- Rollback Planning
  - Keep previous migration artifacts; revert cautiously with careful index and constraint handling.
  - **License rollback**: Ensure proper cleanup of JWT secrets and license cache files during rollback procedures.

### Sample Data Structures (Conceptual)
- Device
  - id, name, type, vendor, model, serialNumber, assetTag, firmwareVersion, operatingSystem, criticality, status, rackId, rackUnitPosition, parentDeviceId, supportDate, healthScore, metadata, tags, zabbixHostId, vmwareMoref, fortiDeviceId, nms_device_id, management_ip, snmp_community, snmp_version, snmp_port, polling_enabled, polling_interval, lastPolledAt, vmHostId, vmwareClusterId
- Service
  - id, name, type, displayName, description, status, port, protocol, deviceId, applicationId, criticality, metadata
- NetworkInterface
  - id, name, type, ipv4, ipv6, macAddress, deviceId, status, vlanId
- SwitchPort
  - id, name, portType, vlanId, nativeVlan, allowedVlans, status, speed, duplex, switchDeviceId, connectedToId
- Connection
  - id, name, type, sourcePortId, sourceInterfaceId, destPortId, destInterfaceId, status
- VLAN/Subnet
  - id, organizationId, vlanId/cidr, name, subnet/gateway/vrf/description
- FirewallPolicy/Address
  - id, deviceId, policyId/name/type/value, srcAddresses/dstAddresses/services, metadata
- Relationship
  - id, sourceDeviceId, targetDeviceId, relationshipType, properties, source, confidence
- NMS Tables
  - NmsInterface, NmsHealthMetric, NmsTopologyLink, NmsDiscoveryScan, NmsDiscoveredDevice, NmsDeviceMetric, NmsInterfaceMetric, NmsBackup
- **License System Tables** *(Updated)*
  - Customer: id, company_name, contact_name, email, phone, tier, status, notes, created_at, updated_at
  - License: id, key, customer_id, tier, max_devices, max_users, valid_from, valid_until, status, activation_limit, created_at, updated_at
  - LicenseActivation: id, license_id, customer_id, machine_id, activated_at, last_seen_at, ip_address, hostname, version, status, usage_data
  - LicenseHeartbeat: id, license_id, machine_id, device_count, user_count, app_version, ip_address, created_at

### License System Configuration
- **Environment Variables**:
  - LICENSE_SERVER_URL: Central license server endpoint (default: https://license.infrascope.com)
  - LICENSE_JWT_SECRET: Secret key for JWT token signing and verification
  - LICENSE_KEY: Customer license key for on-premise installations
- **Cache Management**:
  - Local cache file for license state persistence during network outages
  - 7-day grace period for server unavailability
  - Automatic cache validation and renewal
- **Security Considerations**:
  - JWT tokens include license metadata and expiration
  - Token verification validates signature and expiration
  - Usage data is transmitted securely with authorization headers
  - License keys are masked in logs and responses