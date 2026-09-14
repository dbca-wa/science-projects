#!/bin/bash
# Wrapper to run bandit and show output but never block the commit.
# Enforcement happens on push (pre-push hook) and in CI.
#
# Bandit needs an explicit target and config, otherwise it prints its usage
# text and scans nothing. Use the project config and scan the backend tree.
poetry run bandit -c pyproject.toml -r . -q "$@" >&2 || true

# Always exit 0 (warnings only, don't block commit)
exit 0
