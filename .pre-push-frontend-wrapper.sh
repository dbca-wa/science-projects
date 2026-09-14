#!/usr/bin/env bash
# Pre-push enforcement for the frontend.
#
# Unlike the pre-commit hooks (which are warnings-only so work-in-progress can
# be committed freely), this hook BLOCKS the push when lint or type checks fail.
# It runs against the whole frontend project, mirroring what a reviewer expects
# on the branch. Bypass with `git push --no-verify` only when you mean it.

set -euo pipefail

# Skip when the frontend has no changes relative to the upstream branch.
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    RANGE="@{u}...HEAD"
else
    # No upstream yet (new branch): compare against origin/main if present.
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
        RANGE="origin/main...HEAD"
    else
        RANGE=""
    fi
fi

if [ -n "$RANGE" ]; then
    CHANGED=$(git diff --name-only "$RANGE" -- 'frontend/**' || true)
    if [ -z "$CHANGED" ]; then
        echo "No frontend changes in push range, skipping frontend pre-push checks"
        exit 0
    fi
fi

echo "Running frontend pre-push checks (blocking)..."
cd frontend

echo "→ TypeScript (type checking)..."
bun run typecheck || {
    echo "✗ TypeScript errors. Fix them before pushing (or use --no-verify to bypass)."
    exit 1
}

echo "→ ESLint (linting)..."
bun run lint || {
    echo "✗ ESLint errors. Fix them before pushing (or use --no-verify to bypass)."
    exit 1
}

echo "✓ Frontend pre-push checks passed."
