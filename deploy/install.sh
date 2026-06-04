#!/bin/bash
# =============================================================================
# InfraScope On-Premise Installer
# =============================================================================
# Usage: ./install.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║              InfraScope On-Premise Installer                   ║"
echo "║                                                                ║"
echo "║              Network Management System                         ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed.${NC}"
        echo "Please install Docker from https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker compose &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed.${NC}"
        echo "Please install Docker Compose from https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # Check Docker is running
    if ! docker info &> /dev/null; then
        echo -e "${RED}Error: Docker is not running.${NC}"
        echo "Please start Docker and try again."
        exit 1
    fi
    
    echo -e "${GREEN}✓ All prerequisites met${NC}"
}

# Create directory structure
create_directories() {
    echo -e "${YELLOW}Creating directory structure...${NC}"
    
    mkdir -p data/machine-id
    mkdir -p data/license-cache
    mkdir -p logs
    
    echo -e "${GREEN}✓ Directories created${NC}"
}

# Setup environment file
setup_env() {
    echo -e "${YELLOW}Setting up environment...${NC}"
    
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            echo -e "${GREEN}✓ Created .env from .env.example${NC}"
        else
            echo -e "${RED}Error: .env.example not found${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}! .env already exists, skipping${NC}"
    fi
    
    # Prompt for license key
    echo ""
    echo -e "${BLUE}License Configuration${NC}"
    echo "Enter your license key (format: IS-YYYY-XXXX-XXXX):"
    read -r LICENSE_KEY
    
    if [ -z "$LICENSE_KEY" ]; then
        echo -e "${YELLOW}! No license key provided. Running in TRIAL mode.${NC}"
    else
        # Update .env with license key
        if grep -q "^LICENSE_KEY=" .env; then
            sed -i.bak "s|^LICENSE_KEY=.*|LICENSE_KEY=${LICENSE_KEY}|" .env && rm -f .env.bak
        else
            echo "LICENSE_KEY=${LICENSE_KEY}" >> .env
        fi
        echo -e "${GREEN}✓ License key configured${NC}"
    fi
    
    # Generate random NEXTAUTH_SECRET
    SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
    if grep -q "^NEXTAUTH_SECRET=" .env; then
        sed -i.bak "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${SECRET}|" .env && rm -f .env.bak
    else
        echo "NEXTAUTH_SECRET=${SECRET}" >> .env
    fi
    echo -e "${GREEN}✓ Generated secure session secret${NC}"
}

# Pull Docker images
pull_images() {
    echo -e "${YELLOW}Pulling Docker images...${NC}"
    
    # Source .env for registry/version
    set -a
    source .env
    set +a
    
    REGISTRY=${REGISTRY:-registry.infrascope.com}
    VERSION=${VERSION:-latest}
    
    echo "Pulling ${REGISTRY}/infrascope:${VERSION}..."
    docker pull ${REGISTRY}/infrascope:${VERSION} || {
        echo -e "${YELLOW}! Could not pull from registry. Make sure you have access.${NC}"
        echo -e "${YELLOW}  For trial/evaluation, build locally with: docker compose build${NC}"
    }
    
    echo -e "${GREEN}✓ Images ready${NC}"
}

# Start services
start_services() {
    echo -e "${YELLOW}Starting InfraScope...${NC}"
    
    docker compose up -d
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}║              Installation Complete!                            ║${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Access InfraScope:${NC}"
    echo "  URL: http://localhost:3000"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  View logs:     docker compose logs -f"
    echo "  Stop:          docker compose down"
    echo "  Restart:       docker compose restart"
    echo "  Update:        ./update.sh"
    echo ""
    echo -e "${BLUE}Default credentials:${NC}"
    echo "  Username: admin@infrascope.com"
    echo "  Password: admin (change on first login)"
    echo ""
}

# Main installation flow
main() {
    check_prerequisites
    create_directories
    setup_env
    pull_images
    start_services
}

main "$@"
