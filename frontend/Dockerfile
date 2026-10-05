# Multistage build to prevent code exposure / reduce image size

# ======================== BUILD STAGE ========================
# Uses deps and env vars to bake / build the app
FROM oven/bun:1.4.2-alpine AS build_image

WORKDIR /app

# Copy package files and scripts (needed for postinstall)
COPY package.json bun.lock ./
COPY scripts ./scripts

# Install dependencies
RUN bun install --frozen-lockfile

# Set PATH for local node modules
ENV PATH="./node_modules/.bin:$PATH"

# Copy source code
COPY . .

# Set default values for environment variables (overridden by GitHub Actions)
ARG VITE_VERSION=0.0.1
ARG VITE_SENTRY_DSN=
ARG BUILD_SCRIPT=build

# Set environment variables for Vite build
ENV VITE_VERSION=$VITE_VERSION
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Build the application with TypeScript type checking enabled
# Uses 'build' script which runs: tsc -b && vite build
RUN bun run ${BUILD_SCRIPT}

# ======================== PRODUCTION STAGE ========================
# Uses built app and lightweight server without large dependencies
FROM oven/bun:1.4.2-slim AS production_image

WORKDIR /client

# Copy built files from build stage
COPY --from=build_image /app/dist/ /client/dist/
COPY --from=build_image /app/server.js /client/

# Set ownership and permissions as root
USER root
RUN chown -R bun:bun /client && \
    chmod -R u+rwX /client

# Switch to non-root bun user for security
USER bun

# Add labels
LABEL org.opencontainers.image.licenses="Proprietary"
LABEL org.opencontainers.image.title="Science Projects Frontend"
LABEL org.opencontainers.image.vendor="Department of Biodiversity, Conservation and Attractions"

# Expose port
EXPOSE 3000

# Run the server
CMD ["bun", "run", "server.js"]
