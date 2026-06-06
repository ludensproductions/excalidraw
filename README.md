# Excalidraw – Fork ISSIRMAX

Fork de [Excalidraw](https://excalidraw.com) con autenticación de usuarios via **Supabase self-hosted** y dashboard personal de dibujos guardados.

## ¿Qué incluye este fork?

- **Autenticación** (registro / login) con Supabase Auth
- **Dashboard** personal: guarda, carga y gestiona tus dibujos desde cualquier dispositivo
- **Colaboración en tiempo real** a través de WebSockets (`excalidraw-room`)
- **Links de solo lectura**: comparte un tablero colaborativo en modo vista
- **PWA**: instalable como app de escritorio/móvil
- **Supabase self-hosted** con Docker (sin dependencia del CLI de Supabase)

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Docker + Docker Compose | 24+ |

> Para desarrollo local sin Docker también necesitas Node.js 18+ y Yarn 1.22+.

---

## Paso 1 — Configurar variables locales

```bash
cp .env.example .env
```

Luego genera las claves de Supabase:

```bash
node docker/generate-keys.js
```

Copia la salida del script en tu `.env` (sección de secrets de Supabase).  
También copia `ANON_KEY` como `VITE_APP_SUPABASE_ANON_KEY` en `.env`.

### Puertos

| Servicio | URL |
|---|---|
| App | `http://localhost:3000` |
| WebSocket collab | `http://localhost:3002` |
| Supabase API (Kong) | `http://localhost:54321` |
| Supabase Studio | `http://localhost:54321` (auth basic) |
| Supavisor (session) | `localhost:5432` |
| Supavisor (transaction) | `localhost:6543` |
| Mailpit (emails dev) | `http://localhost:8025` |

### Migraciones (aplicadas automáticamente al iniciar la BD)

| Orden | Archivo | Qué crea |
|---|---|---|
| 1 | `supabase/migrations/0001_init.sql` | Tablas `profiles`, `boards`, `share_links`, `collab_rooms` + triggers RLS |
| 2 | `supabase/migrations/0002_shared_boards.sql` | Tablas `shared_boards`, `shared_board_members` + políticas RLS |
| 3 | `supabase/migrations/0003_join_existing_shared_board.sql` | Función RPC `join_existing_shared_board` |
| 4 | `supabase/migrations/0004_collab_storage.sql` | Bucket de Storage `excalidraw-files` + políticas |
| 5 | `supabase/migrations/0005_readonly_member.sql` | Columna `read_only` en miembros + actualiza la función RPC |
| 6 | `supabase/migrations/0006_board_comments.sql` | Tabla `board_comments` + políticas |

> Las variables `VITE_APP_*` se hornean dentro del bundle en tiempo de **build**.  
> Si cambias alguna después de construir, debes reconstruir: `docker compose up -d --build`.

---

## Paso 2 — Levantar la aplicación con Docker

```bash
# Un solo comando levanta todo: Supabase, room server, y la app
docker compose up -d --build
```

Para verificar que todo está corriendo:

```bash
docker compose ps
docker compose logs -f excalidraw
```

Para detener:

```bash
docker compose down
```

### Reconstruir tras cambiar el `.env`

```bash
docker compose up -d --build
```

---

## Paso 3 (opcional) — Usuarios de prueba

Al iniciar por primera vez, se crean automáticamente dos usuarios:

| Email | Contraseña | Rol |
|---|---|---|
| `admin@admin.com` | `12345` | admin |
| `test@test.com` | `12345` | usuario normal |

Para resetear la base de datos:

```bash
yarn supabase:reset
```

---

## Desarrollo local (sin Docker para la app)

```bash
# 1. Instalar dependencias
yarn

# 2. Levantar Supabase y el servidor de collab (WebSocket)
yarn supabase:start
yarn collab:up

# 3. Dev server con hot-reload
yarn start
#  → http://localhost:3000
```

Scripts útiles:

```bash
yarn test:typecheck   # Verificación de tipos TypeScript
yarn build            # Build de producción
yarn fix              # Auto-fix de formato y linting
```

---

## Servicios del stack

| Servicio | Imagen | Rol | ¿Usado por la app? |
|---|---|---|---|
| `db` | `supabase/postgres:15` | PostgreSQL con schemas de auth, storage, API y migraciones de la app. | **Crítico** — toda la persistencia |
| `kong` | `kong:3.9` | API Gateway. Enruta `/auth/v1`, `/rest/v1`, `/storage/v1`. Escucha en `:54321`. | **Crítico** — punto de entrada de la API |
| `auth` | `supabase/gotrue` | GoTrue: registro, login, sesiones JWT, password reset. | **Crítico** — autenticación de usuarios |
| `rest` | `postgrest/postgrest` | PostgREST: API REST automática sobre las tablas de Postgres. | **Crítico** — acceso a datos |
| `room` | `excalidraw/excalidraw-room` | WebSocket (Socket.IO) para colaboración en tiempo real del canvas. | **Crítico** — colaboración |
| `excalidraw` | build local | App servida por nginx en `:3000`. El bundle se genera con Vite. | **Crítico** — el frontend |
| `storage` | `supabase/storage-api` | API de archivos. Bucket `excalidraw-files` para imágenes/binarios en collab. | Sí — subida de archivos |
| `pooler` | `supabase/supavisor` | Pool de conexiones a Postgres en `:5432` (sesión) y `:6543` (transacción). | Sí — gestión de conexiones |
| `mail` | `axllent/mailpit` | Captura emails de desarrollo (confirmación, reset password). UI en `:8025`. | Sí — emails de auth |
| `studio` | `supabase/studio` | Dashboard web para administrar la BD: tablas, usuarios, políticas, storage. | **No** — solo desarrollo |
| `meta` | `supabase/postgres-meta` | API que usa Studio para gestionar Postgres (crear tablas, roles, ejecutar queries). | **No** — solo lo usa Studio |

### Sobre `studio` y `meta`

Estos dos servicios **no son usados directamente por la aplicación**. Su propósito es desarrollo y operaciones:

- **`studio`** es la consola de administración de Supabase. Permite navegar las tablas, editar políticas RLS, gestionar usuarios de auth, ver buckets de storage, ejecutar consultas SQL, y monitorear métricas. Es el equivalente a phpMyAdmin pero para Supabase.

- **`meta`** es el backend que Studio usa para comunicarse con Postgres. Sin `meta`, Studio no puede listar tablas ni ejecutar operaciones de administración.

Si desplegás en producción y no necesitás administración visual, podés eliminar ambos servicios del `docker-compose.yml` sin afectar el funcionamiento de la app. Ocupan ~300 MB de RAM entre los dos. Para desarrollo local es muy recomendable mantenerlos.

### Servicios eliminados

- **`realtime`** (Supabase Realtime): escucha cambios en Postgres vía LISTEN/NOTIFY. La app de Excalidraw usa su propio WebSocket (`excalidraw-room`) para colaboración, no Supabase Realtime. Se eliminó para ahorrar ~200 MB de RAM. Si en el futuro se quisieran features como notificaciones live en el dashboard, se puede reactivar agregando el bloque del servicio al `docker-compose.yml`.

- **`functions`** (Edge Runtime): runtime de Deno para edge functions serverless. La app no usa ninguna edge function. Se eliminó para ahorrar recursos.

---

## Estructura del repositorio

```
excalidraw/
├── excalidraw-app/        # Aplicación web (auth, dashboard, collab)
│   ├── auth/              # Login / registro (Supabase Auth)
│   ├── collab/            # Colaboración en tiempo real (WebSocket)
│   └── data/              # Stores de Supabase (boards, shared boards, etc.)
├── packages/
│   ├── excalidraw/        # Librería React del canvas (@excalidraw/excalidraw)
│   ├── common/            # Utilidades compartidas
│   ├── element/           # Lógica de elementos del canvas
│   └── math/              # Utilidades matemáticas
├── supabase/
│   └── migrations/        # SQL de creación de tablas (fuente original)
├── docker/
│   ├── volumes/           # Config files para Supabase self-hosted
│   │   ├── api/           # Kong gateway (kong.yml, entrypoint)
│   │   ├── db/            # Postgres init scripts (roles, jwt, migrations)
│   │   └── pooler/        # Supavisor config
│   └── generate-keys.js   # Script para generar claves JWT
├── docker-compose.yml     # Orquestación completa: Supabase + app + room
├── Dockerfile             # Build multi-stage de la app
├── .env                   # Variables de entorno (NO subir al repo)
└── .env.example           # Plantilla sin credenciales
```

---

## Notas de seguridad

- `.env` **nunca** debe commitearse — está protegido en `.gitignore`.
- `.env.example` es solo una plantilla, **sin credenciales reales**.
- `VITE_APP_SUPABASE_ANON_KEY` es una clave **pública** diseñada para estar en el frontend; las políticas RLS en Supabase protegen los datos.
- En producción configura `VITE_APP_WS_SERVER_URL` con la URL pública de tu instancia de `excalidraw-room`.
- Para producción real, regenera TODAS las claves (`node docker/generate-keys.js`) y configura HTTPS con un reverse proxy.
- Las contraseñas de los roles de servicio se re-aplican en cada arranque del contenedor `db` a través de un entrypoint wrapper (`excalidraw-db-entrypoint.sh`).
