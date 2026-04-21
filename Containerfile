FROM denoland/deno:2.7.12 AS frontend-build
WORKDIR /app/frontend

COPY frontend/deno.json frontend/deno.lock ./
COPY frontend/src ./src
COPY frontend/dist ./dist

RUN deno bundle src/entry.ts --output dist/dist/app.js --minify

FROM rust:1.88-bookworm AS backend-build
WORKDIR /app/backend

COPY backend/Cargo.toml ./Cargo.toml
COPY backend/src ./src
COPY --from=frontend-build /app/frontend/dist ./dist

RUN cargo build --release

FROM debian:bookworm-slim AS runtime
WORKDIR /app

COPY --from=backend-build /app/backend/target/release/vemium_backend /usr/local/bin/vemium_backend
COPY --from=backend-build /app/backend/dist ./dist

EXPOSE 8080

CMD ["vemium_backend"]
