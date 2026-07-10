#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-1.0.0}"
OUT_DIR="${ROOT_DIR}/dist"
PACKAGE_DIR="${OUT_DIR}/infrascope-appliance-${VERSION}"
ARCHIVE_PATH="${OUT_DIR}/infrascope-appliance-${VERSION}.tar.gz"

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}/opt/infrascope/images" "${PACKAGE_DIR}/usr/local/bin" "${OUT_DIR}"

cp "${ROOT_DIR}/deploy/docker-compose.yml" "${PACKAGE_DIR}/opt/infrascope/docker-compose.yml"
cp "${ROOT_DIR}/deploy/env.example" "${PACKAGE_DIR}/opt/infrascope/env.example"
cp "${ROOT_DIR}/deploy/install.sh" "${PACKAGE_DIR}/opt/infrascope/install.sh"
cp "${ROOT_DIR}/deploy/update.sh" "${PACKAGE_DIR}/opt/infrascope/update.sh"
cp "${ROOT_DIR}/deploy/INSTALL.md" "${PACKAGE_DIR}/opt/infrascope/INSTALL.md"
cp "${ROOT_DIR}/deploy/appliance/README.md" "${PACKAGE_DIR}/opt/infrascope/APPLIANCE_README.md"
cp "${ROOT_DIR}/deploy/appliance/bin/infrascope-setup" "${PACKAGE_DIR}/usr/local/bin/infrascope-setup"
cp "${ROOT_DIR}/deploy/appliance/bin/infrascope-status" "${PACKAGE_DIR}/usr/local/bin/infrascope-status"
cp "${ROOT_DIR}/deploy/appliance/bin/infrascope-update" "${PACKAGE_DIR}/usr/local/bin/infrascope-update"

chmod +x "${PACKAGE_DIR}/opt/infrascope/install.sh" "${PACKAGE_DIR}/opt/infrascope/update.sh"
chmod +x "${PACKAGE_DIR}/usr/local/bin/infrascope-setup" "${PACKAGE_DIR}/usr/local/bin/infrascope-status" "${PACKAGE_DIR}/usr/local/bin/infrascope-update"

cat > "${PACKAGE_DIR}/INSTALL_ON_VM.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo ./INSTALL_ON_VM.sh" >&2
  exit 1
fi

mkdir -p /opt/infrascope /usr/local/bin
cp -a opt/infrascope/. /opt/infrascope/
cp -a usr/local/bin/. /usr/local/bin/
chmod +x /opt/infrascope/install.sh /opt/infrascope/update.sh
chmod +x /usr/local/bin/infrascope-setup /usr/local/bin/infrascope-status /usr/local/bin/infrascope-update

echo "InfraScope appliance files installed."
echo "Next step: place /opt/infrascope/images/infrascope-<version>.tar if not already present."
echo "Run: sudo infrascope-setup"
EOF

chmod +x "${PACKAGE_DIR}/INSTALL_ON_VM.sh"

(
  cd "${OUT_DIR}"
  tar -czf "${ARCHIVE_PATH}" "infrascope-appliance-${VERSION}"
)

echo "Created ${ARCHIVE_PATH}"
echo "Copy it to the Ubuntu VM, extract, and run: sudo ./INSTALL_ON_VM.sh"

