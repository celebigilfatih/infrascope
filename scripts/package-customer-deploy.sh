#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-1.0.0}"
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
cp "${ROOT_DIR}/deploy/install.sh" "${PACKAGE_DIR}/install.sh"
cp "${ROOT_DIR}/deploy/update.sh" "${PACKAGE_DIR}/update.sh"
cp "${ROOT_DIR}/deploy/INSTALL.md" "${PACKAGE_DIR}/INSTALL.md"

chmod +x "${PACKAGE_DIR}/install.sh" "${PACKAGE_DIR}/update.sh"

if find "${PACKAGE_DIR}" -path "*/license-server/*" -print -quit | grep -q .; then
  echo "Refusing to package central license server files into customer artifact." >&2
  exit 1
fi

(
  cd "${WORK_DIR}"
  zip -qr "${ZIP_PATH}" infrascope
)

echo "Created ${ZIP_PATH}"
