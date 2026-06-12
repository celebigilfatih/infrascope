# Development Setup

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [DEV_WORKFLOW.md](file://DEV_WORKFLOW.md)
- [DOCKER.md](file://DOCKER.md)
- [docker-compose.yml](file://docker-compose.yml)
- [Dockerfile.dev](file://Dockerfile.dev)
- [package.json](file://package.json)
- [scripts/dev-startup.sh](file://scripts/dev-startup.sh)
- [scripts/entrypoint.sh](file://scripts/entrypoint.sh)
- [scripts/wait-for-db.sh](file://scripts/wait-for-db.sh)
- [next.config.js](file://next.config.js)
- [tsconfig.json](file://tsconfig.json)
- [prisma/schema.prisma](file://prisma/schema.prisma)
- [lib/prisma.ts](file://lib/prisma.ts)
- [nms_service/Dockerfile](file://nms_service/Dockerfile)
- [nms_service/main.py](file://nms_service/main.py)
- [nms_service/orchestrator.py](file://nms_service/orchestrator.py)
- [CHANGELOG.md](file://CHANGELOG.md)
</cite>

## Update Summary
**Changes Made**
- Updated hot reload and automatic reloading section to reflect optimized startup scripts
- Enhanced development workflow documentation with streamlined container orchestration
- Improved troubleshooting guide with new error handling and performance optimizations
- Updated architecture diagrams to show simplified entrypoint script responsibilities
- Added new section on development environment stability improvements

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
This document provides a comprehensive guide to setting up and operating the development environment for InfraScope. The development environment has been significantly optimized with streamlined startup scripts that eliminate duplication and improve stability. It covers the hot reload and automatic reloading mechanisms, the Docker-based development stack, and the daily development workflow. You will learn how to configure the environment, mount volumes for live editing, leverage hot module replacement, and manage containers and databases during development. Practical commands for logs, debugging, and performance tuning are included, along with troubleshooting guidance for common issues.

## Project Structure
The development environment is orchestrated by Docker Compose and consists of:
- A Next.js frontend service configured for development with hot reload and Turbopack optimization
- A PostgreSQL database service with persistent volumes
- An NMS (Network Monitoring System) sidecar service written in Python/FastAPI
- Streamlined startup scripts that coordinate container initialization without duplication
- Shared volumes enabling live code synchronization and build isolation

```mermaid
graph TB
subgraph "Optimized Development Environment"
Web["Next.js Web Service<br/>Port 3000<br/>Hot Reload + Turbopack"]
DB["PostgreSQL Database<br/>Port 5432<br/>Persistent Volume"]
NMS["NMS Sidecar<br/>Port 8500<br/>Internal API"]
Entrypoint["Simplified Entrypoint<br/>45 lines (optimized)"]
Startup["Streamlined Startup<br/>71 lines (optimized)"]
end
Host["Developer Machine"]
Host --> |"Volume Mounts"| Web
Web --> |"DATABASE_URL"| DB
Web --> |"NMS_BACKEND_URL"| NMS
Entrypoint --> |"Database Ready"| DB
Startup --> |"Alarm Services"| Web
NMS --> |"Internal Polling"| DB
```

**Diagram sources**
- [docker-compose.yml:5-153](file://docker-compose.yml#L5-L153)
- [Dockerfile.dev:1-51](file://Dockerfile.dev#L1-L51)
- [nms_service/Dockerfile:1-30](file://nms_service/Dockerfile#L1-L30)
- [scripts/entrypoint.sh:1-45](file://scripts/entrypoint.sh#L1-L45)
- [scripts/dev-startup.sh:1-71](file://scripts/dev-startup.sh#L1-L71)

**Section sources**
- [docker-compose.yml:1-153](file://docker-compose.yml#L1-L153)
- [Dockerfile.dev:1-51](file://Dockerfile.dev#L1-L51)
- [nms_service/Dockerfile:1-30](file://nms_service/Dockerfile#L1-L30)
- [scripts/entrypoint.sh:1-45](file://scripts/entrypoint.sh#L1-L45)
- [scripts/dev-startup.sh:1-71](file://scripts/dev-startup.sh#L1-L71)

## Core Components
- **Docker Compose configuration** defines three primary services: web, db, and nms. It sets environment variables, exposes ports, mounts volumes, and ensures health checks and restart policies.
- **Optimized development Dockerfile** installs dependencies, generates the Prisma client, and starts the Next.js dev server with hot reload and Turbopack optimization.
- **Simplified entrypoint script** coordinates database readiness, applies migrations, seeds data in development, and delegates alarm services and pre-warming to the dedicated startup script.
- **Streamlined development startup script** waits for the Next.js server to be healthy, starts alarm services, and performs delayed route pre-warming to avoid Turbopack HMR conflicts.

Key development commands:
- Start/stop services and follow logs
- Execute commands inside containers (linting, type-checking, Prisma operations)
- Manage database migrations and seeding

**Section sources**
- [docker-compose.yml:32-77](file://docker-compose.yml#L32-L77)
- [Dockerfile.dev:23-50](file://Dockerfile.dev#L23-L50)
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)
- [package.json:5-14](file://package.json#L5-L14)

## Architecture Overview
The development architecture centers on a containerized Next.js application with optimized startup scripts that eliminate duplication and improve stability. The simplified entrypoint script focuses solely on database preparation, while the dedicated startup script handles alarm services and route pre-warming with intelligent timing to avoid conflicts with Turbopack hot module replacement.

```mermaid
sequenceDiagram
participant Dev as "Developer"
participant Compose as "Docker Compose"
participant Entrypoint as "Simplified Entrypoint"
participant Web as "Next.js Dev Server"
participant Startup as "Optimized Startup Script"
participant DB as "PostgreSQL"
participant NMS as "NMS Sidecar"
Dev->>Compose : "docker compose up -d"
Compose->>Entrypoint : "Start web container"
Entrypoint->>DB : "Wait for readiness (45 lines)"
Entrypoint->>DB : "Run Prisma migrations"
Entrypoint->>DB : "Generate Prisma client"
Entrypoint->>DB : "Seed development data (if applicable)"
Entrypoint->>Web : "Start Next.js dev server"
Entrypoint->>Startup : "Execute dev-startup.sh"
Startup->>Web : "Wait for health endpoint"
Startup->>Web : "Start alarm scheduler"
Startup->>Web : "Start alarm monitor"
Startup->>Web : "Delayed route pre-warming (30s delay)"
Startup->>NMS : "Start internal API"
Dev->>Web : "Edit files (hot reload)"
Web-->>Dev : "Browser refresh reflects changes"
```

**Diagram sources**
- [docker-compose.yml:32-77](file://docker-compose.yml#L32-L77)
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)
- [nms_service/main.py:62-73](file://nms_service/main.py#L62-L73)

**Section sources**
- [docker-compose.yml:32-77](file://docker-compose.yml#L32-L77)
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)
- [nms_service/main.py:62-73](file://nms_service/main.py#L62-L73)

## Detailed Component Analysis

### Hot Reload and Automatic Reloading
- The web service uses the development Dockerfile and runs the Next.js dev server with hot reload enabled and Turbopack optimization. The container mounts the project directory and excludes node_modules and .next to avoid conflicts.
- The **optimized startup script** waits for the Next.js health endpoint to become responsive and then starts alarm services. This ensures the UI is ready before triggering backend-dependent features.
- The **simplified entrypoint script** focuses on database preparation and delegates route pre-warming to the dedicated startup script with intelligent timing to avoid conflicts with Turbopack HMR.

**Updated** The development environment now includes intelligent pre-warming timing to prevent compilation cascades during initial page loads.

```mermaid
flowchart TD
Start(["Container Start"]) --> WaitDB["Wait for DB readiness<br/>(Simplified 45 lines)"]
WaitDB --> Migrate["Apply Prisma migrations"]
Migrate --> Generate["Generate Prisma client"]
Generate --> Seed{"Development?"}
Seed --> |Yes| SeedData["Seed sample data"]
Seed --> |No| SkipSeed["Skip seeding"]
SeedData --> StartWeb["Start Next.js dev server"]
SkipSeed --> StartWeb
StartWeb --> EntrypointDone["Entrypoint complete"]
EntrypointDone --> Startup["Execute dev-startup.sh<br/>(Optimized 71 lines)"]
Startup --> WaitHealth["Wait for health endpoint"]
WaitHealth --> StartAlarms["Start alarm services"]
StartAlarms --> DelayedPrewarm["30s delay to avoid HMR conflicts"]
DelayedPrewarm --> PreWarm["Pre-warm routes"]
PreWarm --> DevReady["Development server ready"]
DevReady --> Edit["Edit source files"]
Edit --> HotReload["Hot reload in browser"]
```

**Diagram sources**
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)
- [Dockerfile.dev:23-50](file://Dockerfile.dev#L23-L50)

**Section sources**
- [Dockerfile.dev:23-50](file://Dockerfile.dev#L23-L50)
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)
- [CHANGELOG.md:148-155](file://CHANGELOG.md#L148-L155)

### Docker-Based Development Environment
- The Compose configuration selects the development Dockerfile for the web service, sets NODE_ENV=development, and exposes ports for the web and NMS services.
- Volume mounts include the project directory for live editing, excluding node_modules and .next to prevent build conflicts. A named volume persists PostgreSQL data.
- Health checks and restart policies improve reliability during development.

```mermaid
graph TB
Host["Host Machine"]
VolSrc["Mounted Source<br/>.:/app"]
VolNode["Excluded node_modules<br/>/app/node_modules"]
VolNext["Excluded .next<br/>/app/.next"]
VolPG["Named Volume<br/>postgres_data_dev"]
Host --> VolSrc
Host --> VolNode
Host --> VolNext
Host --> VolPG
```

**Diagram sources**
- [docker-compose.yml:58-64](file://docker-compose.yml#L58-L64)

**Section sources**
- [docker-compose.yml:32-77](file://docker-compose.yml#L32-L77)
- [docker-compose.yml:58-64](file://docker-compose.yml#L58-L64)

### Local Development Commands
Essential commands for development:
- Start/stop services and follow logs
- Execute commands inside containers (linting, type-checking, Prisma operations)
- Manage database migrations and seeding

Examples:
- Start services in detached mode
- Follow logs for the web service
- Execute lint/type-check inside the web container
- Run Prisma operations and open Studio
- Access the database CLI

**Section sources**
- [DOCKER.md:123-144](file://DOCKER.md#L123-L144)
- [DOCKER.md:146-163](file://DOCKER.md#L146-L163)
- [DOCKER.md:165-180](file://DOCKER.md#L165-L180)
- [DOCKER.md:182-196](file://DOCKER.md#L182-L196)
- [DEV_WORKFLOW.md:82-99](file://DEV_WORKFLOW.md#L82-L99)

### First-Time Setup and Daily Workflow
First-time setup:
- Build the development container
- Start all services with hot reload and optimized startup

Daily workflow:
- Start services if not running
- View logs in real-time
- Make code changes; they automatically reload
- Benefit from improved stability and reduced compilation conflicts

Stopping services:
- Stop all services
- Stop and remove volumes for a fresh start

**Section sources**
- [DEV_WORKFLOW.md:5-32](file://DEV_WORKFLOW.md#L5-L32)

### Volume Mounting Configuration
- The web service mounts the project directory into the container and excludes node_modules and .next to avoid conflicts with the host's installed packages and Next.js build artifacts.
- A named volume persists PostgreSQL data across container restarts.

**Section sources**
- [docker-compose.yml:58-64](file://docker-compose.yml#L58-L64)
- [docker-compose.yml:14-18](file://docker-compose.yml#L14-L18)

### Hot Module Replacement and Automatic Reloading
- The development Dockerfile sets NODE_ENV=development and starts the Next.js dev server with Turbopack optimization, enabling fast hot reload.
- The **simplified entrypoint script** focuses on database preparation, while the **optimized startup script** handles delayed route pre-warming to reduce initial load times after container restarts.

**Updated** The startup process now prevents Turbopack HMR conflicts through intelligent timing and eliminates duplicate pre-warming operations.

**Section sources**
- [Dockerfile.dev:23-50](file://Dockerfile.dev#L23-L50)
- [scripts/entrypoint.sh:40-44](file://scripts/entrypoint.sh#L40-L44)
- [scripts/dev-startup.sh:55-66](file://scripts/dev-startup.sh#L55-L66)
- [CHANGELOG.md:148-155](file://CHANGELOG.md#L148-L155)

### Database Connection and Prisma Integration
- The web service passes DATABASE_URL to the Next.js application, which connects to the PostgreSQL service.
- Prisma client generation and migrations are executed at container startup in development.
- The Prisma client is configured to disable query logging by default to reduce I/O overhead.

**Section sources**
- [docker-compose.yml:37-47](file://docker-compose.yml#L37-L47)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [prisma/schema.prisma:1-8](file://prisma/schema.prisma#L1-L8)

### NMS Sidecar Service
- The NMS service runs as a FastAPI application on port 8500 and is intended for internal use within the Docker network.
- It exposes endpoints for device polling, backups, and health checks, integrating with the database to store metrics and topology data.

**Section sources**
- [nms_service/Dockerfile:1-30](file://nms_service/Dockerfile#L1-L30)
- [nms_service/main.py:91-98](file://nms_service/main.py#L91-L98)
- [nms_service/main.py:103-129](file://nms_service/main.py#L103-L129)
- [nms_service/main.py:131-182](file://nms_service/main.py#L131-L182)
- [nms_service/main.py:186-200](file://nms_service/main.py#L186-L200)

## Dependency Analysis
The development stack comprises interdependent components with streamlined orchestration:
- The web service depends on the database for Prisma operations and on the NMS service for internal API calls.
- The NMS service depends on the database for storing metrics and topology data.
- The **simplified entrypoint script** coordinates startup order and ensures readiness before launching dependent services.
- The **optimized startup script** handles alarm services and route pre-warming independently to avoid conflicts.

```mermaid
graph TB
Web["Web Service"]
DB["PostgreSQL"]
NMS["NMS Sidecar"]
Entrypoint["Simplified Entrypoint<br/>45 lines"]
Startup["Optimized Startup<br/>71 lines"]
Web --> DB
Web --> NMS
Entrypoint --> DB
Entrypoint --> Web
Startup --> Web
NMS --> DB
```

**Diagram sources**
- [docker-compose.yml:32-114](file://docker-compose.yml#L32-L114)
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)

**Section sources**
- [docker-compose.yml:32-114](file://docker-compose.yml#L32-L114)
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)

## Performance Considerations
- Initial container startup includes npm install and Prisma client generation; subsequent hot reloads are much faster with Turbopack optimization.
- **Improved pre-warming strategy** reduces first-load latency after container restarts while avoiding Turbopack HMR conflicts through 30-second delays.
- Prisma logging is disabled by default to minimize I/O overhead; enable selectively for debugging.
- Use health checks and restart policies to maintain service availability during development.
- **Enhanced stability** through elimination of duplicate operations and intelligent timing of background tasks.

**Updated** Performance improvements include reduced compilation cycles and more efficient resource utilization through optimized startup scripts.

**Section sources**
- [DEV_WORKFLOW.md:101-106](file://DEV_WORKFLOW.md#L101-L106)
- [scripts/entrypoint.sh:40-44](file://scripts/entrypoint.sh#L40-L44)
- [scripts/dev-startup.sh:55-66](file://scripts/dev-startup.sh#L55-L66)
- [lib/prisma.ts:10-20](file://lib/prisma.ts#L10-L20)
- [CHANGELOG.md:148-155](file://CHANGELOG.md#L148-L155)

## Troubleshooting Guide
Common issues and resolutions:
- **Changes not reflecting in the browser**:
  - Verify services are running and check logs for errors
  - Hard refresh the browser to bypass cache
  - Check for Turbopack HMR conflicts (resolved by optimized startup timing)
- **Database connection issues**:
  - Confirm database health and access via the database CLI
  - Check environment variables and network connectivity
  - Verify simplified entrypoint script completes successfully
- **Port conflicts**:
  - Adjust the port in environment variables and rebuild the web service
  - The optimized environment uses port 8170 externally with 3000 internally
- **Migration or seeding failures**:
  - Inspect migration status and reset if necessary
  - Re-run seeding inside the container
- **Container startup problems**:
  - Review web service logs and restart the container
  - Check simplified entrypoint script for database readiness issues
  - Clear Docker caches if images are large or outdated
- **Stability issues**:
  - The optimized startup scripts eliminate duplicate operations that previously caused instability
  - Monitor for improved startup times and reduced error rates

**Updated** Troubleshooting now includes guidance for the new streamlined startup process and resolved HMR conflict issues.

**Section sources**
- [DEV_WORKFLOW.md:54-81](file://DEV_WORKFLOW.md#L54-L81)
- [DOCKER.md:345-420](file://DOCKER.md#L345-L420)
- [scripts/entrypoint.sh:11-44](file://scripts/entrypoint.sh#L11-L44)
- [scripts/dev-startup.sh:14-71](file://scripts/dev-startup.sh#L14-L71)
- [CHANGELOG.md:148-155](file://CHANGELOG.md#L148-L155)

## Conclusion
The InfraScope development environment leverages Docker Compose to provide a robust, hot-reload-capable setup with persistent database storage and integrated NMS functionality. Recent optimizations have significantly improved stability and performance through streamlined startup scripts that eliminate duplication and prevent Turbopack HMR conflicts. The simplified entrypoint script focuses on database preparation while the dedicated startup script handles alarm services and intelligent pre-warming. By following the documented workflow, using the provided commands, and understanding the optimized volume and health-check configurations, developers can achieve a smooth and efficient development experience with enhanced reliability and performance.

## Appendices

### Essential Development Commands
- Start/stop services and follow logs
- Execute commands inside containers (linting, type-checking, Prisma operations)
- Manage database migrations and seeding

**Section sources**
- [DOCKER.md:123-196](file://DOCKER.md#L123-L196)
- [DEV_WORKFLOW.md:82-99](file://DEV_WORKFLOW.md#L82-L99)

### Environment Variables and Configuration
- Key variables include DATABASE_URL, NODE_ENV, NEXTAUTH_SECRET, PORT, DB_HOST, and agent-related tokens.
- The Next.js configuration enables standalone output, compression, and aggressive caching for static assets.
- **Optimized port configuration** uses 8170 externally with 3000 internally for improved development experience.

**Section sources**
- [docker-compose.yml:37-47](file://docker-compose.yml#L37-L47)
- [next.config.js:1-62](file://next.config.js#L1-L62)
- [CHANGELOG.md:147-155](file://CHANGELOG.md#L147-L155)

### Development Environment Improvements
**New** The development environment now includes several key improvements:
- **Simplified entrypoint script** (45 lines) - focused solely on database preparation
- **Optimized startup script** (71 lines) - handles alarm services and delayed pre-warming
- **Eliminated duplicate operations** - prevents Turbopack HMR conflicts
- **Intelligent timing** - 30-second delay for pre-warming avoids initial page load conflicts
- **Enhanced stability** - reduced compilation cycles and improved resource utilization

**Section sources**
- [scripts/entrypoint.sh:1-45](file://scripts/entrypoint.sh#L1-L45)
- [scripts/dev-startup.sh:1-71](file://scripts/dev-startup.sh#L1-L71)
- [CHANGELOG.md:148-155](file://CHANGELOG.md#L148-L155)