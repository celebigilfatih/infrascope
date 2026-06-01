# Development Workflow - Hot Reload Setup

## Quick Start

### First Time Setup
```bash
# Build the development container (one-time)
docker compose build

# Start all services with hot reload
docker compose up -d
```

### Daily Development
```bash
# Start services (if not already running)
docker compose up -d

# View logs in real-time
docker compose logs -f web

# Make code changes - they automatically reload!
```

### Stopping Services
```bash
# Stop all services
docker compose down

# Stop and remove all data (fresh start)
docker compose down -v
```

## What's New

✅ **No More Docker Rebuilds!** - Changes to your code automatically reload in the running container
✅ **Hot Module Replacement** - Next.js dev server watches your files
✅ **Faster Development** - Just save and refresh your browser
✅ **Database Persists** - Data survives container restarts

## How It Works

1. **docker-compose.yml** now uses `Dockerfile.dev` instead of production Dockerfile
2. **Volume Mounting** - Your entire project directory is mounted in the container
3. **npm run dev** - Next.js development server with automatic reload enabled
4. **NODE_ENV=development** - Proper development environment configuration

## Important Files

- `docker-compose.yml` - Updated to enable volumes and dev mode
- `Dockerfile.dev` - New lightweight development Dockerfile
- Original `Dockerfile` - Still used for production builds

## Troubleshooting

### Changes not showing up?
1. Check that services are running: `docker compose ps`
2. Check logs for errors: `docker compose logs web`
3. Hard refresh your browser (Ctrl+Shift+R)

### Database connection issues?
```bash
# Check if database is healthy
docker compose ps

# Access database directly
docker compose exec db psql -U infrascope -d infrascope
```

### Need to rebuild after changing Dockerfile.dev?
```bash
docker compose build --no-cache
docker compose up -d
```

### Package.json changes?
```bash
# Reinstall dependencies
docker compose exec web npm install
```

## Development Commands

```bash
# View all services
docker compose ps

# View specific service logs
docker compose logs -f web
docker compose logs -f db

# Execute command in container
docker compose exec web npm run lint
docker compose exec web npm run type-check

# Database operations
docker compose exec web npm run db:push
docker compose exec web npm run db:studio
```

## Performance Notes

- First `docker compose up -d` takes ~1-2 minutes (npm install)
- Subsequent changes reload in 1-3 seconds
- Database queries may cache - use browser dev tools to clear cache if needed
