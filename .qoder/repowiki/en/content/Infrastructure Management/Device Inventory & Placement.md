# Device Inventory & Placement

<cite>
**Referenced Files in This Document**
- [types/index.ts](file://types/index.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)
- [app/api/devices/route.ts](file://app/api/devices/route.ts)
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)
- [app/api/racks/route.ts](file://app/api/racks/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)
- [app/api/racks/[id]/devices/route.ts](file://app/api/racks/[id]/devices/route.ts)
- [lib/deviceRoleMapper.ts](file://lib/deviceRoleMapper.ts)
- [lib/topology/relationship-engine.ts](file://lib/topology/relationship-engine.ts)
- [app/api/services/dependencies/route.ts](file://app/api/services/dependencies/route.ts)
- [lib/reports/reports-service.ts](file://lib/reports/reports-service.ts)
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
This document explains device inventory management and placement within the infrastructure hierarchy. It covers device types and metadata, rack unit assignment, device status and lifecycle, role mapping, search and filtering, and relationship management including parent-child relationships for virtual machines and service dependencies. Practical workflows demonstrate adding servers to racks, configuring network devices, and placing virtual machines on physical hosts.

## Project Structure
The system organizes infrastructure as hierarchical entities: Organization → Building → Floor → Room → Rack → Devices. Devices are typed and can be placed in rack units, tracked for status and criticality, and linked to services and dependencies. APIs expose CRUD operations for devices and racks, and relationship queries support topology and impact analysis.

```mermaid
graph TB
Organization["Organization"] --> Building["Building"]
Building --> Floor["Floor"]
Floor --> Room["Room"]
Room --> Rack["Rack"]
Rack --> Device["Device"]
Device --> DeviceChildren["Child Devices"]
Device --> NetworkInterface["Network Interfaces"]
Device --> Service["Services"]
Service --> Dependency["Dependencies"]
```

**Diagram sources**
- [prisma/schema.prisma](file://prisma/schema.prisma)
- [types/index.ts](file://types/index.ts)

**Section sources**
- [prisma/schema.prisma](file://prisma/schema.prisma)
- [types/index.ts](file://types/index.ts)

## Core Components
- Device model: central inventory entity with type, status, criticality, rack association, parent/child relationships, and metadata.
- Rack model: physical container with units, operational status, and spatial coordinates.
- Device types and roles: categorization supports role-based layout and topology positioning.
- Services and dependencies: define device-to-service relationships and cross-device dependencies.
- APIs: server-side endpoints for device and rack management, filtering, and relationship queries.

**Section sources**
- [types/index.ts](file://types/index.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)
- [app/api/devices/route.ts](file://app/api/devices/route.ts)
- [app/api/racks/route.ts](file://app/api/racks/route.ts)

## Architecture Overview
The backend uses Prisma ORM against PostgreSQL. Frontend pages consume REST endpoints under app/api/* to manage devices, racks, and relationships. Role mapping and topology utilities assist with visual and logical grouping.

```mermaid
graph TB
subgraph "API Layer"
DevAPI["/api/devices"]
DevIdAPI["/api/devices/[id]"]
RackAPI["/api/racks"]
RackIdAPI["/api/racks/[id]"]
RackDevicesAPI["/api/racks/[id]/devices"]
DepAPI["/api/services/dependencies"]
end
subgraph "Domain Models"
Device["Device"]
Rack["Rack"]
RackUnit["RackUnit"]
NetworkInterface["NetworkInterface"]
Service["Service"]
Dependency["Dependency"]
end
subgraph "Utilities"
RoleMapper["Device Role Mapper"]
RelEngine["Topology Relationship Engine"]
end
DevAPI --> Device
DevIdAPI --> Device
RackAPI --> Rack
RackIdAPI --> Rack
RackDevicesAPI --> Device
DepAPI --> Dependency
Device --> Rack
Device --> NetworkInterface
Device --> Service
Service --> Dependency
RoleMapper --> Device
RelEngine --> Device
RelEngine --> Dependency
```

**Diagram sources**
- [app/api/devices/route.ts](file://app/api/devices/route.ts)
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)
- [app/api/racks/route.ts](file://app/api/racks/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)
- [app/api/racks/[id]/devices/route.ts](file://app/api/racks/[id]/devices/route.ts)
- [app/api/services/dependencies/route.ts](file://app/api/services/dependencies/route.ts)
- [lib/deviceRoleMapper.ts](file://lib/deviceRoleMapper.ts)
- [lib/topology/relationship-engine.ts](file://lib/topology/relationship-engine.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

## Detailed Component Analysis

### Device Model and Metadata Management
- Device fields include identification, hardware/software attributes, lifecycle status, criticality, optional rack placement, parent/child hierarchy, and freeform metadata for extensibility.
- Device types enumerate physical and virtual assets, networking gear, and peripherals.
- Status and criticality support lifecycle and risk-aware operations.

```mermaid
classDiagram
class Device {
+string id
+string name
+string type
+string vendor
+string model
+string serialNumber
+string assetTag
+string firmwareVersion
+string operatingSystem
+string status
+string criticality
+string rackId
+number rackUnitPosition
+string parentDeviceId
+any metadata
}
class Rack {
+string id
+string name
+string type
+number maxUnits
+string roomId
+string operationalStatus
}
class NetworkInterface {
+string id
+string name
+string type
+string ipv4
+string ipv6
+string macAddress
+string deviceId
+string status
}
class Service {
+string id
+string name
+string type
+number port
+string protocol
+string deviceId
}
class Dependency {
+string id
+string sourceServiceId
+string targetDeviceId
+string type
+string criticality
}
Device --> Rack : "placed in"
Device --> Device : "parent/child"
Device --> NetworkInterface : "has"
Device --> Service : "hosts"
Service --> Dependency : "depends on"
```

**Diagram sources**
- [types/index.ts](file://types/index.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [types/index.ts](file://types/index.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

### Device Types, Roles, and Categorization
- DeviceType enumerates categories such as physical servers, virtual hosts/machines, firewalls, switches, routers, storage, and peripherals.
- DeviceRoleMapper assigns logical roles (core, distribution, access, compute, storage, other) based on type and name heuristics, enabling topology positioning and grouping.

```mermaid
flowchart TD
Start(["Device Type + Name"]) --> CheckSwitchRouter{"Type is SWITCH or ROUTER?"}
CheckSwitchRouter --> |Yes| CheckName["Contains 'CORE' or 'DIST'?"]
CheckSwitchRouter --> |No| CheckServerVM{"Type is PHYSICAL_SERVER or VIRTUAL_MACHINE?"}
CheckSwitchRouter --> |No| CheckStorage{"Type is STORAGE?"}
CheckSwitchRouter --> |No| Other["other"]
CheckName --> |CORE| Core["role = core"]
CheckName --> |DIST| Dist["role = distribution"]
CheckName --> |Else| Access["role = access"]
CheckServerVM --> |Yes| Compute["role = compute"]
CheckStorage --> |Yes| Storage["role = storage"]
```

**Diagram sources**
- [lib/deviceRoleMapper.ts](file://lib/deviceRoleMapper.ts)
- [types/index.ts](file://types/index.ts)

**Section sources**
- [lib/deviceRoleMapper.ts](file://lib/deviceRoleMapper.ts)
- [types/index.ts](file://types/index.ts)

### Rack and Unit Management
- Rack defines capacity (maxUnits), operational status, and optional spatial coordinates and rotation.
- RackUnit represents individual U positions within a rack, linking to a device and side (front/rear).
- Rack endpoints support listing, creation, updates, and retrieval with contextual location data.

```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "Rack API"
participant DB as "Prisma"
Client->>API : GET /api/racks
API->>DB : findMany(include rooms/buildings)
DB-->>API : racks with nested data
API-->>Client : JSON {success, data}
Client->>API : POST /api/racks
API->>DB : create({name, type, maxUnits, roomId, position, operationalStatus, coords})
DB-->>API : rack
API-->>Client : JSON {success, data}
```

**Diagram sources**
- [app/api/racks/route.ts](file://app/api/racks/route.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [app/api/racks/route.ts](file://app/api/racks/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

### Device Placement Workflows
- Assigning devices to rack units:
  - Update device with rackId and rackUnitPosition; validation ensures position does not exceed rack capacity.
  - Retrieve rack details to see ordered devices by unit position.
- Managing device status and lifecycle:
  - Update device status and criticality via device endpoint; status values include ACTIVE, INACTIVE, MAINTENANCE, DECOMMISSIONED, UNKNOWN.
- Virtual machine placement:
  - Set parentDeviceId to a VIRTUAL_HOST or PHYSICAL_SERVER; validation enforces parent type for VIRTUAL_MACHINE.

```mermaid
sequenceDiagram
participant Client as "Client"
participant DevAPI as "Device API"
participant RackAPI as "Rack API"
participant DB as "Prisma"
Client->>DevAPI : PUT /api/devices/ : id {rackId, rackUnitPosition}
DevAPI->>DB : findUnique(device)
DevAPI->>DB : findUnique(rack)
DevAPI->>DB : update(device with rackId, position)
DB-->>DevAPI : updated device
DevAPI-->>Client : success
Client->>RackAPI : GET /api/racks/ : id
RackAPI->>DB : findUnique(rack include devices)
DB-->>RackAPI : rack with devices ordered by position
RackAPI-->>Client : rack with devices
```

**Diagram sources**
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)

**Section sources**
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)

### Device Search, Filtering, and Bulk Operations
- Device listing supports pagination, filtering by manual/auto-managed types, and text search across name, serial, vendor, and model.
- Minimal vs full response modes optimize performance for dashboards versus detailed views.
- Suggested bulk operations (conceptual):
  - Batch update status/criticality by applying filters and iterating pages.
  - Bulk import via CSV upload pipeline (not implemented here) followed by batch inserts.

```mermaid
flowchart TD
Params["page, limit, filterType, search, mode"] --> BuildWhere["Build where clause"]
BuildWhere --> SearchFilter{"Has search term?"}
SearchFilter --> |Yes| ApplySearch["OR(name,serial,vendor,model)"]
SearchFilter --> |No| TypeFilter["Apply type filter"]
ApplySearch --> Mode{"Mode = minimal?"}
TypeFilter --> Mode
Mode --> |Yes| SelectMinimal["Select basic fields"]
Mode --> |No| IncludeFull["Include rack/network/services"]
SelectMinimal --> Query["Prisma query"]
IncludeFull --> Query
Query --> Response["Paginated response"]
```

**Diagram sources**
- [app/api/devices/route.ts](file://app/api/devices/route.ts)

**Section sources**
- [app/api/devices/route.ts](file://app/api/devices/route.ts)

### Device Import/Export and Reports
- Reports service aggregates device metrics (counts by type/vendor/status/criticality) and generates capacity insights per rack and room.
- Import/export (conceptual):
  - Export: query devices with selected fields and serialize to CSV/JSON.
  - Import: validate rows against Device schema and upsert records.

```mermaid
flowchart TD
FetchDevices["Fetch devices"] --> GroupBy["Group by type/vendor/status/criticality"]
GroupBy --> Metrics["Compute counts and recent additions"]
FetchRacks["Fetch racks with devices"] --> Capacity["Compute utilization per rack and room"]
Metrics --> Report["Device summary report"]
Capacity --> Report
```

**Diagram sources**
- [lib/reports/reports-service.ts](file://lib/reports/reports-service.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [lib/reports/reports-service.ts](file://lib/reports/reports-service.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

### Relationship Mapping and Service Dependencies
- Device-to-device relationships and service-device dependencies are modeled explicitly.
- Relationship engine retrieves and labels relationships for topology visualization, including containment, connectivity, and dependency types.
- Service dependencies endpoint supports listing, creating, updating, and deleting dependencies.

```mermaid
sequenceDiagram
participant Client as "Client"
participant DepAPI as "Dependencies API"
participant DB as "Prisma"
Client->>DepAPI : GET /api/services/dependencies?serviceId=...
DepAPI->>DB : findMany(where serviceId or targetDeviceId)
DB-->>DepAPI : dependencies with related service/device
DepAPI-->>Client : JSON {success, dependencies}
Client->>DepAPI : POST /api/services/dependencies {sourceServiceId, targetDeviceId, type, criticality}
DepAPI->>DB : create(dependency)
DB-->>DepAPI : dependency
DepAPI-->>Client : JSON {success, dependency}
```

**Diagram sources**
- [app/api/services/dependencies/route.ts](file://app/api/services/dependencies/route.ts)
- [lib/topology/relationship-engine.ts](file://lib/topology/relationship-engine.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [app/api/services/dependencies/route.ts](file://app/api/services/dependencies/route.ts)
- [lib/topology/relationship-engine.ts](file://lib/topology/relationship-engine.ts)
- [prisma/schema.prisma](file://prisma/schema.prisma)

### Practical Workflows

#### Add a Physical Server to a Rack
- Create or update a Device with type PHYSICAL_SERVER and optional metadata.
- Update the device with rackId and a valid rackUnitPosition within the rack’s maxUnits.
- Verify via GET /api/racks/:id to see the device listed in unit order.

**Section sources**
- [app/api/devices/route.ts](file://app/api/devices/route.ts)
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)

#### Configure a Network Device (Switch/Router)
- Create a Device with type SWITCH or ROUTER.
- Optionally set operational status and criticality.
- Use role mapper to infer logical role for topology grouping.

**Section sources**
- [lib/deviceRoleMapper.ts](file://lib/deviceRoleMapper.ts)
- [app/api/devices/route.ts](file://app/api/devices/route.ts)

#### Place a Virtual Machine on a Physical Host
- Create a Device with type VIRTUAL_MACHINE.
- Set parentDeviceId to an existing VIRTUAL_HOST or PHYSICAL_SERVER; validation ensures correct parent type.
- Optionally assign to a rack unit if the host is placed in a rack.

**Section sources**
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)

#### Track Device Lifecycle and Status
- Update status and criticality via device endpoint; supported values are validated.
- Use reports to track trends and capacity.

**Section sources**
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)
- [lib/reports/reports-service.ts](file://lib/reports/reports-service.ts)

## Dependency Analysis
- Device depends on Rack for placement and on NetworkInterface/Service for connectivity and hosting.
- Services depend on Device instances; Dependencies connect services to devices.
- Topology engine queries relationships for visualization and labeling.

```mermaid
erDiagram
ORGANIZATION ||--o{ BUILDING : "owns"
BUILDING ||--o{ FLOOR : "contains"
FLOOR ||--o{ ROOM : "contains"
ROOM ||--o{ RACK : "contains"
RACK ||--o{ DEVICE : "holds"
DEVICE ||--o{ DEVICE : "parent/child"
DEVICE ||--o{ NETWORK_INTERFACE : "has"
DEVICE ||--o{ SERVICE : "hosts"
SERVICE ||--o{ DEPENDENCY : "depends on"
DEPENDENCY ||--|| DEVICE : "targets"
```

**Diagram sources**
- [prisma/schema.prisma](file://prisma/schema.prisma)

**Section sources**
- [prisma/schema.prisma](file://prisma/schema.prisma)

## Performance Considerations
- Use minimal mode for device listings on dashboards to avoid heavy joins.
- Cache rack listings with TTL to reduce DB load.
- Prefer server-side filtering and pagination for large inventories.
- Indexes on frequently queried fields (e.g., device status, rackId) improve query performance.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Rack capacity exceeded: when updating a device’s rackUnitPosition, ensure it does not exceed rack.maxUnits.
- Parent-child validation: VIRTUAL_MACHINE requires a VIRTUAL_HOST or PHYSICAL_SERVER parent.
- Deletion constraints: cannot delete devices with child devices or services attached.
- Rack deletion safety: cannot delete racks that still contain devices.

**Section sources**
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)

## Conclusion
The system provides a robust foundation for device inventory and placement across physical and virtual infrastructures. It supports precise rack unit assignment, lifecycle tracking, role-based topology, and explicit service-device dependencies. With server-side filtering, caching, and reporting, it scales to enterprise-grade environments while maintaining clear workflows for day-to-day operations.

## Appendices

### API Summary: Devices
- GET /api/devices: paginated listing with search and type filters; minimal/full modes.
- POST /api/devices: create device with required name and type.
- GET /api/devices/[id]: retrieve device with rack, parent/children, interfaces, and services.
- PUT /api/devices/[id]: update device fields with validations.
- DELETE /api/devices/[id]: delete device with cascade checks.

**Section sources**
- [app/api/devices/route.ts](file://app/api/devices/route.ts)
- [app/api/devices/[id]/route.ts](file://app/api/devices/[id]/route.ts)

### API Summary: Racks
- GET /api/racks: list racks with room/building context and device summaries.
- POST /api/racks: create rack with spatial and operational attributes.
- GET /api/racks/[id]: detailed rack with devices ordered by unit position.
- PUT /api/racks/[id]: update rack with validations and duplicate name checks.
- DELETE /api/racks/[id]: delete rack after ensuring no devices remain.

**Section sources**
- [app/api/racks/route.ts](file://app/api/racks/route.ts)
- [app/api/racks/[id]/route.ts](file://app/api/racks/[id]/route.ts)

### API Summary: Rack Devices
- GET /api/racks/[id]/devices: list devices in a rack with first IPv4 and basic attributes.

**Section sources**
- [app/api/racks/[id]/devices/route.ts](file://app/api/racks/[id]/devices/route.ts)

### API Summary: Dependencies
- GET /api/services/dependencies: list dependencies optionally filtered by serviceId.
- POST /api/services/dependencies: create a dependency with type and criticality.
- PUT /api/services/dependencies: update dependency fields.
- DELETE /api/services/dependencies?id: remove a dependency.

**Section sources**
- [app/api/services/dependencies/route.ts](file://app/api/services/dependencies/route.ts)