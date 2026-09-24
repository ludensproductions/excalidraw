# Inventario de limpieza del sistema

Fecha: 2026-09-24

Este inventario resume que zonas del repo se consideran necesarias, que se limpio y que no debe borrarse sin evidencia adicional.

## Baseline

| Dato | Valor |
| --- | --- |
| Rama | `main` |
| Ultimo commit base | `ec34d2a28 feat: update confirmation and recovery email templates with correct URL structure` |
| Archivos versionados al baseline | 1291 |
| Carpetas con mas archivos | `packages` 972, `excalidraw-app` 79, `dev-docs` 71, `examples` 38, `public` 26, `scripts` 20, `supabase` 18, `.github` 16, `docker` 16 |

## Inventario por zona

| Ruta | Categoria | Razon para conservar | Riesgo si se elimina | Accion tomada/propuesta | Evidencia |
| --- | --- | --- | --- | --- | --- |
| `excalidraw-app/` | core | App propia: dashboard, auth, editor, colaboracion, Supabase, Sentry/PWA. | Rompe el producto principal. | Conservar; limpiar solo codigo probado como muerto. | `rg` de consumidores y pruebas `yarn test:app --watch=false`. |
| `excalidraw-app/components/` | core UI | Contiene pantallas y controles del fork. | Regresiones visibles en dashboard/editor. | Conservar; se eliminaron solo componentes comerciales sin referencias. | Busquedas finales sin referencias comerciales retiradas. |
| `excalidraw-app/data/` | core datos | Stores de Supabase para tableros privados y compartidos. | Perdida de guardado, autoguardado o membresia. | Conservar; cambios pequenos validados en pruebas. | `SharedBoardsStore.ts` y tests de regresion. |
| `excalidraw-app/auth/` | core auth | Registro, login, recovery y validaciones. | Usuarios sin acceso o links de recovery rotos. | Conservar. | Tests focales de auth y typecheck. |
| `excalidraw-app/collab/` | core colaboracion | Socket.IO y entrada/salida de salas. | Rompe sincronizacion viva o permisos de invitado. | Conservar. | Suite app completa y matriz de permisos. |
| `packages/excalidraw/` | core upstream | Canvas, UI base, locales, acciones y tests del paquete. | Regresiones amplias en editor/export/import. | Conservar; tocar solo referencias de Plus y limpiezas puntuales. | Suite app completa y build. |
| `packages/common/`, `packages/element/`, `packages/math/`, `packages/utils/`, `packages/fractional-indexing/` | core compartido | APIs internas usadas por paquetes y app. | Fallos de compilacion o comportamiento del canvas. | Conservar; cambios minimos. | `yarn test:typecheck`, `yarn test:code`. |
| `packages/excalidraw/locales/*.json` | i18n | Textos visibles del paquete. | UI incompleta o claves faltantes. | Conservar; eliminar claves y textos comerciales retirados. | Parser JSON + `yarn test:other`. |
| `supabase/migrations/` | infra DB | Fuente de verdad del esquema persistente. | DB nueva o persistente queda incompleta. | Conservar todas las migraciones; no compactar. | Migraciones `0001` a `0015` presentes. |
| `docker/` | infra | Kong, GoTrue, PostgREST, Storage, Pooler, plantillas email. | Stack local/produccion no levanta. | Conservar. | Auditoria en `docs/env-docker-supabase-audit.md`. |
| `docker-compose.yml` | infra | Orquesta Supabase, room y frontend. | Entorno irreproducible. | Conservar; mantener alineado con `.env.example`. | Cruce de variables con `.env.example`. |
| `Dockerfile` | infra build | Build multi-stage de la app. | No hay imagen frontend reproducible. | Conservar; sin args de Plus. | `yarn build:app` paso. |
| `.env.example` | config | Plantilla sin secretos para local/prod. | Onboarding roto o variables fantasma. | Conservar; alinear con consumidores reales. | Busqueda de `VITE_APP_*`, Compose y Dockerfile. |
| `.env`, `.env.prod`, `.env.local`, `.env.production` | local/secrets | Credenciales y valores privados del entorno. | Filtracion de secretos o entorno roto. | No versionar, no imprimir valores, no borrar. | Revision segura de nombres, no valores. |
| `README.md` | docs onboarding | Guia para levantar el sistema. | Nuevos entornos fallan. | Conservar; actualizar solo cuando cambian puertos, Docker, scripts o variables. | Parte 10 confirma cambios de onboarding. |
| `docs/` | docs operativos | Plan, inventario, resultados y permisos. | Se pierde contexto para mantenimiento. | Conservar y mantener cerca del codigo afectado. | Este archivo y `cleanup-results.md`. |
| `docs/board-menu-permissions.md` | docs arquitectura | Matriz de permisos del menu lateral. | Futuras ediciones pueden reabrir bugs de invitados/owner. | Conservar; actualizar si cambian permisos. | No hubo cambios de permisos en parte 10. |
| `public/` | assets runtime | Assets servidos por la app/PWA. | Iconos, manifest o assets faltantes. | Conservar. | Build de app. |
| `scripts/` | tooling | Locales, release, build package y utilidades. | CI/dev tooling roto. | Conservar. | `yarn test:code` y busquedas de uso. |
| `examples/` | examples/dev-docs | Ejemplos versionados de upstream. | Puede romper documentacion o demos. | Conservar salvo decision explicita de producto. | No se borro por intuicion. |
| `dev-docs/` | examples/dev-docs | Documentacion tecnica versionada. | Perdida de docs upstream/locales. | Conservar; se retiro solo nav/footer comercial externo. | Busqueda final sin referencias comerciales retiradas. |
| `.github/` | CI/comunidad | Flujos, plantillas y metadata. | Automatizaciones/documentacion rotas. | Conservar. | No fue objetivo de limpieza. |
| `node_modules/`, `coverage/`, `excalidraw-app/build/`, `**/dist`, `**/build` | local/generated | Artefactos regenerables. | Ocupan espacio o ensucian revision. | Limpiar localmente cuando aparezcan; no versionar. | `excalidraw-app/build` eliminado tras build. |

## Archivos versionados removidos con evidencia

| Ruta | Motivo | Evidencia |
| --- | --- | --- |
| Tres componentes comerciales retirados | Integracion comercial eliminada del producto. | Sin imports/referencias despues de limpieza; typecheck, app tests y build pasaron. |
| `packages/excalidraw/tests/__snapshots__/MobileMenu.test.tsx.snap` | Snapshot huerfano con contenido de Plus, sin test propietario actual. | Suite focal y completa pasaron despues de eliminarlo. |
| `packages/excalidraw/tests/packages/__snapshots__/excalidraw.test.tsx.snap` | Snapshot huerfano duplicado con contenido de Plus. | Suite focal y completa pasaron despues de eliminarlo. |

## Elementos conservados intencionalmente

| Elemento | Decision | Razon |
| --- | --- | --- |
| MIME tecnico de archivos `.excalidraw` | Conservar | Es necesario para import/export y payloads SVG embebidos. No representa una integracion comercial. Quitar esto rompe compatibilidad. |
| Icono generico de agregar | Conservar | Es un icono de UI usado por la libreria, no una marca comercial retirada. |
| Migraciones antiguas | Conservar | Entornos persistentes pueden necesitarlas para reproducir el esquema sin reset destructivo. |
| `studio` y `meta` en Docker | Conservar | No son runtime directo de la app, pero son utiles para administracion/desarrollo y estan documentados. |

## Candidatos aplazados

| Area | Motivo de aplazamiento | Proxima accion segura |
| --- | --- | --- |
| `examples/` y `dev-docs/` | Son versionados y pueden servir para docs/desarrollo; no hay decision de producto para removerlos. | Hacer revision separada si se busca reducir tamano del repo. |
| Suite manual de navegador | Requiere entorno levantado y usuarios reales. | Validar auth, dashboard, editor y colaboracion en navegador antes de deploy. |
| Migraciones ya aplicadas en produccion | El repo no prueba estado de una DB persistente. | Aplicar/confirmar migraciones en cada DB objetivo y recargar PostgREST si aplica. |
