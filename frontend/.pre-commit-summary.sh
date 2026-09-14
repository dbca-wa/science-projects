#!/bin/bash
# Pre-commit summary wrapper
# Displays a summary of all checks (blocking on critical failures)

set -e

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ISSUES_FOUND=0
WARNINGS_FOUND=0

# Force output to stderr
exec 1>&2

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Pre-Commit Check Summary                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Track start time
START_TIME=$(date +%s)

# Function to run a check and display results
run_check() {
    local check_name="$1"
    local check_command="$2"
    local is_critical="${3:-true}"

    echo -e "${BLUE}▶ Running ${check_name}...${NC}"

    if eval "$check_command" > /tmp/precommit_output.txt 2>&1; then
        echo -e "${GREEN}✓ ${check_name} passed${NC}"
        echo ""
    else
        if [ "$is_critical" = "true" ]; then
            echo -e "${RED}✗ ${check_name} FAILED:${NC}"
            cat /tmp/precommit_output.txt
            echo ""
            ISSUES_FOUND=1
        else
            echo -e "${YELLOW}⚠ ${check_name} warnings:${NC}"
            cat /tmp/precommit_output.txt
            echo ""
            WARNINGS_FOUND=1
        fi
    fi

    rm -f /tmp/precommit_output.txt
}

# Run TypeScript type checking (critical)
if command -v bun &> /dev/null; then
    run_check "TypeScript (type checking)" "bun run tsc --noEmit" "true"
else
    echo -e "${YELLOW}⚠ Bun not found, skipping TypeScript check${NC}"
    echo ""
fi

# Run ESLint (non-critical, warnings only)
if command -v bun &> /dev/null; then
    run_check "ESLint (linting)" "bun run lint" "false"
else
    echo -e "${YELLOW}⚠ Bun not found, skipping ESLint${NC}"
    echo ""
fi

# Calculate execution time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Final summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Final Summary                                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $ISSUES_FOUND -eq 0 ]; then
    if [ $WARNINGS_FOUND -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed! Proceeding with commit...${NC}"
    else
        echo -e "${YELLOW}⚠ Committing with lint warnings (not blocked).${NC}"
        echo -e "${YELLOW}  These will FAIL the push and CI. Fix them before you push.${NC}"
    fi
    echo ""
    echo -e "${BLUE}Total execution time: ${DURATION}s${NC}"
    echo ""
    echo -e "${YELLOW}Note: Full test suite will run in CI/CD pipeline${NC}"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Checks failed! Please fix the issues above before committing.${NC}"
    echo ""
    echo -e "${YELLOW}To bypass these checks (not recommended), use:${NC}"
    echo -e "${YELLOW}  git commit --no-verify${NC}"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    exit 1
fi
