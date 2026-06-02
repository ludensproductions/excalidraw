# Excalidraw – Fork ISSIRMAX

Fork de [Excalidraw](https://excalidraw.com) con autenticación de usuarios via **Supabase** y dashboard personal de dibujos guardados.

## ¿Qué es este proyecto?

Pizarrón virtual de estilo dibujado a mano, colaborativo y cifrado de extremo a extremo. Esta versión añade:

- **Autenticación** (registro / login) con Supabase Auth
- **Dashboard** personal: guarda, carga y gestiona tus dibujos desde cualquier dispositivo
- **Colaboración en tiempo real** a través de WebSockets (`excalidraw-room`)
- **IA integrada** para convertir wireframes en código
- **PWA**: instalable como app de escritorio/móvil

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 18+ |
| Yarn | 1.22+ |
| Docker + Docker Compose | cualquier versión reciente |
| Cuenta Supabase | gratuita |
| Proyecto Firebase | gratuito (Spark) |

---

## Configuración del entorno

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```

2. Rellena las variables obligatorias (ver tabla abajo).

3. **Nunca** subas `.env` al repositorio — está en `.gitignore`.

### Variables obligatorias

| Variable | Descripción | Cómo obtenerla |
|---|---|---|
| `VITE_APP_SUPABASE_URL` | URL de tu proyecto Supabase | Supabase Dashboard → Settings → API |
| `VITE_APP_SUPABASE_ANON_KEY` | Clave anon pública de Supabase | Supabase Dashboard → Settings → API |
| `VITE_APP_FIREBASE_CONFIG` | JSON de configuración Firebase | Firebase Console → Project Settings → Your apps |
| `VITE_APP_WS_SERVER_URL` | URL del servidor de colaboración WebSocket | `http://localhost:3002` en local |

### Variables opcionales relevantes

| Variable | Default | Descripción |
|---|---|---|
| `NODE_ENV` | `production` | Modo de build de Node |
| `VITE_APP_PORT` | `3000` | Puerto del dev server de Vite |
| `FAST_REFRESH` | `false` | Fast Refresh de React en dev |
| `VITE_APP_BACKEND_V2_GET_URL` | URL pública excalidraw.com | Endpoint GET para escenas compartidas |
| `VITE_APP_BACKEND_V2_POST_URL` | URL pública excalidraw.com | Endpoint POST para escenas compartidas |
| `VITE_APP_AI_BACKEND` | URL pública excalidraw.com | Backend de IA (wireframes → código) |
| `VITE_APP_DISABLE_SENTRY` | `true` | Desactiva reporte de errores a Sentry |
| `VITE_APP_ENABLE_TRACKING` | `false` | Desactiva telemetría de uso |
| `VITE_APP_ENABLE_PWA` | `true` | Habilita service worker e instalación PWA |
| `VITE_APP_PLUS_LP` / `VITE_APP_PLUS_APP` | vacío | Solo si integras con Excalidraw+; dejar vacío en self-hosted |

> **Importante:** las variables `VITE_APP_*` se **hornean en el bundle** en tiempo de build. Cambiarlas después de construir no tiene efecto; hay que reconstruir.

---

## Desarrollo local

```bash
# 1. Instalar dependencias
yarn

# 2. Levantar el servidor de colaboración (WebSocket) con Docker
docker compose up -d excalidraw-room

# 3. Arrancar el dev server (hot-reload)
yarn start
#  → http://localhost:3000
```

### Scripts útiles

```bash
yarn test:typecheck   # Verificación de tipos TypeScript
yarn test:app         # Ejecutar tests con Vitest
yarn test:update      # Ejecutar tests y actualizar snapshots
yarn fix              # Auto-fix de formato y linting
yarn build            # Build de producción de la app
```

---

## Ejecución con Docker (producción)

Asegúrate de que `.env` tiene todos los valores correctos (especialmente las de Supabase y Firebase).

```bash
# Construir imagen y levantar todos los servicios
docker compose up --build

#  → App en http://localhost:3000
#  → Servidor de collab en http://localhost:3002
```

Para reconstruir solo la app tras cambiar variables del `.env`:

```bash
docker compose up --build excalidraw
```

Para gestionar solo el servidor de colaboración:

```bash
yarn collab:up     # iniciar
yarn collab:down   # parar
yarn collab:logs   # ver logs
```

---

## Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Copia `VITE_APP_SUPABASE_URL` y `VITE_APP_SUPABASE_ANON_KEY` desde **Settings → API**.
3. Aplica las migraciones de la base de datos:
   ```bash
   # Con Supabase CLI instalado
   supabase db push
   ```
   O ejecuta manualmente los archivos en `supabase/migrations/`.
4. Habilita los providers de autenticación que necesites en **Authentication → Providers**.

---

## Configurar Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com).
2. Agrega una **Web App** y copia el objeto de configuración.
3. Pega el JSON (en una sola línea) en `VITE_APP_FIREBASE_CONFIG`:
   ```
   VITE_APP_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"...",...}
   ```
4. Habilita **Firestore Database** y **Storage** en tu proyecto Firebase.

---

## Estructura del monorepo

```
excalidraw/
├── excalidraw-app/     # Aplicación web completa (excalidraw.com / este fork)
│   ├── auth/           # Páginas y store de autenticación (Supabase)
│   ├── collab/         # Colaboración en tiempo real (WebSocket)
│   └── components/     # Componentes de la app (AI, menús, sidebar…)
├── packages/
│   ├── excalidraw/     # Librería React publicada en npm (@excalidraw/excalidraw)
│   ├── common/         # Utilidades compartidas
│   ├── element/        # Lógica de elementos del canvas
│   ├── math/           # Utilidades matemáticas (Point, vectores…)
│   └── utils/          # Helpers genéricos
├── supabase/           # Migraciones y configuración de Supabase
├── docker-compose.yml  # Orquestación Docker (app + excalidraw-room)
├── Dockerfile          # Build multi-stage de la app
└── .env                # Variables de entorno (no subir al repo)
```

---

## Notas de seguridad

- El archivo `.env` **nunca** debe commitearse. Está en `.gitignore`.
- `VITE_APP_SUPABASE_ANON_KEY` es una clave pública segura (solo acceso anon RLS).
- `VITE_APP_FIREBASE_CONFIG` contiene claves públicas protegidas por reglas de Firestore/Storage.
- En producción, asegúrate de configurar las **Row Level Security (RLS)** policies en Supabase.
