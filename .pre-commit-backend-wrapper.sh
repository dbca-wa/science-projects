#!/usr/bin/env bash
# Wrapper script to run backend pre-commit hooks only on changed backend files

set -e

# Get list of changed files in backend directory
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep "^backend/" || true)

if [ -z "$CHANGED_FILES" ]; then
    echo "No backend files changed, skipping backend checks"
    exit 0
fi

echo "Running backend pre-commit checks..."

# Change to backend directory for all operations
cd backend

# Convert paths from "backend/foo.py" to "foo.py"
BACKEND_FILES=$(echo "$CHANGED_FILES" | sed 's|^backend/||')

# Export files for hooks that need them
export CHANGED_FILES="$BACKEND_FILES"

# If dependency files changed, keep the pre-commit config's pinned tool
# revisions aligned with the Poetry-installed versions, then re-stage it.
if echo "$BACKEND_FILES" | grep -qE '^(pyproject\.toml|poetry\.lock)$'; then
    echo "→ Syncing pre-commit revisions with Poetry versions..."
    if [ -f .pre-commit-sync-versions.sh ]; then
        ./.pre-commit-sync-versions.sh || true
        # Re-stage the config if the sync changed it (cwd is backend/).
        if ! git diff --quiet .pre-commit-config.yaml 2>/dev/null; then
            git add .pre-commit-config.yaml
            echo "  Updated backend/.pre-commit-config.yaml to match Poetry."
        fi
    fi
fi

# Run each hook manually in order
echo "→ Running Black (formatting)..."
if command -v poetry &> /dev/null && [ -n "$BACKEND_FILES" ]; then
    PY_FILES=$(echo "$BACKEND_FILES" | grep "\.py$" || true)
    if [ -n "$PY_FILES" ]; then
        echo "$PY_FILES" | xargs poetry run black --line-length=88 2>&1 | grep -v "reformatted\|unchanged" || true
    fi
fi

echo "→ Running isort (import sorting)..."
if command -v poetry &> /dev/null && [ -n "$BACKEND_FILES" ]; then
    PY_FILES=$(echo "$BACKEND_FILES" | grep "\.py$" || true)
    if [ -n "$PY_FILES" ]; then
        echo "$PY_FILES" | xargs poetry run isort --profile=black --line-length=88 2>&1 | grep -v "Skipped\|Fixing" || true
    fi
fi

echo "→ Running autoflake (unused imports)..."
if command -v poetry &> /dev/null && [ -n "$BACKEND_FILES" ]; then
    PY_FILES=$(echo "$BACKEND_FILES" | grep "\.py$" || true)
    if [ -n "$PY_FILES" ]; then
        echo "$PY_FILES" | xargs poetry run autoflake --in-place --remove-all-unused-imports --remove-unused-variables --remove-duplicate-keys --ignore-init-module-imports 2>&1 | grep -v "^$" || true
    fi
fi

echo "→ Running flake8 (linting - warnings only)..."
if command -v poetry &> /dev/null && [ -f .pre-commit-flake8-wrapper.sh ]; then
    ./.pre-commit-flake8-wrapper.sh 2>&1 | head -20 || true
fi

echo "→ Running bandit (security - warnings only)..."
if command -v poetry &> /dev/null && [ -f .pre-commit-bandit-wrapper.sh ]; then
    ./.pre-commit-bandit-wrapper.sh 2>&1 | head -20 || true
fi

echo "→ Running commit summary..."
if [ -f .pre-commit-confirm-wrapper.sh ]; then
    ./.pre-commit-confirm-wrapper.sh
fi
