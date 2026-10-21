#!/usr/bin/env bash
# Shared producer-side checks; never reads installation secrets.
validate_customer_release() {
  if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9][A-Za-z0-9.-]*)?$ ]]; then
    echo "VERSION must be an explicit release such as 1.0.1." >&2
    return 1
  fi
  if [ -n "${IMAGE_TAR_DIR:-}" ]; then
    for name in "infrascope-${VERSION}.tar" "infrascope-nms-${VERSION}.tar" postgres-16-alpine.tar; do
      if [ ! -s "${IMAGE_TAR_DIR}/${name}" ]; then
        echo "Missing release image archive: ${name}" >&2
        return 1
      fi
    done
  fi
}

prepare_customer_release_files() {
  local destination="$1"
  for name in env.example .env.example; do
    if [ -f "${destination}/${name}" ]; then
      sed -i 's/\r$//' "${destination}/${name}"
      sed -i "s/^VERSION=.*/VERSION=${VERSION}/" "${destination}/${name}"
    fi
  done
  find "$destination" -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
  find "$destination" -type f -name '*.sh' -exec chmod +x {} +
  if [ -n "${IMAGE_TAR_DIR:-}" ]; then
    mkdir -p "${destination}/images"
    for name in "infrascope-${VERSION}.tar" "infrascope-nms-${VERSION}.tar" postgres-16-alpine.tar; do
      cp "${IMAGE_TAR_DIR}/${name}" "${destination}/images/${name}"
    done
    if [ -f "${IMAGE_TAR_DIR}/image-manifest.json" ]; then
      cp "${IMAGE_TAR_DIR}/image-manifest.json" "${destination}/images/image-manifest.json"
    fi
  fi
}
