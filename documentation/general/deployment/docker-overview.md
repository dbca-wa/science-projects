# Docker Overview

## Overview

This document outlines the Docker strategy for the Science Projects Management System (SPMS) monorepo, covering both frontend and backend containers.

## Docker Strategy

### Multi-Stage Builds

Both frontend and backend use multi-stage Docker builds to:

- Reduce final image Size
- Separate build dependencies from runtime dependencies
- Improve build caching
- Enhance security (no build tools in production image)

## Frontend Container

### Overview

The frontend container serves the Vite-built application using Bun's built-in HTTP server.

**Base image**: `oven/bun:1.3.9-alpine` (build), `oven/bun:1.3.9-slim` (production)
**Final Size**: ~296MB
**Port**: 3000

### Dockerfile Structure

**Location**: `frontend/Dockerfile`

See the actual Dockerfile: [`frontend/Dockerfile`](../../../frontend/Dockerfile)

**Key features**:

- Multi-stage build (build stage + production stage)
- Build stage uses `oven/bun:1.3.9-alpine` for dependencies and Vite build
- Production stage uses `oven/bun:1.3.9-slim` for minimal runtime
- Runs as non-root `bun` user for security
- Uses `server.js` for serving static files

### Server Configuration

**Location**: `frontend/server.js`

The frontend uses a custom Bun server (not nginx) to serve static files. Key features:

- Serves static files from `dist/` directory
- SPA routing support (fallback to index.html)
- Runs on port 3000

### Build Process

**Build command**: `bun run build`
**Output**: `dist/` directory with optimised static assets

**Build features**:

- TypeScript compilation with type checking
- Vite bundling and optimisation
- Tree shaking and code splitting
- Asset optimisation (images, fonts, etc.)

### Security

- Runs as non-root `bun` user
- Minimal production image (no build tools)
- Read-only root filesystem (uses tmpfs for /tmp)
- No privilege escalation
- All capabilities dropped

### Build Arguments

**Environment variables:**

- `VITE_PRODUCTION_BACKEND_API_URL` - Backend API URL
- `VITE_VERSION` - Version tag
- `VITE_SENTRY_ENVIRONMENT` - Environment name (production, staging)

**Build command:**

```bash
docker build \
  --build-arg VITE_PRODUCTION_BACKEND_API_URL=https://scienceprojects.dbca.wa.gov.au/api/v1/ \
  --build-arg VITE_VERSION=v3.4.13 \
  --build-arg VITE_SENTRY_ENVIRONMENT=production \
  -t spms-frontend:v3.4.13 \
  frontend/
```

### Optimisations

**Build optimisations:**

- Use Bun for faster dependency installation
- Multi-stage build to exclude build tools
- Copy only necessary files to final image

**Runtime optimisations:**

- Minimal Bun slim image
- Static asset optimisation via Vite
- Runs as non-root user

## Backend Container

### Overview

The backend container runs Django with gunicorn.

**Base image**: `python:3.15-slim-trixie`
**Final Size**: ~880MB
**Port**: 8000

### Dockerfile Structure

**Location**: `backend/Dockerfile`

```dockerfile
# Stage 1: Build
FROM python:3.15-slim-trixie AS builder

WORKDIR /usr/src/app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential gcc g++ dpkg-dev \
    curl wget ca-certificates \
    gdebi \
    && apt-get upgrade -y

# Install Poetry
RUN pip install --upgrade pip
RUN curl -sSL https://install.python-poetry.org | POETRY_HOME=/etc/poetry python3 -
ENV PATH="${PATH}:/etc/poetry/bin"

# Install Prince XML
RUN DEB_FILE=prince.deb \
    && ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "arm64" ]; then \
    PRINCE_URL="https://www.princexml.com/download/prince_16.1-1_debian12_arm64.deb"; \
    else \
    PRINCE_URL="https://www.princexml.com/download/prince_16.1-1_debian12_amd64.deb"; \
    fi \
    && wget -O ${DEB_FILE} $PRINCE_URL \
    && yes | gdebi ${DEB_FILE} \
    && rm -f ${DEB_FILE}

# Copy project files
COPY . ./backend
WORKDIR /usr/src/app/backend

# Configure Poetry and install dependencies
RUN poetry config virtualenvs.create false
RUN poetry install --only=main --no-root

# Collect static files
RUN python manage.py collectstatic --noinput

# Compile Python bytecode and remove source files
RUN python -m compileall -b -f . \
    && python -O -m compileall -b -f . \
    && find . -name "*.py" -not -name "manage.py" -not -path "./*/migrations/*" -delete

# Stage 2: Production
FROM python:3.15-slim-trixie AS production

WORKDIR /usr/src/app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl ca-certificates \
    gdebi \
    && apt-get upgrade -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Prince XML from builder
COPY --from=builder /usr/lib/prince /usr/lib/prince
ENV PATH="${PATH}:/usr/lib/prince/bin"

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.15/site-packages /usr/local/lib/python3.15/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Create non-root user
ARG UID=10001
ARG GID=10001
RUN groupadd -g "${GID}" spmsuser \
    && useradd --create-home --uid "${UID}" --gid "${GID}" spmsuser

# Copy application from builder
COPY --from=builder --chown=${UID}:${GID} /usr/src/app/backend ./backend
WORKDIR /usr/src/app/backend

# Create directories and set permissions
RUN mkdir -p staticfiles media \
    && chown -R ${UID}:${GID} /usr/src/app

# Switch to non-root user
USER ${UID}

# Expose port
EXPOSE 8000

# Start gunicorn
CMD ["gunicorn", "config.wsgi", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--timeout", "300", \
     "--graceful-timeout", "90", \
     "--max-requests", "2048", \
     "--preload"]
```

### Gunicorn Configuration

**Workers**: 4 (adjust based on CPU cores)
**Timeout**: 300 seconds
**Graceful timeout**: 90 seconds
**Max requests**: 2048 (worker restart after this many requests)
**Bind**: 0.0.0.0:8000

**Configuration file** (optional): `backend/gunicorn.conf.py`

```python
import multiprocessing

bind = "0.0.0.0:8000"
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
worker_connections = 1000
timeout = 60
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = "info"

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
```

### Environment Variables

**Required:**

- `DATABASE_URL` - PostgreSQL connection string
- `SECRET_KEY` - Django secret key
- `ALLOWED_HOSTS` - Comma-separated list of allowed hosts

**Optional:**

- `DEBUG` - Debug mode (default: False)
- `SENTRY_DSN` - Sentry DSN for error tracking
- `REDIS_URL` - Redis connection string (if using cache)

**Build command:**

```bash
docker build \
  -t spms-backend:prod-1.0.0 \
  backend/
```

### Optimisations

**Build optimisations:**

- Multi-stage build to exclude build tools
- Use Poetry for dependency management
- Copy only necessary files to final image

**Runtime optimisations:**

- Non-root user for security
- Gunicorn with multiple workers
- Static files collected at build time

## Docker Compose for Local Development

### Overview

Docker Compose is used for local development to run frontend, backend, and database together.

**File**: `docker-compose.dev.yml`

### Services

**Frontend:**

- Vite dev server with hot reload
- Mounts source code as volume
- Port: 5173

**Backend:**

- Django dev server with auto-reload
- Mounts source code as volume
- Port: 8000

**Database:**

- PostgreSQL 15
- Persistent volume for data
- Port: 5432

**Redis** (optional):

- Redis 7
- Port: 6379

### Docker Compose Configuration

```yaml
version: "3.8"

services:
    frontend:
        build:
            context: ./frontend
            dockerfile: Dockerfile.dev
        ports:
            - "5173:5173"
        volumes:
            - ./frontend:/app
            - /app/node_modules
        environment:
            - VITE_API_URL=http://localhost:8000
            - VITE_ENVIRONMENT=development
        depends_on:
            - backend

    backend:
        build:
            context: ./backend
            dockerfile: Dockerfile.dev
        ports:
            - "8000:8000"
        volumes:
            - ./backend:/app
        environment:
            - DATABASE_URL=postgresql://postgres:postgres@db:5432/spms
            - SECRET_KEY=dev-secret-key-change-in-production
            - DEBUG=True
            - ALLOWED_HOSTS=localhost,127.0.0.1
        depends_on:
            - db

    db:
        image: postgres:17-alpine
        ports:
            - "5432:5432"
        environment:
            - POSTGRES_DB=spms
            - POSTGRES_USER=postgres
            - POSTGRES_PASSWORD=postgres
        volumes:
            - postgres_data:/var/lib/postgresql/data

    redis:
        image: redis:7-alpine
        ports:
            - "6379:6379"

volumes:
    postgres_data:
```

### Development Dockerfiles

**Frontend** (`frontend/Dockerfile.dev`):

```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

EXPOSE 5173

CMD ["bun", "run", "dev", "--host"]
```

**Backend** (`backend/Dockerfile.dev`):

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

RUN pip install poetry

COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi

COPY . .

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

### Usage

**Start all services:**

```bash
docker-compose -f docker-compose.dev.yml up
```

**Start specific service:**

```bash
docker-compose -f docker-compose.dev.yml up frontend
```

**Rebuild services:**

```bash
docker-compose -f docker-compose.dev.yml up --build
```

**Stop all services:**

```bash
docker-compose -f docker-compose.dev.yml down
```

**View logs:**

```bash
docker-compose -f docker-compose.dev.yml logs -f frontend
```

## Image Registry

### GitHub Container Registry (GHCR)

**Registry**: `ghcr.io`

**Repositories:**

- `ghcr.io/dbca-wa/science-projects-frontend` - Frontend images
- `ghcr.io/dbca-wa/science-projects-backend` - Backend images

### Image Tagging Strategy

The project uses different tagging strategies for staging and production environments to support proper testing and deployment workflows.

#### Staging/UAT Images

**Purpose**: Testing and User Acceptance Testing (UAT) environment

**Tags:**
- Frontend: `test`
- Backend: `test`

**Characteristics:**
- **Mutable tags**: `test` tag is overwritten on each staging deployment
- **Environment-specific**: Frontend image has `VITE_SENTRY_ENVIRONMENT=test` baked in
- **Always pull**: Kubernetes configured with `imagePullPolicy: Always` to get latest `test` image

**Build triggers:**
- Push to `staging` branch
- Only builds changed components (frontend or backend)

**Example:**
```bash
# Frontend test image
ghcr.io/dbca-wa/science-projects-frontend:test

# Backend test image
ghcr.io/dbca-wa/science-projects-backend:test
```

**Deployment:**
```yaml
# Kubernetes deployment uses test tag
image: ghcr.io/dbca-wa/science-projects-frontend:test
imagePullPolicy: Always  # Always pulls latest test image
```

#### Production Images

**Purpose**: Production environment

**Tags:**
- Frontend: `v1.0.0` (version) + `stable` (alias)
- Backend: `v1.0.0` (version) + `stable` (alias)

**Characteristics:**
- **Immutable version tags**: `v1.0.0` never changes once created
- **Mutable stable tag**: `stable` always points to latest production release
- **Environment-specific**: Frontend image has `VITE_SENTRY_ENVIRONMENT=production` baked in
- **Specific version**: Kubernetes uses specific version tag (e.g., `v1.0.0`)

**Build triggers:**
- Push tags matching `v*` (e.g., `v1.0.0`)
- Release published events
- Always builds both frontend and backend

**Example:**
```bash
# Frontend production images
ghcr.io/dbca-wa/science-projects-frontend:v1.0.0  # Immutable
ghcr.io/dbca-wa/science-projects-frontend:stable  # Alias to latest

# Backend production images
ghcr.io/dbca-wa/science-projects-backend:v1.0.0   # Immutable
ghcr.io/dbca-wa/science-projects-backend:stable   # Alias to latest
```

**Deployment:**
```yaml
# Kubernetes deployment uses specific version
image: ghcr.io/dbca-wa/science-projects-frontend:v1.0.0
imagePullPolicy: IfNotPresent  # Uses cached image if available
```

#### Why Different Frontend Images?

**Frontend images are environment-specific** because Vite bakes environment variables into the JavaScript bundle at build time:

```typescript
// frontend/vite.config.ts
// These values are replaced at build time by Vite
const apiUrl = import.meta.env.VITE_PRODUCTION_BACKEND_API_URL;
const sentryEnv = import.meta.env.VITE_SENTRY_ENVIRONMENT;
```

**Result:**
- `test` image contains:
  - `VITE_PRODUCTION_BACKEND_API_URL=https://scienceprojects-test.dbca.wa.gov.au/api/v1/`
  - `VITE_SENTRY_ENVIRONMENT=test`
- `v1.0.0` image contains:
  - `VITE_PRODUCTION_BACKEND_API_URL=https://scienceprojects.dbca.wa.gov.au/api/v1/`
  - `VITE_SENTRY_ENVIRONMENT=production`

**Cannot use same frontend image for both environments** because the environment variables are compiled into the JavaScript code.

#### Why Same Backend Image Works?

**Backend images are environment-agnostic** because Django reads environment variables at runtime:

```python
# backend/config/settings.py
# These values are read at runtime from environment
API_URL = os.environ.get('API_URL')
SENTRY_ENVIRONMENT = os.environ.get('SENTRY_ENVIRONMENT')
```

**Result:**
- Same backend image can be used in any environment
- Configuration injected via Kubernetes Secrets at runtime
- No need for environment-specific builds

**However**, we still use separate `test` and versioned tags for:
- Clear separation between staging and production
- Ability to test specific versions before production
- Consistent tagging strategy across frontend and backend

#### Tag Lifecycle

**Staging workflow:**
```
1. Push to staging branch
2. Detect changes (frontend/backend)
3. Run tests
4. Build changed components
5. Tag as `test`
6. Push to GHCR (overwrites previous `test` tag)
7. Kubernetes pulls new `test` image automatically
```

**Production workflow:**
```
1. Create version tag (e.g., v1.0.0)
2. Detect changes (always builds both)
3. Run tests
4. Build both components
5. Tag as `v1.0.0` and `stable`
6. Push to GHCR
7. Update Kustomize configs with new version
8. Manual deployment to production
```

#### Best Practices

**For staging:**
- Use `test` tag for all staging deployments
- Configure `imagePullPolicy: Always` to get latest images
- Test thoroughly before promoting to production

**For production:**
- Always use specific version tags (e.g., `v1.0.0`)
- Never use `latest` or mutable tags in production
- Use `stable` tag only for reference, not deployment
- Keep version tags immutable (never overwrite)

**For rollbacks:**
```bash
# Rollback to previous version
kubectl set image deployment/spms-frontend \
  frontend=ghcr.io/dbca-wa/science-projects-frontend:v0.9.0 \
  -n spms-prod
```

#### Tag Naming Conventions

**Version tags:**
- Format: `vMAJOR.MINOR.PATCH` (e.g., `v1.0.0`)
- Follow semantic versioning
- Immutable once created

**Environment tags:**
- `test` - Staging/UAT environment
- `stable` - Alias to latest production release

**Never use:**
- `latest` - Ambiguous and error-prone
- `dev` - Use `test` instead
- `prod` - Use specific versions instead

### Authentication

**Docker login:**

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
```

**Or with GitHub Actions:**

```yaml
- uses: docker/login-action@v3
  with:
      registry: ghcr.io
      username: ${{ github.actor }}
      password: ${{ secrets.GITHUB_TOKEN }}
```

### Push Images

**Frontend:**

```bash
docker tag spms-frontend:prod-1.0.0 ghcr.io/dbca-wa/science-projects-frontend:prod-1.0.0
docker push ghcr.io/dbca-wa/science-projects-frontend:prod-1.0.0
```

**Backend:**

```bash
docker tag spms-backend:prod-1.0.0 ghcr.io/dbca-wa/science-projects-backend:prod-1.0.0
docker push ghcr.io/dbca-wa/science-projects-backend:prod-1.0.0
```

## Security Best Practices

### Image Security

1. **Use official base images** - `oven/bun:1.3.9-slim`, `python:3.11-slim`
2. **Scan for vulnerabilities** - Use Azure Security Centre or Trivy
3. **Run as non-root user** - Both containers run as non-root users
4. **Minimal image Size** - Use alpine or slim variants
5. **No secrets in images** - Use environment variables or Azure Key Vault

### Build Security

1. **Use .dockerignore** - Exclude unnecessary files
2. **Multi-stage builds** - Separate build and runtime stages
3. **Pin versions** - Use specific versions for dependencies
4. **Verify checksums** - Verify package integrity
5. **Regular updates** - Keep base images and dependencies updated

### Runtime Security

1. **Read-only filesystem** - Mount volumes as read-only where possible
2. **Resource limits** - Set CPU and memory limits
3. **Network policies** - Restrict network access
4. **Health checks** - Implement health check endpoints
5. **Logging** - Log to stdout/stderr for container logs

## Troubleshooting

### Build Issues

**Issue**: Frontend build fails with "out of memory"
**Solution**: Increase Docker memory limit or use build arguments to limit bundle size

**Issue**: Backend build fails with "poetry lock mismatch"
**Solution**: Run `poetry lock` locally and commit updated `poetry.lock`

### Runtime Issues

**Issue**: Frontend container exits immediately
**Solution**: Check server.js configuration and logs

**Issue**: Backend container can't connect to database
**Solution**: Verify `DATABASE_URL` environment variable and network connectivity

**Issue**: High memory usage in backend
**Solution**: Reduce gunicorn workers or increase container memory limit

## Docker Image Sizing

### Overview

Understanding Docker image sizes helps optimise builds and deployment times. The frontend and backend images have significantly different sizes due to their different technology stacks and runtime requirements.

### Image Size Comparison

**Current sizes (as of February 2026):**

- **Frontend**: ~296MB
- **Backend**: ~880MB

**Why is the backend nearly 3x larger?**

The backend image is larger due to:

1. Python runtime and standard library (~108MB base)
2. Django and Django REST Framework ecosystem (~233MB)
3. System dependencies for PDF generation (PrinceXML ~28MB)
4. PostgreSQL client libraries (~50MB)
5. Additional runtime tools (~50MB)

The frontend image is smaller because:

1. Bun runtime is more compact (~50MB)
2. Static assets are pre-built and optimised
3. No database client libraries needed
4. Minimal runtime dependencies

### Frontend Image Breakdown (~296MB)

**Base image**: `oven/bun:1.3.9-slim` (production stage)

```
Base Bun slim image:      ~50MB
Built static assets:      ~150MB
Node modules (runtime):   ~80MB
Application code:         ~10MB
Server configuration:     ~6MB
--------------------------------
Total:                    ~296MB
```

**Key components:**

- Bun runtime (JavaScript/TypeScript execution)
- Built Vite bundle (optimised, tree-shaken)
- Static assets (images, fonts, CSS)
- Server.js (HTTP server)

**Why it's small:**

- Pre-built static assets (no build tools in production)
- Bun is more compact than Node.js
- No database drivers or system libraries
- Minimal runtime dependencies

### Backend Image Breakdown (~880MB)

**Base image**: `python:3.15-slim-trixie` (production stage)

```
Base Python image:        ~108MB
Python runtime deps:      ~56MB
System dependencies:      ~50MB
  - curl, ca-certificates ~20MB
  - gdebi:                ~10MB
  - Other libs:           ~20MB
Python packages:          ~233MB
  - Django:               ~50MB
  - DRF:                  ~30MB
  - psycopg2:             ~20MB
  - Other packages:       ~133MB
PrinceXML:                ~28MB
Application code:         ~12MB
Static files:             ~393MB
--------------------------------
Total:                    ~880MB
```

**Key components:**

- Python 3.14 runtime and standard library
- Django and Django REST Framework
- PostgreSQL client libraries (psycopg2)
- PrinceXML for PDF generation (16.1)
- Code obfuscation (compiled bytecode, source removed)
- Application code and static files

**Why it's larger:**

- Python ecosystem is heavier than JavaScript
- Database drivers require system libraries (psycopg2)
- PDF generation requires PrinceXML (~28MB)
- Django includes extensive standard library
- Static files collected at build time (~393MB)
- Code obfuscation adds compiled bytecode

### Optimisation History

**Initial backend image**: ~940MB

**Optimisations applied:**

1. Removed unnecessary development tools (vim, wget, ncdu): -60MB
2. Multi-stage build to exclude build tools: Already implemented
3. Cleaned apt cache: Already implemented

**Current backend image**: ~880MB (6.4% reduction)

### Further Optimisation Potential

#### Frontend

**Current optimisations:**

- ✅ Multi-stage build
- ✅ Bun slim base image
- ✅ Static asset optimisation via Vite
- ✅ Tree shaking and code splitting

**Potential improvements:**

- Use `oven/bun:1.3.9-distroless` (could save ~20MB)
- Further optimise static assets (image compression)
- Remove unused dependencies

**Trade-offs:**

- Distroless images are harder to debug (no shell)
- Aggressive asset optimisation may impact quality

#### Backend

**Current optimisations:**

- ✅ Multi-stage build
- ✅ Python 3.14 slim base image
- ✅ Removed development tools (vim, wget, ncdu)
- ✅ Cleaned apt cache
- ✅ Code obfuscation (compiled bytecode, source removed)

**Potential improvements:**

- Use `python:3.14-alpine` (could save ~50MB)
- Remove PrinceXML if PDF generation not needed (saves ~28MB)
- Optimise static files collection (currently ~393MB)
- Use PostgreSQL connection pooler instead of client libraries

**Trade-offs:**

- Alpine requires compiling many Python packages (slower builds, potential compatibility issues)
- Removing PrinceXML breaks PDF generation feature
- Connection pooler adds infrastructure complexity
- Code obfuscation already applied (security vs debuggability)

### Build Time Comparison

**Frontend build:**

- Build time: ~60-90 seconds
- Stages: 2 (build + production)
- Caching: Excellent (node_modules cached)

**Backend build:**

- Build time: ~120-180 seconds
- Stages: 2 (builder + production)
- Caching: Good (Poetry dependencies cached)

### Deployment Impact

**Frontend:**

- Pull time: ~30-60 seconds (296MB)
- Startup time: ~2-5 seconds
- Memory usage: ~50-100MB

**Backend:**

- Pull time: ~90-180 seconds (880MB)
- Startup time: ~5-10 seconds
- Memory usage: ~200-400MB (depends on workers)

### Best Practices

**For both images:**

1. Use multi-stage builds to exclude build tools
2. Use slim/alpine base images where possible
3. Clean package manager caches
4. Copy only necessary files
5. Use .dockerignore to exclude unnecessary files

**For frontend:**

1. Optimise static assets during build
2. Use tree shaking and code splitting
3. Compress images and fonts
4. Use CDN for large static assets

**For backend:**

1. Use Poetry for dependency management
2. Collect static files at build time
3. Remove development dependencies
4. Consider alpine for smaller images (with trade-offs)

### Monitoring Image Sizes

**Check image size:**

```bash
docker images | grep spms
```

**Analyse image layers:**

```bash
docker history spms-frontend:latest
docker history spms-backend:latest
```

**Detailed layer analysis:**

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive:latest spms-backend:latest
```

### Summary

The backend image is larger than the frontend primarily due to:

1. Python ecosystem is heavier than JavaScript/Bun
2. Database client libraries and system dependencies (psycopg2)
3. PDF generation tools (PrinceXML 16.1, ~28MB)
4. Django's extensive standard library
5. Large static files collection (~393MB)
6. Code obfuscation (compiled bytecode alongside migrations)

Both images are reasonably optimised for their respective technology stacks. Further optimisation is possible but involves trade-offs between image size, build time, and functionality.

## Component-Specific Docker Documentation

### Frontend Docker

**Frontend-specific:**

- Vite build configuration
- Bun server configuration
- Static asset optimisation

### Backend Docker

For backend-specific Docker details, see:

- [Backend Deployment Documentation](./)

**Backend-specific:**

- Django static files
- Database migrations
- Celery workers (if applicable)

## Related Documentation

- [CI/CD Overview](./ci-cd-overview.md) - CI/CD strategy for monorepo
- [Kubernetes Overview](./kubernetes-overview.md) - Kubernetes deployment
- [Environment Strategy](./environment-strategy.md) - Environment configuration
- [Backend Deployment](./) - Backend-specific deployment

## External Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Azure Container Registry](https://docs.microsoft.com/en-us/azure/container-registry/)
- [Bun Documentation](https://bun.sh/docs)
- [Gunicorn Documentation](https://docs.gunicorn.org/)
