# Enterprise Features

<cite>
**Referenced Files in This Document**
- [schema.prisma](file://prisma/schema.prisma)
- [migration.sql](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql)
- [vmware.md](file://docs/20-modules/integrations/vmware.md)
- [vmware.ts](file://lib/integrations/vmware.ts)
- [index.ts](file://lib/license/index.ts)
- [client.ts](file://lib/license/client.ts)
- [features.ts](file://lib/license/features.ts)
- [jwt.ts](file://lib/license/jwt.ts)
- [machine-id.ts](file://lib/license/machine-id.ts)
- [middleware.ts](file://lib/license/middleware.ts)
- [activate/route.ts](file://app/api/license/activate/route.ts)
- [validate/route.ts](file://app/api/license/validate/route.ts)
- [heartbeat/route.ts](file://app/api/license/heartbeat/route.ts)
- [status/route.ts](file://app/api/license/status/route.ts)
- [page.tsx](file://app/settings/license/page.tsx)
- [install-guide.html](file://deploy/install-guide.html)
- [middleware.ts](file://middleware.ts)
</cite>

## Update Summary
**Changes Made**
- Enhanced license management system documentation with comprehensive JWT-based license token validation
- Updated heartbeat monitoring and status tracking workflows for enterprise deployments
- Improved license validation cycle with grace period handling and restricted mode transitions
- Added detailed machine identification system for on-premise deployments
- Expanded feature gating mechanisms across TRIAL, STANDARD, and ENTERPRISE tiers
- Integrated comprehensive license management APIs and administrative interfaces

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Enhanced License Management System](#enhanced-license-management-system)
7. [License Management APIs](#license-management-apis)
8. [Feature Gating and Access Control](#feature-gating-and-access-control)
9. [Dependency Analysis](#dependency-analysis)
10. [Performance Considerations](#performance-considerations)
11. [Troubleshooting Guide](#troubleshooting-guide)
12. [Conclusion](#conclusion)
13. [Appendices](#appendices)

## Introduction
This document provides comprehensive data model documentation for enterprise-level extensions in the platform, including the enhanced enterprise licensing system for on-premise deployments. The licensing system encompasses license activation, validation, heartbeat monitoring, status checking, JWT token management, machine identification, and feature gating across TRIAL, STANDARD, and ENTERPRISE tiers. It covers VLAN management, VMware integration, firewall policies, capacity monitoring, virtual machine snapshot management, and integration configuration/logging.

**Updated** Enhanced with comprehensive JWT-based license token validation, heartbeat monitoring, and status tracking for enterprise deployments.

## Project Structure
Enterprise features are defined in the Prisma schema and implemented across backend services, UI pages, and licensing infrastructure. The schema defines core models for licensing (Customer, License, LicenseActivation, LicenseHeartbeat), alongside existing enterprise models for VLANs, subnets, firewall integration, VMware clusters/datastores, capacity metrics, VM snapshots, relationships, and integration configurations. The licensing system integrates with the VMware integration module and other enterprise features.

```mermaid
graph TB
subgraph "Prisma Schema"
ORG["Organization"]
DEV["Device"]
NI["NetworkInterface"]
VLAN["Vlan"]
SUB["Subnet"]
FPOL["FirewallPolicy"]
FADDR["FirewallAddress"]
CLU["VMwareCluster"]
DS["VMwareDatastore"]
CM["CapacityMetric"]
SNAP["VmSnapshot"]
REL["Relationship"]
ICONF["IntegrationConfig"]
ISLOG["IntegrationSyncLog"]
CUST["Customer"]
LIC["License"]
LACT["LicenseActivation"]
LHB["LicenseHeartbeat"]
end
subgraph "Enhanced Licensing System"
JWT["JWT Token Management"]
MID["Machine ID Generation"]
FS["Feature Gating"]
API["License APIs"]
HB["Heartbeat Monitoring"]
STATUS["Status Tracking"]
end
ORG --> VLAN
ORG --> SUB
ORG --> CLU
ORG --> DS
DEV --> NI
NI --> VLAN
DEV --> CLU
DEV --> FPOL
DEV --> FADDR
CLU --> DS
DEV --> SNAP
DEV --> REL
DEV --> CM
ICONF --> ISLOG
CUST --> LIC
LIC --> LACT
LIC --> LHB
JWT --> API
MID --> API
FS --> API
HB --> API
STATUS --> API
```

**Diagram sources**
- [schema.prisma:11-25](file://prisma/schema.prisma#L11-L25)
- [schema.prisma:591-608](file://prisma/schema.prisma#L591-L608)
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)
- [schema.prisma:629-667](file://prisma/schema.prisma#L629-L667)
- [schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)
- [schema.prisma:715-727](file://prisma/schema.prisma#L715-L727)
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [schema.prisma:745-762](file://prisma/schema.prisma#L745-L762)
- [schema.prisma:765-801](file://prisma/schema.prisma#L765-L801)
- [schema.prisma:1382-1487](file://prisma/schema.prisma#L1382-L1487)

**Section sources**
- [schema.prisma:11-25](file://prisma/schema.prisma#L11-L25)
- [schema.prisma:591-608](file://prisma/schema.prisma#L591-L608)
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)
- [schema.prisma:629-667](file://prisma/schema.prisma#L629-L667)
- [schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)
- [schema.prisma:715-727](file://prisma/schema.prisma#L715-L727)
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [schema.prisma:745-762](file://prisma/schema.prisma#L745-L762)
- [schema.prisma:765-801](file://prisma/schema.prisma#L765-L801)
- [schema.prisma:1382-1487](file://prisma/schema.prisma#L1382-L1487)

## Core Components
- Vlan: Represents Layer 2 broadcast domains with optional CIDR subnet association, gateway, and VRF support. Each VLAN belongs to an organization and can be attached to network interfaces and subnets.
- Subnet: Defines IP address spaces using CIDR notation, with typed categories (management, production, development, DMZ, guest, reserved) and optional VLAN linkage.
- FirewallPolicy and FirewallAddress: Fortinet integration models capturing policy rules and address objects linked to a FortiGate device.
- VMwareCluster and VMwareDatastore: vCenter-backed models for compute clusters and storage resources, including capacity and host/datastore counts.
- CapacityMetric: Time-series metrics for CPU, memory, and disk utilization across VMware resources.
- VmSnapshot: Snapshot records for virtual machines, including current snapshot flags and sizing.
- Relationship: Edge relationships between devices (contains, connects_to, virtual_runs_on, cluster_contains, vlan_member, firewall_policy, service_dependency, HA_pair, uplink, spanning_tree).
- IntegrationConfig and IntegrationSyncLog: Centralized configuration and logs for external system integrations (Zabbix, VMware vCenter, Fortinet, SNMP, cloud providers, API).
- **Enhanced License Management**: Complete licensing infrastructure including Customer, License, LicenseActivation, and LicenseHeartbeat models with tier-based access control, JWT token validation, heartbeat monitoring, and status tracking.
- **JWT Token System**: Secure token-based validation for license state verification and feature gating with automatic renewal and expiration handling.
- **Machine Identification**: Stable hardware fingerprinting for on-premise deployment tracking and license activation binding with Docker, Linux, macOS, and fallback strategies.
- **Heartbeat Monitoring**: Periodic usage reporting and system health tracking with configurable intervals and warning systems.
- **Status Tracking**: Comprehensive license status monitoring with grace period detection, expiration warnings, and administrative oversight.

**Section sources**
- [schema.prisma:591-608](file://prisma/schema.prisma#L591-L608)
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)
- [schema.prisma:629-667](file://prisma/schema.prisma#L629-L667)
- [schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)
- [schema.prisma:715-727](file://prisma/schema.prisma#L715-L727)
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [schema.prisma:745-762](file://prisma/schema.prisma#L745-L762)
- [schema.prisma:765-801](file://prisma/schema.prisma#L765-L801)
- [schema.prisma:1382-1487](file://prisma/schema.prisma#L1382-L1487)

## Architecture Overview
The enterprise data model centers around organizations and their infrastructure assets, now enhanced with comprehensive licensing capabilities. VLANs and subnets define network topology and IP allocation. Firewall models integrate with Fortinet devices. VMware models connect to vCenter for compute and storage visibility. Capacity metrics enable time-series monitoring. Snapshots track VM lifecycle. Relationships capture topology and dependencies. Integration configuration and logs manage external system connectivity. The enhanced licensing system provides tier-based access control, machine identification, JWT token validation, heartbeat monitoring, and administrative oversight with comprehensive status tracking.

```mermaid
classDiagram
class Organization {
+String id
+String name
+String code
+DateTime createdAt
+DateTime updatedAt
}
class Vlan {
+String id
+Int vlanId
+String name
+String? subnet
+String? gateway
+String? vrf
+DateTime createdAt
+DateTime updatedAt
}
class Subnet {
+String id
+String cidr
+String? name
+SubnetType type
+String? description
}
class Device {
+String id
+String name
+DeviceType type
+String? vmwareMoref
+String? vmwareClusterId
}
class NetworkInterface {
+String id
+String name
+String? vlanId
}
class FirewallPolicy {
+String id
+Int policyId
+String? name
+String action
+Json? srcAddresses
+Json? dstAddresses
+Json? services
}
class FirewallAddress {
+String id
+String name
+String type
+String value
}
class VMwareCluster {
+String id
+String vcenterId
+String name
+BigInt? cpuTotal
+BigInt? cpuUsed
+BigInt? memoryTotal
+BigInt? memoryUsed
+Int hostCount
+Int vmCount
}
class VMwareDatastore {
+String id
+String vcenterId
+String name
+String? type
+BigInt? capacity
+BigInt? freeSpace
+String? datacenter
+String? clusterId
}
class CapacityMetric {
+String id
+String resourceType
+String resourceId
+String resourceName
+String metricType
+Float value
+Float? total
+DateTime timestamp
}
class VmSnapshot {
+String id
+String vmId
+String snapshotId
+String? name
+Boolean isCurrent
}
class Relationship {
+String id
+String sourceDeviceId
+String targetDeviceId
+RelationshipType relationshipType
+Float confidence
}
class IntegrationConfig {
+String id
+IntegrationType type
+String name
+Boolean enabled
+Int syncInterval
}
class IntegrationSyncLog {
+String id
+String configId
+String status
+Int itemsProcessed
+DateTime startedAt
}
class Customer {
+String id
+String companyName
+String contactName
+String email
+String tier
+String status
}
class License {
+String id
+String key
+String tier
+Int maxDevices
+Int maxUsers
+DateTime validFrom
+DateTime validUntil
+String status
+Int activationLimit
}
class LicenseActivation {
+String id
+String licenseId
+String machineId
+DateTime activatedAt
+DateTime lastSeenAt
+String? ipAddress
+String? hostname
+String? version
+String status
+Json? usageData
}
class LicenseHeartbeat {
+String id
+String licenseId
+String machineId
+Int deviceCount
+Int userCount
+String? appVersion
+String? ipAddress
+DateTime createdAt
}
Organization "1" --> "many" Vlan
Organization "1" --> "many" Subnet
Organization "1" --> "many" VMwareCluster
Organization "1" --> "many" VMwareDatastore
Device "1" --> "many" NetworkInterface
NetworkInterface "1" --> "0..1" Vlan
Device "1" --> "many" FirewallPolicy
Device "1" --> "many" FirewallAddress
Device "1" --> "0..1" VMwareCluster
VMwareCluster "1" --> "many" VMwareDatastore
Device "1" --> "many" VmSnapshot
Device "1" --> "many" Relationship
Device "1" --> "many" CapacityMetric
IntegrationConfig "1" --> "many" IntegrationSyncLog
Customer "1" --> "many" License
License "1" --> "many" LicenseActivation
License "1" --> "many" LicenseHeartbeat
```

**Diagram sources**
- [schema.prisma:11-25](file://prisma/schema.prisma#L11-L25)
- [schema.prisma:591-608](file://prisma/schema.prisma#L591-L608)
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)
- [schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)
- [schema.prisma:231-251](file://prisma/schema.prisma#L231-L251)
- [schema.prisma:629-667](file://prisma/schema.prisma#L629-L667)
- [schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)
- [schema.prisma:694-712](file://prisma/schema.prisma#L694-L712)
- [schema.prisma:715-727](file://prisma/schema.prisma#L715-L727)
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [schema.prisma:745-762](file://prisma/schema.prisma#L745-L762)
- [schema.prisma:765-801](file://prisma/schema.prisma#L765-L801)
- [schema.prisma:1382-1487](file://prisma/schema.prisma#L1382-L1487)

## Detailed Component Analysis

### VLAN Management
- Purpose: Define Layer 2 broadcast domains with optional subnet association, gateway, and VRF support.
- Key attributes:
  - VLAN identifier, name, description
  - Optional CIDR subnet, gateway, VRF
  - Organization-scoped uniqueness on (organizationId, vlanId)
- Relationships:
  - Associated with NetworkInterface and Subnet
  - Belongs to Organization

```mermaid
erDiagram
ORGANIZATION ||--o{ VLAN : "has"
VLAN ||--o{ SUBNET : "may associate"
VLAN ||--o{ NETWORK_INTERFACE : "attaches"
```

**Diagram sources**
- [schema.prisma:591-608](file://prisma/schema.prisma#L591-L608)
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)
- [schema.prisma:231-251](file://prisma/schema.prisma#L231-L251)

**Section sources**
- [schema.prisma:591-608](file://prisma/schema.prisma#L591-L608)
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)

### Subnet Models
- Purpose: Allocate IP address spaces using CIDR notation with typed categories.
- Key attributes:
  - CIDR, name, type (management, production, development, DMZ, guest, reserved), description
  - Optional VLAN linkage
  - Organization-scoped uniqueness on (organizationId, cidr)
- Relationships:
  - Links to Vlan via optional foreign key

```mermaid
erDiagram
ORGANIZATION ||--o{ SUBNET : "owns"
VLAN ||--o{ SUBNET : "may reference"
```

**Diagram sources**
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)
- [schema.prisma:591-608](file://prisma/schema.prisma#L591-L608)

**Section sources**
- [schema.prisma:611-626](file://prisma/schema.prisma#L611-L626)

### Firewall Policies and Addresses (Fortinet Integration)
- FirewallPolicy:
  - Device-scoped policies with unique (deviceId, policyId)
  - Fields for action, interfaces, source/destination addresses, services, schedule, hit counters
- FirewallAddress:
  - Address objects (IP, FQDN, geoip, group) associated with a device
- Relationships:
  - Both models belong to Device

```mermaid
erDiagram
DEVICE ||--o{ FIREWALL_POLICY : "defines"
DEVICE ||--o{ FIREWALL_ADDRESS : "provides"
```

**Diagram sources**
- [schema.prisma:629-667](file://prisma/schema.prisma#L629-L667)
- [schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

**Section sources**
- [schema.prisma:629-667](file://prisma/schema.prisma#L629-L667)

### VMware Integration (Clusters, Datastores, Snapshots)
- VMwareCluster:
  - vCenter-scoped cluster with CPU/memory totals/usage, host and VM counts, status
  - Organization-scoped
- VMwareDatastore:
  - Storage resource with capacity/free space, type, datacenter, and optional cluster linkage
- VmSnapshot:
  - Snapshot records for VMs with current flag and size
- Relationships:
  - Device can reference a VMwareCluster (host-to-cluster)
  - Cluster has many datastores
  - Device has many snapshots

```mermaid
erDiagram
ORGANIZATION ||--o{ VMWARE_CLUSTER : "manages"
ORGANIZATION ||--o{ VMWARE_DATASTORE : "manages"
VMWARE_CLUSTER ||--o{ VMWARE_DATASTORE : "contains"
DEVICE ||--o{ VM_SNAPSHOT : "has"
DEVICE ||--o{ VMWARE_CLUSTER : "belongs to"
```

**Diagram sources**
- [schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)
- [schema.prisma:694-712](file://prisma/schema.prisma#L694-L712)
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

**Section sources**
- [schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)
- [schema.prisma:694-712](file://prisma/schema.prisma#L694-L712)
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [vmware.md:1-133](file://docs/20-modules/integrations/vmware.md#L1-L133)
- [vmware.ts:1-800](file://lib/integrations/vmware.ts#L1-L800)

### Capacity Monitoring (Time-Series Metrics)
- CapacityMetric:
  - Tracks resourceType (cluster/host/datastore), resourceId/resourceName
  - metricType (cpu, memory, disk)
  - value and optional total
  - timestamped entries for trend analysis
- Usage:
  - Supports dashboards and capacity planning queries

```mermaid
flowchart TD
Start(["Collect Capacity"]) --> SelectRes["Select Resource Type and ID"]
SelectRes --> MetricType{"Metric Type?"}
MetricType --> |CPU| ReadCPU["Read CPU Utilization"]
MetricType --> |Memory| ReadMem["Read Memory Utilization"]
MetricType --> |Disk| ReadDisk["Read Disk Utilization"]
ReadCPU --> Store["Insert CapacityMetric record"]
ReadMem --> Store
ReadDisk --> Store
Store --> End(["Indexed by ResourceType/ResourceID/Timestamp"])
```

**Diagram sources**
- [schema.prisma:715-727](file://prisma/schema.prisma#L715-L727)

**Section sources**
- [schema.prisma:715-727](file://prisma/schema.prisma#L715-L727)

### Virtual Machine Snapshots
- VmSnapshot:
  - Links VMs (Device) to snapshot identifiers
  - Tracks name, description, size, creation time, and current flag
- Use cases:
  - Backup verification, rollback readiness, drift analysis

```mermaid
sequenceDiagram
participant VC as "vCenter"
participant WS as "Web Service"
participant DB as "Database"
VC-->>WS : "Snapshot events"
WS->>DB : "Upsert VmSnapshot records"
DB-->>WS : "Persisted snapshots"
WS-->>DB : "Mark current snapshot"
```

**Diagram sources**
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [vmware.md:74-81](file://docs/20-modules/integrations/vmware.md#L74-L81)

**Section sources**
- [schema.prisma:729-742](file://prisma/schema.prisma#L729-L742)
- [vmware.md:74-81](file://docs/20-modules/integrations/vmware.md#L74-L81)

### Relationships (Topology and Dependencies)
- Relationship:
  - Edges between devices with typed relationships and confidence
  - Properties JSON supports carrying auxiliary data (e.g., VLAN IDs, policy IDs)
- Types include containment, physical connections, virtual runs-on, cluster membership, VLAN membership, firewall policy edges, service dependencies, HA pairs, uplinks, and spanning tree blocking

```mermaid
erDiagram
DEVICE ||--o{ RELATIONSHIP : "source"
DEVICE ||--o{ RELATIONSHIP : "target"
```

**Diagram sources**
- [schema.prisma:745-762](file://prisma/schema.prisma#L745-L762)
- [schema.prisma:896-907](file://prisma/schema.prisma#L896-L907)

**Section sources**
- [schema.prisma:745-762](file://prisma/schema.prisma#L745-L762)
- [schema.prisma:896-907](file://prisma/schema.prisma#L896-L907)

### Integration Configuration and Sync Logs
- IntegrationConfig:
  - Stores integration type, name, description, encrypted config, enabled flag, sync interval, and timestamps
  - Unique constraint on (type, name)
- IntegrationSyncLog:
  - Records sync outcomes, item counts, messages, and timing per IntegrationConfig
- Use cases:
  - Centralized management of external system credentials and schedules
  - Auditing and troubleshooting sync issues

```mermaid
erDiagram
INTEGRATION_CONFIG ||--o{ INTEGRATION_SYNC_LOG : "logs"
```

**Diagram sources**
- [schema.prisma:765-801](file://prisma/schema.prisma#L765-L801)

**Section sources**
- [schema.prisma:765-801](file://prisma/schema.prisma#L765-L801)

## Enhanced License Management System

### Comprehensive License Infrastructure
The enhanced enterprise licensing system provides comprehensive license management for on-premise deployments with three distinct tiers: TRIAL, STANDARD, and ENTERPRISE. The system includes complete infrastructure for license activation, validation, heartbeat monitoring, status tracking, and administrative oversight with JWT token validation and machine identification.

**Enhanced License Models:**
- **Customer**: Represents license holders with company information, contact details, tier assignment, and status tracking
- **License**: Contains license key, tier level, usage limits (devices/users), validity periods, activation limits, and status
- **LicenseActivation**: Tracks machine activations with hardware fingerprints, IP addresses, versions, and usage data
- **LicenseHeartbeat**: Monitors ongoing usage patterns, system health, and heartbeat reporting with configurable intervals

```mermaid
erDiagram
CUSTOMER ||--o{ LICENSE : "owns"
LICENSE ||--o{ LICENSE_ACTIVATION : "activations"
LICENSE ||--o{ LICENSE_HEARTBEAT : "heartbeats"
LICENSE_ACTIVATION ||--|| LICENSE : "belongs to"
LICENSE_HEARTBEAT ||--|| LICENSE : "belongs to"
```

**Diagram sources**
- [schema.prisma:1382-1487](file://prisma/schema.prisma#L1382-L1487)

**Section sources**
- [schema.prisma:1382-1487](file://prisma/schema.prisma#L1382-L1487)

### Advanced License Activation Process
The enhanced license activation process establishes secure bindings between license keys and on-premise installations using machine identification and JWT token validation with improved error handling and status tracking.

**Enhanced Activation Workflow:**
1. Client requests license activation with license key and machine ID
2. Server validates license key and customer status
3. Checks activation limits and existing activations
4. Creates/upserts license activation record with usage data
5. Issues signed JWT token with license details and expiration
6. Returns token and comprehensive license state to client
7. Updates activation last seen timestamp and IP address

```mermaid
sequenceDiagram
participant Client as "On-Premise Client"
participant Server as "License Server"
participant DB as "Database"
Client->>Server : POST /api/license/activate
Server->>DB : Validate license key
DB-->>Server : License details
Server->>DB : Check activation limits
DB-->>Server : Current activations
Server->>DB : Upsert license activation
DB-->>Server : Activation saved
Server->>Server : Sign JWT token with expiration
Server-->>Client : {token, state}
Note over Client,Server : Enhanced JWT validation + machine ID binding
```

**Diagram sources**
- [activate/route.ts:16-147](file://app/api/license/activate/route.ts#L16-L147)
- [client.ts:119-142](file://lib/license/client.ts#L119-L142)

**Section sources**
- [activate/route.ts:16-147](file://app/api/license/activate/route.ts#L16-L147)
- [client.ts:119-142](file://lib/license/client.ts#L119-L142)

### Comprehensive License Validation and Heartbeat System
The enhanced validation system operates on a 24-hour cycle with intelligent caching, grace period handling, and comprehensive status tracking for network outages and system health monitoring.

**Enhanced Validation Logic:**
- **Normal Operation**: Server validation with JWT token verification and automatic renewal
- **Grace Period**: 7-day grace period using cached license state during outages with status tracking
- **Restricted Mode**: Read-only operation after grace period expiration with comprehensive warnings
- **Heartbeat Monitoring**: Periodic usage reporting (every 6-12 hours) with warning generation
- **Status Tracking**: Real-time license status monitoring with administrative oversight

```mermaid
flowchart TD
Start(["Enhanced License Validation Cycle"]) --> CheckKey{"License Key Present?"}
CheckKey --> |No| TrialMode["TRIAL Mode<br/>10 devices, 2 users<br/>30 day expiry"]
CheckKey --> |Yes| TryValidate["Try Server Validation<br/>+ JWT Token Verification"]
TryValidate --> ValidateSuccess{"Validation Success?"}
ValidateSuccess --> |Yes| UpdateState["Update State & Cache<br/>+ Heartbeat Recording"]
ValidateSuccess --> |No| TryActivate["Try Full Activation<br/>+ Enhanced Error Handling"]
TryActivate --> ActivateSuccess{"Activation Success?"}
ActivateSuccess --> |Yes| UpdateState
ActivateSuccess --> |No| CheckGrace{"Within Grace Period?"}
CheckGrace --> |Yes| UseCache["Use Cached State<br/>Grace Mode Active<br/>+ Status Tracking"]
CheckGrace --> |No| Restricted["Restricted Mode<br/>Read-only Access<br/>+ Comprehensive Warnings"]
UpdateState --> ScheduleNext["Schedule Next Validation<br/>(24 hours)<br/>+ Heartbeat Monitoring"]
UseCache --> ScheduleNext
Restricted --> End(["End"])
ScheduleNext --> End
```

**Diagram sources**
- [client.ts:180-265](file://lib/license/client.ts#L180-L265)
- [install-guide.html:641-669](file://deploy/install-guide.html#L641-L669)

**Section sources**
- [client.ts:180-265](file://lib/license/client.ts#L180-L265)
- [install-guide.html:641-669](file://deploy/install-guide.html#L641-L669)

### Advanced JWT Token Management
The enhanced system uses JWT tokens for secure license validation with automatic renewal, expiration handling, and comprehensive error management for license state verification and feature gating.

**Enhanced Token Features:**
- HS256 signing algorithm with configurable secret
- Payload includes license details, tier, limits, and machine ID
- Automatic expiration matching license validity with renewal logic
- Comprehensive verification with proper error handling for expired tokens
- Enhanced security with license server secret management

```mermaid
classDiagram
class LicenseTokenPayload {
+String licenseId
+String customerId
+String key
+String tier
+Int maxDevices
+Int maxUsers
+String validUntil
+String machineId
}
class JWTUtilities {
+signLicenseToken(payload) String
+verifyLicenseToken(token) LicenseTokenPayload
}
LicenseTokenPayload --> JWTUtilities : "signed/verified by"
```

**Diagram sources**
- [jwt.ts:13-58](file://lib/license/jwt.ts#L13-L58)

**Section sources**
- [jwt.ts:13-58](file://lib/license/jwt.ts#L13-L58)

### Sophisticated Machine Identification System
The enhanced machine identification system creates stable hardware fingerprints for secure license binding across different deployment environments with improved Docker, Linux, macOS, and fallback strategies.

**Enhanced Identification Strategies:**
- **Docker**: Container hostname + volume UUID for persistent identification with marker persistence
- **Linux**: `/etc/machine-id` for system-wide unique identification
- **macOS**: IOPlatformSerialNumber via ioreg for hardware-bound identification
- **Fallback**: Random UUID persisted to `.machine-id` file with enhanced error handling
- **Enhanced Persistence**: Improved file system handling and cross-platform compatibility

```mermaid
flowchart TD
Start(["Enhanced Machine ID Generation"]) --> CheckDocker{"Running in Docker?"}
CheckDocker --> |Yes| DockerID["Use container hostname + volume UUID<br/>+ Enhanced Marker Persistence"]
CheckDocker --> |No| CheckLinux{"Linux System?"}
CheckLinux --> |Yes| LinuxID["Read /etc/machine-id<br/>+ Enhanced Error Handling"]
CheckLinux --> |No| CheckMac{"macOS System?"}
CheckMac --> |Yes| MacID["Extract IOPlatformSerialNumber<br/>+ SHA256 Hashing"]
CheckMac --> |No| Fallback["Generate Random UUID<br/>+ Enhanced Persistence<br/>+ Cross-platform Support"]
DockerID --> End(["Stable Machine ID"])
LinuxID --> End
MacID --> End
Fallback --> End
```

**Diagram sources**
- [machine-id.ts:31-102](file://lib/license/machine-id.ts#L31-L102)

**Section sources**
- [machine-id.ts:31-102](file://lib/license/machine-id.ts#L31-L102)

### Enhanced Heartbeat Monitoring and Status Tracking
The enhanced heartbeat system provides comprehensive usage tracking, system health monitoring, and status reporting with configurable intervals and warning generation for enterprise deployments.

**Enhanced Heartbeat Features:**
- **Periodic Reporting**: Every 6-12 hours with configurable intervals
- **Usage Tracking**: Device count, user count, and application version monitoring
- **Warning Generation**: Approaching limit warnings and expiration alerts
- **Status Recording**: IP address, timestamp, and usage data persistence
- **Administrative Oversight**: Comprehensive status tracking for license management

**Section sources**
- [heartbeat/route.ts:14-125](file://app/api/license/heartbeat/route.ts#L14-L125)
- [client.ts:292-297](file://lib/license/client.ts#L292-L297)

### Comprehensive Status Tracking System
The enhanced status tracking system provides detailed license information, usage statistics, and administrative oversight with comprehensive warning generation and status indicators.

**Enhanced Status Features:**
- **License Status Display**: Visual indicators (Active, Expiring Soon, Grace Period, Invalid)
- **Technical Details**: License key and machine ID display with masking
- **Usage Statistics**: Device and user count monitoring
- **Warning Generation**: Comprehensive warnings for approaching limits and expiration
- **Administrative Interface**: Enhanced UI with feature comparison and license management

**Section sources**
- [page.tsx:176-486](file://app/settings/license/page.tsx#L176-L486)
- [status/route.ts:12-38](file://app/api/license/status/route.ts#L12-L38)

## License Management APIs

### Enhanced Activation API
The enhanced activation endpoint handles initial license key registration and machine binding with improved error handling and comprehensive status reporting.

**Endpoint**: `POST /api/license/activate`
**Purpose**: Register license key on a machine for the first time with enhanced validation
**Request**: `{ licenseKey: string, machineId: string }`
**Response**: `{ token: string, state: LicenseState }`
**Enhanced Features**: 
- Comprehensive error handling and status reporting
- Enhanced activation limit checking
- Improved machine ID validation
- Detailed license state information

**Section sources**
- [activate/route.ts:16-147](file://app/api/license/activate/route.ts#L16-L147)

### Enhanced Validation API
The enhanced validation endpoint performs periodic license state verification and token renewal with automatic JWT token management and comprehensive status tracking.

**Endpoint**: `POST /api/license/validate`
**Purpose**: Validate existing license activation and refresh tokens with enhanced JWT handling
**Request**: `{ licenseKey: string, machineId: string, token?: string }`
**Response**: `{ valid: boolean, state: LicenseState, token?: string }`
**Enhanced Features**:
- Automatic JWT token renewal when expired
- Enhanced validation logic with comprehensive error handling
- Improved activation status checking
- Detailed state information with warnings

**Section sources**
- [validate/route.ts:16-157](file://app/api/license/validate/route.ts#L16-L157)

### Enhanced Heartbeat API
The enhanced heartbeat endpoint tracks ongoing usage patterns, system health, and license status with comprehensive warning generation and administrative oversight.

**Endpoint**: `POST /api/license/heartbeat`
**Purpose**: Report usage statistics, system health, and license status with enhanced monitoring
**Request**: `{ licenseKey: string, machineId: string, deviceCount?: number, userCount?: number, appVersion?: string }`
**Response**: `{ success: boolean, warnings?: string[], daysRemaining: number }`
**Enhanced Features**:
- Comprehensive warning generation for approaching limits
- Enhanced usage data recording
- Improved error handling and status reporting
- Detailed administrative oversight capabilities

**Section sources**
- [heartbeat/route.ts:14-125](file://app/api/license/heartbeat/route.ts#L14-L125)

### Enhanced Status API
The enhanced status endpoint provides comprehensive administrative license information, usage statistics, and license administration with enhanced status tracking.

**Endpoint**: `GET /api/license/status`
**Purpose**: Retrieve current license status and usage statistics for administrative monitoring
**Response**: `{ license: AdminLicenseInfo, usage: { deviceCount: number, userCount: number } }`
**Enhanced Features**:
- Comprehensive license status information
- Enhanced usage statistics
- Improved administrative oversight
- Detailed warning generation

**Section sources**
- [status/route.ts:12-38](file://app/api/license/status/route.ts#L12-L38)

## Feature Gating and Access Control

### Enhanced License Tiers and Feature Matrix
The enhanced licensing system implements tier-based feature gating across TRIAL, STANDARD, and ENTERPRISE tiers with granular access control and comprehensive status tracking.

**Enhanced Feature Availability Matrix:**
- **TRIAL**: Basic features with limitations (10 devices, 2 users, 30-day expiry)
- **STANDARD**: Core enterprise features plus integrations (VMware, Fortinet, Zabbix)
- **ENTERPRISE**: Advanced analytics, reporting, API access, and premium features

**Core Features** (Always Available):
- Dashboard, Devices, Locations, Racks, NMS, Alarms

**Enhanced Standard Features**:
- Integrations: VMware, Fortinet, Zabbix
- Reports, Audit

**Enhanced Enterprise Features**:
- Advanced Reports, External API, Analytics, Premium Audit

```mermaid
graph TB
subgraph "Enhanced License Tiers"
TRIAL["TRIAL<br/>10 devices, 2 users<br/>30 days"]
STANDARD["STANDARD<br/>Unlimited devices/users<br/>Full integrations<br/>Enhanced Monitoring"]
ENTERPRISE["ENTERPRISE<br/>Premium features<br/>Advanced analytics<br/>Comprehensive Oversight"]
end
subgraph "Enhanced Feature Categories"
CORE["Core Features<br/>Dashboard, Devices, Locations<br/>Enhanced Security"]
INT["Integrations<br/>VMware, Fortinet, Zabbix<br/>Enhanced Monitoring"]
ADV["Advanced Features<br/>Reports, Analytics, API<br/>Premium Features"]
end
TRIAL --> CORE
STANDARD --> CORE
STANDARD --> INT
ENTERPRISE --> CORE
ENTERPRISE --> INT
ENTERPRISE --> ADV
```

**Diagram sources**
- [features.ts:25-51](file://lib/license/features.ts#L25-L51)

**Section sources**
- [features.ts:25-51](file://lib/license/features.ts#L25-L51)

### Enhanced Usage Limit Checking
The enhanced system enforces usage limits through device and user count validation with configurable thresholds, comprehensive warning generation, and graceful degradation capabilities.

**Enhanced Limit Enforcement:**
- Device count checks against `maxDevices` limit (90% threshold for warnings)
- User count checks against `maxUsers` limit (90% threshold for warnings)
- Automatic warnings when approaching limits with enhanced messaging
- Graceful degradation when limits exceeded with comprehensive status tracking
- Enhanced administrative oversight with warning generation

**Section sources**
- [features.ts:78-90](file://lib/license/features.ts#L78-L90)
- [heartbeat/route.ts:84-106](file://app/api/license/heartbeat/route.ts#L84-L106)

### Enhanced Administrative License Interface
The enhanced administrative interface provides comprehensive license management with status monitoring, usage statistics, license administration, and enhanced warning generation.

**Enhanced Administrative Features:**
- License status display with enhanced visual indicators (Active, Expiring Soon, Grace Period, Invalid)
- Technical details including license key and machine ID with enhanced masking
- Usage statistics (device and user counts) with enhanced progress tracking
- License information formatting with color-coded status indicators
- Enhanced warning generation and administrative oversight
- Comprehensive feature comparison matrix

**Section sources**
- [page.tsx:176-486](file://app/settings/license/page.tsx#L176-L486)

## Dependency Analysis
- Foreign keys enforce referential integrity across models:
  - Vlan.organizationId -> Organization.id
  - Subnet.organizationId -> Organization.id; Subnet.vlanId -> Vlan.id
  - Device.vmwareClusterId -> VMwareCluster.id
  - NetworkInterface.vlanId -> Vlan.id
  - FirewallPolicy.deviceId -> Device.id; FirewallAddress.deviceId -> Device.id
  - VMwareDatastore.clusterId -> VMwareCluster.id
  - VmSnapshot.vmId -> Device.id
  - Relationship.sourceDeviceId/targetDeviceId -> Device.id
  - IntegrationSyncLog.configId -> IntegrationConfig.id
  - License.customerId -> Customer.id
  - LicenseActivation.licenseId -> License.id
  - LicenseHeartbeat.licenseId -> License.id
  - LicenseActivation.customerId -> Customer.id
  - LicenseActivation.machineId -> LicenseActivation.id

```mermaid
graph LR
ORG["Organization"] --> VLAN["Vlan"]
ORG --> SUB["Subnet"]
VLAN --> SUB
ORG --> CLU["VMwareCluster"]
ORG --> DS["VMwareDatastore"]
CLU --> DS
DEV["Device"] --> NI["NetworkInterface"]
NI --> VLAN
DEV --> FPOL["FirewallPolicy"]
DEV --> FADDR["FirewallAddress"]
DEV --> SNAP["VmSnapshot"]
DEV --> REL["Relationship"]
ICONF["IntegrationConfig"] --> ISLOG["IntegrationSyncLog"]
CUST["Customer"] --> LIC["License"]
LIC --> LACT["LicenseActivation"]
LIC --> LHB["LicenseHeartbeat"]
LACT --> LHB
```

**Diagram sources**
- [migration.sql:346-387](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql#L346-L387)

**Section sources**
- [migration.sql:346-387](file://prisma/migrations/20260130053347_enterprise_extension/migration.sql#L346-L387)

## Performance Considerations
- Indexes on frequently queried fields (e.g., device IDs, timestamps, organization IDs, license keys) improve lookup performance for relationships, firewall policies, capacity metrics, and licensing operations.
- Time-series partitioning strategies can be considered for CapacityMetric and LicenseHeartbeat to manage long histories efficiently.
- Caching strategies (e.g., snapshot cache TTL, license state cache, JWT token caching) reduce repeated API calls in integrations like VMware and licensing validation.
- Enhanced JWT token caching reduces cryptographic overhead during frequent validation cycles.
- Grace period caching ensures minimal performance impact during network outages with improved cache management.
- Heartbeat monitoring with configurable intervals optimizes resource usage while maintaining comprehensive status tracking.

## Troubleshooting Guide
- **Enhanced Licensing Issues**
  - Activation failures: Verify license key validity, customer status, and activation limits; check machine ID generation and JWT secret configuration; review enhanced error messages.
  - Validation failures: Confirm network connectivity to license server, token expiration, and proper JWT secret environment variable; check enhanced validation logs.
  - Grace period problems: Check cache file permissions, disk space, and grace period configuration; verify enhanced status tracking.
  - Heartbeat failures: Monitor heartbeat endpoint status, usage data recording, and warning generation; check enhanced administrative interface.
- **VMware Integration**
  - Authentication failures: Verify vCenter credentials and certificate handling; ensure session cookies are refreshed.
  - SOAP session expiration: Re-bootstrap via SDK login when sessions expire.
  - Event synchronization: Confirm EventHistoryCollector availability and filter logic; events are parsed from SOAP responses.
- **Firewall Integration**
  - Policy conflicts: Validate unique policy IDs per device; review source/destination addresses and services arrays.
- **Capacity Monitoring**
  - Missing metrics: Confirm collection intervals and resource tagging; check timestamp indexing.
- **Integration Logs**
  - Review IntegrationSyncLog for detailed error messages and item counts to diagnose sync issues.
- **Enhanced License Status**
  - Monitor license status through enhanced administrative interface; check warning generation and status indicators.
  - Verify heartbeat monitoring and usage tracking for comprehensive license oversight.

**Section sources**
- [vmware.md:119-127](file://docs/20-modules/integrations/vmware.md#L119-L127)
- [vmware.ts:168-215](file://lib/integrations/vmware.ts#L168-L215)
- [vmware.ts:220-267](file://lib/integrations/vmware.ts#L220-L267)
- [schema.prisma:765-801](file://prisma/schema.prisma#L765-L801)
- [client.ts:230-265](file://lib/license/client.ts#L230-L265)

## Conclusion
The enhanced enterprise feature set, with comprehensive licensing capabilities, builds a robust foundation for network and virtualization visibility, policy enforcement, and operational observability. The enhanced licensing system provides secure on-premise deployment management with tier-based access control, machine identification, JWT token validation, heartbeat monitoring, and administrative oversight with comprehensive status tracking. The data models emphasize strong referential integrity, extensibility, and auditability. Integrations with VMware and Fortinet are first-class citizens, enabling real-time insights and automated workflows while maintaining strict license compliance. The enhanced system provides comprehensive monitoring, warning generation, and administrative oversight for enterprise deployments.

## Appendices

### Enhanced Enterprise Feature Configuration Examples
- **VLAN/Subnet**
  - Create VLAN with optional subnet/gateway/VRF; assign to network interfaces and subnets.
- **Firewall Policies**
  - Define policies per FortiGate device with unique IDs; populate address and service arrays.
- **VMware**
  - Configure vCenter credentials and sync intervals; validate REST/SOAP connectivity and event history.
- **Capacity Planning Queries**
  - Aggregate CapacityMetric by resourceType/resourceId and metricType over time windows to identify growth trends and saturation points.
- **Security and Audit**
  - Enable audit logging for sensitive changes; maintain encrypted integration configs; apply whitelists for known automation events.
- **Enhanced Licensing Setup**
  - Configure license key and server URL environment variables; initialize enhanced license system on application startup; monitor license status through administrative interface.
- **Feature Gating**
  - Implement tier-based feature access control; configure usage limits; handle grace period and restricted mode transitions with enhanced status tracking.
- **Heartbeat Monitoring**
  - Configure heartbeat intervals (6-12 hours); monitor usage patterns; generate warnings for approaching limits; track system health.

### Enhanced License Administration Interface
The enhanced administrative license interface provides comprehensive monitoring and management capabilities with improved status tracking, warning generation, and administrative oversight:

**Enhanced Visual Status Indicators:**
- **Active**: Green badge with check icon for valid, active licenses with enhanced status tracking
- **Expiring Soon**: Orange badge with clock icon for licenses with ≤30 days remaining with warning generation
- **Grace Period**: Yellow badge with warning triangle for temporary grace period with comprehensive monitoring
- **Invalid**: Red badge with X circle for invalid or expired licenses with enhanced error reporting

**Enhanced Technical Information Display:**
- License key masking for security with enhanced display
- Machine ID display with shortened identifier and enhanced tracking
- Tier and validity period information with comprehensive status indicators
- Usage statistics and limit warnings with enhanced progress tracking
- Warning generation and administrative oversight capabilities

**Enhanced Administrative Features:**
- Comprehensive license status monitoring with enhanced visibility
- Technical details with enhanced masking and tracking
- Usage statistics with enhanced progress visualization
- Warning generation with comprehensive alerting
- Feature comparison matrix with enhanced tier information

**Section sources**
- [page.tsx:176-486](file://app/settings/license/page.tsx#L176-L486)
- [install-guide.html:641-669](file://deploy/install-guide.html#L641-L669)
- [heartbeat/route.ts:84-106](file://app/api/license/heartbeat/route.ts#L84-L106)
- [client.ts:292-297](file://lib/license/client.ts#L292-L297)