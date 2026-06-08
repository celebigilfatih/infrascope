# API Endpoints & Services

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [lib/api.ts](file://lib/api.ts)
- [lib/prisma.ts](file://lib/prisma.ts)
- [lib/alarm-scheduler.ts](file://lib/alarm-scheduler.ts)
- [lib/topology/index.ts](file://lib/topology/index.ts)
- [middleware.ts](file://middleware.ts)
- [lib/rate-limit.ts](file://lib/rate-limit.ts)
- [lib/auth/session.ts](file://lib/auth/session.ts)
- [lib/auth/password.ts](file://lib/auth/password.ts)
- [lib/license/middleware.ts](file://lib/license/middleware.ts)
- [nms_service/main.py](file://nms_service/main.py)
- [nms_service/orchestrator.py](file://nms_service/orchestrator.py)
- [app/api/organizations/route.ts](file://app/api/organizations/route.ts)
- [app/api/buildings/route.ts](file://app/api/buildings/route.ts)
- [app/api/devices/route.ts](file://app/api/devices/route.ts)
- [app/api/services/route.ts](file://app/api/services/route.ts)
- [app/api/floors/route.ts](file://app/api/floors/route.ts)
- [app/api/rooms/route.ts](file://app/api/rooms/route.ts)
- [app/api/racks/route.ts](file://app/api/racks/route.ts)
- [app/api/network-connections/route.ts](file://app/api/network-connections/route.ts)
- [app/api/topology/route.ts](file://app/api/topology/route.ts)
- [app/api/integrations/nms/route.ts](file://app/api/integrations/nms/route.ts)
- [app/api/integrations/nms/discovery/route.ts](file://app/api/integrations/nms/discovery/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/route.ts](file://app/api/integrations/nms/discovery/[scanId]/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/import/route.ts](file://app/api/integrations/nms/discovery/[scanId]/import/route.ts)
- [app/api/integrations/nms/devices/route.ts](file://app/api/integrations/nms/devices/route.ts)
- [app/api/integrations/nms/devices/[id]/route.ts](file://app/api/integrations/nms/devices/[id]/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/route.ts](file://app/api/integrations/nms/devices/[id]/backups/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts](file://app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts](file://app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/[portName]/monitored/route.ts](file://app/api/integrations/nms/devices/[id]/ports/[portName]/monitored/route.ts)
- [app/api/integrations/nms/alarms/route.ts](file://app/api/integrations/nms/alarms/route.ts)
- [app/api/integrations/nms/network-devices/route.ts](file://app/api/integrations/nms/network-devices/route.ts)
- [app/api/integrations/nms/network-devices/[id]/route.ts](file://app/api/integrations/nms/network-devices/[id]/route.ts)
- [app/api/integrations/fortianalyzer/route.ts](file://app/api/integrations/fortianalyzer/route.ts)
- [app/api/integrations/fortianalyzer/mire/route.ts](file://app/api/integrations/fortianalyzer/mire/route.ts)
- [app/api/integrations/fortigate/route.ts](file://app/api/integrations/fortigate/route.ts)
- [app/api/integrations/zabbix/route.ts](file://app/api/integrations/zabbix/route.ts)
- [app/api/integrations/vmware/route.ts](file://app/api/integrations/vmware/route.ts)
- [app/api/integrations/status/route.ts](file://app/api/integrations/status/route.ts)
- [app/api/health/route.ts](file://app/api/health/route.ts)
- [app/api/health/alarms/route.ts](file://app/api/health/alarms/route.ts)
- [app/api/security/quarantine/route.ts](file://app/api/security/quarantine/route.ts)
- [app/api/security/risky-rules/route.ts](file://app/api/security/risky-rules/route.ts)
- [app/api/users/route.ts](file://app/api/users/route.ts)
- [app/api/auth/login/route.ts](file://app/api/auth/login/route.ts)
- [app/api/auth/logout/route.ts](file://app/api/auth/logout/route.ts)
- [app/api/auth/me/route.ts](file://app/api/auth/me/route.ts)
- [app/api/license/activate/route.ts](file://app/api/license/activate/route.ts)
- [app/api/license/validate/route.ts](file://app/api/license/validate/route.ts)
- [app/api/license/heartbeat/route.ts](file://app/api/license/heartbeat/route.ts)
- [app/api/license/status/route.ts](file://app/api/license/status/route.ts)
- [docs/API_TESTING_GUIDE.md](file://docs/API_TESTING_GUIDE.md)
- [docs/QUICK_START_TESTING.md](file://docs/QUICK_START_TESTING.md)
- [ALARM_PERFORMANCE_OPTIMIZATION.md](file://ALARM_PERFORMANCE_OPTIMIZATION.md)
</cite>

## Update Summary
**Changes Made**
- Added comprehensive authentication endpoints (login, logout, me) with session management
- Added complete license management endpoints (activate, validate, heartbeat, status)
- Enhanced security middleware with rate limiting and permission enforcement
- Integrated license validation middleware for protected routes
- Updated authentication and authorization flows throughout the API

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
This document describes the InfraScope RESTful API surface for public and internal services. It covers:
- Public endpoints for organizations, buildings, devices, services, floors, rooms, racks, network connections, topology, integrations, health, security, and users.
- **New**: Authentication endpoints (login, logout, me) with session-based authentication.
- **New**: License management endpoints (activate, validate, heartbeat, status) for enterprise licensing.
- **Enhanced**: Security middleware with rate limiting, permission enforcement, and license validation.
- Internal service endpoints for network monitoring and discovery (NMS service).
- Request/response schemas, HTTP methods, URL patterns, authentication, error handling, status codes, and practical examples.
- API versioning, rate limiting, security considerations, testing strategies, and performance optimization tips.

## Project Structure
The API is implemented as Next.js App Router handlers under app/api. Data access uses Prisma ORM. Public API endpoints are exposed to clients; internal services (NMS) run separately and are intended for backend-to-backend communication.

```mermaid
graph TB
Client["Client"] --> Middleware["Security Middleware<br/>middleware.ts"]
Middleware --> PublicAPI["Next.js API Routes<br/>app/api/*"]
PublicAPI --> Prisma["Prisma Client<br/>lib/prisma.ts"]
PublicAPI --> Utils["Utilities<br/>lib/api.ts"]
PublicAPI --> Auth["Auth Utilities<br/>lib/auth/*"]
PublicAPI --> License["License Utilities<br/>lib/license/*"]
PublicAPI --> Docs["Docs & Guides<br/>docs/*"]
subgraph "Internal Services"
NMS["NMS Service (Python/FastAPI)<br/>nms_service/main.py"]
end
Utils --> PublicAPI
Prisma --> PublicAPI
Auth --> PublicAPI
License --> PublicAPI
NMS -. "Internal only (Docker network)" .- PublicAPI
```

**Diagram sources**
- [middleware.ts:35-131](file://middleware.ts#L35-L131)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [lib/api.ts:1-57](file://lib/api.ts#L1-L57)
- [lib/auth/session.ts:1-62](file://lib/auth/session.ts#L1-L62)
- [lib/license/middleware.ts:1-203](file://lib/license/middleware.ts#L1-L203)
- [nms_service/main.py:39-43](file://nms_service/main.py#L39-L43)

**Section sources**
- [middleware.ts:35-131](file://middleware.ts#L35-L131)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [lib/api.ts:1-57](file://lib/api.ts#L1-L57)
- [lib/auth/session.ts:1-62](file://lib/auth/session.ts#L1-L62)
- [lib/license/middleware.ts:1-203](file://lib/license/middleware.ts#L1-L203)
- [nms_service/main.py:39-43](file://nms_service/main.py#L39-L43)

## Core Components
- Public REST API: Implemented as Next.js App Router handlers returning JSON with standardized success/error envelopes.
- **Enhanced**: Security middleware with rate limiting, session verification, and permission enforcement.
- **New**: Authentication system with JWT-based sessions and bcrypt password hashing.
- **New**: License management system with JWT-based license tokens and validation.
- Data persistence: Prisma Client singleton configured with environment-aware logging.
- Client-side API helpers: Axios-based wrappers for GET/POST/PUT/DELETE with unified error handling.
- Internal NMS service: FastAPI service for SNMP/SSH polling, backups, discovery, and topology retrieval.

Key behaviors:
- Standardized response envelope: success flag, data payload, timestamps, and optional cached metadata.
- Error responses: structured error messages and explicit HTTP status codes.
- **Enhanced**: Rate limiting with different configurations for auth vs general API endpoints.
- **Enhanced**: Permission-based access control using role-based resource permissions.
- Caching: Select endpoints cache results for short TTLs to reduce DB load.
- Pagination: Devices and services endpoints support page/limit with bounded limits.

**Section sources**
- [middleware.ts:35-131](file://middleware.ts#L35-L131)
- [lib/rate-limit.ts:12-22](file://lib/rate-limit.ts#L12-L22)
- [lib/auth/session.ts:34-61](file://lib/auth/session.ts#L34-L61)
- [lib/auth/password.ts:9-18](file://lib/auth/password.ts#L9-L18)
- [app/api/organizations/route.ts:9-88](file://app/api/organizations/route.ts#L9-L88)
- [app/api/buildings/route.ts:9-79](file://app/api/buildings/route.ts#L9-L79)
- [app/api/devices/route.ts:10-94](file://app/api/devices/route.ts#L10-L94)
- [app/api/services/route.ts:4-75](file://app/api/services/route.ts#L4-L75)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [lib/api.ts:10-56](file://lib/api.ts#L10-L56)

## Architecture Overview
High-level interactions:
- Clients call Next.js API routes for public resources.
- Security middleware intercepts all API requests for rate limiting, authentication, and authorization.
- Routes use Prisma to query the database and return JSON.
- Internal NMS service runs independently and exposes endpoints for device polling, backups, discovery, and topology.

```mermaid
sequenceDiagram
participant C as "Client"
participant M as "Security Middleware"
participant R as "Next.js Route"
participant P as "Prisma"
participant DB as "PostgreSQL"
C->>M : HTTP Request (with cookies)
M->>M : Rate Limit Check
M->>M : Session Verification
M->>M : Permission Check
M->>R : Forward if authorized
R->>P : Query/Command
P->>DB : SQL
DB-->>P : Rows
P-->>R : Records
R-->>C : JSON {success, data, ...}
```

**Diagram sources**
- [middleware.ts:35-131](file://middleware.ts#L35-L131)
- [app/api/organizations/route.ts:23-64](file://app/api/organizations/route.ts#L23-L64)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)

## Detailed Component Analysis

### Authentication Endpoints
**New**: Complete authentication system with session-based authentication.

- Base URL: /api/auth
- Login Endpoint (/api/auth/login):
  - Method: POST
  - Request body: { email: string, password: string }
  - Response: Success with user info and httpOnly session cookie
  - Status codes: 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 500 Internal Server Error
  - Security: Password verification, account status validation, rate limiting
  - Example curl: curl -s -X POST https://host/api/auth/login -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"Password123!"}'

- Logout Endpoint (/api/auth/logout):
  - Method: POST
  - Response: Success with cleared session cookie
  - Status codes: 200 OK, 500 Internal Server Error
  - Security: Clears httpOnly session cookie
  - Example curl: curl -s -X POST https://host/api/auth/logout

- Profile Endpoint (/api/auth/me):
  - Method: GET
  - Response: User profile information
  - Status codes: 200 OK, 401 Unauthorized, 403 Forbidden, 500 Internal Server Error
  - Security: Session verification required
  - Example curl: curl -s -H "Cookie: infrascope_session=..." https://host/api/auth/me

**Section sources**
- [app/api/auth/login/route.ts:8-117](file://app/api/auth/login/route.ts#L8-L117)
- [app/api/auth/logout/route.ts:4-16](file://app/api/auth/logout/route.ts#L4-L16)
- [app/api/auth/me/route.ts:6-68](file://app/api/auth/me/route.ts#L6-L68)
- [lib/auth/session.ts:34-61](file://lib/auth/session.ts#L34-L61)
- [lib/auth/password.ts:16-18](file://lib/auth/password.ts#L16-L18)

### License Management Endpoints
**New**: Complete license management system for enterprise licensing.

- Base URL: /api/license
- Activate Endpoint (/api/license/activate):
  - Method: POST
  - Request body: { licenseKey: string, machineId: string }
  - Response: { token: string, state: LicenseState }
  - Status codes: 200 OK, 400 Bad Request, 403 Forbidden, 404 Not Found, 500 Internal Server Error
  - Security: License validation, activation limits, machine ID tracking
  - Example curl: curl -s -X POST https://host/api/license/activate -H "Content-Type: application/json" -d '{"licenseKey":"ABC123","machineId":"HOST001"}'

- Validate Endpoint (/api/license/validate):
  - Method: POST
  - Request body: { licenseKey: string, machineId: string, token?: string }
  - Response: { valid: boolean, state: LicenseState, token?: string }
  - Status codes: 200 OK, 400 Bad Request, 403 Forbidden, 404 Not Found, 500 Internal Server Error
  - Security: License validation, activation verification, periodic heartbeat
  - Example curl: curl -s -X POST https://host/api/license/validate -H "Content-Type: application/json" -d '{"licenseKey":"ABC123","machineId":"HOST001"}'

- Heartbeat Endpoint (/api/license/heartbeat):
  - Method: POST
  - Request body: { licenseKey: string, machineId: string, deviceCount?: number, userCount?: number, appVersion?: string }
  - Response: { success: boolean, warnings?: string[] }
  - Status codes: 200 OK, 400 Bad Request, 403 Forbidden, 404 Not Found, 500 Internal Server Error
  - Security: License validation, usage tracking, limit warnings
  - Example curl: curl -s -X POST https://host/api/license/heartbeat -H "Content-Type: application/json" -d '{"licenseKey":"ABC123","machineId":"HOST001","deviceCount":10}'

- Status Endpoint (/api/license/status):
  - Method: GET
  - Response: { license, usage: { deviceCount, userCount } }
  - Status codes: 200 OK, 500 Internal Server Error
  - Security: Admin-only access via license middleware
  - Example curl: curl -s https://host/api/license/status

**Section sources**
- [app/api/license/activate/route.ts:16-146](file://app/api/license/activate/route.ts#L16-L146)
- [app/api/license/validate/route.ts:16-156](file://app/api/license/validate/route.ts#L16-L156)
- [app/api/license/heartbeat/route.ts:14-124](file://app/api/license/heartbeat/route.ts#L14-L124)
- [app/api/license/status/route.ts:12-37](file://app/api/license/status/route.ts#L12-L37)
- [lib/license/middleware.ts:45-153](file://lib/license/middleware.ts#L45-L153)

### Organizations
- Base URL: /api/organizations
- Methods:
  - GET: List organizations with nested buildings/floors/racks counts.
  - POST: Create organization (name, code, description).
- Response envelope: success, data, timestamp, cached (when applicable).
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s https://host/api/organizations
  - POST: curl -s -X POST https://host/api/organizations -H "Content-Type: application/json" -d '{"name":"Org","code":"O1"}'

**Section sources**
- [app/api/organizations/route.ts:9-88](file://app/api/organizations/route.ts#L9-L88)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Buildings
- Base URL: /api/buildings
- Methods:
  - GET: List buildings with organization and floor/rack summaries.
  - POST: Create building (name, address, city, country, organizationId).
- Response envelope: success, data, timestamp, cached (when applicable).
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s https://host/api/buildings
  - POST: curl -s -X POST https://host/api/buildings -H "Content-Type: application/json" -d '{"name":"B1","organizationId":"<id>"}'

**Section sources**
- [app/api/buildings/route.ts:9-79](file://app/api/buildings/route.ts#L9-L79)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Devices
- Base URL: /api/devices
- Query parameters:
  - page (default 1), limit (max 200), filterType (manual/all/type), search (text), mode (full/minimal).
- Methods:
  - GET: Paginated devices; minimal mode excludes heavy joins.
  - POST: Create device with name, type, and optional attributes.
- Response envelope: success, data, total, page, limit, totalPages, timestamp.
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s "https://host/api/devices?page=1&limit=25&mode=minimal"
  - POST: curl -s -X POST https://host/api/devices -H "Content-Type: application/json" -d '{"name":"Server1","type":"PHYSICAL_SERVER","rackId":"<id>"}'

**Section sources**
- [app/api/devices/route.ts:10-94](file://app/api/devices/route.ts#L10-L94)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Services
- Base URL: /api/services
- Query parameters:
  - page (default 1), limit (max 500), mode (full/minimal).
- Methods:
  - GET: Paginated services; minimal mode excludes heavy joins.
  - POST: Create service (name, type, port, deviceId, optional protocol/application/criticality).
- Response envelope: success, data, total, page, limit, totalPages, timestamp.
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s "https://host/api/services?limit=50"
  - POST: curl -s -X POST https://host/api/services -H "Content-Type: application/json" -d '{"name":"Web","type":"TCP","port":80,"deviceId":"<id>"}'

**Section sources**
- [app/api/services/route.ts:4-75](file://app/api/services/route.ts#L4-L75)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Floors
- Base URL: /api/floors
- Methods:
  - GET: List floors with building and room/rack summaries; cached for 60s.
  - POST: Create floor (name, floorNumber, buildingId).
- Response envelope: success, data, timestamp, cached (when applicable).
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s https://host/api/floors
  - POST: curl -s -X POST https://host/api/floors -H "Content-Type: application/json" -d '{"name":"F1","floorNumber":1,"buildingId":"<id>"}'

**Section sources**
- [app/api/floors/route.ts:9-70](file://app/api/floors/route.ts#L9-L70)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Rooms
- Base URL: /api/rooms
- Methods:
  - GET: List rooms with floor/building and rack/device counts; cached for 60s.
  - POST: Create room (name, floorId, optional capacity/dimensions).
- Response envelope: success, data, timestamp, cached (when applicable).
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s https://host/api/rooms
  - POST: curl -s -X POST https://host/api/rooms -H "Content-Type: application/json" -d '{"name":"R101","floorId":"<id>"}'

**Section sources**
- [app/api/rooms/route.ts:9-72](file://app/api/rooms/route.ts#L9-L72)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Racks
- Base URL: /api/racks
- Methods:
  - GET: List racks with room/building and device summaries; cached for 30s.
  - POST: Create rack (name, roomId, optional type/maxUnits/position/coordinates/rotation/status).
- Response envelope: success, data, timestamp, cached (when applicable).
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s https://host/api/racks
  - POST: curl -s -X POST https://host/api/racks -H "Content-Type: application/json" -d '{"name":"A-01","roomId":"<id>"}'

**Section sources**
- [app/api/racks/route.ts:9-67](file://app/api/racks/route.ts#L9-L67)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Network Connections
- Base URL: /api/network-connections
- Methods:
  - GET: List connections with source port/device details.
  - POST: Create connection (name, type, sourcePortId/sourceInterfaceId, destPortId/destInterfaceId, status).
- Response envelope: success, data, timestamp.
- Status codes: 200 OK, 201 Created, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET: curl -s https://host/api/network-connections
  - POST: curl -s -X POST https://host/api/network-connections -H "Content-Type: application/json" -d '{"name":"Link1","sourcePortId":"<id>","destPortId":"<id>"}'

**Section sources**
- [app/api/network-connections/route.ts:4-34](file://app/api/network-connections/route.ts#L4-L34)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Topology
- Base URL: /api/topology
- Query parameters:
  - organizationId (optional), action (graph|stats).
- Methods:
  - GET: action=graph returns topology graph; action=stats returns relationship statistics.
  - POST: action=correlate triggers correlation across relationships.
- Response envelope: depends on action; errors return { error } with 400/500.
- Status codes: 200 OK, 400 Bad Request, 500 Internal Server Error.
- **Enhanced**: Protected by security middleware with permission checks.
- Example curl:
  - GET graph: curl -s "https://host/api/topology?action=graph"
  - GET stats: curl -s "https://host/api/topology?action=stats"
  - POST correlate: curl -s -X POST https://host/api/topology -H "Content-Type: application/json" -d '{"action":"correlate"}'

**Section sources**
- [app/api/topology/route.ts:4-28](file://app/api/topology/route.ts#L4-L28)
- [middleware.ts:63-90](file://middleware.ts#L63-L90)

### Integrations
Public integration endpoints under /api/integrations expose data and actions related to external systems.

- FortiAnalyzer
  - Base: /api/integrations/fortianalyzer
  - Methods: GET (status), POST (MITRE mapping)
  - Example curl:
    - GET: curl -s https://host/api/integrations/fortianalyzer
    - POST: curl -s -X POST https://host/api/integrations/fortianalyzer/mitre -H "Content-Type: application/json" -d '{}'

- FortiGate
  - Base: /api/integrations/fortigate
  - Methods: GET (status)
  - Example curl: curl -s https://host/api/integrations/fortigate

- Zabbix
  - Base: /api/integrations/zabbix
  - Methods: GET (status)
  - Example curl: curl -s https://host/api/integrations/zabbix

- VMware
  - Base: /api/integrations/vmware
  - Methods: GET (status)
  - Example curl: curl -s https://host/api/integrations/vmware

- NMS (Network Monitoring Service)
  - Base: /api/integrations/nms
  - Subpaths:
    - /alarms: GET
    - /backups: GET, POST
    - /devices: GET, POST
    - /devices/[id]: GET, PATCH, DELETE
    - /devices/[id]/backups: GET, POST
    - /devices/[id]/backups/[backupId]: GET, DELETE
    - /devices/[id]/ports/[portName]: GET
    - /devices/[id]/ports/[portName]/monitored: GET
    - /network-devices: GET
    - /network-devices/[id]: GET
    - /discovery: GET, POST
    - /discovery/[scanId]: GET
    - /discovery/[scanId]/results: GET
    - /discovery/[scanId]/import: POST
  - Example curl:
    - GET devices: curl -s https://host/api/integrations/nms/devices
    - POST discovery: curl -s -X POST https://host/api/integrations/nms/discovery -H "Content-Type: application/json" -d '{"cidr":"192.168.1.0/24"}'

**Section sources**
- [app/api/integrations/fortianalyzer/route.ts](file://app/api/integrations/fortianalyzer/route.ts)
- [app/api/integrations/fortianalyzer/mire/route.ts](file://app/api/integrations/fortianalyzer/mire/route.ts)
- [app/api/integrations/fortigate/route.ts](file://app/api/integrations/fortigate/route.ts)
- [app/api/integrations/zabbix/route.ts](file://app/api/integrations/zabbix/route.ts)
- [app/api/integrations/vmware/route.ts](file://app/api/integrations/vmware/route.ts)
- [app/api/integrations/nms/route.ts](file://app/api/integrations/nms/route.ts)
- [app/api/integrations/nms/discovery/route.ts](file://app/api/integrations/nms/discovery/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/route.ts](file://app/api/integrations/nms/discovery/[scanId]/route.ts)
- [app/api/integrations/nms/discovery/[scanId]/import/route.ts](file://app/api/integrations/nms/discovery/[scanId]/import/route.ts)
- [app/api/integrations/nms/devices/route.ts](file://app/api/integrations/nms/devices/route.ts)
- [app/api/integrations/nms/devices/[id]/route.ts](file://app/api/integrations/nms/devices/[id]/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/route.ts](file://app/api/integrations/nms/devices/[id]/backups/route.ts)
- [app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts](file://app/api/integrations/nms/devices/[id]/backups/[backupId]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts](file://app/api/integrations/nms/devices/[id]/ports/[portName]/route.ts)
- [app/api/integrations/nms/devices/[id]/ports/[portName]/monitored/route.ts](file://app/api/integrations/nms/devices/[id]/ports/[portName]/monitored/route.ts)
- [app/api/integrations/nms/alarms/route.ts](file://app/api/integrations/nms/alarms/route.ts)
- [app/api/integrations/nms/network-devices/route.ts](file://app/api/integrations/nms/network-devices/route.ts)
- [app/api/integrations/nms/network-devices/[id]/route.ts](file://app/api/integrations/nms/network-devices/[id]/route.ts)

### Health
- Base URL: /api/health
- Methods:
  - GET: Application health endpoint.
  - GET /api/health/alarms: Alarm-related health checks.
- Example curl:
  - GET: curl -s https://host/api/health
  - GET: curl -s https://host/api/health/alarms

**Section sources**
- [app/api/health/route.ts](file://app/api/health/route.ts)
- [app/api/health/alarms/route.ts](file://app/api/health/alarms/route.ts)

### Security
- Quarantine
  - Base: /api/security/quarantine
  - Methods: GET (status)
  - Example curl: curl -s https://host/api/security/quarantine

- Risky Rules
  - Base: /api/security/risky-rules
  - Methods: GET (status)
  - Example curl: curl -s https://host/api/security/risky-rules

**Section sources**
- [app/api/security/quarantine/route.ts](file://app/api/security/quarantine/route.ts)
- [app/api/security/risky-rules/route.ts](file://app/api/security/risky-rules/route.ts)

### Users
- Base URL: /api/users
- Methods: GET (status)
- Example curl: curl -s https://host/api/users

**Section sources**
- [app/api/users/route.ts](file://app/api/users/route.ts)

### Internal Service API: NMS (Network Monitoring Service)
The NMS service is internal-only and runs on a dedicated port. It provides:
- Health: GET /health
- Devices: GET /devices, POST /devices/{nms_device_id}/poll
- Backups: POST /devices/{nms_device_id}/backup
- Metrics: GET /devices/{nms_device_id}/health, GET /devices/{nms_device_id}/interfaces
- Discovery: POST /discovery/start, GET /discovery/{scan_id}, GET /discovery/{scan_id}/results
- Topology: GET /topology

Example curl:
- GET /health: curl -s http://nms-host:8500/health
- GET /devices: curl -s http://nms-host:8500/devices
- POST /discovery/start: curl -s -X POST http://nms-host:8500/discovery/start -H "Content-Type: application/json" -d '{"cidr":"192.168.1.0/24"}'

Operational notes:
- The NMS service runs a background polling thread and uses a persistent thread pool for concurrent SNMP/SSH polling.
- Dynamic polling intervals adjust based on device outcomes.
- SSH fallback is used when SNMP fails.

**Section sources**
- [nms_service/main.py:91-98](file://nms_service/main.py#L91-L98)
- [nms_service/main.py:103-127](file://nms_service/main.py#L103-L127)
- [nms_service/main.py:131-182](file://nms_service/main.py#L131-L182)
- [nms_service/main.py:186-270](file://nms_service/main.py#L186-L270)
- [nms_service/main.py:274-296](file://nms_service/main.py#L274-L296)
- [nms_service/main.py:298-324](file://nms_service/main.py#L298-L324)
- [nms_service/main.py:328-374](file://nms_service/main.py#L328-L374)
- [nms_service/main.py:376-404](file://nms_service/main.py#L376-L404)
- [nms_service/main.py:406-442](file://nms_service/main.py#L406-L442)
- [nms_service/main.py:446-470](file://nms_service/main.py#L446-L470)
- [nms_service/orchestrator.py:35-71](file://nms_service/orchestrator.py#L35-L71)
- [nms_service/orchestrator.py:175-354](file://nms_service/orchestrator.py#L175-L354)
- [nms_service/orchestrator.py:407-434](file://nms_service/orchestrator.py#L407-L434)

## Dependency Analysis
- Public API routes depend on Prisma for data access and return standardized JSON.
- **Enhanced**: Security middleware provides centralized rate limiting, authentication, and authorization.
- **New**: Authentication utilities handle JWT session management and password verification.
- **New**: License utilities provide JWT license token signing and validation.
- Client-side helpers wrap HTTP requests and normalize errors.
- Internal NMS service is decoupled from the public API and runs independently.

```mermaid
graph LR
Middleware["Security Middleware<br/>middleware.ts"] --> Routes["Next.js Routes<br/>app/api/*"]
Routes --> Prisma["Prisma Client"]
Auth["Auth Utilities<br/>lib/auth/*"] --> Routes
License["License Utilities<br/>lib/license/*"] --> Routes
Helpers["Client Helpers<br/>lib/api.ts"] --> Routes
NMS["NMS Service<br/>nms_service/main.py"] --> Orchestrator["Orchestrator<br/>nms_service/orchestrator.py"]
Orchestrator --> DB["PostgreSQL"]
```

**Diagram sources**
- [middleware.ts:35-131](file://middleware.ts#L35-L131)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [lib/api.ts:1-57](file://lib/api.ts#L1-L57)
- [lib/auth/session.ts:1-62](file://lib/auth/session.ts#L1-L62)
- [lib/license/middleware.ts:1-203](file://lib/license/middleware.ts#L1-L203)
- [nms_service/main.py:39-43](file://nms_service/main.py#L39-L43)
- [nms_service/orchestrator.py:35-71](file://nms_service/orchestrator.py#L35-L71)

**Section sources**
- [middleware.ts:35-131](file://middleware.ts#L35-L131)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [lib/api.ts:1-57](file://lib/api.ts#L1-L57)
- [lib/auth/session.ts:1-62](file://lib/auth/session.ts#L1-L62)
- [lib/license/middleware.ts:1-203](file://lib/license/middleware.ts#L1-L203)
- [nms_service/main.py:39-43](file://nms_service/main.py#L39-L43)
- [nms_service/orchestrator.py:35-71](file://nms_service/orchestrator.py#L35-L71)

## Performance Considerations
- Caching: Several endpoints cache results for short TTLs to reduce DB load.
- Pagination: Devices and services enforce upper bounds on limit and compute total pages.
- Minimal mode: Devices and services support minimal mode to avoid heavy joins for dashboards.
- **Enhanced**: Rate limiting with different configurations for auth (10 req/min) vs general API (100 req/min).
- **Enhanced**: Session-based authentication reduces repeated password verification overhead.
- **New**: License token validation is lightweight and cached in memory.
- NMS polling: Concurrent polling with dynamic intervals and SSH fallback reduces timeouts and improves reliability.
- Query logging: Prisma logging disabled by default to minimize I/O overhead; enable temporarily for diagnostics.

Recommendations:
- Use minimal mode for dashboards and listing views.
- Tune pagination limits according to UI needs.
- Monitor NMS logs for poll timeouts and adjust concurrency and intervals.
- Apply client-side caching for repeated reads of static data.
- **New**: Implement exponential backoff for license validation failures.
- **New**: Use session cookies instead of API keys for better security and performance.

**Section sources**
- [app/api/devices/route.ts:42-71](file://app/api/devices/route.ts#L42-L71)
- [app/api/services/route.ts:10-27](file://app/api/services/route.ts#L10-L27)
- [lib/rate-limit.ts:12-22](file://lib/rate-limit.ts#L12-L22)
- [lib/auth/session.ts:34-61](file://lib/auth/session.ts#L34-L61)
- [lib/license/middleware.ts:175-182](file://lib/license/middleware.ts#L175-L182)
- [nms_service/orchestrator.py:61-70](file://nms_service/orchestrator.py#L61-L70)
- [nms_service/orchestrator.py:355-406](file://nms_service/orchestrator.py#L355-L406)

## Troubleshooting Guide
Common issues and resolutions:
- Validation errors: Requests missing required fields return 400 with error message.
- Database errors: Unexpected failures return 500 with error message.
- **New**: Authentication failures: Invalid credentials return 401, session expiration returns 401.
- **New**: Authorization failures: Insufficient permissions return 403 with required resource/action.
- **New**: Rate limiting: Excessive requests return 429 with Retry-After header.
- **New**: License validation failures: Invalid license returns 403 with grace mode information.
- NMS device not registered: Poll/backups return 404 when device is not registered.
- SSH backup failures: May return 502 if no output or connection errors occur.
- Discovery scan not found: Returns 404 for invalid scan_id.

Client-side helpers:
- Unified error handling wraps axios errors and returns { success: false, error }.

**Section sources**
- [app/api/organizations/route.ts:95-101](file://app/api/organizations/route.ts#L95-L101)
- [app/api/buildings/route.ts:86-92](file://app/api/buildings/route.ts#L86-L92)
- [app/api/devices/route.ts:104-110](file://app/api/devices/route.ts#L104-L110)
- [app/api/services/route.ts:85-91](file://app/api/services/route.ts#L85-L91)
- [middleware.ts:47-55](file://middleware.ts#L47-L55)
- [middleware.ts:77-88](file://middleware.ts#L77-L88)
- [middleware.ts:120-128](file://middleware.ts#L120-L128)
- [app/api/auth/login/route.ts:33-44](file://app/api/auth/login/route.ts#L33-L44)
- [app/api/license/activate/route.ts:33-46](file://app/api/license/activate/route.ts#L33-L46)
- [nms_service/main.py:134-136](file://nms_service/main.py#L134-L136)
- [nms_service/main.py:193-197](file://nms_service/main.py#L193-L197)
- [nms_service/main.py:209-212](file://nms_service/main.py#L209-L212)
- [nms_service/main.py:389-390](file://nms_service/main.py#L389-L390)
- [lib/api.ts:14-19](file://lib/api.ts#L14-L19)
- [lib/api.ts:26-31](file://lib/api.ts#L26-L31)
- [lib/api.ts:39-44](file://lib/api.ts#L39-L44)
- [lib/api.ts:51-56](file://lib/api.ts#L51-L56)

## Conclusion
InfraScope provides a comprehensive REST API for infrastructure modeling and monitoring, with public endpoints for organizations, buildings, devices, services, and topology, plus robust integration endpoints for Fortinet, Zabbix, VMware, and the internal NMS service. **Enhanced** with a complete authentication system using JWT sessions, **enhanced** with rate limiting and permission enforcement, and **new** with comprehensive license management for enterprise deployments. Responses follow a consistent envelope, with caching, pagination, and error handling designed for production use. The NMS service offers scalable SNMP/SSH polling, discovery, and topology retrieval for network monitoring.

## Appendices

### API Versioning
- No explicit version path/version header is present in the public API routes.
- The NMS service declares a version in its FastAPI metadata.

**Section sources**
- [nms_service/main.py:40-42](file://nms_service/main.py#L40-L42)

### Rate Limiting
**Enhanced**: Comprehensive rate limiting implemented across all API routes.

- **Auth endpoints** (/api/auth/*): Strict limit of 10 requests per minute to prevent brute-force attacks.
- **General API endpoints** (/api/* excluding auth): Generous limit of 100 requests per minute to prevent abuse.
- **Implementation**: In-memory sliding window with automatic cleanup to prevent memory leaks.
- **IP Detection**: Uses x-forwarded-for header for production, with development fallbacks.
- **Headers**: Returns Retry-After header with seconds until reset on 429 responses.

Recommendations:
- Implement exponential backoff client-side for 429 responses.
- Consider upgrading to Redis-based rate limiting for multi-instance deployments.
- Monitor rate limit violations in production logs.

**Section sources**
- [lib/rate-limit.ts:12-22](file://lib/rate-limit.ts#L12-L22)
- [lib/rate-limit.ts:122-127](file://lib/rate-limit.ts#L122-L127)
- [middleware.ts:43-55](file://middleware.ts#L43-L55)

### Security Considerations
**Enhanced**: Comprehensive security implementation with multiple layers.

- **Authentication**: JWT-based session management with httpOnly cookies, secure flags, and SameSite protection.
- **Authorization**: Role-based access control with resource-specific permissions.
- **Rate Limiting**: Application-level rate limiting for all API endpoints.
- **Input Validation**: Zod schema validation for all request bodies.
- **Password Security**: bcrypt hashing with configurable rounds.
- **License Validation**: JWT-based license tokens with automatic renewal.
- **TLS Safety**: Production security check for NODE_TLS_REJECT_UNAUTHORIZED.
- **Internal Service**: NMS service is intended for internal Docker network exposure only.

Best Practices:
- Always use HTTPS in production environments.
- Store secrets in environment variables, not in code.
- Regularly rotate JWT secrets and license keys.
- Monitor authentication attempts and rate limit violations.
- Implement proper session timeout handling.

**Section sources**
- [middleware.ts:35-131](file://middleware.ts#L35-L131)
- [lib/auth/session.ts:17-18](file://lib/auth/session.ts#L17-L18)
- [lib/auth/session.ts:101-107](file://lib/auth/session.ts#L101-L107)
- [lib/auth/password.ts:9-11](file://lib/auth/password.ts#L9-L11)
- [lib/license/middleware.ts:45-59](file://lib/license/middleware.ts#L45-L59)

### Testing Strategies
- Use the included testing guides for quick start and API testing.
- **New**: Test authentication flow: login → me → logout.
- **New**: Test license management: activate → validate → heartbeat → status.
- Example scenarios:
  - List organizations and buildings.
  - Create devices and services, then paginate and filter.
  - Trigger NMS discovery scans and poll results.
  - Retrieve health and interface metrics for devices.
  - Test rate limiting by sending multiple requests quickly.

**Section sources**
- [docs/API_TESTING_GUIDE.md](file://docs/API_TESTING_GUIDE.md)
- [docs/QUICK_START_TESTING.md](file://docs/QUICK_START_TESTING.md)

### Client Implementation Guidelines
- Use the client helpers to centralize HTTP calls and error handling.
- **New**: Implement session-based authentication with cookie management.
- **New**: Handle rate limit responses with exponential backoff.
- **New**: Implement license token refresh logic.
- Respect pagination and limits; prefer minimal mode for dashboards.
- Cache responses for frequently accessed static lists.
- **New**: Implement proper error handling for authentication, authorization, and rate limit failures.

**Section sources**
- [lib/api.ts:1-57](file://lib/api.ts#L1-L57)
- [lib/auth/session.ts:101-107](file://lib/auth/session.ts#L101-L107)
- [lib/rate-limit.ts:52-54](file://lib/rate-limit.ts#L52-L54)

### Performance Optimization Tips
- Enable Prisma query logging only during diagnostics.
- Adjust NMS concurrency and intervals based on device counts and network conditions.
- Use minimal mode for listing endpoints to reduce payload sizes.
- **New**: Implement client-side session caching to reduce authentication overhead.
- **New**: Use rate limit headers to optimize request scheduling.
- **New**: Implement license token caching with automatic refresh.

**Section sources**
- [lib/prisma.ts:13-15](file://lib/prisma.ts#L13-L15)
- [nms_service/orchestrator.py:61-70](file://nms_service/orchestrator.py#L61-L70)
- [nms_service/orchestrator.py:355-406](file://nms_service/orchestrator.py#L355-L406)
- [ALARM_PERFORMANCE_OPTIMIZATION.md](file://ALARM_PERFORMANCE_OPTIMIZATION.md)
- [lib/auth/session.ts:34-40](file://lib/auth/session.ts#L34-L40)
- [lib/rate-limit.ts:32-68](file://lib/rate-limit.ts#L32-L68)