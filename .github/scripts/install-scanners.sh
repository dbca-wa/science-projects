#!/usr/bin/env bash
# Install pinned releases of Grype and Trivy, verifying each download against
# the SHA-256 checksums published with the release.
set -euo pipefail

GRYPE_VERSION="${GRYPE_VERSION:-0.121.3}"
TRIVY_VERSION="${TRIVY_VERSION:-0.76.2}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

fetch_and_verify() {
  local base_url="$1" archive="$2" checksums="$3"
  curl -sSfL --retry 3 -o "$workdir/$archive" "$base_url/$archive"
  curl -sSfL --retry 3 -o "$workdir/$checksums" "$base_url/$checksums"
  (cd "$workdir" && grep -F " $archive" "$checksums" | sha256sum --check --strict -)
}

grype_archive="grype_${GRYPE_VERSION}_linux_amd64.tar.gz"
fetch_and_verify \
  "https://github.com/anchore/grype/releases/download/v${GRYPE_VERSION}" \
  "$grype_archive" "grype_${GRYPE_VERSION}_checksums.txt"
tar -xzf "$workdir/$grype_archive" -C "$workdir" grype
sudo install -m 0755 "$workdir/grype" "$INSTALL_DIR/grype"

trivy_archive="trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
fetch_and_verify \
  "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}" \
  "$trivy_archive" "trivy_${TRIVY_VERSION}_checksums.txt"
tar -xzf "$workdir/$trivy_archive" -C "$workdir" trivy
sudo install -m 0755 "$workdir/trivy" "$INSTALL_DIR/trivy"

grype version
trivy --version
