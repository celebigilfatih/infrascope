# Multi-System Integration

<cite>
**Referenced Files in This Document**
- [nms_service/main.py](file://nms_service/main.py)
- [nms_service/orchestrator.py](file://nms_service/orchestrator.py)
- [nms_service/discovery_worker.py](file://nms_service/discovery_worker.py)
- [nms_service/snmp/poller.py](file://nms_service/snmp/poller.py)
- [nms_service/snmp/session.py](file://nms_service/snmp/session.py)
- [nms_service/ssh/poller.py](file://nms_service/ssh/poller.py)
- [nms_service/core/config.py](file://nms_service/core/config.py)
- [nms_service/database/models.py](file://nms_service/database/models.py)
- [nms_service/database/repository.py](file://nms_service/database/repository.py)
- [nms_service/core/models.py](file://nms_service/core/models.py)
- [prisma/schema.prisma](file://prisma/schema.prisma)
- [app/api/integrations/nms/route.ts](file://app/api/integrations/nms/route.ts)
- [app/api/integrations/nms/devices/route.ts](file://app/api/integrations/nms/devices/route.ts)
- [app/api/integrations/nms/discovery/route.ts](file://app/api/integrations/nms/discovery/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/route.ts](file://app/api/integrations/nms/discovery/[scanId]/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/import/route.ts](file://app/api/integrations/nms/discovery/[scanId]/import/route.ts)
- [app/api/integrations/nms/backups/route.ts](file://app/api/integrations/nms/backups/route.ts)
- [app/api/integrations/nms/backups/[id]/route.ts](file://app/api/integrations/nms/backups/[id]/route.ts)
- [app/api/integrations/nms/network-devices/route.ts](file://app/api/integrations/nms/network-devices/route.ts)
- [app/api/integrations/nms/network-devices/[id]/route.ts](file://app/api/integrations/nms/network-devices/[id]/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/route.ts](file://app/api/integrations/nms/devices/[id]/backups/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts](file://app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts](file://app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/monitored/route.ts](file://app/api/integrations/nms/devices/[id]/ports/monitored/route.ts)
- [app/api/integrations/nms/alarms/route.ts](file://app/api/integrations/nms/alarms/route.ts)
- [app/api/integrations/vmware/route.ts](file://app/api/integrations/vmware/route.ts)
- [app/api/integrations/fortianalyzer/route.ts](file://app/api/integrations/fortianalyzer/route.ts)
- [app/api/integrations/fortianalyzer/mitre/route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [app/api/integrations/fortigate/route.ts](file://app/api/integrations/fortigate/route.ts)
- [app/api/integrations/status/route.ts](file://app/api/integrations/status/route.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document explains the multi-system integration capabilities of InfraScope with a focus on external system connectivity and data synchronization. It covers:
- Network Management Service (NMS) architecture for SNMP polling, device discovery, and background processing
- Integration patterns with VMware vCenter for virtualization management, Zabbix for monitoring and alerting, and Fortinet for security operations
- Authentication, webhook configuration, and real-time data synchronization
- Data mapping between external systems and InfraScope models
- Integration monitoring, error handling, and retry mechanisms
- Practical setup examples, data flows, and troubleshooting guidance
- Security considerations and access control for external system connections

## Project Structure
InfraScope’s integration architecture spans:
- A Python-based NMS service that polls network devices, discovers new assets, and persists metrics to the shared PostgreSQL database
- A Next.js API surface that exposes integration endpoints for UI and automation
- A Prisma-managed schema that defines shared models and relationships across integrations

```mermaid
graph TB
subgraph "Next.js Frontend"
UI["Integration UI Pages<br/>e.g., NMS, VMware, Zabbix, Fortinet"]
end
subgraph "Next.js API"
API_NMS["/api/integrations/nms/*"]
API_VM["/api/integrations/vmware/*"]
API_FA["/api/integrations/fortianalyzer/*"]
API_FG["/api/integrations/fortigate/*"]
API_STATUS["/api/integrations/status/*"]
end
subgraph "NMS Service (Python)"
NMS_MAIN["nms_service/main.py"]
NMS_ORCH["nms_service/orchestrator.py"]
NMS_DISC["nms_service/discovery_worker.py"]
NMS_SNMP["snmp/poller.py, session.py"]
NMS_SSH["ssh/poller.py"]
NMS_DB["database/models.py, repository.py"]
end
subgraph "Shared Database"
PRISMA["prisma/schema.prisma"]
end
UI --> API_NMS
UI --> API_VM
UI --> API_FA
UI --> API_FG
UI --> API_STATUS
API_NMS --> NMS_MAIN
API_VM --> |"External calls"| PRISMA
API_FA --> |"External calls"| PRISMA
API_FG --> |"External calls"| PRISMA
API_STATUS --> PRISMA
NMS_MAIN --> NMS_ORCH
NMS_ORCH --> NMS_SNMP
NMS_ORCH --> NMS_SSH
NMS_ORCH --> NMS_DB
NMS_DISC --> NMS_DB
NMS_DB --> PRISMA
```

**Diagram sources**
- [nms_service/main.py:39-483](file://nms_service/main.py#L39-L483)
- [nms_service/orchestrator.py:35-461](file://nms_service/orchestrator.py#L35-L461)
- [nms_service/discovery_worker.py:128-262](file://nms_service/discovery_worker.py#L128-L262)
- [nms_service/snmp/poller.py:63-592](file://nms_service/snmp/poller.py#L63-L592)
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)
- [nms_service/database/repository.py:28-251](file://nms_service/database/repository.py#L28-L251)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

**Section sources**
- [nms_service/main.py:39-483](file://nms_service/main.py#L39-L483)
- [nms_service/orchestrator.py:35-461](file://nms_service/orchestrator.py#L35-L461)
- [nms_service/discovery_worker.py:128-262](file://nms_service/discovery_worker.py#L128-L262)
- [nms_service/snmp/poller.py:63-592](file://nms_service/snmp/poller.py#L63-L592)
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)
- [nms_service/database/repository.py:28-251](file://nms_service/database/repository.py#L28-L251)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

## Core Components
- NMS Orchestrator: Registers devices from InfraScope’s shared database, polls them concurrently via SNMP and SSH, and writes metrics to nms_* tables. Implements dynamic polling intervals and fallbacks.
- SNMP Poller: Performs OID walks and queries for interfaces, health, inventory, and topology using subprocess-based net-snmp commands.
- SSH Poller: Stateless SSH sessions for interface status, device health, and configuration backups with vendor-aware command selection.
- Discovery Worker: Scans CIDR ranges for reachable devices using parallel SNMP and SSH probes, storing results in discovery tables.
- Database Layer: SQLAlchemy models and repositories mapping to Prisma-managed tables, including nms_* metrics and discovery artifacts.
- API Surface: Next.js routes under /api/integrations expose NMS, VMware, Zabbix, and Fortinet integrations.

**Section sources**
- [nms_service/orchestrator.py:35-461](file://nms_service/orchestrator.py#L35-L461)
- [nms_service/snmp/poller.py:63-592](file://nms_service/snmp/poller.py#L63-L592)
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)
- [nms_service/discovery_worker.py:128-262](file://nms_service/discovery_worker.py#L128-L262)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)
- [nms_service/database/repository.py:28-251](file://nms_service/database/repository.py#L28-L251)
- [app/api/integrations/nms/route.ts](file://app/api/integrations/nms/route.ts)
- [app/api/integrations/nms/devices/route.ts](file://app/api/integrations/nms/devices/route.ts)
- [app/api/integrations/nms/discovery/route.ts](file://app/api/integrations/nms/discovery/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/route.ts](file://app/api/integrations/nms/discovery/[scanId]/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/import/route.ts](file://app/api/integrations/nms/discovery/[scanId]/import/route.ts)
- [app/api/integrations/nms/backups/route.ts](file://app/api/integrations/nms/backups/route.ts)
- [app/api/integrations/nms/backups/[id]/route.ts](file://app/api/integrations/nms/backups/[id]/route.ts)
- [app/api/integrations/nms/network-devices/route.ts](file://app/api/integrations/nms/network-devices/route.ts)
- [app/api/integrations/nms/network-devices/[id]/route.ts](file://app/api/integrations/nms/network-devices/[id]/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/route.ts](file://app/api/integrations/nms/devices/[id]/backups/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts](file://app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts](file://app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/monitored/route.ts](file://app/api/integrations/nms/devices/[id]/ports/monitored/route.ts)
- [app/api/integrations/nms/alarms/route.ts](file://app/api/integrations/nms/alarms/route.ts)
- [app/api/integrations/vmware/route.ts](file://app/api/integrations/vmware/route.ts)
- [app/api/integrations/fortianalyzer/route.ts](file://app/api/integrations/fortianalyzer/route.ts)
- [app/api/integrations/fortianalyzer/mitre/route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [app/api/integrations/fortigate/route.ts](file://app/api/integrations/fortigate/route.ts)
- [app/api/integrations/status/route.ts](file://app/api/integrations/status/route.ts)

## Architecture Overview
The integration architecture centers on a shared PostgreSQL database managed by Prisma. The NMS service runs as a background process, polling devices and writing metrics. The Next.js API exposes integration endpoints that either call external systems or read from the shared database.

```mermaid
sequenceDiagram
participant UI as "Frontend UI"
participant API as "Next.js API (/api/integrations)"
participant NMS as "NMS Service (Python)"
participant DB as "PostgreSQL (Prisma)"
participant Ext as "External Systems"
UI->>API : Request integration data
API->>DB : Query shared models
DB-->>API : Results
API-->>UI : Rendered data
Note over NMS,DB : Background polling and discovery
NMS->>Ext : SNMP/SSH queries
Ext-->>NMS : Device metrics
NMS->>DB : Upsert nms_* tables
```

**Diagram sources**
- [nms_service/main.py:39-483](file://nms_service/main.py#L39-L483)
- [nms_service/orchestrator.py:407-434](file://nms_service/orchestrator.py#L407-L434)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

## Detailed Component Analysis

### Network Management Service (NMS) Orchestration
The orchestrator coordinates device registration, concurrent polling, and persistence:
- Loads polling-enabled devices from the shared database and registers them for SNMP and SSH
- Applies dynamic polling intervals and jitter to avoid thundering herds
- Polls interfaces, health, and topology with fallbacks and throttling
- Writes metrics to nms_* tables and updates last polled timestamps

```mermaid
classDiagram
class NMSOrchestrator {
+register_devices_from_db() int
+poll_cycle() void
+run() void
+shutdown() void
-_effective_interval(nms_device_id, device) int
-_poll_single_device(nms_device_id) bool
-_poll_single_device_inner(nms_device_id) bool
-_detect_vendor(device_name) str
}
class SNMPPoller {
+register_device(config) void
+unregister_device(device_id) void
+poll_interfaces(device_id) List
+poll_device_health(device_id, vendor) DeviceHealthMetric
+poll_inventory(device_id) DeviceInventory
+poll_topology(device_id) List
+close_all() void
}
class SSHPoller {
+register_device(cfg) void
+poll_interfaces(device_id) List
+poll_device_health(device_id, vendor) DeviceHealthMetric
+backup_running_config(device_id, vendor) str
+close_all() void
}
NMSOrchestrator --> SNMPPoller : "uses"
NMSOrchestrator --> SSHPoller : "uses"
```

**Diagram sources**
- [nms_service/orchestrator.py:35-461](file://nms_service/orchestrator.py#L35-L461)
- [nms_service/snmp/poller.py:63-592](file://nms_service/snmp/poller.py#L63-L592)
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)

**Section sources**
- [nms_service/orchestrator.py:35-461](file://nms_service/orchestrator.py#L35-L461)

### SNMP Polling Engine
The SNMP engine performs OID-based queries and vendor-aware parsing:
- Uses subprocess-based net-snmp commands for true parallelism
- Supports vendor-specific OIDs for CPU, memory, temperature, and inventory
- Provides topology discovery via LLDP/CDP

```mermaid
flowchart TD
Start(["SNMP Poll Entry"]) --> CheckReg["Device registered?"]
CheckReg --> |No| ExitNoop["Return empty"]
CheckReg --> |Yes| FetchIndices["Walk interface indices"]
FetchIndices --> LoopIdx{"Per-index fetch"}
LoopIdx --> |Fetch OIDs| Parse["Parse values and statuses"]
Parse --> Save["Upsert interface metrics"]
Save --> HealthPoll["Poll device health (vendor-aware)"]
HealthPoll --> SaveHealth["Insert health metric row"]
SaveHealth --> TopoPoll["Poll topology (LLDP/CDP)"]
TopoPoll --> SaveTopo["Upsert topology links"]
SaveTopo --> Done(["Exit"])
```

**Diagram sources**
- [nms_service/snmp/poller.py:132-592](file://nms_service/snmp/poller.py#L132-L592)
- [nms_service/snmp/session.py:109-241](file://nms_service/snmp/session.py#L109-L241)

**Section sources**
- [nms_service/snmp/poller.py:132-592](file://nms_service/snmp/poller.py#L132-L592)
- [nms_service/snmp/session.py:109-241](file://nms_service/snmp/session.py#L109-L241)

### SSH Polling and Configuration Backup
The SSH engine provides stateless, vendor-aware operations:
- Global semaphore limits concurrent SSH connections
- Vendor-aware command selection for interface status, device health, and configuration backups
- Pager handling and error detection for robust output parsing

```mermaid
sequenceDiagram
participant Orchestrator as "NMS Orchestrator"
participant SSHPoller as "SSHPoller"
participant Device as "Network Device"
Orchestrator->>SSHPoller : register_device(cfg)
Orchestrator->>SSHPoller : poll_interfaces(device_id)
SSHPoller->>Device : SSH connect + terminal length 0
Device-->>SSHPoller : show interfaces status
SSHPoller-->>Orchestrator : Parsed interface metrics
Orchestrator->>SSHPoller : backup_running_config(device_id, vendor)
SSHPoller->>Device : Vendor-aware commands + pager handling
Device-->>SSHPoller : Running configuration
SSHPoller-->>Orchestrator : Configuration text
```

**Diagram sources**
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)

**Section sources**
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)

### Network Discovery Workflow
The discovery worker scans CIDR ranges and stores results:
- Parallel SNMP and SSH probes per IP
- Vendor inference from system descriptions
- Batched persistence with conflict resolution

```mermaid
sequenceDiagram
participant API as "NMS API"
participant Worker as "Discovery Worker"
participant DB as "PostgreSQL"
participant Net as "Network"
API->>Worker : POST /discovery/start (cidr, communities, ssh_creds)
Worker->>DB : Insert nms_discovery_scans
Worker->>Net : Async scan IPs (SNMP + SSH)
Net-->>Worker : Probe results
Worker->>DB : Upsert nms_discovered_devices (batch)
Worker->>DB : Update scan progress
API->>DB : GET /discovery/{scan_id}
DB-->>API : Scan status/results
```

**Diagram sources**
- [nms_service/main.py:328-404](file://nms_service/main.py#L328-L404)
- [nms_service/discovery_worker.py:128-262](file://nms_service/discovery_worker.py#L128-L262)
- [nms_service/database/models.py:146-194](file://nms_service/database/models.py#L146-L194)

**Section sources**
- [nms_service/main.py:328-404](file://nms_service/main.py#L328-L404)
- [nms_service/discovery_worker.py:128-262](file://nms_service/discovery_worker.py#L128-L262)
- [nms_service/database/models.py:146-194](file://nms_service/database/models.py#L146-L194)

### Data Mapping Between External Systems and InfraScope Models
InfraScope’s Prisma schema defines shared models and integration fields:
- Device model includes fields for VMware (vCenter identifiers), Zabbix host IDs, Fortinet device IDs, and NMS integration fields
- NMS metrics tables (nms_interfaces, nms_health_metrics, nms_topology_links) map to the orchestrator’s output
- Integration configuration and sync logs track external system connectivity and synchronization status

```mermaid
erDiagram
DEVICE {
string id PK
string name
int nms_device_id UK
string management_ip
string snmp_community
string snmp_version
int snmp_port
boolean polling_enabled
int polling_interval
datetime last_polled_at
string vendor
string zabbix_host_id
string vmware_moref
string forti_device_id
}
NMS_INTERFACE {
string id PK
int nms_device_id FK
int interface_index
string interface_name
string description
string admin_status
string oper_status
bigint speed
bigint in_octets
bigint out_octets
int in_errors
int out_errors
int mtu
datetime last_polled_at
}
NMS_HEALTH_METRIC {
string id PK
int nms_device_id FK
int uptime_seconds
float cpu_usage
float memory_usage
float temperature
datetime collected_at
}
NMS_TOPOLOGY_LINK {
string id PK
int nms_device_id FK
string local_interface
string remote_device_name
string remote_interface
string protocol
datetime last_seen_at
}
DEVICE ||--o{ NMS_INTERFACE : "nms_device_id"
DEVICE ||--o{ NMS_HEALTH_METRIC : "nms_device_id"
DEVICE ||--o{ NMS_TOPOLOGY_LINK : "nms_device_id"
```

**Diagram sources**
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)

**Section sources**
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)

### Integration Patterns: VMware vCenter
- InfraScope tracks VMware relationships via Device fields for vCenter identifiers and cluster/datastore references
- The integration endpoint under /api/integrations/vmware provides VMware-specific operations
- Data mapping aligns with Prisma models for clusters, datastores, and relationships

```mermaid
sequenceDiagram
participant API as "Next.js API"
participant DB as "PostgreSQL (Prisma)"
participant VC as "vCenter"
API->>VC : Query clusters/datastores
VC-->>API : Inventory and metrics
API->>DB : Upsert Device, VMwareCluster, VMwareDatastore
API-->>API : Expose relationships and capacity metrics
```

**Diagram sources**
- [app/api/integrations/vmware/route.ts](file://app/api/integrations/vmware/route.ts)
- [prisma/schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)

**Section sources**
- [app/api/integrations/vmware/route.ts](file://app/api/integrations/vmware/route.ts)
- [prisma/schema.prisma:669-712](file://prisma/schema.prisma#L669-L712)

### Integration Patterns: Zabbix
- Device model includes zabbix_host_id for linking Zabbix host identifiers
- The integration endpoint under /api/integrations/zabbix provides Zabbix-specific operations
- Data mapping aligns with Prisma models for relationships and event handling

```mermaid
sequenceDiagram
participant API as "Next.js API"
participant DB as "PostgreSQL (Prisma)"
participant ZBX as "Zabbix"
API->>ZBX : Query hosts, triggers, items
ZBX-->>API : Events and metrics
API->>DB : Upsert relationships and events
API-->>API : Expose monitoring dashboards
```

**Diagram sources**
- [app/api/integrations/status/route.ts](file://app/api/integrations/status/route.ts)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

**Section sources**
- [app/api/integrations/status/route.ts](file://app/api/integrations/status/route.ts)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

### Integration Patterns: Fortinet
- Device model includes forti_device_id for Fortinet device linkage
- Fortinet integration endpoints under /api/integrations/fortianalyzer and /api/integrations/fortigate provide Fortinet-specific operations
- MITRE ATT&CK mapping endpoint under /api/integrations/fortianalyzer/mitre supports threat intelligence alignment

```mermaid
sequenceDiagram
participant API as "Next.js API"
participant DB as "PostgreSQL (Prisma)"
participant FA as "FortiAnalyzer"
participant FG as "FortiGate"
API->>FA : Query events, reports
FA-->>API : Security events
API->>FG : Query policies, addresses
FG-->>API : Configuration and logs
API->>DB : Upsert relationships and security data
API-->>API : MITRE mapping and SOAR integrations
```

**Diagram sources**
- [app/api/integrations/fortianalyzer/route.ts](file://app/api/integrations/fortianalyzer/route.ts)
- [app/api/integrations/fortianalyzer/mitre/route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [app/api/integrations/fortigate/route.ts](file://app/api/integrations/fortigate/route.ts)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

**Section sources**
- [app/api/integrations/fortianalyzer/route.ts](file://app/api/integrations/fortianalyzer/route.ts)
- [app/api/integrations/fortianalyzer/mitre/route.ts](file://app/api/integrations/fortianalyzer/mitre/route.ts)
- [app/api/integrations/fortigate/route.ts](file://app/api/integrations/fortigate/route.ts)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

### Real-Time Data Synchronization and Webhooks
- NMS provides on-demand polling and backup endpoints for immediate synchronization
- Discovery scans are asynchronous with progress tracking and import endpoints
- Integration status endpoints expose health and connectivity indicators

```mermaid
sequenceDiagram
participant UI as "Frontend"
participant API as "NMS API"
participant NMS as "NMS Service"
participant DB as "PostgreSQL"
UI->>API : POST /devices/{id}/poll
API->>NMS : Trigger on-demand poll
NMS->>DB : Upsert metrics
API-->>UI : Poll results
UI->>API : POST /discovery/start
API->>NMS : Start discovery scan
NMS->>DB : Store scan progress
API-->>UI : Scan ID and status
```

**Diagram sources**
- [nms_service/main.py:131-182](file://nms_service/main.py#L131-L182)
- [nms_service/main.py:328-404](file://nms_service/main.py#L328-L404)
- [nms_service/discovery_worker.py:128-262](file://nms_service/discovery_worker.py#L128-L262)

**Section sources**
- [nms_service/main.py:131-182](file://nms_service/main.py#L131-L182)
- [nms_service/main.py:328-404](file://nms_service/main.py#L328-L404)
- [nms_service/discovery_worker.py:128-262](file://nms_service/discovery_worker.py#L128-L262)

### Authentication and Access Control
- NMS configuration reads credentials from environment variables and applies sensible defaults
- SSH credentials are enforced with global concurrency limits to protect upstream devices
- Integration configurations store encrypted credentials and track sync status and logs

```mermaid
flowchart TD
Env["Environment Variables"] --> Config["NMS Config"]
Config --> SNMP["SNMP Settings"]
Config --> SSH["SSH Settings"]
SSH --> Limits["Global Semaphore Limits"]
Config --> DB["Database Credentials"]
DB --> Prisma["Prisma Schema"]
```

**Diagram sources**
- [nms_service/core/config.py:71-172](file://nms_service/core/config.py#L71-L172)
- [nms_service/ssh/poller.py:37-40](file://nms_service/ssh/poller.py#L37-L40)
- [prisma/schema.prisma:764-800](file://prisma/schema.prisma#L764-L800)

**Section sources**
- [nms_service/core/config.py:71-172](file://nms_service/core/config.py#L71-L172)
- [nms_service/ssh/poller.py:37-40](file://nms_service/ssh/poller.py#L37-L40)
- [prisma/schema.prisma:764-800](file://prisma/schema.prisma#L764-L800)

## Dependency Analysis
The integration stack exhibits clear separation of concerns:
- NMS orchestrator depends on SNMP and SSH pollers and the database layer
- Next.js API depends on shared database models and external system endpoints
- Prisma schema governs data models and relationships across integrations

```mermaid
graph LR
API["Next.js API"] --> DB["Prisma Models"]
API --> Ext["External Systems"]
NMS["NMS Orchestrator"] --> DB
NMS --> SNMP["SNMP Poller"]
NMS --> SSH["SSH Poller"]
SNMP --> Session["SNMP Session"]
SSH --> Parser["SSH Parser"]
```

**Diagram sources**
- [nms_service/orchestrator.py:35-461](file://nms_service/orchestrator.py#L35-L461)
- [nms_service/snmp/poller.py:63-592](file://nms_service/snmp/poller.py#L63-L592)
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)
- [nms_service/snmp/session.py:38-258](file://nms_service/snmp/session.py#L38-L258)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

**Section sources**
- [nms_service/orchestrator.py:35-461](file://nms_service/orchestrator.py#L35-L461)
- [nms_service/snmp/poller.py:63-592](file://nms_service/snmp/poller.py#L63-L592)
- [nms_service/ssh/poller.py:221-625](file://nms_service/ssh/poller.py#L221-L625)
- [nms_service/snmp/session.py:38-258](file://nms_service/snmp/session.py#L38-L258)
- [nms_service/database/models.py:43-227](file://nms_service/database/models.py#L43-L227)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)

## Performance Considerations
- Concurrent polling: ThreadPoolExecutor with configurable max workers and per-device throttling
- SNMP subprocess-based polling for true parallelism and reduced Python overhead
- SSH global semaphore to cap concurrent connections and prevent device overload
- Dynamic polling intervals and jitter to balance responsiveness and load
- Batched discovery scanning with timeouts and conflict resolution

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- SNMP timeouts and authentication failures: Verify community strings, versions, and ports; reduce retries and timeouts for faster fallback
- SSH connection errors: Ensure credentials and device accessibility; check global concurrency limits
- Discovery scan hangs: Monitor timeouts and adjust batch sizes; confirm network reachability
- Data inconsistencies: Validate Prisma schema alignment and unique constraints on nms_* tables
- Integration sync failures: Review integration sync logs and credential encryption

**Section sources**
- [nms_service/snmp/session.py:135-142](file://nms_service/snmp/session.py#L135-L142)
- [nms_service/ssh/poller.py:134-142](file://nms_service/ssh/poller.py#L134-L142)
- [nms_service/discovery_worker.py:174-179](file://nms_service/discovery_worker.py#L174-L179)
- [nms_service/database/models.py:68-144](file://nms_service/database/models.py#L68-L144)
- [prisma/schema.prisma:764-800](file://prisma/schema.prisma#L764-L800)

## Conclusion
InfraScope’s multi-system integration leverages a robust NMS service, shared database models, and a modular API to connect VMware vCenter, Zabbix, and Fortinet systems. The architecture emphasizes concurrent polling, vendor-aware parsing, asynchronous discovery, and secure credential handling, enabling reliable real-time synchronization and comprehensive observability.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Practical Setup Examples
- Configure NMS environment variables for SNMP and SSH settings
- Enable polling on devices by setting nms_device_id and management IP in the Device model
- Start discovery scans via the NMS API and import results into InfraScope
- Link external systems by populating zabbix_host_id, vmware_moref, and forti_device_id fields

**Section sources**
- [nms_service/core/config.py:111-147](file://nms_service/core/config.py#L111-L147)
- [nms_service/main.py:328-404](file://nms_service/main.py#L328-L404)
- [prisma/schema.prisma:152-228](file://prisma/schema.prisma#L152-L228)