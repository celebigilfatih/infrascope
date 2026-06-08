# Development & Deployment

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [QUICK_START.md](file://QUICK_START.md)
- [DEV_WORKFLOW.md](file://DEV_WORKFLOW.md)
- [package.json](file://package.json)
- [Dockerfile](file://Dockerfile)
- [Dockerfile.dev](file://Dockerfile.dev)
- [docker-compose.yml](file://docker-compose.yml)
- [docker-compose.prod.yml](file://docker-compose.prod.yml)
- [deploy/docker-compose.yml](file://deploy/docker-compose.yml)
- [deploy/install-guide.html](file://deploy/install-guide.html)
- [deploy/install.sh](file://deploy/install.sh)
- [deploy/update.sh](file://deploy/update.sh)
- [scripts/entrypoint.sh](file://scripts/entrypoint.sh)
- [scripts/wait-for-db.sh](file://scripts/wait-for-db.sh)
- [scripts/dev-startup.sh](file://scripts/dev-startup.sh)
- [nms_service/Dockerfile](file://nms_service/Dockerfile)
- [nms_service/main.py](file://nms_service/main.py)
- [nms_service/orchestrator.py](file://nms_service/orchestrator.py)
- [nms_service/discovery_worker.py](file://nms_service/discovery_worker.py)
- [lib/prisma.ts](file://lib/prisma.ts)
</cite>

## Update Summary
**Changes Made**
- Added comprehensive on-premise deployment infrastructure with new Docker Compose configuration
- Integrated professional installation and update scripts for production deployments
- Enhanced deployment documentation with interactive installer and rollback procedures
- Updated licensing system with automated activation and cache management
- Improved production deployment with enhanced security configurations

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
This document provides a comprehensive guide to developing, building, and deploying the InfraScope platform. It covers development environment setup, local database configuration, debugging workflows, the build process and optimization strategies, containerization and orchestration, production deployment configurations, scaling and high availability, monitoring and observability, and operational best practices. The platform now includes enhanced on-premise deployment infrastructure with professional installation tools, automated licensing management, and streamlined update procedures.

## Project Structure
InfraScope is a Next.js 14 application with a PostgreSQL-backed Prisma ORM and an internal Python-based Network Monitoring Sidecar (NMS). The repository includes:
- Frontend application under app/ and components/
- Backend API routes under app/api/
- Database schema and migrations under prisma/
- Utilities and database client under lib/
- Scripts for container entrypoints and database waits under scripts/
- NMS service under nms_service/ with its own Dockerfile and FastAPI endpoints
- Enhanced Docker configurations for both development and production environments
- Professional deployment tools under deploy/ directory

```mermaid
graph TB
subgraph "Frontend"
WEB["Next.js App<br/>app/, components/"]
API["API Routes<br/>app/api/"]
PRISMA["Prisma Client<br/>lib/prisma.ts"]
end
subgraph "Services"
NMS["NMS Sidecar<br/>nms_service/main.py"]
end
subgraph "Deployment Infrastructure"
DEPLOY["On-Premise Deployment<br/>deploy/"]
INSTALL["Installation Tools<br/>install.sh, update.sh"]
LICENSE["License Management<br/>.env, .machine-id"]
end
subgraph "Infrastructure"
DB["PostgreSQL"]
DOCKER_DEV["Dockerfile.dev"]
DOCKER_PROD["Dockerfile"]
DC_DEV["docker-compose.yml"]
DC_PROD["docker-compose.prod.yml"]
DC_DEPLOY["deploy/docker-compose.yml"]
end
WEB --> API
API --> PRISMA
PRISMA --> DB
WEB --> NMS
NMS --> DB
DOCKER_DEV --> WEB
DOCKER_DEV --> NMS
DOCKER_PROD --> WEB
DC_DEV --> DB
DC_DEV --> WEB
DC_DEV --> NMS
DC_PROD --> DB
DC_PROD --> WEB
DC_DEPLOY --> DB
DC_DEPLOY --> WEB
DC_DEPLOY --> INSTALL
INSTALL --> LICENSE
DEPLOY --> LICENSE
```

**Diagram sources**
- [Dockerfile.dev:1-51](file://Dockerfile.dev#L1-L51)
- [Dockerfile:1-115](file://Dockerfile#L1-L115)
- [docker-compose.yml:1-153](file://docker-compose.yml#L1-L153)
- [docker-compose.prod.yml:1-135](file://docker-compose.prod.yml#L1-L135)
- [deploy/docker-compose.yml:1-105](file://deploy/docker-compose.yml#L1-L105)
- [deploy/install.sh:1-170](file://deploy/install.sh#L1-L170)
- [deploy/update.sh:1-169](file://deploy/update.sh#L1-L169)
- [nms_service/Dockerfile:1-30](file://nms_service/Dockerfile#L1-L30)
- [nms_service/main.py:1-483](file://nms_service/main.py#L1-L483)
- [lib/prisma.ts:1-21](file://lib/prisma.ts#L1-L21)

**Section sources**
- [README.md:106-164](file://README.md#L106-L164)
- [docker-compose.yml:5-153](file://docker-compose.yml#L5-L153)
- [docker-compose.prod.yml:7-135](file://docker-compose.prod.yml#L7-L135)
- [deploy/docker-compose.yml:1-105](file://deploy/docker-compose.yml#L1-L105)

## Core Components
- Next.js Application: Single-page application with API routes, TypeScript, and Tailwind CSS.
- Prisma ORM: Database client singleton with configurable query logging.
- NMS Sidecar: Python FastAPI service for SNMP/SSH polling, discovery, and topology collection.
- Enhanced Containerization: Multi-stage Docker build for production and a lightweight development image with hot reload.
- Professional Deployment Tools: Interactive installer and updater scripts for on-premise deployments.
- Licensing System: Automated license activation with cache management and offline support.
- Production-Grade Orchestration: Docker Compose configurations for both development and production environments.

Key capabilities:
- Local development with hot reload and persistent database.
- Professional on-premise deployment with automated installation and updates.
- Production-ready container with health checks, non-root user, and pre-warmed routes.
- Automated license management with activation, caching, and graceful degradation.
- Internal NMS service exposing endpoints for device polling, discovery, backups, and topology.

**Section sources**
- [README.md:108-126](file://README.md#L108-L126)
- [lib/prisma.ts:1-21](file://lib/prisma.ts#L1-L21)
- [nms_service/main.py:1-483](file://nms_service/main.py#L1-L483)
- [Dockerfile.dev:1-51](file://Dockerfile.dev#L1-L51)
- [Dockerfile:1-115](file://Dockerfile#L1-L115)
- [deploy/install.sh:1-170](file://deploy/install.sh#L1-L170)
- [deploy/update.sh:1-169](file://deploy/update.sh#L1-L169)

## Architecture Overview
The system comprises:
- Web tier: Next.js serving pages and API routes.
- Database tier: PostgreSQL with Prisma managing schema and migrations.
- Sidecar tier: NMS service for network telemetry and discovery.
- Deployment tier: Professional on-premise deployment with automated tools.
- Containerization: Separate images for development and production, orchestrated by Docker Compose.

```mermaid
graph TB
CLIENT["Browser"]
NEXT["Next.js Server"]
API["API Routes"]
PRISMA["Prisma Client"]
PG["PostgreSQL"]
NMS["NMS FastAPI"]
NMS_DB["NMS Tables"]
DEPLOY["Deployment Tools"]
INSTALL["Installer"]
UPDATE["Updater"]
LICENSE["License Manager"]
CLIENT --> NEXT
NEXT --> API
API --> PRISMA
PRISMA --> PG
NEXT --> NMS
NMS --> NMS_DB
NMS_DB --> PG
DEPLOY --> INSTALL
DEPLOY --> UPDATE
DEPLOY --> LICENSE
INSTALL --> NEXT
UPDATE --> NEXT
LICENSE --> NEXT
```

**Diagram sources**
- [nms_service/main.py:39-51](file://nms_service/main.py#L39-L51)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [docker-compose.yml:78-115](file://docker-compose.yml#L78-L115)
- [deploy/install.sh:160-170](file://deploy/install.sh#L160-L170)
- [deploy/update.sh:145-169](file://deploy/update.sh#L145-L169)

**Section sources**
- [README.md:108-126](file://README.md#L108-L126)
- [docker-compose.yml:78-115](file://docker-compose.yml#L78-L115)
- [deploy/docker-compose.yml:1-105](file://deploy/docker-compose.yml#L1-105)

## Detailed Component Analysis

### Development Environment Setup
- Local prerequisites: Node.js 18+, PostgreSQL, and a package manager.
- Environment variables: DATABASE_URL, NEXT_PUBLIC_API_URL, NODE_ENV, LOG_LEVEL.
- Steps: Install dependencies, configure .env.local, generate Prisma client, initialize database, seed data, and start development server.
- Quick start commands and troubleshooting tips are documented for common issues.

Practical example:
- Start with the quick start steps and confirm the dashboard is reachable.

**Section sources**
- [README.md:66-98](file://README.md#L66-L98)
- [QUICK_START.md:10-48](file://QUICK_START.md#L10-L48)
- [README.md:332-341](file://README.md#L332-L341)

### Local Database Setup
- PostgreSQL 12+ is required.
- Configure DATABASE_URL in .env.local.
- Use Prisma to generate client and push schema to the database.
- Seed the database with sample data for immediate exploration.

Operational tip:
- If Prisma client generation fails, regenerate the client and reinstall dependencies if needed.

**Section sources**
- [README.md:343-348](file://README.md#L343-L348)
- [README.md:368-376](file://README.md#L368-L376)
- [QUICK_START.md:22-35](file://QUICK_START.md#L22-L35)

### Debugging Workflows
- Use logs from Docker Compose for real-time insight during development.
- Access the database directly via psql inside the container.
- Restart containers after rebuilding Dockerfile.dev if necessary.
- Use type checking and linting commands for faster feedback loops.

**Section sources**
- [DEV_WORKFLOW.md:54-106](file://DEV_WORKFLOW.md#L54-L106)
- [QUICK_START.md:152-178](file://QUICK_START.md#L152-L178)

### Build Process and Optimization Strategies
- Development build: Turbo mode enabled, hot reload, and automatic startup scripts.
- Production build: Multi-stage Docker build with optimized image size, non-root user, health checks, and pre-warmed routes.
- Optimization highlights:
  - Multi-stage build reduces final image size.
  - Health checks ensure readiness.
  - Pre-warming routes improves first-load performance.
  - Prisma client generation is performed at build time for production.

**Section sources**
- [package.json:5-14](file://package.json#L5-L14)
- [Dockerfile:6-115](file://Dockerfile#L6-L115)
- [scripts/entrypoint.sh:69-88](file://scripts/entrypoint.sh#L69-L88)
- [lib/prisma.ts:13-16](file://lib/prisma.ts#L13-L16)

### Enhanced Containerization and Orchestration
- Development containerization:
  - Dockerfile.dev builds a lightweight image with hot reload and development dependencies.
  - docker-compose.yml defines services for web, db, and NMS sidecar with volume mounts for hot reload.
- Production containerization:
  - Dockerfile performs a multi-stage build, installs runtime dependencies, and sets a non-root user.
  - docker-compose.prod.yml defines production-grade settings including health checks, read-only root filesystem, and security options.
- On-premise deployment:
  - deploy/docker-compose.yml provides production-ready configuration with health checks and volume mounts.
  - Professional installation and update scripts automate deployment procedures.

```mermaid
sequenceDiagram
participant Dev as "Developer"
participant DC as "Docker Compose"
participant Web as "Web Container"
participant DB as "PostgreSQL"
participant NMS as "NMS Sidecar"
Dev->>DC : "docker compose up -d"
DC->>DB : "Start and healthcheck"
DB-->>DC : "Healthy"
DC->>Web : "Build/run with entrypoint"
Web->>DB : "Wait for DB readiness"
Web->>Web : "Run migrations and generate Prisma client"
Web->>NMS : "Start alarm services after server ready"
Web-->>Dev : "Server ready on port 3000"
```

**Diagram sources**
- [docker-compose.yml:32-77](file://docker-compose.yml#L32-L77)
- [Dockerfile.dev:33-51](file://Dockerfile.dev#L33-L51)
- [scripts/entrypoint.sh:11-41](file://scripts/entrypoint.sh#L11-L41)
- [scripts/dev-startup.sh:12-28](file://scripts/dev-startup.sh#L12-L28)

**Section sources**
- [docker-compose.yml:32-115](file://docker-compose.yml#L32-L115)
- [Dockerfile.dev:1-51](file://Dockerfile.dev#L1-L51)
- [docker-compose.prod.yml:36-75](file://docker-compose.prod.yml#L36-L75)
- [Dockerfile:56-115](file://Dockerfile#L56-L115)
- [deploy/docker-compose.yml:1-105](file://deploy/docker-compose.yml#L1-L105)

### Professional Deployment Tools
- Interactive Installer (install.sh):
  - Checks Docker and Docker Compose prerequisites
  - Creates directory structure for data and logs
  - Generates secure authentication secrets
  - Pulls Docker images from registry
  - Starts services automatically
- Update Manager (update.sh):
  - Creates database backups before updates
  - Pulls new versions from registry
  - Runs database migrations safely
  - Performs health checks after updates
  - Provides rollback instructions

**Section sources**
- [deploy/install.sh:1-170](file://deploy/install.sh#L1-L170)
- [deploy/update.sh:1-169](file://deploy/update.sh#L1-L169)

### Licensing System and Activation
- Automated License Activation:
  - Machine ID generation for unique identification
  - License key validation against central server
  - JWT token caching for offline operation
  - Grace period support (7 days) for network outages
- License Cache Management:
  - Persistent storage in data/license-cache volume
  - Automatic cache refresh during online periods
  - Restricted mode when cache expires
- Configuration Management:
  - .env file with license server URL and keys
  - Volume mounting for persistence across updates

**Section sources**
- [deploy/docker-compose.yml:47-69](file://deploy/docker-compose.yml#L47-L69)
- [deploy/install.sh:83-109](file://deploy/install.sh#L83-L109)
- [deploy/update.sh:42-59](file://deploy/update.sh#L42-L59)

### NMS Sidecar: Polling, Discovery, and Topology
- FastAPI endpoints expose:
  - Device polling, backups, health metrics, interface states, discovery scans, and topology links.
- Orchestrator:
  - Concurrent polling via ThreadPoolExecutor with per-device throttling and dynamic intervals.
  - SNMP-first, SSH-fallback strategy with vendor detection.
  - Periodic topology polling and last-polled tracking.
- Discovery worker:
  - Async CIDR scanning with threaded SNMP/SSH probing and batched persistence.

```mermaid
sequenceDiagram
participant API as "Next.js API"
participant NMS as "NMS FastAPI"
participant Orchestrator as "NMS Orchestrator"
participant DB as "PostgreSQL"
API->>NMS : "POST /api/alarms/scheduler"
API->>NMS : "POST /api/alarms/monitor"
NMS->>Orchestrator : "Background polling loop"
Orchestrator->>DB : "Save metrics and topology"
DB-->>Orchestrator : "Ack"
Orchestrator-->>NMS : "Cycle complete"
```

**Diagram sources**
- [nms_service/main.py:91-98](file://nms_service/main.py#L91-L98)
- [nms_service/main.py:131-182](file://nms_service/main.py#L131-L182)
- [nms_service/main.py:328-374](file://nms_service/main.py#L328-L374)
- [nms_service/orchestrator.py:407-434](file://nms_service/orchestrator.py#L407-L434)

**Section sources**
- [nms_service/main.py:1-483](file://nms_service/main.py#L1-L483)
- [nms_service/orchestrator.py:1-461](file://nms_service/orchestrator.py#L1-L461)
- [nms_service/discovery_worker.py:1-262](file://nms_service/discovery_worker.py#L1-L262)

### Database Readiness and Startup Flow
- The container entrypoint waits for the database to be ready, runs Prisma migrations, generates the client, seeds data in development, and starts alarm services after the server is healthy.
- A dedicated wait script provides a reusable mechanism to check database connectivity.

```mermaid
flowchart TD
Start(["Container Start"]) --> WaitDB["Wait for DB Connectivity"]
WaitDB --> Migrate["Run Prisma Migrations"]
Migrate --> GenClient["Generate Prisma Client"]
GenClient --> Seed{"Development?"}
Seed --> |Yes| SeedDB["Seed Sample Data"]
Seed --> |No| SkipSeed["Skip Seed"]
SeedDB --> ServerReady["Start Next.js Server"]
SkipSeed --> ServerReady
ServerReady --> PreWarm["Pre-warm Routes"]
PreWarm --> StartAlarms["Start Alarm Services"]
StartAlarms --> End(["Ready"])
```

**Diagram sources**
- [scripts/entrypoint.sh:11-41](file://scripts/entrypoint.sh#L11-L41)
- [scripts/wait-for-db.sh:8-28](file://scripts/wait-for-db.sh#L8-L28)
- [scripts/entrypoint.sh:44-84](file://scripts/entrypoint.sh#L44-L84)

**Section sources**
- [scripts/entrypoint.sh:1-88](file://scripts/entrypoint.sh#L1-L88)
- [scripts/wait-for-db.sh:1-29](file://scripts/wait-for-db.sh#L1-L29)

### Development Workflow Example
- Build and start development containers, watch logs, and iterate with hot reload.
- Use Docker Compose commands to manage services and perform common tasks like linting and type checking inside the container.

**Section sources**
- [DEV_WORKFLOW.md:1-106](file://DEV_WORKFLOW.md#L1-L106)

### Professional Production Deployment Procedures
- Enhanced production deployment with:
  - Automated installer for on-premise environments
  - Secure license management with cache persistence
  - Professional update procedures with rollback support
  - Health checks and monitoring integration
- Build the production image using the multi-stage Dockerfile.
- Use docker-compose.prod.yml to orchestrate services with health checks, security hardening, and read-only root filesystem.
- Expose the service on the desired port and ensure environment variables are configured for production.

**Section sources**
- [Dockerfile:1-115](file://Dockerfile#L1-L115)
- [docker-compose.prod.yml:36-75](file://docker-compose.prod.yml#L36-L75)
- [deploy/docker-compose.yml:1-105](file://deploy/docker-compose.yml#L1-L105)
- [deploy/install.sh:160-170](file://deploy/install.sh#L160-L170)
- [deploy/update.sh:145-169](file://deploy/update.sh#L145-L169)

### Scaling and High Availability
- Horizontal scaling:
  - Run multiple instances behind a reverse proxy (e.g., Caddy) for load distribution.
  - Use a managed PostgreSQL instance or a clustered database for HA.
- Service isolation:
  - Keep the web application and NMS sidecar in separate containers for independent scaling.
- Health checks:
  - Leverage existing health endpoints for load balancer probes and orchestrator restart policies.
- License management:
  - Centralized license server for multiple on-premise installations.
  - Graceful degradation with cached licenses for network outages.

Note: The repository includes commented optional Caddy and Redis configurations for production-grade setups.

**Section sources**
- [docker-compose.prod.yml:76-92](file://docker-compose.prod.yml#L76-L92)
- [deploy/docker-compose.yml:81-96](file://deploy/docker-compose.yml#L81-L96)

### Monitoring, Logging, and Observability
- Health endpoints:
  - Web application exposes a health endpoint for readiness checks.
  - NMS sidecar exposes a health endpoint indicating poller status and registered devices.
  - Deployment tools provide status reporting and rollback capabilities.
- Logging:
  - NMS logs are persisted to a dedicated volume for inspection.
  - Prisma client logging is configurable and disabled by default to reduce I/O overhead.
  - Application logs stored in mounted volume for persistent access.
- Recommendations:
  - Integrate structured logging and metrics collection in production.
  - Use a centralized logging stack and APM for end-to-end observability.

**Section sources**
- [nms_service/main.py:91-98](file://nms_service/main.py#L91-L98)
- [docker-compose.yml:109-114](file://docker-compose.yml#L109-L114)
- [lib/prisma.ts:13-16](file://lib/prisma.ts#L13-L16)
- [deploy/docker-compose.yml:65-71](file://deploy/docker-compose.yml#L65-L71)

### Security Considerations
- Production hardening:
  - Non-root user, read-only root filesystem, and health checks.
  - Restrict database exposure and use environment variables for secrets.
- License security:
  - Machine ID generation prevents unauthorized reuse across systems.
  - License cache encryption for sensitive token storage.
  - Graceful degradation prevents unauthorized access during outages.
- Development caution:
  - NEXTAUTH_SECRET and TLS settings are highlighted for development; change them before production.
- Secrets management:
  - Store sensitive configuration in environment files and avoid committing secrets.

**Section sources**
- [Dockerfile:68-115](file://Dockerfile#L68-L115)
- [docker-compose.prod.yml:45-71](file://docker-compose.prod.yml#L45-L71)
- [docker-compose.yml:37-50](file://docker-compose.yml#L37-L50)
- [deploy/docker-compose.yml:47-69](file://deploy/docker-compose.yml#L47-L69)

## Dependency Analysis
The application's primary dependencies and their roles:
- Next.js 14: Frontend framework and API routing.
- Prisma: Database client and migrations.
- PostgreSQL: Relational database for application and NMS data.
- NMS Python service: SNMP/SSH polling and discovery.
- Docker: Containerization and orchestration.
- Deployment tools: Professional installer and updater scripts.

```mermaid
graph LR
NEXT["Next.js"]
PRISMA["@prisma/client"]
PG["PostgreSQL"]
NMS_PY["Python NMS"]
NMS_FASTAPI["FastAPI"]
NMS_DB["NMS Tables"]
INSTALL["Installer Script"]
UPDATE["Updater Script"]
LICENSE["License System"]
NEXT --> PRISMA
PRISMA --> PG
NEXT --> NMS_FASTAPI
NMS_FASTAPI --> NMS_PY
NMS_PY --> NMS_DB
NMS_DB --> PG
INSTALL --> NEXT
UPDATE --> NEXT
LICENSE --> NEXT
```

**Diagram sources**
- [package.json:16-57](file://package.json#L16-L57)
- [nms_service/Dockerfile:1-30](file://nms_service/Dockerfile#L1-L30)
- [nms_service/main.py:20-34](file://nms_service/main.py#L20-L34)
- [deploy/install.sh:111-130](file://deploy/install.sh#L111-L130)
- [deploy/update.sh:61-73](file://deploy/update.sh#L61-L73)

**Section sources**
- [package.json:16-57](file://package.json#L16-L57)
- [docker-compose.yml:78-115](file://docker-compose.yml#L78-L115)

## Performance Considerations
- Build-time optimizations:
  - Multi-stage Docker build reduces image size and attack surface.
  - Prisma client generated at build time ensures runtime efficiency.
- Runtime optimizations:
  - Pre-warming routes at startup minimizes cold-start latency.
  - Prisma query logging disabled by default to reduce I/O overhead.
- Operational tips:
  - Use type checking and linting to catch regressions early.
  - Monitor database performance and adjust connection pooling and indexes as needed.
- Deployment optimizations:
  - Automated installer reduces manual configuration errors.
  - Update scripts provide safe rollback capabilities.

**Section sources**
- [Dockerfile:6-41](file://Dockerfile#L6-L41)
- [scripts/entrypoint.sh:66-77](file://scripts/entrypoint.sh#L66-L77)
- [lib/prisma.ts:13-16](file://lib/prisma.ts#L13-L16)
- [deploy/install.sh:160-170](file://deploy/install.sh#L160-L170)

## Troubleshooting Guide
Common issues and resolutions:
- PostgreSQL connection failures:
  - Verify DATABASE_URL and ensure the database is healthy.
  - Use psql to connect and inspect database state.
- Prisma client issues:
  - Re-run Prisma client generation and reinstall dependencies if needed.
- Port conflicts:
  - Change the development port or stop conflicting services.
- TypeScript errors:
  - Run type checking and clear Next.js cache if necessary.
- Development container rebuilds:
  - Rebuild the development image if Dockerfile.dev changes.
- License activation failures:
  - Verify license key format and network connectivity to license server.
  - Check machine ID persistence in data/machine-id volume.
- Update failures:
  - Review database backup creation and migration logs.
  - Use rollback procedure if update fails.

**Section sources**
- [README.md:357-392](file://README.md#L357-L392)
- [DEV_WORKFLOW.md:54-106](file://DEV_WORKFLOW.md#L54-L106)
- [deploy/install.sh:28-54](file://deploy/install.sh#L28-L54)
- [deploy/update.sh:42-98](file://deploy/update.sh#L42-L98)

## Conclusion
InfraScope provides a robust foundation for enterprise infrastructure management with a modern frontend, a PostgreSQL-backed backend, and an internal NMS sidecar for network telemetry. The enhanced deployment infrastructure includes professional installation tools, automated licensing management, and streamlined update procedures. The repository now supports both development and production environments with comprehensive configuration options, enabling rapid iteration and secure, scalable deployments. By following the documented workflows and leveraging the provided scripts and Docker configurations, teams can confidently develop, test, and operate InfraScope in diverse environments.

## Appendices

### Appendix A: Development Commands Reference
- Start development server: npm run dev
- Build for production: npm run build
- Start production server: npm run start
- Linting: npm run lint
- Type checking: npm run type-check
- Database operations: db:migrate, db:push, db:seed, db:studio

**Section sources**
- [README.md:194-209](file://README.md#L194-L209)
- [package.json:5-14](file://package.json#L5-L14)

### Appendix B: Production Environment Variables
- Required variables include database credentials, API URLs, and authentication settings.
- License configuration requires LICENSE_KEY and license server URL.
- Ensure secrets are managed securely and not committed to source control.

**Section sources**
- [README.md:332-341](file://README.md#L332-L341)
- [docker-compose.prod.yml:45-53](file://docker-compose.prod.yml#L45-L53)
- [deploy/docker-compose.yml:47-58](file://deploy/docker-compose.yml#L47-L58)

### Appendix C: Deployment Tools Reference
- Installation: ./install.sh - Interactive installer with prerequisite checks
- Updates: ./update.sh [version] - Safe update with backup and rollback
- License management: Automatic activation and cache management
- Monitoring: Health checks and status reporting

**Section sources**
- [deploy/install.sh:1-170](file://deploy/install.sh#L1-L170)
- [deploy/update.sh:1-169](file://deploy/update.sh#L1-L169)
- [deploy/install-guide.html:576-628](file://deploy/install-guide.html#L576-L628)