FROM denoland/deno:2.7.12 AS frontend-build
WORKDIR /app/frontend

COPY frontend/deno.json frontend/deno.lock ./
RUN deno install

COPY frontend/src ./src
COPY frontend/dist ./dist
RUN deno bundle src/entry.ts --output dist/dist/app.js --minify

FROM rust:1.88-bookworm AS backend-build
WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y libsqlite3-dev && rm -rf /var/lib/apt/lists/*

COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
  && cargo fetch && rm -rf src

COPY backend/src ./src
COPY backend/migrations ./migrations
RUN cargo build --release --offline

COPY --from=frontend-build /app/frontend/dist ./dist

FROM debian:bookworm-slim AS runtime
WORKDIR /app

# Install Python (for `uv run python`), uv (for the project + venv mgmt),
# ruff (formatter + linter), and ty (type checker). uv is fetched as a
# static binary to keep the image small. ruff and ty come in as uv-managed
# tools per project, so they don't need to be installed globally — but a
# global ruff is handy as a sanity-check during image build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       libsqlite3-0 \
       python3 \
       python3-venv \
       ca-certificates \
       curl \
  && rm -rf /var/lib/apt/lists/* \
  && curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh \
  && mkdir -p /data

COPY --from=backend-build \
  /app/backend/target/release/vemium_backend /usr/local/bin/vemium_backend
COPY --from=backend-build /app/backend/dist ./dist

EXPOSE 8080

CMD ["vemium_backend"]
