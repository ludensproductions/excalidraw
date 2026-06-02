FROM --platform=${BUILDPLATFORM} node:24 AS build

WORKDIR /opt/node_app

COPY . .

# ── Build-time env vars (baked into the static bundle by Vite) ────────────────
ARG VITE_APP_PORT=3000
ARG FAST_REFRESH=false
ARG VITE_APP_BACKEND_V2_GET_URL=https://json.excalidraw.com/api/v2/
ARG VITE_APP_BACKEND_V2_POST_URL=https://json.excalidraw.com/api/v2/post/
ARG VITE_APP_LIBRARY_URL=https://libraries.excalidraw.com
ARG VITE_APP_LIBRARY_BACKEND=https://us-central1-excalidraw-room-persistence.cloudfunctions.net/libraries
ARG VITE_APP_WS_SERVER_URL=https://oss-collab.excalidraw.com
ARG VITE_APP_AI_BACKEND=https://oss-ai.excalidraw.com
ARG VITE_APP_FIREBASE_CONFIG={}
ARG VITE_APP_SUPABASE_URL=
ARG VITE_APP_SUPABASE_ANON_KEY=
ARG VITE_APP_DISABLE_SENTRY=true
ARG VITE_APP_ENABLE_TRACKING=false
ARG VITE_APP_ENABLE_PWA=true
ARG VITE_APP_ENABLE_ESLINT=false
ARG VITE_APP_COLLAPSE_OVERLAY=true
ARG VITE_APP_DISABLE_PREVENT_UNLOAD=
ARG VITE_APP_DEV_DISABLE_LIVE_RELOAD=
ARG VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX=false
ARG VITE_APP_GIT_SHA=

# Escribe todas las vars al .env.local (máxima precedencia en Vite),
# sobreescribiendo cualquier valor en .env.production del repo.
RUN env | grep -E '^(VITE_APP_|FAST_REFRESH)' > .env.local

# do not ignore optional dependencies:
# Error: Cannot find module @rollup/rollup-linux-x64-gnu
RUN --mount=type=cache,target=/root/.cache/yarn \
    npm_config_target_arch=${TARGETARCH} yarn --network-timeout 600000

ARG NODE_ENV=production

RUN npm_config_target_arch=${TARGETARCH} yarn build:app:docker

FROM nginx:1.27-alpine

COPY --from=build /opt/node_app/excalidraw-app/build /usr/share/nginx/html

HEALTHCHECK CMD wget -q -O /dev/null http://localhost || exit 1
