#!/bin/bash
# =============================================================================
# InfraScope On-Premise Updater
# =============================================================================
# Usage: ./update.sh [version]
# Example: ./update.sh 2.1.0
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              InfraScope Update                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found. Run install.sh first.${NC}"
    exit 1
fi

# Source current config
set -a
source .env
set +a

CURRENT_VERSION=${VERSION:-latest}
TARGET_VERSION=${1:-$CURRENT_VERSION}

echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}"
echo -e "${YELLOW}Target version:  ${TARGET_VERSION}${NC}"
echo ""

# Backup database
backup_database() {
    echo -e "${YELLOW}Creating database backup...${NC}"
    
    BACKUP_DIR="./backups"
    mkdir -p "$BACKUP_DIR"
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/infrascope_${TIMESTAMP}.sql"
    
    # Get database credentials from .env
    DB_USER=${POSTGRES_USER:-infrascope}
    DB_NAME=${POSTGRES_DB:-infrascope}
    
    docker exec infrascope-postgres pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
    
    echo -e "${GREEN}✓ Database backed up to ${BACKUP_FILE}${NC}"
}

# Load or pull new image
prepare_update_image() {
    echo -e "${YELLOW}Preparing new version...${NC}"
    
    REGISTRY=${REGISTRY:-ghcr.io/celebigilfatih}
    IMAGE_REF="${REGISTRY}/infrascope:${TARGET_VERSION}"
    LOCAL_IMAGE_TAR="./images/infrascope-${TARGET_VERSION}.tar"

    if docker image inspect "${IMAGE_REF}" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Image already available: ${IMAGE_REF}${NC}"
        return 0
    fi

    if [ -f "${LOCAL_IMAGE_TAR}" ]; then
        echo "Loading local appliance image ${LOCAL_IMAGE_TAR}..."
        docker load -i "${LOCAL_IMAGE_TAR}"

        if docker image inspect "${IMAGE_REF}" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Local image loaded: ${IMAGE_REF}${NC}"
            return 0
        fi

        echo -e "${RED}Error: ${LOCAL_IMAGE_TAR} did not provide expected image ${IMAGE_REF}.${NC}"
        exit 1
    fi
    
    docker pull "${IMAGE_REF}" || {
        echo -e "${RED}Failed to prepare image ${IMAGE_REF}${NC}"
        echo "For offline appliance updates, place the image at ${LOCAL_IMAGE_TAR}."
        exit 1
    }
    
    echo -e "${GREEN}✓ New image ready${NC}"
}

# Stop current services
stop_services() {
    echo -e "${YELLOW}Stopping services...${NC}"
    docker compose stop app
    echo -e "${GREEN}✓ Services stopped${NC}"
}

# Apply migrations (if needed)
run_migrations() {
    echo -e "${YELLOW}Running database migrations...${NC}"
    
    # Start only postgres for migrations
    docker compose up -d postgres
    
    # Wait for postgres
    sleep 5
    
    # Run migrations via temporary container
    docker compose run --rm app npx prisma migrate deploy || {
        echo -e "${YELLOW}! No migrations to run or migration failed${NC}"
    }
    
    echo -e "${GREEN}✓ Migrations complete${NC}"
}

# Start updated services
start_services() {
    echo -e "${YELLOW}Starting updated services...${NC}"
    
    # Update VERSION in .env
    if [ "$TARGET_VERSION" != "latest" ]; then
        if grep -q "^VERSION=" .env; then
            sed -i.bak "s|^VERSION=.*|VERSION=${TARGET_VERSION}|" .env && rm -f .env.bak
        else
            echo "VERSION=${TARGET_VERSION}" >> .env
        fi
    fi
    
    docker compose up -d
    
    echo -e "${GREEN}✓ Services started${NC}"
}

# Health check
health_check() {
    echo -e "${YELLOW}Waiting for application to be ready...${NC}"
    
    MAX_RETRIES=30
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -sf http://localhost:${APP_PORT:-3000}/api/health/ready > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Application is ready${NC}"
            return 0
        fi
        sleep 2
        RETRY_COUNT=$((RETRY_COUNT + 1))
    done
    
    echo -e "${YELLOW}! Application readiness check timed out. Check logs: docker compose logs app${NC}"
    return 1
}

# Cleanup old images
cleanup_images() {
    echo -e "${YELLOW}Cleaning up old images...${NC}"
    docker image prune -f
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# Main update flow
main() {
    backup_database
    prepare_update_image
    stop_services
    run_migrations
    start_services
    health_check
    cleanup_images
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              Update Complete!                                  ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}InfraScope has been updated to version ${TARGET_VERSION}${NC}"
    echo ""
    echo -e "${BLUE}Rollback:${NC}"
    echo "  If there are issues, restore from backup:"
    echo "  docker exec -i infrascope-postgres psql -U ${POSTGRES_USER:-infrascope} ${POSTGRES_DB:-infrascope} < ./backups/infrascope_XXXXXXXX_XXXXXX.sql"
    echo ""
}

main "$@"
