# Auditoria de entorno, Docker y Supabase

Fecha: 2026-09-24

Objetivo: documentar que variables existen, quien las consume y que decisiones se tomaron para que el entorno sea reproducible sin versionar secretos.

## Reglas de manejo de entorno

- `.env.example` es plantilla sin secretos.
- `.env`, `.env.prod`, `.env.local` y `.env.production` pueden contener credenciales reales; no imprimir valores.
- Las variables `VITE_APP_*` se hornean en el bundle de Vite. Si cambian en produccion, reconstruir con `docker compose up -d --build`.
- Las migraciones SQL deben aplicarse a cada DB persistente; hacer `git pull` no actualiza una base ya levantada.

## Variables principales

| Variable | Consumidor | Requerida local | Requerida prod | Nota |
| --- | --- | --- | --- | --- |
| `COMPOSE_PROFILES` | Compose | Si | Si | `prod` sirve frontend con nginx; `dev` permite Vite local. |
| `EXCALIDRAW_PORT` | Compose | Si | Si | Puerto host del frontend. |
| `EXCALIDRAW_ROOM_PORT` | Compose | Si | Si | Puerto host de `excalidraw-room`. |
| `VITE_APP_PORT` | Vite | Si si se usa `yarn start` | No directo | Puerto del dev server local. |
| `EXCALIDRAW_PUBLIC_URL` | Compose/Auth defaults | Si | Si | URL externa del frontend. |
| `EXCALIDRAW_ROOM_PUBLIC_URL` | Compose frontend build args | Si | Si | URL publica del room server. |
| `SUPABASE_INTERNAL_URL` | Studio/servicios Docker | Si | Si | URL de Kong dentro de la red Docker. |
| `SUPABASE_PUBLIC_URL` | Storage/Studio/frontend | Si | Si | URL publica de la API Supabase. |
| `API_EXTERNAL_URL` | GoTrue | Si | Si | Base publica usada por issuer y links. |
| `SITE_URL` | GoTrue | Si | Si | URL base de redirects auth. |
| `ADDITIONAL_REDIRECT_URLS` | GoTrue | Opcional | Opcional | Allow-list extra para redirects. |
| `POSTGRES_HOST` | Servicios Supabase | Si | Si | Usualmente `db`. |
| `POSTGRES_DB` | Servicios Supabase | Si | Si | Usualmente `postgres`. |
| `POSTGRES_PORT` | Servicios Supabase | Si | Si | Puerto interno PostgreSQL. |
| `POSTGRES_PASSWORD` | DB, PostgREST, Storage, Studio, Pooler | Si | Si | Secreto. |
| `JWT_SECRET` | Auth, PostgREST, Storage, Pooler | Si | Si | Secreto; generar con `docker/generate-keys.js`. |
| `ANON_KEY` | Kong/Studio/Storage | Si | Si | Copiar tambien como `VITE_APP_SUPABASE_ANON_KEY`. |
| `SERVICE_ROLE_KEY` | Kong/Studio/Storage | Si | Si | Secreto de servicio. |
| `VITE_APP_SUPABASE_ANON_KEY` | Frontend | Si | Si | Clave publica anon de Supabase. |
| `VITE_APP_SUPABASE_URL` | Frontend | Si | Si | Puede ser `/` en dev con proxy o URL publica en prod. |
| `VITE_APP_WS_SERVER_URL` | Frontend collab | Si | Si | URL del room server. |
| `VITE_APP_LIBRARY_URL` | Frontend | Opcional | Opcional | Libreria publica de elementos. |
| `VITE_APP_LIBRARY_BACKEND` | Frontend | Opcional | Opcional | Backend de libreria. |
| `VITE_APP_DISABLE_SENTRY` | Frontend Sentry | Si | Si | `true` deshabilita Sentry. |
| `VITE_APP_ENABLE_TRACKING` | Frontend | Opcional | Opcional | Tracking. |
| `VITE_APP_ENABLE_PWA` | Frontend/PWA | Opcional | Opcional | Habilita PWA. |
| `VITE_APP_COLLAPSE_OVERLAY` | Frontend | Opcional | Opcional | Preferencia de UI. |
| `VITE_APP_DISABLE_PREVENT_UNLOAD` | Frontend | Opcional | Opcional | Controla aviso de salida. |
| `VITE_APP_ENABLE_ESLINT` | Vite | Opcional | Opcional | Lint durante dev/build. |
| `VITE_APP_DEV_DISABLE_LIVE_RELOAD` | Vite | Opcional | No | Dev server. |
| `VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX` | Frontend debug | Opcional | No | Debug visual. |
| `VITE_APP_GIT_SHA` | Frontend/Sentry | Opcional | Opcional | Release/build id. |
| `SYSTEM_EMAIL` | GoTrue SMTP | Si | Si | Remitente y usuario SMTP. |
| `EMAIL_APP_KEY` | GoTrue SMTP | Si | Si | Clave de app Gmail; no contrasena normal. |
| `EMAIL_VERIFICATION_TOKEN_EXPIRY_SECONDS` | GoTrue | Si | Si | Expiracion de token email. |
| `EMAIL_VERIFICATION_RESEND_INTERVAL` | GoTrue | Si | Si | Cooldown de reenvio. |
| `EMAIL_RATE_LIMIT_PER_MINUTE` | GoTrue | Si | Si | Limite de emails. |
| `DISABLE_SIGNUP` | GoTrue | Si | Si | Habilita/deshabilita registro. |
| `ENABLE_EMAIL_SIGNUP` | GoTrue | Si | Si | Registro por email. |
| `ENABLE_EMAIL_AUTOCONFIRM` | GoTrue | Si | Si | Confirmacion automatica. |
| `ENABLE_ANONYMOUS_USERS` | GoTrue | Si | Si | Usuarios anonimos. |
| `ENABLE_PHONE_SIGNUP` | GoTrue | Si | Si | Registro por telefono. |
| `ENABLE_PHONE_AUTOCONFIRM` | GoTrue | Si | Si | Confirmacion telefono. |
| `PGRST_DB_SCHEMAS` | PostgREST/Studio | Si | Si | `public,storage,graphql_public`. |
| `PGRST_DB_MAX_ROWS` | PostgREST/Studio | Si | Si | Limite de filas. |
| `PGRST_DB_EXTRA_SEARCH_PATH` | PostgREST/Studio | Si | Si | Search path extra. |
| `POOLER_*` | Supavisor | Si | Si | Configuracion de pool. |
| `STORAGE_*`, `GLOBAL_S3_BUCKET`, `FILE_SIZE_LIMIT` | Storage | Si | Si | Storage local. |
| `S3_PROTOCOL_ACCESS_KEY_ID`, `S3_PROTOCOL_ACCESS_KEY_SECRET` | Storage | Si | Si | Secretos S3 local. |
| `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` | Kong dashboard auth | Si | Si | Basic auth de Studio/Kong. |
| `POSTGRES_IMAGE`, `SUPAVISOR_IMAGE`, `GOTRUE_IMAGE`, `POSTGREST_IMAGE`, `STORAGE_IMAGE`, `POSTGRES_META_IMAGE`, `STUDIO_IMAGE`, `KONG_IMAGE`, `EXCALIDRAW_ROOM_IMAGE` | Compose | Opcional | Opcional | Versiones de imagen. |

## Variables eliminadas

| Variable | Motivo |
| --- | --- |
| Variables comerciales de landing/app/export | Integracion comercial retirada del producto. |

## Servicios Docker

| Servicio | Rol | Decision |
| --- | --- | --- |
| `db` | PostgreSQL con schemas de Supabase y migraciones. | Conservar critico. |
| `pooler` | Supavisor para conexiones. | Conservar. |
| `auth` | GoTrue para auth y recovery. | Conservar critico. |
| `rest` | PostgREST sobre DB. | Conservar critico. |
| `storage` | Storage API para archivos. | Conservar. |
| `meta` | API administrativa usada por Studio. | Conservar para desarrollo/ops. |
| `studio` | UI de administracion. | Conservar para desarrollo/ops. |
| `kong` | Gateway `/auth`, `/rest`, `/storage`. | Conservar critico. |
| `room` | WebSocket de colaboracion. | Conservar critico. |
| `excalidraw` | Frontend construido con Vite y servido por nginx. | Conservar critico. |

## Supabase y migraciones

Migraciones presentes al cierre:

| Rango | Contenido |
| --- | --- |
| `0001` a `0006` | Esquema base, tableros compartidos, storage, read-only y comentarios. |
| `0007` a `0010` | Comentarios compartidos, user management, admin por defecto y nombres duplicados. |
| `0011` | Cierre persistente de tableros compartidos y RPC `close_shared_board`. |
| `0012` | RPC `is_email_registered`. |
| `0013` | Asegura tablas de comentarios. |
| `0014` | Actualiza username de miembro compartido. |
| `0015` | Grants API publicos necesarios para PostgREST/Auth. |

RPCs y tablas criticas observadas:

| Elemento | Consumidor |
| --- | --- |
| `shared_boards` | `excalidraw-app/data/SharedBoardsStore.ts`, `excalidraw-app/data/firebase.ts`. |
| `shared_board_members` | `SharedBoardsStore.ts` y politicas/RPCs de membresia. |
| `join_shared_board` | `SharedBoardsStore.ts`; viene del flujo base de shared boards. |
| `join_existing_shared_board` | `SharedBoardsStore.ts`; une invitados a una sala persistida. |
| `close_shared_board` | `SharedBoardsStore.ts`; invalida links persistidos. |
| `is_email_registered` | `authStore.ts`; validacion de registro/recovery. |

## Revision comercial

La auditoria confirma que la configuracion actual ya no debe incluir variables, URLs ni componentes de la integracion comercial retirada. Si reaparecen, tratarlas como regresion salvo que el producto cambie explicitamente de alcance.
