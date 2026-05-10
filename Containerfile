FROM denoland/deno:2.7.12 AS frontend-build
WORKDIR /app/frontend

COPY frontend/deno.json frontend/deno.lock ./
RUN deno install

COPY frontend/src ./src
COPY frontend/dist ./dist
RUN deno task bundle

FROM rust:1.91-trixie AS backend-build
WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  libsqlite3-dev libtesseract-dev libleptonica-dev \
  clang cmake \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
  && cargo fetch && rm -rf src

COPY backend/src ./src
COPY backend/migrations ./migrations
RUN cargo build --release --offline

COPY --from=frontend-build /app/frontend/dist ./dist

FROM debian:trixie-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  libsqlite3-0 \
  libtesseract5 tesseract-ocr tesseract-ocr-eng \
  tesseract-ocr-kor tesseract-ocr-osd \
  ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh \
  && useradd -m -u 1000 app \
  && mkdir -p /data \
  && chown 1000:1000 /data

USER 1000
RUN uv python install 3.14

COPY --from=backend-build \
  /app/backend/target/release/vemium_backend /usr/local/bin/vemium_backend
COPY --from=backend-build /app/backend/dist ./dist

EXPOSE 8080

CMD ["vemium_backend"]
