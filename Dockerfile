# ============================================================================
# InfraScope - Multi-Stage Docker Build
# Production-ready Next.js application with optimized image size
# ============================================================================

# ============================================================================
# STAGE 1: BUILDER
# ============================================================================
FROM node:20 AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ libc6 && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./

# Install dependencies (ignoring lockfile to avoid SWC platform issues)
RUN npm install && npm cache clean --force

# Copy Prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy application source
COPY . .

# Build Next.js application
RUN npm run build

# ============================================================================
# STAGE 2: DEPENDENCIES
# ============================================================================
FROM node:20 AS deps

WORKDIR /app

# Copy package files
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# ============================================================================
# STAGE 3: RUNTIME
# ============================================================================
FROM node:20-slim

# Metadata
LABEL maintainer="InfraScope Team"
LABEL version="1.0.0"
LABEL description="Enterprise Infrastructure Management Platform"

# Install runtime dependencies
RUN apt-get update && apt-get install -y netcat-openbsd curl && rm -rf /var/lib/apt/lists/*

# Security: Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh -m nextjs

# Set working directory
WORKDIR /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy production dependencies from deps stage
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy Prisma schema and migrations
COPY --chown=nextjs:nodejs prisma ./prisma

# Copy environment template
COPY --chown=nextjs:nodejs .env.example ./

# Copy startup scripts
COPY --chown=nextjs:nodejs scripts/wait-for-db.sh ./scripts/
COPY --chown=nextjs:nodejs scripts/entrypoint.sh ./scripts/

# Make scripts executable
RUN chmod +x ./scripts/*.sh

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Entrypoint script for database migrations and startup
ENTRYPOINT ["./scripts/entrypoint.sh"]

# Default command - Start Next.js server
CMD ["node", "server.js"]
