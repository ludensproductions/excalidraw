# Excalidraw – Fork ISSIRMAX

Fork de [Excalidraw](https://excalidraw.com) con autenticación de usuarios via **Supabase** y dashboard personal de dibujos guardados.

## ¿Qué incluye este fork?

- **Autenticación** (registro / login) con Supabase Auth
- **Dashboard** personal: guarda, carga y gestiona tus dibujos desde cualquier dispositivo
- **Colaboración en tiempo real** a través de WebSockets (`excalidraw-room`)
- **Links de solo lectura**: comparte un tablero colaborativo en modo vista
- **PWA**: instalable como app de escritorio/móvil

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Docker + Docker Compose | 24+ |
| Cuenta Supabase | gratuita en [supabase.com](https://supabase.com) |

> Para desarrollo local sin Docker también necesitas Node.js 18+ y Yarn 1.22+.

---

## Paso 1 — Crear y configurar la base de datos en Supabase

### 1.1 Crear el proyecto

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto nuevo.
2. Elige región, dale un nombre y establece una contraseña de base de datos (guárdala).
3. Espera a que el proyecto termine de inicializarse (~1 min).

### 1.2 Obtener las credenciales

En el dashboard de Supabase ve a **Settings → API** y copia:

| Campo | Donde usarlo en `.env` |
|---|---|
| **Project URL** | `VITE_APP_SUPABASE_URL` |
| **anon / public key** | `VITE_APP_SUPABASE_ANON_KEY` |

### 1.3 Aplicar las migraciones (crear todas las tablas)

Ve a **SQL Editor → New query**, pega el contenido de cada archivo en orden y ejecútalo con **Run**:

| Orden | Archivo | Qué crea |
|---|---|---|
| 1 | `supabase/migrations/0001_init.sql` | Tablas `profiles`, `boards`, `share_links`, `collab_rooms` + triggers RLS |
| 2 | `supabase/migrations/0002_shared_boards.sql` | Tablas `shared_boards`, `shared_board_members` + políticas RLS |
| 3 | `supabase/migrations/0003_join_existing_shared_board.sql` | Función RPC `join_existing_shared_board` |
| 4 | `supabase/migrations/0004_collab_storage.sql` | Bucket de Storage `excalidraw-files` + políticas |
| 5 | `supabase/migrations/0005_readonly_member.sql` | Columna `read_only` en miembros + actualiza la función RPC |

> Ejecuta los 5 en orden. Cada uno es idempotente (`CREATE IF NOT EXISTS`, `DROP IF EXISTS`) — si necesitas re-ejecutar alguno no romperá nada.

### 1.4 Habilitar autenticación por email

En Supabase ve a **Authentication → Providers → Email** y asegúrate de que esté habilitado.  
Si no quieres confirmación por correo en desarrollo, desactiva **"Confirm email"** en esa misma pantalla.

---

## Paso 2 — Configurar el archivo `.env`

El `.env` **no está en el repositorio** (está en `.gitignore`). Las credenciales te las pasará el responsable del proyecto de forma segura.

Una vez que tengas el archivo `.env`, colócalo en la raíz del repositorio (junto a `docker-compose.yml`).

Las únicas variables que tú necesitas completar/verificar son:

```env
VITE_APP_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_APP_SUPABASE_ANON_KEY=<anon-key-del-paso-1.2>
VITE_APP_WS_SERVER_URL=http://localhost:3002   # en local
```

> Las variables `VITE_APP_*` se hornean dentro del bundle en tiempo de **build**.  
> Si cambias alguna después de construir, debes reconstruir la imagen: `docker compose up -d --build excalidraw`.

---

## Paso 3 — Levantar la aplicación con Docker

```bash
# Primera vez (descarga imágenes, compila la app, levanta todo)
docker compose up -d --build

# La app queda disponible en:
#   http://localhost:3000   →  aplicación web
#   http://localhost:3002   →  servidor de colaboración WebSocket
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
docker compose up -d --build excalidraw
```

---

## Paso 4 (opcional) — Usuarios de prueba

Si quieres crear usuarios de prueba ejecuta el archivo `supabase/seed.sql` en **SQL Editor → New query** del dashboard de Supabase.

Crea dos usuarios:

| Email | Contraseña | Rol |
|---|---|---|
| `admin@admin.com` | `12345` | admin |
| `test@test.com` | `12345` | usuario normal |

---

## Desarrollo local (sin Docker)

```bash
# 1. Instalar dependencias
yarn

# 2. Levantar solo el servidor de collab (WebSocket)
docker compose up -d excalidraw-room

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
│   └── migrations/        # SQL de creación de tablas (aplicar en orden)
├── docker-compose.yml     # Orquestación: app + excalidraw-room
├── Dockerfile             # Build multi-stage de la app
└── .env                   # Variables de entorno (NO subir al repo)
```

---

## Notas de seguridad

- `.env` **nunca** debe commitearse — está protegido en `.gitignore`.
- `VITE_APP_SUPABASE_ANON_KEY` es una clave **pública** diseñada para estar en el frontend; las políticas RLS en Supabase protegen los datos.
- En producción configura `VITE_APP_WS_SERVER_URL` con la URL pública de tu instancia de `excalidraw-room`.
