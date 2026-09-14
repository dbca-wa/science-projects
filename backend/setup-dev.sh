#!/bin/bash
# Development environment setup script for Science Projects Backend

set -e  # Exit on error

echo "🚀 Setting up Science Projects Backend development environment..."
echo ""

# Check if Poetry is installed
if ! command -v poetry &> /dev/null; then
    echo "❌ Poetry is not installed. Please install it first:"
    echo "   curl -sSL https://install.python-poetry.org | python3 -"
    exit 1
fi

echo "✅ Poetry found: $(poetry --version)"
echo ""

# Check Python version
python_version=$(python3 --version | cut -d' ' -f2)
echo "✅ Python version: $python_version"
echo ""

# Update lock file if needed
echo "🔒 Updating poetry.lock file..."
poetry lock
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
poetry install
echo ""

# Align pre-commit hook revisions with the installed tool versions
echo "🔗 Syncing pre-commit revisions with Poetry versions..."
./.pre-commit-sync-versions.sh
echo ""

# Install pre-commit hooks
echo "🔧 Installing pre-commit hooks..."
poetry run pre-commit install
echo ""

# Run pre-commit on all files to ensure everything is set up correctly
echo "🧪 Running pre-commit checks on all files..."
poetry run pre-commit run --all-files || {
    echo ""
    echo "⚠️  Some pre-commit checks failed. This is normal for first-time setup."
    echo "   The hooks have been installed and will run automatically on future commits."
    echo ""
}

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found."
    if [ -f .env.example ]; then
        echo "   Creating .env from .env.example..."
        cp .env.example .env
        echo "   ✅ .env created. Please edit it with your settings."
    else
        echo "   Please create a .env file with your configuration."
    fi
    echo ""
fi

echo "✅ Development environment setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Edit .env with your database and other settings"
echo "   2. Run migrations: poetry run python manage.py migrate"
echo "   3. Create superuser: poetry run python manage.py createsuperuser"
echo "   4. Run tests: poetry run pytest"
echo "   5. Start development server: poetry run python manage.py runserver"
echo ""
echo "💡 Pre-commit hooks are now active and will run automatically on git commit"
echo "   To run manually: poetry run pre-commit run --all-files"
echo ""
