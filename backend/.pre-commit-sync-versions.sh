#!/bin/bash
# Sync pre-commit hook revisions to match the versions installed by Poetry.
#
# Several pre-commit hooks (black, isort, autoflake) run the same tools that
# are declared as Poetry dev dependencies. Their pinned `rev:` in
# .pre-commit-config.yaml can drift from the Poetry-resolved versions after a
# `poetry update`. This script reads the installed versions and rewrites the
# matching `rev:` lines so the two stay in step.
#
# Usage:
#   ./.pre-commit-sync-versions.sh          # apply changes
#   ./.pre-commit-sync-versions.sh --check  # report drift, exit 1 if any (CI)
#
# Notes:
# - flake8 and bandit run as local hooks via wrapper scripts, so they already
#   use the Poetry-installed versions and need no rev sync.
# - Tag prefixes differ per repo: black/isort tag as "X.Y.Z"; autoflake tags
#   as "vX.Y.Z". This is encoded in the mapping below.

set -euo pipefail

CONFIG_FILE="$(dirname "$0")/.pre-commit-config.yaml"
CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

# Mapping: poetry_package|repo_url|tag_prefix
MAPPINGS=(
    "black|https://github.com/psf/black|"
    "isort|https://github.com/PyCQA/isort|"
    "autoflake|https://github.com/PyCQA/autoflake|v"
)

get_installed_version() {
    # Extract the resolved version from `poetry show <pkg>`.
    poetry show "$1" 2>/dev/null | awk '/^ *version/ {print $3; exit}'
}

drift_found=false

for entry in "${MAPPINGS[@]}"; do
    IFS='|' read -r pkg repo prefix <<< "$entry"

    version="$(get_installed_version "$pkg")"
    if [ -z "$version" ]; then
        echo "⚠️  $pkg is not installed via Poetry — skipping."
        continue
    fi

    desired_rev="${prefix}${version}"

    # Find the current rev for this repo. The rev line is the first `rev:`
    # after the matching `- repo:` line.
    current_rev="$(
        awk -v repo="$repo" '
            $0 ~ "- repo: " repo "$" {found=1; next}
            found && /rev:/ {gsub(/^[[:space:]]*rev:[[:space:]]*/, ""); print; exit}
        ' "$CONFIG_FILE"
    )"

    if [ -z "$current_rev" ]; then
        echo "⚠️  Could not find a rev for $repo in $CONFIG_FILE — skipping."
        continue
    fi

    if [ "$current_rev" = "$desired_rev" ]; then
        echo "✅ $pkg: $current_rev (in sync)"
        continue
    fi

    drift_found=true
    if $CHECK_ONLY; then
        echo "❌ $pkg: pre-commit rev '$current_rev' != installed '$desired_rev'"
    else
        # Replace only the rev line that belongs to this repo block.
        awk -v repo="$repo" -v newrev="$desired_rev" '
            $0 ~ "- repo: " repo "$" {found=1; print; next}
            found && /rev:/ {
                sub(/rev:[[:space:]]*.*/, "rev: " newrev)
                found=0
            }
            {print}
        ' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        echo "🔧 $pkg: $current_rev → $desired_rev"
    fi
done

if $CHECK_ONLY && $drift_found; then
    echo ""
    echo "Pre-commit revisions are out of sync with Poetry. Run:"
    echo "  ./.pre-commit-sync-versions.sh"
    exit 1
fi

exit 0
