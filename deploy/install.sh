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
    mkdir -p certs
    mkdir -p logs
    mkdir -p images
    
    echo -e "${GREEN}✓ Directories created${NC}"
}

generate_secret() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 32 | tr -d '\n'
    else
        head -c 32 /dev/urandom | base64 | tr -d '\n'
    fi
}

set_env_value() {
    KEY="$1"
    VALUE="$2"
    if grep -q "^${KEY}=" .env; then
        sed -i.bak "s|^${KEY}=.*|${KEY}=${VALUE}|" .env && rm -f .env.bak
    else
        echo "${KEY}=${VALUE}" >> .env
    fi
}

# Setup environment file
setup_env() {
    echo -e "${YELLOW}Setting up environment...${NC}"
    
    if [ ! -f .env ]; then
        if [ -f env.example ]; then
            cp env.example .env
            echo -e "${GREEN}✓ Created .env from env.example${NC}"
        elif [ -f .env.example ]; then
            cp .env.example .env
            echo -e "${GREEN}✓ Created .env from .env.example${NC}"
        else
            echo -e "${RED}Error: env.example or .env.example not found${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}! .env already exists, skipping${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}License Configuration${NC}"
    echo "Enter your license key (format: IS-YYYY-XXXX-XXXX-XXXX):"
    read -r LICENSE_KEY

    if [ -n "$LICENSE_KEY" ]; then
        set_env_value "LICENSE_KEY" "$LICENSE_KEY"
        echo -e "${GREEN}✓ License key configured${NC}"
    else
        echo -e "${YELLOW}! No license key provided. You can enter it in the setup wizard.${NC}"
    fi

    echo ""
    echo -e "${BLUE}Application URL${NC}"
    echo "Enter the public URL for this installation [http://localhost:8170]:"
    read -r APP_URL
    APP_URL=${APP_URL:-http://localhost:8170}
    set_env_value "APP_URL" "$APP_URL"
    set_env_value "NEXTAUTH_URL" "$APP_URL"

    echo "Enter the host port to expose InfraScope [8170]:"
    read -r APP_PORT
    APP_PORT=${APP_PORT:-8170}
    set_env_value "APP_PORT" "$APP_PORT"

    CURRENT_NEXTAUTH_SECRET=$(grep "^NEXTAUTH_SECRET=" .env | cut -d= -f2-)
    if [ -z "$CURRENT_NEXTAUTH_SECRET" ] || echo "$CURRENT_NEXTAUTH_SECRET" | grep -q "^change-me"; then
        set_env_value "NEXTAUTH_SECRET" "$(generate_secret)"
    fi
    echo -e "${GREEN}✓ Generated secure session secret${NC}"

    CURRENT_INTEGRATION_KEY=$(grep "^INTEGRATION_CREDENTIALS_KEY=" .env | cut -d= -f2-)
    if [ -z "$CURRENT_INTEGRATION_KEY" ]; then
        set_env_value "INTEGRATION_CREDENTIALS_KEY" "$(generate_secret)"
    fi
    echo -e "${GREEN}✓ Generated integration credential encryption key${NC}"

    CURRENT_NMS_INTERNAL_TOKEN=$(grep "^NMS_INTERNAL_TOKEN=" .env | cut -d= -f2-)
    if [ -z "$CURRENT_NMS_INTERNAL_TOKEN" ]; then
        set_env_value "NMS_INTERNAL_TOKEN" "$(generate_secret)"
    fi
    echo -e "${GREEN}✓ Generated internal NMS service token${NC}"

    CURRENT_POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" .env | cut -d= -f2-)
    if [ -z "$CURRENT_POSTGRES_PASSWORD" ] || [ "$CURRENT_POSTGRES_PASSWORD" = "infrascope-prod" ]; then
        set_env_value "POSTGRES_PASSWORD" "$(generate_secret)"
    fi
    echo -e "${GREEN}✓ Generated secure database password${NC}"

    CURRENT_VERSION=$(grep "^VERSION=" .env | cut -d= -f2-)
    if [ -z "$CURRENT_VERSION" ] || [ "$CURRENT_VERSION" = "latest" ]; then
        echo -e "${YELLOW}! VERSION is not pinned. Set VERSION=1.0.0 or your assigned release before production use.${NC}"
    fi
}

# Load or pull Docker image
prepare_images() {
    echo -e "${YELLOW}Preparing Docker images...${NC}"
    
    # Source .env for registry/version
    set -a
    source .env
    set +a
    
    REGISTRY=${REGISTRY:-ghcr.io/celebigilfatih}
    VERSION=${VERSION:-1.0.0}
    IMAGE_REF="${REGISTRY}/infrascope:${VERSION}"
    LOCAL_IMAGE_TAR="./images/infrascope-${VERSION}.tar"

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
        echo "Rebuild the appliance image tar with the expected tag."
        exit 1
    fi
    
    echo "Local image not found. Pulling ${IMAGE_REF}..."
    docker pull "${IMAGE_REF}" || {
        echo -e "${RED}Error: Could not prepare image ${IMAGE_REF}.${NC}"
        echo "For offline OVA installs, place the image at ${LOCAL_IMAGE_TAR}."
        echo "For online installs, make sure this VM can access the registry."
        exit 1
    }
    
    echo -e "${GREEN}✓ Image ready: ${IMAGE_REF}${NC}"
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
    set -a
    source .env
    set +a
    echo "  URL: ${APP_URL:-http://localhost:${APP_PORT:-3000}}/setup"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  View logs:     docker compose logs -f"
    echo "  Stop:          docker compose down"
    echo "  Restart:       docker compose restart"
    echo "  Update:        ./update.sh"
    echo ""
    echo -e "${BLUE}First login:${NC}"
    echo "  Complete the setup wizard to create the first admin user."
    echo ""
}

# Main installation flow
main() {
    check_prerequisites
    create_directories
    setup_env
    prepare_images
    start_services
}

main "$@"
