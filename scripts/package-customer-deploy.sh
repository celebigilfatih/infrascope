#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-1.0.0}"
source "${ROOT_DIR}/scripts/customer-release-common.sh"
validate_customer_release
OUT_DIR="${ROOT_DIR}/dist"
WORK_DIR="$(mktemp -d)"
PACKAGE_DIR="${WORK_DIR}/infrascope"
ZIP_PATH="${OUT_DIR}/infrascope-customer-deploy-${VERSION}.zip"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${PACKAGE_DIR}" "${OUT_DIR}"

cp "${ROOT_DIR}/deploy/docker-compose.yml" "${PACKAGE_DIR}/docker-compose.yml"
cp "${ROOT_DIR}/deploy/.env.example" "${PACKAGE_DIR}/.env.example"
cp "${ROOT_DIR}/deploy/env.example" "${PACKAGE_DIR}/env.example"
cp "${ROOT_DIR}/deploy/install.sh" "${PACKAGE_DIR}/install.sh"
cp "${ROOT_DIR}/deploy/install.ps1" "${PACKAGE_DIR}/install.ps1"
cp "${ROOT_DIR}/deploy/backup.ps1" "${PACKAGE_DIR}/backup.ps1"
cp "${ROOT_DIR}/deploy/update.ps1" "${PACKAGE_DIR}/update.ps1"
cp "${ROOT_DIR}/deploy/release-common.ps1" "${PACKAGE_DIR}/release-common.ps1"
cp "${ROOT_DIR}/deploy/install-infrascope.ps1" "${PACKAGE_DIR}/install-infrascope.ps1"
cp "${ROOT_DIR}/deploy/INSTALL_WINDOWS.md" "${PACKAGE_DIR}/INSTALL_WINDOWS.md"
cp "${ROOT_DIR}/deploy/update.sh" "${PACKAGE_DIR}/update.sh"
cp "${ROOT_DIR}/deploy/backup.sh" "${PACKAGE_DIR}/backup.sh"
cp "${ROOT_DIR}/docker/postgres-backup.sh" "${PACKAGE_DIR}/postgres-backup.sh"
cp "${ROOT_DIR}/deploy/INSTALL.md" "${PACKAGE_DIR}/INSTALL.md"
cp "${ROOT_DIR}/docs/30-runbooks/nms-backups.md" "${PACKAGE_DIR}/BACKUP_OPERATIONS.md"
cp "${ROOT_DIR}/Kurulum/infrascope_customer_cookbook.html" "${PACKAGE_DIR}/infrascope_customer_cookbook.html"
cp "${ROOT_DIR}/Kurulum/infrascope_user_cookbook.html" "${PACKAGE_DIR}/infrascope_user_cookbook.html"

chmod +x "${PACKAGE_DIR}/install.sh" "${PACKAGE_DIR}/update.sh" "${PACKAGE_DIR}/backup.sh"
prepare_customer_release_files "$PACKAGE_DIR"

if find "${PACKAGE_DIR}" -path "*/license-server/*" -print -quit | grep -q .; then
  echo "Refusing to package central license server files into customer artifact." >&2
  exit 1
fi

(
  cd "${WORK_DIR}"
  zip -qr "${WORK_DIR}/release.zip" infrascope
)
mv "${WORK_DIR}/release.zip" "$ZIP_PATH"

echo "Created ${ZIP_PATH}"
