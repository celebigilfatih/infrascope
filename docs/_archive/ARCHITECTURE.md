# InfraScope Architecture Documentation

## Project Overview

InfraScope is an enterprise-grade infrastructure management platform designed to provide centralized visibility and management of IT operations, including physical infrastructure, network topology, device inventory, and service dependencies.

## Technology Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **React Flow** - Network topology visualization
- **Zustand** - State management
- **Axios** - HTTP client

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Node.js** - Runtime environment
- **REST API** - Standard HTTP interface
- **WebSocket** - Real-time updates (optional)

### Database
- **PostgreSQL** - Primary database
- **Prisma ORM** - Database abstraction and migrations
- **JSONB Fields** - Extensible metadata storage

## Project Structure

```
d:\Dev\infraScope/
├── app/                          # Next.js App Router
│   ├── api/                       # API endpoints
│   │   ├── organizations/         # Organization management
│   │   ├── buildings/             # Building management
│   │   ├── devices/               # Device inventory
│   │   ├── services/              # Service management
│   │   ├── network/               # Network topology
│   │   └── dependencies/          # Dependency management
│   ├── dashboard/                 # Dashboard page
│   ├── devices/                   # Device management pages
│   ├── locations/                 # Location hierarchy pages
│   ├── services/                  # Service management pages
│   ├── network/                   # Network topology pages
│   ├── layout.tsx                 # Root layout
│   ├── globals.css                # Global styles
│   └── page.tsx                   # Home page
│
├── components/                    # React components
│   ├── layout/                    # Layout components
│   │   ├── Header.tsx             # Main header
│   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   └── Footer.tsx             # Footer
│   ├── devices/                   # Device-related components
│   │   ├── DeviceCard.tsx         # Device display card
│   │   ├── DeviceList.tsx         # Device list view
│   │   └── DeviceDetails.tsx      # Device detail view
│   ├── racks/                     # Rack visualization
│   │   ├── RackVisualization.tsx  # Rack 3D view
│   │   ├── RackUnit.tsx           # Individual unit
│   │   └── RackEditor.tsx         # Rack configuration
│   ├── network/                   # Network components
│   │   ├── TopologyGraph.tsx      # Network topology
│   │   ├── SwitchView.tsx         # Switch detail
│   │   └── ConnectionView.tsx     # Connection details
│   └── common/                    # Common components
│       ├── Modal.tsx              # Modal dialog
│       ├── Card.tsx               # Card wrapper
│       └── Spinner.tsx            # Loading spinner
│
├── lib/                           # Utilities and helpers
│   ├── api.ts                     # API client utilities
│   ├── formatting.ts              # Text formatting utilities
│   ├── prisma.ts                  # Prisma client singleton
│   ├── hooks.ts                   # Custom React hooks
│   └── validators.ts              # Data validation
│
├── types/                         # TypeScript type definitions
│   └── index.ts                   # All shared types
│
├── prisma/                        # Database schema and migrations
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Seed data script
│   └── migrations/                # Migration files
│
├── hooks/                         # Custom React hooks
│   ├── useDevice.ts               # Device data hook
│   ├── useServices.ts             # Service data hook
│   └── useNetwork.ts              # Network data hook
│
├── public/                        # Static assets
│   ├── images/                    # Image files
│   └── icons/                     # SVG icons
│
├── .env.example                   # Environment variables template
├── .env.local                     # Local environment config
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── tailwind.config.js             # Tailwind configuration
├── postcss.config.js              # PostCSS configuration
├── next.config.js                 # Next.js configuration
└── ARCHITECTURE.md                # This file
```

## Database Schema

### Core Entities

#### 1. Organizational Hierarchy
- **organizations** - Top-level organization
- **buildings** - Physical buildings
- **floors** - Floors within buildings
- **rooms** - Server rooms on floors
- **racks** - Equipment racks
- **rack_units** - Individual U positions

#### 2. Device Inventory
- **devices** - Physical and virtual devices (servers, switches, firewalls, etc.)
- **network_interfaces** - Network adapters on devices
- **switch_ports** - Switch port configurations

#### 3. Services & Applications
- **applications** - Software applications
- **services** - Services running on devices
- **connections** - Network connections between devices

#### 4. Dependencies & Impact Analysis
- **dependencies** - Service dependencies (CMDB)

#### 5. Audit & Monitoring
- **audit_logs** - Change audit trail
- **device_health_snapshots** - Device health metrics

## API Endpoints

### Organizations
- `GET /api/organizations` - List all organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations/[id]` - Get organization details
- `PUT /api/organizations/[id]` - Update organization
- `DELETE /api/organizations/[id]` - Delete organization

### Buildings
- `GET /api/buildings` - List buildings
- `POST /api/buildings` - Create building
- `GET /api/buildings/[id]` - Get building details

### Devices
- `GET /api/devices` - List all devices
- `POST /api/devices` - Create device
- `GET /api/devices/[id]` - Get device details
- `PUT /api/devices/[id]` - Update device
- `DELETE /api/devices/[id]` - Delete device

### Services
- `GET /api/services` - List services
- `POST /api/services` - Create service
- `GET /api/services/[id]` - Get service details

### Network
- `GET /api/network/topology` - Get network topology
- `GET /api/network/connections` - List connections
- `POST /api/network/connections` - Create connection

### Dependencies
- `GET /api/dependencies` - List dependencies
- `POST /api/dependencies` - Create dependency
- `GET /api/dependencies/[id]/impact` - Analyze impact

## Key Features

### 1. Infrastructure Management
- Hierarchical location structure (Org → Building → Floor → Room → Rack → Unit)
- Rack visualization with U-position management
- Device placement and tracking
- Capacity planning

### 2. Device Inventory
- Comprehensive device types (servers, network equipment, workstations)
- Device attributes (vendor, model, serial, firmware)
- Device grouping and hierarchies (VMs on hosts)
- Device status tracking

### 3. Network Management
- Switch port configuration
- VLAN management
- Network interface mapping
- Inter-device connections
- Network topology visualization

### 4. Service Tracking
- Application and service inventory
- Service-to-device mapping
- Service status monitoring
- Port and protocol tracking

### 5. Dependency Management
- Service dependency mapping
- Impact analysis (what breaks if X goes down)
- Criticality levels
- Dependency chains visualization

### 6. Audit & Compliance
- Change audit trail
- User action tracking
- Health snapshots for trending

## Design Principles

### SOLID Principles
1. **Single Responsibility** - Each component has one reason to change
2. **Open/Closed** - Open for extension, closed for modification
3. **Liskov Substitution** - Properly typed interfaces and contracts
4. **Interface Segregation** - Focused, specific interfaces
5. **Dependency Inversion** - Depend on abstractions, not concretions

### Clean Architecture
- **Separation of Concerns** - Clear boundaries between layers
- **Testability** - Components designed to be testable
- **Maintainability** - Clear naming and structure
- **Scalability** - Designed for enterprise scale

### Code Quality
- **Type Safety** - Full TypeScript coverage
- **Documentation** - Inline comments for complex logic
- **Consistent Naming** - Clear, domain-driven naming
- **DRY Principle** - Reusable utilities and components

## Extensibility

### Adding New Device Types
1. Update `DeviceType` enum in `types/index.ts`
2. Update database schema if new fields needed
3. Create new device-type-specific component if needed
4. Update API validation

### Adding New Services
1. Add `ServiceType` enum value in `types/index.ts`
2. Create service-specific component
3. Update API endpoints for new service properties

### Adding New Network Features
1. Update `SwitchPort` or `Connection` models in schema
2. Create visualization components
3. Add API endpoints
4. Create management pages

### Adding New Pages/Routes
1. Create page file in `app/` directory
2. Follow Next.js App Router conventions
3. Use shared layout and components
4. Add to header navigation

## Performance Considerations

### Database
- Use indexes on frequently queried fields
- Implement pagination for large datasets
- Use lazy loading for related entities
- Cache commonly accessed data

### Frontend
- Implement code splitting
- Use dynamic imports for large components
- Optimize images
- Implement virtual scrolling for large lists

### API
- Implement rate limiting
- Use caching headers
- Compress responses
- Implement request validation

## Security Considerations

### To Implement
- Authentication (OAuth2 / JWT)
- Authorization (Role-based access control)
- API rate limiting
- Input validation and sanitization
- SQL injection prevention (already handled by Prisma)
- CORS configuration
- HTTPS enforcement
- Secure headers (CSP, X-Frame-Options, etc.)

## Development Workflow

### Setup
```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

### Available Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Push schema to database
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed database with sample data
npm run db:studio    # Open Prisma Studio
npm run type-check   # Check TypeScript
```

## Monitoring and Logging

### Application Logging
- Structured logging for API calls
- Error tracking and reporting
- Audit trail for compliance

### Metrics
- Device health metrics
- Service availability
- Network statistics
- API response times

## Deployment

### Development
- Uses SQLite or local PostgreSQL
- Hot reload enabled

### Production
- PostgreSQL database (managed)
- Environment-based configuration
- Optimized builds
- Health checks and monitoring

## Future Enhancements

### Phase 2
- Real-time WebSocket updates
- Advanced analytics dashboard
- Machine learning-based anomaly detection
- Advanced CMDB with impact analysis

### Phase 3
- Agent-based device discovery
- SNMP integration
- SSH/WinRM agentless discovery
- Integration with monitoring tools

### Phase 4
- Multi-tenancy support
- Advanced access control
- API webhooks
- Integration with external ITSM systems

## Contributing Guidelines

1. Follow TypeScript strict mode
2. Write components as functional with hooks
3. Use Tailwind CSS for styling
4. Document complex logic
5. Keep components focused and reusable
6. Test before committing
7. Follow naming conventions

## Support and Documentation

- Inline code comments for complex logic
- TypeScript types as documentation
- README files in key directories
- Architecture decision records (ADRs)

---

**Version:** 1.0.0
**Last Updated:** 2024
