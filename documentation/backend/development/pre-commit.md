# Pre-commit Hooks Guide

Understanding and using pre-commit hooks for code quality.

Related Documentation: [Getting Started](getting-started.md), [Code Style](code-style.md)

## Overview

Pre-commit hooks automatically check and fix code quality issues before you commit. They ensure consistent code style, catch common errors, and enforce security best practices.

## What Pre-commit Does

Pre-commit runs automatically when you `git commit`. It:

1. **Formats code** - Applies black and isort
2. **Removes unused code** - Cleans up imports and variables
3. **Checks for issues** - Runs flake8 and bandit
4. **Fixes common problems** - Trailing whitespace, line endings
5. **Prevents mistakes** - Detects large files, merge conflicts, private keys

## Installation

### First Time Setup

```bash
pip install pre-commit
pre-commit install
```

Expected output:
```
pre-commit installed at .git/hooks/pre-commit
```

### Verify Installation

```bash
pre-commit --version
```

## Using Pre-commit

### Automatic Execution with Confirmation

Pre-commit runs automatically on `git commit` and includes a confirmation prompt:

```bash
git add .
git commit -m "Add new feature"
```

Output:
```
Trim Trailing Whitespace.................................................Passed
Fix End of Files.........................................................Passed
black....................................................................Passed
isort....................................................................Passed
autoflake................................................................Passed
flake8 (warnings only)...................................................Passed
bandit (warnings only)...................................................Passed

╔════════════════════════════════════════════════════════════╗
║         Pre-Commit Check Summary                           ║
╚════════════════════════════════════════════════════════════╝

✓ All checks passed!

Do you want to proceed with the commit?
  y or yes - Proceed with commit
  n, no, q, or Ctrl+C - Cancel commit

Your choice: y

✓ Proceeding with commit...
```

**Confirmation Prompt:**
- After all hooks run, you'll see a summary
- Type `y` or `yes` to proceed
- Type `n`, `no`, `q`, or press `Ctrl+C` to cancel
- 30-second timeout (auto-cancels if no response)

### Example with Issues Found

If flake8 or bandit find issues:

```
⚠ Flake8 (linting) found issues:
agencies/views.py:45:1: F401 'os' imported but unused
agencies/models.py:12:80: E501 line too long (92 > 88 characters)

⚠ Bandit (security) found issues:
>> Issue: [B105:hardcoded_password_string] Possible hardcoded password
   Severity: Low   Confidence: Medium
   Location: config/settings.py:45

Do you want to proceed with the commit?
  y or yes - Proceed with commit
  n, no, q, or Ctrl+C - Cancel commit

Your choice: n

✗ Commit cancelled by user
```

**What to do:**
1. Review the warnings carefully
2. Decide if you want to fix them now or later
3. Type `n` to cancel and fix issues
4. Or type `y` to proceed anyway (warnings are non-blocking)

### Manual Execution

Run hooks without committing:

```bash
# Run on all files
pre-commit run --all-files

# Run on staged files only
pre-commit run

# Run specific hook
pre-commit run black

# Run on specific files
pre-commit run --files agencies/models.py agencies/views.py
```

### When Hooks Fail

If a hook fails, the commit is aborted:

```bash
git commit -m "Add feature"
```

Output:
```
black....................................................................Failed
- hook id: black
- files were modified by this hook

reformatted agencies/views.py
1 file reformatted.
```

**What to do:**
1. Review the changes made by the hook
2. Stage the fixed files: `git add .`
3. Commit again: `git commit -m "Add feature"`

### Skipping Hooks

Sometimes you need to skip hooks (use sparingly):

```bash
# Skip all hooks
git commit --no-verify -m "WIP: temporary commit"

# Skip specific hook
SKIP=flake8 git commit -m "Fix urgent bug"

# Skip multiple hooks
SKIP=flake8,bandit git commit -m "Quick fix"
```

**When to skip:**
- Work-in-progress commits on feature branches
- Urgent hotfixes (fix properly later)
- Known false positives

**When NOT to skip:**
- Commits to `main` or `develop`
- Pull requests
- Production releases

## Hooks Explained

### Code Formatting

**black** - Formats Python code consistently:
- Enforces 88-character line length
- Standardises quotes, spacing, indentation

**isort** - Sorts and organises imports:
- Groups imports (standard library, third-party, local)
- Sorts alphabetically within groups

**autoflake** - Removes unused imports and variables:
- Removes unused imports
- Removes unused variables

### Code Quality

**flake8 (Warning-Only Mode)** - Checks code for style and quality issues:
- Checks PEP 8 compliance
- Detects unused variables
- Reports warnings but doesn't block commits

**bandit (Warning-Only Mode)** - Checks for security issues:
- Detects SQL injection risks
- Finds hardcoded passwords
- Reports warnings but doesn't block commits

### Django-Specific

**django-upgrade** - Upgrades Django code to modern patterns:
- Updates deprecated Django APIs
- Modernises code for Django 5.1

### File Checks

**Commit Confirmation** - Provides summary and confirmation prompt:
- Runs after all other hooks complete
- Displays summary of any issues found
- Prompts for confirmation before proceeding

**Other file checks:**
- trailing-whitespace - Removes trailing whitespace
- end-of-file-fixer - Ensures files end with newline
- check-yaml - Validates YAML syntax
- check-json - Validates JSON syntax
- check-toml - Validates TOML syntax
- check-added-large-files - Prevents committing large files (>1MB)
- check-merge-conflict - Detects unresolved merge conflict markers
- check-case-conflict - Detects files that differ only in case
- detect-private-key - Prevents committing private keys
- mixed-line-ending - Ensures consistent line endings (LF)

## Configuration Files

### .pre-commit-config.yaml

Main configuration file defining all hooks.

**Location:** `backend/.pre-commit-config.yaml`

**Key settings:**
```yaml
default_language_version:
  python: python3.15

fail_fast: false  # Run all hooks even if one fails

exclude: |  # Files to skip
  migrations/.*
  __pycache__/.*
  \.venv/.*
```

### Wrapper Scripts

**`.pre-commit-confirm-wrapper.sh`** - Provides final confirmation prompt:
- Runs flake8 and bandit
- Shows coloured output
- Prompts for user confirmation
- 30-second timeout

**`.pre-commit-flake8-wrapper.sh`** - Makes flake8 non-blocking:
- Shows warnings without blocking commits

**`.pre-commit-bandit-wrapper.sh`** - Makes bandit non-blocking:
- Shows security warnings without blocking commits

### pyproject.toml

Configuration for black, isort, and bandit:

```toml
[tool.black]
line-length = 88
target-version = ['py313']

[tool.isort]
profile = "black"
line_length = 88

[tool.bandit]
exclude_dirs = ["tests", "migrations"]
skips = ["B101"]  # Skip assert_used check
```

## Troubleshooting

### Hooks not running

**Solution:**
```bash
pre-commit install
```

### Hook fails with "command not found"

**Solution:**
```bash
poetry --version
poetry install
pre-commit run --all-files
```

### Black and flake8 conflict

**Solution:** Configuration already handles this:
- Both use 88-character line length
- flake8 ignores E203, W503 (black-incompatible rules)

### False positive from bandit

**Solution:**
```python
# Add inline comment to suppress
password = get_password_from_env()  # nosec B105

# Or skip the check globally in pyproject.toml
[tool.bandit]
skips = ["B105"]
```

### Pre-commit modifies files but commit still fails

**Solution:**
```bash
git add .
git commit -m "Your message"
```

### Need to update hooks

**Solution:**
```bash
pre-commit autoupdate
pre-commit run --all-files
git add .pre-commit-config.yaml
git commit -m "Update pre-commit hooks"
```

## Best Practices

### Run Before Committing

```bash
pre-commit run --all-files
```

### Fix Issues Incrementally

Don't skip hooks to avoid fixing issues. Address them as you go:

```bash
pre-commit run --all-files
# Fix reported issues
git add .
git commit -m "Fix code quality issues"
```

### Review Auto-Fixes

Always review changes made by hooks:

```bash
git diff
git add -p  # Interactive staging
```

### Keep Configuration Updated

```bash
# Update hook versions quarterly
pre-commit autoupdate
pre-commit run --all-files
git add .pre-commit-config.yaml
git commit -m "Update pre-commit hooks"
```

## Integration with CI/CD

Pre-commit hooks run locally, but CI/CD also enforces code quality:

**Local (pre-commit):**
- Fast feedback
- Catches issues before push
- Auto-fixes formatting

**CI/CD (GitHub Actions):**
- Enforces on all PRs
- Runs full test suite
- Generates coverage reports

## Next Steps

- [Code Style](code-style.md) - Detailed code style guidelines
- [Testing Guide](testing-guide.md) - Testing strategy
