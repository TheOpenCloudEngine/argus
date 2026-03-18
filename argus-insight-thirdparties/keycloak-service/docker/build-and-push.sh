#!/bin/bash
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/../versions.env"

# Private registry (change to your Zot Registry address)
REGISTRY="${REGISTRY:-registry.argus.local}"

KEYCLOAK_IMAGE="argus-insight/keycloak"
POSTGRESQL_IMAGE="argus-insight/keycloak-postgresql"

# ─── Build ────────────────────────────────────────────────────────────────────
echo "=== Building Keycloak image ==="
docker build \
  --build-arg KEYCLOAK_VERSION="${KEYCLOAK_VERSION}" \
  -t "${KEYCLOAK_IMAGE}:${KEYCLOAK_VERSION}" \
  -t "${REGISTRY}/${KEYCLOAK_IMAGE}:${KEYCLOAK_VERSION}" \
  "${SCRIPT_DIR}/keycloak"

echo "=== Building Keycloak PostgreSQL image ==="
docker build \
  --build-arg POSTGRES_VERSION="${POSTGRES_VERSION}" \
  -t "${POSTGRESQL_IMAGE}:${POSTGRES_VERSION}" \
  -t "${REGISTRY}/${POSTGRESQL_IMAGE}:${POSTGRES_VERSION}" \
  "${SCRIPT_DIR}/postgresql"

echo ""
echo "=== Build complete ==="
echo "  ${KEYCLOAK_IMAGE}:${KEYCLOAK_VERSION}"
echo "  ${POSTGRESQL_IMAGE}:${POSTGRES_VERSION}"

# ─── Push ─────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--push" ]]; then
  echo ""
  echo "=== Pushing to ${REGISTRY} ==="
  docker push "${REGISTRY}/${KEYCLOAK_IMAGE}:${KEYCLOAK_VERSION}"
  docker push "${REGISTRY}/${POSTGRESQL_IMAGE}:${POSTGRES_VERSION}"
  echo ""
  echo "=== Push complete ==="
  echo "  ${REGISTRY}/${KEYCLOAK_IMAGE}:${KEYCLOAK_VERSION}"
  echo "  ${REGISTRY}/${POSTGRESQL_IMAGE}:${POSTGRES_VERSION}"
else
  echo ""
  echo "To push to registry, run:"
  echo "  $0 --push"
fi
