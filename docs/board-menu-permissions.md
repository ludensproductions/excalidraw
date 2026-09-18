# Seguimiento de permisos del menu lateral de tableros

Fecha: 2026-09-15

Este documento registra la primera arquitectura de permisos para el menu lateral del editor. La implementacion inicial esta en `excalidraw-app/permissions/boardMenuPermissions.ts` y el primer consumidor es `excalidraw-app/components/AppMainMenu.tsx`.

## Roles actuales

| Rol | Descripcion | Fuente actual |
| --- | --- | --- |
| `personal_owner` | Usuario autenticado trabajando en un tablero privado propio, sin colaboracion activa. | No hay colaboracion activa. |
| `collaboration_owner` | Host o propietario del tablero compartido. Puede guardar y renombrar su registro privado, ademas de gestionar la sesion colaborativa. | `isOwnerAtom === true`. |
| `collaboration_editor` | Invitado con permiso de edicion en la sesion. Puede editar la escena colaborativa, pero no guardar ni renombrar el tablero privado del host. | Colaboracion activa, no read-only, no owner. |
| `collaboration_viewer` | Invitado de enlace solo lectura. Puede inspeccionar/exportar, pero no mutar la escena ni el registro del tablero. | `isReadOnlySessionAtom === true`. |
| `signed_out` | Estado defensivo. El editor normalmente no se muestra sin usuario autenticado. | Sin `currentUser`. |

## Matriz por boton del menu lateral

| Boton | personal_owner | collaboration_owner | collaboration_editor | collaboration_viewer | signed_out | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Inicio | Si | Si | Si | Si | No | Vuelve al dashboard; antes ejecuta flush de guardado cuando aplica. |
| Guardar tablero | Si | Si | No | No | No | Guarda el tablero privado. En colaboracion solo el owner puede crear/actualizar este registro. |
| Renombrar tablero | Si | Si | No | No | No | Si el owner aun no tiene registro privado, renombrar dispara un guardado con ese nombre. |
| Cargar escena | Si | Si | No | No | No | Reemplaza la escena; se bloquea para invitados en colaboracion. |
| Guardar en archivo activo | Si | Si | Si | Si | No | Accion de archivo/exportacion local, no actualiza permisos del tablero en Supabase. |
| Exportar | Si | Si | Si | Si | No | Exportacion local. |
| Guardar como imagen | Si | Si | Si | Si | No | Exportacion local. |
| Colaboracion en vivo | Si | Si | Si | Si | No | Para invitados se muestra como "Salir de la sesion"; owner/personal mantiene el dialogo de colaboracion. |
| Paleta de comandos | Si | Si | Si | No | No | Se oculta en solo lectura para no exponer comandos mutadores desde el menu. |
| Ayuda | Si | Si | Si | Si | No | Informativo. |
| Limpiar lienzo | Si | Si | Si | No | No | Muta la escena; se bloquea para solo lectura. |
| Preferencias | Si | Si | Si | Si | No | Configuracion local del usuario. |
| Cambiar tema | Si | Si | Si | Si | No | Preferencia local del usuario. |
| Cambiar fondo del lienzo | Si | Si | Si | No | No | Muta el tablero; se bloquea para solo lectura. |

## Cambios aplicados en esta tarea

- Se quito el bloqueo que mostraba "Tablero compartido" al owner cuando intentaba guardar manualmente un tablero en colaboracion.
- `useSaveBoard` ahora permite guardar en colaboracion solo al `collaboration_owner`; invitados reciben un mensaje claro si la accion se invoca por otra ruta.
- `useAutoSaveBoard` aplica la misma regla: owner puede persistir el tablero privado; invitados no crean copias privadas por autoguardado.
- `AppMainMenu` ya no renderiza Guardar/Renombrar/Abrir para invitados no propietarios.
- La accion de colaboracion de invitados no propietarios se muestra como "Salir de la sesion" y abandona la sala directamente.
- El menu lateral del editor ya no muestra "Cerrar sesion"; esa accion queda solo en dashboard/home.
- Renombrar como owner sincroniza el nombre del tablero privado y, si hay sala activa, tambien el registro compartido.
- Se agrego `excalidraw-app/tests/boardMenuPermissions.test.ts` para cubrir las reglas principales de owner, invitado editor y colaborador solo lectura.

## Pendientes para extender permisos al sistema

- Centralizar permisos de acciones fuera del menu, por ejemplo atajos de teclado, paleta de comandos y botones contextuales.
- Reutilizar esta matriz en dashboard, comentarios y gestion de tableros compartidos.
- Ampliar las pruebas de `getBoardMenuPermissions` cuando se agreguen nuevos roles o acciones.
