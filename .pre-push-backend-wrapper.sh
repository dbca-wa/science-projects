#!/usr/bin/env bash
# Pre-push enforcement for the backend.
#
# Unlike the pre-commit hooks (warnings-only), this hook BLOCKS the push when
# lint or security checks fail. Bypass with `git push --no-verify` only when
# you mean it.

set -euo pipefail

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    RANGE="@{u}...HEAD"
else
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
        RANGE="origin/main...HEAD"
    else
        RANGE=""
    fi
fi

if [ -n "$RANGE" ]; then
    CHANGED=$(git diff --name-only "$RANGE" -- 'backend/**' || true)
    if [ -z "$CHANGED" ]; then
        echo "No backend changes in push range, skipping backend pre-push checks"
        exit 0
    fi
fi

echo "Running backend pre-push checks (blocking)..."
cd backend

echo "→ Flake8 (linting)..."
poetry run flake8 \
    --max-line-length=88 \
    --extend-ignore=E203,W503,E501 \
    --exclude=migrations,__pycache__,.venv,venv,build,dist,_refactor_archive \
    . || {
    echo "✗ Flake8 errors. Fix them before pushing (or use --no-verify to bypass)."
    exit 1
}

echo "→ Bandit (security)..."
poetry run bandit -c pyproject.toml -r . -q || {
    echo "✗ Bandit findings. Fix them before pushing (or use --no-verify to bypass)."
    exit 1
}

echo "✓ Backend pre-push checks passed."
