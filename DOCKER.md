# InfraScope - Docker & Container Guide

> Production-ready Docker setup for InfraScope infrastructure management platform

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Docker Setup](#docker-setup)
3. [Development Workflow](#development-workflow)
4. [Production Deployment](#production-deployment)
5. [Database Management](#database-management)
6. [Troubleshooting](#troubleshooting)
7. [Architecture](#architecture)

---

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Git

### Start Development Environment (3 steps)

**Step 1: Clone and Configure**
```bash
cd d:\Dev\infraScope
cp .env.example .env.local
```

**Step 2: Build and Start Containers**
```bash
docker compose up -d
```

**Step 3: Verify**
```bash
# Check if all containers are running
docker compose ps

# View logs
docker compose logs -f web
```

Visit: **http://localhost:3000**

---

## 🐳 Docker Setup

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│         Docker Compose Network                  │
├──────────────────┬──────────────────────────────┤
│                  │                              │
│  Next.js Web     │     PostgreSQL DB           │
│  (Port 3000)     │     (Port 5432)             │
│                  │                              │
│  - App Router    │   - Persistent Volume       │
│  - API Routes    │   - Backup Support          │
│  - Hot Reload    │   - Health Checks           │
│                  │                              │
├──────────────────┼──────────────────────────────┤
│  Named Volumes   │  Networks                    │
│  - postgres_data │  - infrascope-network       │
│  - npm_cache     │                              │
└──────────────────┴──────────────────────────────┘
```

### Container Specifications

#### Web Container (Next.js)
- **Image**: Built from multi-stage Dockerfile
- **Base**: Node.js 18-Alpine (optimized)
- **Port**: 3000
- **User**: nextjs (non-root)
- **Health Check**: ✅ Enabled
- **Features**:
  - Multi-stage build (builder → runtime)
  - Optimized image size (~500MB)
  - Production-ready
  - Hot reload in development

#### Database Container (PostgreSQL)
- **Image**: postgres:15-alpine
- **Port**: 5432 (localhost only in production)
- **Volume**: Persistent storage
- **User**: infrascope
- **Health Check**: ✅ Enabled
- **Features**:
  - Automatic initialization
  - Backup scripts included
  - Performance tuning for production

### File Structure

```
docker/
├── postgres-init.sql        # Database initialization
├── postgres-backup.sh       # Backup utility
└── Caddyfile               # (optional) Reverse proxy config

scripts/
├── entrypoint.sh           # Container startup script
└── wait-for-db.sh          # Database readiness check

Dockerfile                   # Multi-stage build
docker-compose.yml          # Development configuration
docker-compose.prod.yml     # Production configuration
.dockerignore              # Docker build exclusions
```

---

## 💻 Development Workflow

### Starting Development

```bash
# 1. Start containers in background
docker compose up -d

# 2. View logs in real-time
docker compose logs -f

# 3. When ready, access the application
# http://localhost:3000
```

### Working with Code

Changes to your code are automatically reflected (hot reload enabled):

```bash
# Make changes to TypeScript/React files
# The web container will automatically rebuild

# If rebuild doesn't trigger, rebuild manually:
docker compose up -d --build web
```

### Database Operations

```bash
# Access PostgreSQL CLI
docker compose exec db psql -U infrascope -d infrascope

# Run migrations manually
docker compose exec web npx prisma migrate deploy

# Seed database
docker compose exec web npm run db:seed

# View Prisma Studio
docker compose exec web npx prisma studio

# Backup database
docker compose exec db /usr/local/bin/backup-db.sh
```

### Container Access

```bash
# Access web container shell
docker compose exec web sh

# Access database container
docker compose exec db psql -U infrascope

# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f web
docker compose logs -f db
```

### Stopping & Cleanup

```bash
# Stop containers (preserve volumes)
docker compose down

# Stop and remove volumes (⚠️ deletes data)
docker compose down -v

# Remove all images
docker compose down --rmi all

# Complete cleanup
docker compose down -v --rmi all
```

---

## 🚀 Production Deployment

### Pre-Deployment Checklist

- [ ] Generate secure secrets (see below)
- [ ] Set production environment variables
- [ ] Configure database backup location
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (Nginx/Caddy)
- [ ] Enable resource limits
- [ ] Set up monitoring/logging
- [ ] Configure auto-restart policies

### Generate Secure Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate REDIS_PASSWORD (if using Redis)
openssl rand -base64 24

# Generate AGENT_API_TOKEN
openssl rand -hex 32
```

### Production Environment Setup

**Step 1: Create .env file with production values**
```bash
cp .env.production .env
# Edit .env with actual production values
```

**Step 2: Start Production Stack**
```bash
docker compose -f docker-compose.prod.yml up -d
```

**Step 3: Verify Deployment**
```bash
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f

# Health check
curl http://localhost:3000/api/health
```

### Production Configuration

```yaml
# docker-compose.prod.yml features:
- Database: Localhost-only access (no external port)
- Security: Non-root user, no-new-privileges
- Read-only filesystem: Improved security
- Resource limits: Configure as needed
- Restart policy: always
- Health checks: Enhanced monitoring
```

### Scaling & Performance

```bash
# Monitor resource usage
docker stats

# Set resource limits (if needed)
# Update docker-compose.prod.yml:
# services:
#   web:
#     deploy:
#       resources:
#         limits:
#           cpus: '1'
#           memory: 1G

# Rebuild with optimization
docker compose -f docker-compose.prod.yml build --no-cache
```

---

## 🗄️ Database Management

### Backup & Restore

**Automatic Backups (Development)**

The backup script is mounted in production. Use it:

```bash
# Create backup
docker compose exec db /usr/local/bin/backup-db.sh

# List backups (in container)
docker compose exec db ls -lah /var/lib/postgresql/backups
```

**Manual Backup**

```bash
# Using pg_dump
docker compose exec db pg_dump -U infrascope infrascope > backup.sql

# Compressed backup
docker compose exec db pg_dump -U infrascope infrascope | gzip > backup.sql.gz
```

**Restore from Backup**

```bash
# Restore from SQL file
docker compose exec -T db psql -U infrascope infrascope < backup.sql

# Restore from compressed file
gunzip -c backup.sql.gz | docker compose exec -T db psql -U infrascope infrascope
```

### Database Migrations

```bash
# Run pending migrations
docker compose exec web npx prisma migrate deploy

# Create new migration
docker compose exec web npx prisma migrate dev --name your_migration_name

# Reset database (⚠️ deletes data)
docker compose exec web npx prisma migrate reset
```

### Seed Data

```bash
# Seed development database
docker compose exec web npm run db:seed

# Manual seed execution
docker compose exec web npx ts-node prisma/seed.ts
```

---

## 🔍 Troubleshooting

### Container Won't Start

**Problem**: Web container fails to start

```bash
# Check logs
docker compose logs web

# Common causes:
# 1. Database not ready - wait 30s
# 2. Port already in use - change PORT in .env
# 3. Missing environment variables - check .env.local

# Solution: Restart containers
docker compose restart web
```

**Problem**: Database connection refused

```bash
# Check if database is healthy
docker compose exec db pg_isready -U infrascope

# Check database logs
docker compose logs db

# Restart database
docker compose restart db
```

### Port Already in Use

```bash
# Change port in .env
PORT=3001
docker compose up -d --build web
```

### Database Migration Errors

```bash
# Check migration status
docker compose exec web npx prisma migrate status

# Reset migrations (⚠️ loses data)
docker compose exec web npx prisma migrate reset --skip-seed
```

### Building Large Images

```bash
# Clear Docker cache
docker builder prune

# Build with no-cache
docker compose build --no-cache web

# Check image size
docker images infrascope-web
```

### Memory/CPU Issues

```bash
# Monitor container resources
docker stats

# Check available resources
docker system df

# Remove unused images/volumes
docker system prune -a
```

---

## 🏗️ Architecture

### Multi-Stage Build Process

```
Stage 1: BUILDER
├─ Install dependencies
├─ Copy Prisma schema
├─ Generate Prisma client
├─ Copy application source
└─ Build Next.js app

Stage 2: DEPENDENCIES
├─ Install production dependencies
└─ Cache in separate layer

Stage 3: RUNTIME
├─ Copy built app
├─ Copy dependencies
├─ Create non-root user
├─ Copy startup scripts
└─ Ready to run
```

**Benefits**:
- ✅ Optimized image size (~500MB vs 1GB+)
- ✅ Faster builds (dependency caching)
- ✅ Security (non-root user)
- ✅ Minimal attack surface

### Network Architecture

```
Development:
- Single network: infrascope-network
- All services communicate internally
- Ports exposed for development

Production:
- Isolated network
- Database: localhost-only
- Web: Reverse proxy on port 80/443
- No direct database port exposure
```

### Volume Management

**Development Volumes**:
- `postgres_data_dev`: Database persistence
- Source code: Mounted for hot reload
- node_modules: Separate to avoid conflicts

**Production Volumes**:
- `postgres_data_prod`: Database persistence
- No source code (immutable)
- No development dependencies

---

## 📊 Monitoring & Logging

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f web
docker compose logs -f db

# Last 100 lines
docker compose logs --tail=100 web

# Timestamps
docker compose logs -f --timestamps web
```

### Health Checks

```bash
# Automatic health monitoring
docker compose ps  # Shows health status

# Manual health check
curl http://localhost:3000/api/health

# Database health
docker compose exec db pg_isready -U infrascope
```

### Performance Monitoring

```bash
# Real-time stats
docker stats

# Inspect container
docker compose exec web node -e "console.log(process.memoryUsage())"
```

---

## 🔐 Security Best Practices

✅ **Implemented in Setup**:
- Non-root user (nextjs)
- No hardcoded secrets
- Environment variable configuration
- Read-only filesystem (production)
- Health checks enabled
- Network isolation

⚠️ **Production Checklist**:
- [ ] Change default passwords
- [ ] Generate strong secrets
- [ ] Use HTTPS/SSL
- [ ] Configure firewall
- [ ] Set resource limits
- [ ] Enable logging
- [ ] Regular backups
- [ ] Update base images regularly

---

## 📚 Quick Reference

### Essential Commands

```bash
# Start/Stop
docker compose up -d                 # Start
docker compose down                  # Stop
docker compose restart               # Restart

# Logs
docker compose logs -f               # Follow all
docker compose logs -f web           # Follow service

# Execute
docker compose exec web sh           # Shell access
docker compose exec db psql -U infrascope  # Database CLI

# Maintenance
docker system df                     # Disk usage
docker system prune                  # Clean up
docker builder prune                 # Clear build cache
```

### Environment Variables

```bash
# Key variables
DATABASE_URL          # PostgreSQL connection
NODE_ENV             # development/production
NEXTAUTH_SECRET      # Authentication secret
PORT                 # Application port
DB_HOST              # Database hostname
AGENT_API_TOKEN      # API token for agents
```

---

## 🎓 Further Learning

- **Docker**: https://docs.docker.com
- **Docker Compose**: https://docs.docker.com/compose
- **Next.js**: https://nextjs.org/docs
- **PostgreSQL**: https://www.postgresql.org/docs
- **Prisma**: https://www.prisma.io/docs

---

## 📞 Support

For issues:
1. Check logs: `docker compose logs -f`
2. Verify .env configuration
3. Check Docker/Docker Compose versions
4. Review troubleshooting section above

**Last Updated**: January 1, 2026

**Docker Version**: 20.10+ required

**Status**: ✅ Production Ready
