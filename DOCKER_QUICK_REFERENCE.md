# InfraScope - Docker Quick Reference

**Get started with Docker in 3 commands:**

```bash
docker compose up -d              # Start
docker compose logs -f web        # View logs
# Then visit: http://localhost:3000
```

---

## 📋 Key Files

| File | Purpose |
|------|---------|
| **Dockerfile** | Multi-stage build |
| **docker-compose.yml** | Development (with hot reload) |
| **docker-compose.prod.yml** | Production (hardened) |
| **DOCKER.md** | Complete guide |
| **scripts/entrypoint.sh** | Container startup + migrations |

---

## 🚀 Common Commands

### Start & Stop
```bash
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose down -v            # Stop and delete volumes
docker compose restart            # Restart services
```

### Logs & Status
```bash
docker compose logs -f            # View all logs
docker compose logs -f web        # View web service logs
docker compose ps                 # Show container status
```

### Database
```bash
docker compose exec db psql -U infrascope  # Access PostgreSQL
docker compose exec web npx prisma migrate deploy  # Run migrations
docker compose exec web npm run db:seed   # Load sample data
```

### Development
```bash
docker compose exec web sh        # Shell access
docker compose up -d --build web  # Rebuild web service
```

---

## 🔧 Configuration

### Development (.env.local)
```env
DATABASE_URL=postgresql://infrascope:infrascope-dev@db:5432/infrascope
NODE_ENV=development
PORT=3000
```

### Production (.env)
- Copy `.env.production` to `.env`
- Update with your values
- Keep secure (don't commit)

---

## 📊 What's Included

- ✅ Multi-stage Dockerfile (optimized)
- ✅ Development docker-compose.yml
- ✅ Production docker-compose.prod.yml
- ✅ Database initialization script
- ✅ Migration automation
- ✅ Health checks
- ✅ Comprehensive documentation

---

## 🔒 Security

- Non-root user (nextjs)
- No hardcoded secrets
- Environment-based config
- Health monitoring
- Read-only filesystem (prod)

---

## 📚 Full Documentation

See **DOCKER.md** for complete guide with:
- Architecture overview
- Development workflow
- Production deployment
- Database management
- Troubleshooting
- Best practices

---

**Ready to deploy? Start with:** `docker compose up -d`
