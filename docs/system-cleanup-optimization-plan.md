# Plan de limpieza y optimizacion del sistema

Fecha: 2026-09-24

Este documento es una guia operativa para limpiar, ordenar y optimizar este fork de Excalidraw sin romper los flujos propios del sistema. Esta pensado para que un chat de IA lo use como referencia y aplique el trabajo por partes, con evidencia antes de borrar o refactorizar.

## Objetivo

Dejar el sistema con solo archivos necesarios, menos deuda tecnica, configuracion coherente, pruebas confiables y codigo mas facil de mantener.

El resultado esperado no es "borrar mucho". El resultado esperado es que cada archivo conservado tenga una razon clara, cada archivo eliminado este probado como innecesario, y cada cambio importante mantenga funcionando dashboard, editor, autenticacion, colaboracion, guardado, Supabase y Docker.

## Reglas para cualquier IA que aplique este plan

- Trabajar por una fase a la vez. No mezclar limpieza de archivos, refactor funcional y cambios visuales en el mismo bloque.
- Antes de tocar archivos, ejecutar `git status --short` y registrar que cambios ya existian.
- No hacer `git reset --hard`, `git checkout --`, `git clean -fdx` ni borrados masivos.
- No commitear ni stagear cambios salvo que el usuario lo pida explicitamente.
- No imprimir secretos de `.env`, `.env.prod` ni claves reales. Solo verificar nombres de variables y archivos consumidores.
- No borrar archivos versionados solo porque "parecen ejemplos". En este repo `examples/`, `dev-docs/`, `packages/`, `docker/` y `supabase/` son parte del arbol versionado.
- Para borrar un archivo versionado, primero demostrar: no hay imports, no hay referencias en configs/scripts/docs, no es asset publico, no es migracion necesaria, no afecta build/tests.
- Para archivos ignorados/locales, primero usar vista previa. Preferir `git clean -Xdn` antes de cualquier limpieza real.
- Mantener las reglas de negocio existentes. En este fork son criticos los permisos de tablero, el autoguardado, la separacion entre tablero privado y compartido, el cierre de colaboracion, la recuperacion de password, los emails de GoTrue y las migraciones de Supabase.
- Cada fase debe terminar con validacion y una nota corta de "hecho", "pendiente" o "bloqueado".

## Mapa actual del repo

Usar este mapa como punto de partida, pero volver a verificarlo antes de ejecutar cambios:

- `excalidraw-app/`: aplicacion propia. Contiene rutas, dashboard, editor, auth, colaboracion, stores, hooks, permisos, estilos y tests especificos del sistema.
- `packages/excalidraw/`: nucleo de Excalidraw. Tocar con cuidado porque tiene mucha logica upstream.
- `packages/element/`, `packages/common/`, `packages/math/`, `packages/utils/`, `packages/fractional-indexing/`: paquetes compartidos del monorepo.
- `supabase/`: migraciones y seed del esquema. No borrar migraciones antiguas si un entorno podria necesitarlas.
- `docker/` y `docker-compose.yml`: infraestructura local/produccion, GoTrue, PostgREST, Kong, storage y `excalidraw-room`.
- `public/`: assets servidos por la app.
- `scripts/`: scripts de build, releases, locales y utilidades.
- `examples/` y `dev-docs/`: ejemplos/documentacion versionados. Revisar si el producto los necesita antes de removerlos.
- `docs/`: documentacion operativa del fork.

## Invariantes que no se deben romper

- `excalidraw-app/index.tsx` define el flujo de entrada entre dashboard y editor.
- `Dashboard.tsx` es la pantalla real de inicio/tableros para usuarios autenticados.
- `dashboardState`, `useAutoSaveBoard`, `useSaveBoard`, `DrawingsStore` y `SharedBoardsStore` forman el flujo de guardado/reapertura.
- `shared_boards` y `shared_board_members` controlan publicacion, membresia y validez de enlaces compartidos.
- Socket.IO y `excalidraw-room` controlan sincronizacion viva del canvas.
- Un invitado colaborador no debe crear ni renombrar una copia privada accidental del tablero del host.
- Un tablero compartido cerrado debe invalidar el reingreso por link persistido, no solo cerrar el socket actual.
- `excalidraw-app/permissions/boardMenuPermissions.ts` es la matriz central del menu lateral.
- Las migraciones de Supabase deben aplicarse en DB persistente; traer SQL por `git pull` no basta.
- Las variables `VITE_APP_*` se hornean en build. Cambiarlas requiere rebuild del frontend de produccion.

## Parte 0 - Preparacion y baseline

Objetivo: saber exactamente desde donde se parte.

Comandos sugeridos:

```powershell
git status --short
git branch --show-current
git log -1 --oneline
git ls-files | Measure-Object
git ls-files | ForEach-Object { ($_ -split '[\\/]')[0] } | Group-Object | Sort-Object Count -Descending
```

Entregables:

- Lista de cambios previos que no pertenecen a la limpieza.
- Rama actual y ultimo commit.
- Conteo de archivos versionados por carpeta.
- Nota de riesgos visibles antes de empezar.

Criterio de avance:

- No hay dudas sobre que cambios son previos y cuales hara la IA.

## ~~Parte 1 - Inventario de archivos y clasificacion~~

Estado: hecho. Resultado registrado en `docs/cleanup-inventory.md`.

Objetivo: crear un inventario claro antes de borrar o mover.

Pasos:

1. Listar archivos versionados por carpeta con `git ls-files`.
2. Listar archivos no versionados con `git status --short`.
3. Listar ignorados que podrian limpiarse localmente con `git clean -Xdn`.
4. Detectar builds y artefactos locales sin usar expresiones ingenuas que confundan nombres como `distribute` con `dist`.
5. Clasificar cada zona como:
   - `core`: necesario para app/runtime.
   - `infra`: Docker, Supabase, CI, config.
   - `tests`: validacion automatica.
   - `docs`: documentacion necesaria.
   - `examples/dev-docs`: conservar solo si el producto lo necesita.
   - `local/generated`: limpiar localmente, no versionar.
   - `candidato a remover`: requiere prueba adicional.

Comandos utiles:

```powershell
git status --short
git clean -Xdn
rg --files
rg --files docs excalidraw-app packages docker supabase scripts public
```

Entregable:

- Crear o actualizar `docs/cleanup-inventory.md` con tabla:
  - ruta
  - categoria
  - razon para conservar
  - riesgo si se elimina
  - accion propuesta
  - evidencia

Criterio de avance:

- Ningun borrado versionado se aprueba sin estar en el inventario.

## ~~Parte 2 - Limpieza local segura~~

Estado: hecho. Resultado registrado en `docs/cleanup-results.md`.

Objetivo: retirar basura local sin cambiar el producto.

Candidatos tipicos:

- `node_modules/`
- `excalidraw-app/build/`
- `excalidraw-app/dist/`
- `excalidraw-app/dev-dist/`
- `packages/*/dist`
- `packages/*/build`
- `examples/*/build`
- `examples/*/dist`
- `coverage/`
- `*.log`
- caches locales ignoradas

Pasos:

1. Ejecutar vista previa:

```powershell
git clean -Xdn
```

2. Si solo aparecen artefactos esperados, usar scripts existentes:

```powershell
yarn rm:build
```

3. Solo si hace falta reinstalacion limpia:

```powershell
yarn clean-install
```

4. No borrar `.env`, `.env.prod` ni archivos de credenciales locales.

Entregable:

- Lista de artefactos removidos localmente.
- Confirmacion de que `git status --short` no muestra borrados versionados inesperados.

Criterio de avance:

- El repo queda sin basura local relevante y sin tocar archivos necesarios.

## ~~Parte 3 - Higiene de configuracion y dependencias~~

Estado: hecho. Resultado registrado en `docs/cleanup-results.md`.

Objetivo: que scripts, dependencias y configuracion reflejen lo que realmente usa el sistema.

Pasos:

1. Auditar `package.json` raiz y `excalidraw-app/package.json`.
2. Confirmar que no existe `package-lock.json` ni lockfiles duplicados que contradigan `yarn.lock`.
3. Revisar dependencias candidatas a remover con evidencia:
   - buscar imports con `rg "from \"paquete\"|from 'paquete'|require\\("`.
   - revisar uso indirecto en Vite, scripts, tests y configs.
   - correr typecheck/tests despues de cualquier eliminacion.
4. Revisar scripts redundantes, pero conservar aliases utiles para Docker/Supabase si los usa README.
5. Verificar que `.gitignore`, `.dockerignore`, `.eslintignore` y `.prettierignore` cubren artefactos reales sin ocultar archivos necesarios.

Comandos utiles:

```powershell
yarn install --frozen-lockfile
yarn test:typecheck
yarn test:code
yarn test:other
```

Entregable:

- Tabla de dependencias:
  - paquete
  - usado por
  - decision
  - prueba ejecutada

Criterio de avance:

- No quedan dependencias removidas "por intuicion".
- El lockfile queda coherente.

## ~~Parte 4 - Auditoria de entorno, Docker y Supabase~~

Estado: hecho. Resultado registrado en `docs/env-docker-supabase-audit.md` y `docs/cleanup-results.md`.

Objetivo: que la infraestructura sea reproducible y no dependa de conocimiento oculto.

Pasos:

1. Cruzar `.env.example` contra:
   - `docker-compose.yml`
   - `Dockerfile`
   - `excalidraw-app/vite.config.mts`
   - codigo que lee `import.meta.env`
   - README
2. Confirmar que `.env.example` contiene lo necesario, ni de mas ni de menos.
3. Confirmar que `.env` y `.env.prod` siguen ignorados y no se versionan.
4. Revisar migraciones en `supabase/migrations/`.
5. Para cambios de DB, documentar siempre:
   - SQL aplicado
   - entorno
   - si PostgREST necesita recarga de schema
   - si se reinicio `rest`
6. Validar que `close_shared_board` y otras RPC usadas por frontend existen en migraciones y en la DB objetivo.

Comandos utiles:

```powershell
rg -n "import.meta.env|VITE_APP_|SUPABASE|POSTGRES|GOTRUE|SMTP|PASSWORD_RECOVERY" excalidraw-app docker-compose.yml Dockerfile README.md .env.example
rg -n "rpc\\(|close_shared_board|join_existing_shared_board|is_email_registered" excalidraw-app supabase
docker compose ps
```

Entregable:

- Matriz de variables:
  - variable
  - consumidor
  - requerida en local
  - requerida en produccion
  - valor seguro en `.env.example`

Criterio de avance:

- Un nuevo entorno puede levantarse siguiendo README sin depender de secretos versionados.

## ~~Parte 5 - Limpieza de codigo de aplicacion~~

Estado: hecho. Resultado registrado en `docs/cleanup-results.md`.

Objetivo: reducir complejidad en `excalidraw-app/` sin alterar comportamiento.

Orden recomendado:

1. `auth/`
   - mantener validaciones centralizadas en `authValidation.ts`.
   - conservar login password sin restricciones que rompan credenciales existentes.
   - probar registro, login, recuperacion y cambio de password.
2. `data/`
   - revisar duplicacion entre stores.
   - centralizar acceso a Supabase.
   - no mezclar persistencia privada (`boards`) con tablero compartido (`shared_boards`).
3. `hooks/`
   - revisar `useAutoSaveBoard` y `useSaveBoard`.
   - eliminar estado global cruzado si puede filtrar identidad entre sesiones.
   - cubrir con tests antes de refactorizar.
4. `collab/`
   - separar claramente Socket.IO, validacion persistida de sala y salida/cierre.
   - no autorizar entrada solo por hash de URL.
5. `components/`
   - extraer componentes grandes solo cuando reduzca complejidad real.
   - mover textos visibles a locales cuando aplique.
   - evitar duplicar logica de permisos en JSX.
6. `permissions/`
   - mantener `boardMenuPermissions.ts` como fuente de verdad.
   - extender tests si se agregan roles/acciones.

Comandos utiles:

```powershell
rg -n "dashboardState|useAutoSaveBoard|useSaveBoard|SharedBoardsStore|DrawingsStore|boardMenuPermissions" excalidraw-app
rg -n "console\\.log|debugger|TODO|FIXME|@ts-ignore|eslint-disable" excalidraw-app
yarn test:app excalidraw-app/tests/useAutoSaveBoard.test.ts --watch=false
yarn test:app excalidraw-app/tests/boardMenuPermissions.test.ts --watch=false
yarn test:app excalidraw-app/tests/authValidation.test.ts --watch=false
```

Entregable:

- Lista de refactors pequenos aplicados.
- Para cada refactor: archivo, razon, comportamiento protegido, prueba.

Criterio de avance:

- El codigo queda mas claro y las pruebas criticas siguen pasando.

## ~~Parte 6 - Limpieza de paquetes compartidos~~

Estado: hecho. Resultado registrado en `docs/cleanup-results.md`.

Objetivo: tocar `packages/` solo donde haya beneficio claro.

Reglas:

- Distinguir codigo propio del fork vs codigo upstream de Excalidraw.
- No limpiar todos los `TODO/FIXME` de upstream como objetivo principal.
- Priorizar imports muertos, archivos generados accidentales, tests rotos o APIs realmente no usadas por la app.
- Evitar refactors amplios de canvas, renderer, history, bounds, text, fonts o store sin pruebas especificas.

Pasos:

1. Inventariar exports usados por `excalidraw-app/`.
2. Detectar duplicacion local que pueda moverse a `packages/common` solo si ya hay patron existente.
3. Mantener cambios pequenos y medibles.
4. Correr tests del paquete tocado.

Comandos utiles:

```powershell
rg -n "from \"@excalidraw|from '@excalidraw" excalidraw-app packages
yarn test:typecheck
yarn test:app --watch=false
```

Entregable:

- Decision explicita por paquete: sin cambios, limpieza menor o refactor necesario.

Criterio de avance:

- No se introduce deuda por "ordenar" codigo estable sin necesidad.

## ~~Parte 7 - Limpieza visual, estilos e i18n~~

Estado: hecho. Resultado registrado en `docs/cleanup-results.md`.

Objetivo: dejar UI consistente y textos mantenibles.

Pasos:

1. Revisar estilos propios:
   - `excalidraw-app/components/Dashboard.scss`
   - `excalidraw-app/components/BoardSaveButton.scss`
   - `excalidraw-app/appDialog.scss`
   - estilos de auth, share y comentarios.
2. Buscar clases muertas con `rg` antes de eliminarlas.
3. Evitar cambios visuales grandes en limpieza tecnica salvo que corrijan deuda real.
4. Mover textos repetidos a locales cuando aplique.
5. Revisar `packages/excalidraw/locales/es-ES.json` y textos propios fuera del paquete.
6. Verificar responsive en dashboard/editor si se toca CSS.

Comandos utiles:

```powershell
rg -n "className=|dashboard__|board-save|appDialog|ShareDialog|CommentsPanel" excalidraw-app
rg -n "\"app\\.|app\\." excalidraw-app packages/excalidraw/locales
```

Entregable:

- Lista de clases eliminadas/consolidadas con evidencia de no uso.
- Lista de textos movidos o normalizados.

Criterio de avance:

- No hay regresiones visibles en dashboard, editor, dialogs, menu lateral ni colaboracion.

## ~~Parte 8 - Optimizacion de rendimiento~~

Estado: hecho. Resultado registrado en `docs/cleanup-results.md`.

Objetivo: mejorar rendimiento con medicion, no con suposiciones.

Areas a medir:

- Build de produccion y tamano de chunks.
- Carga inicial de dashboard.
- Entrada al editor.
- Guardado/autoguardado.
- Reapertura de tableros.
- Colaboracion viva con Socket.IO.
- Consultas Supabase repetidas.

Pasos:

1. Ejecutar build base y guardar resultado.
2. Identificar imports pesados y chunks grandes.
3. Revisar componentes que renderizan listas de tableros o miembros.
4. Evitar `memo`, `useMemo` o `useCallback` cosmeticos sin evidencia.
5. Optimizar consultas y estados duplicados antes que micro-optimizaciones.
6. Validar que PWA/Sentry/tracking se configuran segun entorno.

Comandos utiles:

```powershell
yarn build:app
rg -n "useMemo|useCallback|memo\\(|supabase\\.from|rpc\\(|setInterval|setTimeout" excalidraw-app
```

Entregable:

- Comparacion antes/despues:
  - build pasa/falla
  - tamano de salida relevante
  - cambios de consultas o renders

Criterio de avance:

- Cada optimizacion tiene una metrica o una reduccion clara de trabajo innecesario.

## ~~Parte 9 - Pruebas de regresion por flujo critico~~

Estado: hecho el 2026-09-24. Se ejecutaron las suites minimas, pruebas focales de flujos criticos, suite completa de app, build y revision de servicios Docker. La regresion corrigio fallos reales detectados en busqueda, menu de idioma y configuracion de Sentry.

Objetivo: confirmar que la limpieza no rompio el producto.

Flujos minimos:

1. Auth:
   - registro
   - login
   - logout
   - recuperacion de password
   - validaciones de formulario
2. Dashboard:
   - crear tablero
   - abrir tablero existente
   - renombrar
   - eliminar
   - ver tableros compartidos
3. Editor:
   - dibujar
   - guardar manual
   - autoguardado
   - volver al dashboard
   - reabrir sin perder contenido
4. Colaboracion:
   - crear sala
   - unirse como editor
   - unirse como solo lectura
   - cerrar sala como owner
   - reabrir link cerrado y ver bloqueo
   - verificar que invitado no crea copia privada accidental
5. Infra:
   - levantar servicios Docker
   - verificar Kong/PostgREST/Auth/Room
   - aplicar migraciones cuando corresponda

Comandos minimos:

```powershell
yarn test:typecheck
yarn test:code
yarn test:other
yarn test:app --watch=false
yarn build:app
docker compose ps
```

Tests focales conocidos:

```powershell
yarn test:app excalidraw-app/tests/authValidation.test.ts --watch=false
yarn test:app excalidraw-app/tests/passwordResetTiming.test.ts --watch=false
yarn test:app excalidraw-app/tests/boardMenuPermissions.test.ts --watch=false
yarn test:app excalidraw-app/tests/useAutoSaveBoard.test.ts --watch=false
yarn test:app excalidraw-app/tests/collab.test.tsx --watch=false
```

Entregable:

- Tabla de validacion:
  - comando/flujo
  - resultado
  - evidencia corta
  - pendiente si no se pudo ejecutar

Criterio de avance:

- No se declara una fase terminada si fallan pruebas relacionadas con los archivos tocados.

## ~~Parte 10 - Documentacion final y mantenimiento~~

Estado: hecho el 2026-09-24. Cierre registrado en `docs/cleanup-results.md`, `docs/cleanup-inventory.md` y `docs/env-docker-supabase-audit.md`.

Objetivo: que la limpieza quede entendible para el siguiente mantenimiento.

Pasos:

1. Actualizar README solo si cambia onboarding, Docker, scripts o variables.
2. Mantener docs tecnicos en `docs/`.
3. Agregar un resumen de decisiones:
   - que se elimino
   - que se conservo y por que
   - que se aplazo
   - que riesgos quedan
4. Si se agregan nuevas reglas de arquitectura, documentarlas cerca del area afectada.
5. Si se cambian permisos de tablero, actualizar `docs/board-menu-permissions.md`.

Entregable recomendado:

- `docs/cleanup-inventory.md`
- `docs/cleanup-results.md`
- README actualizado solo si aplica.

Criterio final:

- El sistema queda reproducible, probado y documentado.

## Plantilla para que otro chat aplique una fase

Usar este mensaje como inicio:

```text
Lee docs/system-cleanup-optimization-plan.md y aplica solo la Parte X.
Antes de cambiar archivos, ejecuta el baseline indicado.
No borres archivos versionados sin demostrar referencias/imports/configs/tests.
Al final deja una tabla con cambios, pruebas ejecutadas y pendientes.
No hagas commit ni stage.
```

## Definicion de terminado del plan completo

El plan se considera terminado cuando:

- El inventario explica cada carpeta importante.
- Los artefactos locales estan limpios o justificados.
- Las dependencias y scripts no tienen duplicacion innecesaria.
- `.env.example`, Docker, Vite, README y codigo consumidor estan alineados.
- Las zonas criticas de `excalidraw-app/` tienen responsabilidades claras.
- Los cambios en `packages/` son minimos y justificados.
- Los estilos/textos propios no tienen duplicacion evidente.
- Build, typecheck, lint, prettier y tests relevantes pasan.
- Los flujos manuales criticos fueron verificados o quedaron documentados como pendientes.
- No hay secretos versionados.
- No hay borrados sin evidencia.
