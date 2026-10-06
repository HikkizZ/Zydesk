# docker/vps — scripts del VPS (Fase 9, bloque 9C)

Scripts para Linux (Ubuntu en el VPS de Nexus). En Windows se prueban con Git Bash, WSL o un contenedor; los `.sh` terminan en LF (`.gitattributes`). Fuente de verdad: `docs/specs/fase-9.md` §5, §8, §10 y las respuestas B1–B8 y B23 de §19.

## Quién corre qué

| Archivo                                                  | Dónde queda en el VPS                           | Corre como                            | Para qué                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `instalar-vps.sh`                                        | (se corre desde el clon)                        | root, una vez                         | Usuario `zydesk-deploy`, carpetas, sshd, llave, proxy, temporizadores                            |
| `desplegar.sh`                                           | `/srv/apps/zydesk/desplegar.sh` (root:root 755) | `zydesk-deploy` (ForceCommand del CD) | Respaldo previo, `git checkout` de la etiqueta, `pull`, migrar, `up -d`, salud, reversión, aviso |
| `respaldar.sh`                                           | `/srv/apps/zydesk/respaldar.sh` (700)           | root (`zydesk-respaldo.timer`, 02:30) | `pg_dump` + archivos + bot, cifrado con `age`; `rclone` solo si `RCLONE_DESTINO` no está vacío   |
| `restaurar.sh`                                           | `/srv/apps/zydesk/restaurar.sh` (700)           | root, a mano                          | Restaura un `.tar.age` (o un `.dump` de `pre-despliegue/` con `--solo-bd`)                       |
| `archivar-logs.sh`, `errores-ayer.sh`                    | `/srv/apps/zydesk/` (700)                       | root (`zydesk-logs/-errores.timer`)   | Logs diarios en gzip (30 días) y aviso de errores por Telegram                                   |
| `sshd_zydesk-deploy.conf`                                | `/etc/ssh/sshd_config.d/60-zydesk-deploy.conf`  | —                                     | `Match User zydesk-deploy` con `ForceCommand`, sin TTY ni reenvíos                               |
| `zydesk.nginx-proxy.conf`                                | `/srv/nexus-infra/proxy/conf.d/zydesk.conf`     | —                                     | `desk.zytech.dev` → `zydesk-web:8080` (convención de `portfolio.conf`)                           |
| `systemd/zydesk-{respaldo,logs,errores}.{service,timer}` | `/etc/systemd/system/`                          | —                                     | Temporizadores en hora de Santiago (el host está en UTC)                                         |
| `desplegar.test.sh`, `ensayar-restauracion.sh`           | no se instalan                                  | CI / desarrollo                       | Pruebas (ver abajo)                                                                              |

`/srv/apps/zydesk/` y su `.env` son de `zydesk-deploy`. Los scripts instalados son copias: para actualizarlos, volver a correr `instalar-vps.sh` desde el clon (o copiarlos como root); el despliegue **no** los cambia.

## Primera instalación (resumen; el detalle sale al final de `instalar-vps.sh`)

1. `sudo ./instalar-vps.sh --llave zydesk-deploy.pub` (léelo antes: imprime cada acción y pide confirmación antes de recargar `sshd`; deja una sesión abierta hasta probar la llave).
2. Clonar el repo como `zydesk-deploy`, escribir el `.env` (desde `.env.produccion.example`), generar la clave `age`, crear la ruta del túnel, publicar `zydesk.conf` en nexus-infra (recarga: `docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload`), cargar los 3 secretos del environment `produccion`.
3. Primer despliegue: `sudo -u zydesk-deploy /srv/apps/zydesk/desplegar.sh v1.0.0-rc.1` (o por el CD).

El `.env` es lo único que no está en git: guarda una copia como nota segura en Bitwarden, y la clave privada `age` **fuera del VPS**.

## Códigos de salida de `desplegar.sh`

`0` desplegado · `1` falló y se revirtió · `2` etiqueta inválida · `3` otro despliegue en curso · `4` el respaldo previo falló (no se despliega) · `5` falló y la reversión también (rollback manual: `docs/despliegue.md`) · `6` etiqueta inexistente o clon con cambios (no se tocó ningún contenedor) · `7` se corrió como root.

## Pruebas

- `bash docker/vps/desplegar.test.sh`: `desplegar.sh` con `ZYDESK_SIMULAR=1` (docker, git, curl y flock simulados; sin red ni root).
- `bash docker/vps/compose.test.sh`: `docker compose config` del Compose de producción: `zydesk-api` sin `zydesk_owner`, `ADMIN_PASSWORD` ni variables de la demo (solo `zydesk-herramientas`), y `mem_limit`/`pids_limit` en cada servicio.
- `bash docker/postgres-init-prod/probar-roles.sh`: `01-roles.sh` contra un `postgres:16-alpine` efímero.
- `docker/vps/ensayar-restauracion.sh`: ensayo completo de §8.3 (Compose con `.env` de prueba y datos temporales, `demo --reiniciar`, `respaldar.sh`, destruir, `restaurar.sh`, conteos y hashes idénticos, ingreso y descarga, `permission denied` para `zydesk_app`). Necesita Linux/WSL con `docker`, `age`, `zstd`, `flock`. Corre bajo el proyecto `zydesk-ensayo` y lo baja al terminar (`ENSAYO_CONSERVAR=1` lo deja arriba para depurar). **No se corre en el VPS.**
- `shellcheck` sobre `docker/**/*.sh` (en CI; local: `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable …`).

## Desviaciones de la spec (todas por algo comprobado en el ensayo o por una respuesta de §19)

- **El volcado conserva dueños y permisos** (sin `--no-owner --no-acl`): los `REVOKE UPDATE, DELETE` sobre `evento`/`auditoria` viven en las ACL, y las tablas de `pgboss` las crea pg-boss como `zydesk_app`; con `--no-owner --no-acl` la API no arrancaba tras restaurar (`permission denied for table version`). Los roles se llaman igual en toda instalación (`01-roles.sh`), así que restaurar con dueños es seguro. `restaurar.sh` solo reaplica `permisos.sql` (privilegios de base y de `public`).
- `respaldos/` es `root:zydesk-deploy 710` (no `root:root 700`): `desplegar.sh` no tiene `sudo` y deja su volcado en `respaldos/pre-despliegue/` (`zydesk-deploy` 700); sin el bit de paso no podría llegar.
- Se agrega `up -d --wait zydesk-db` antes de migrar (en el primer despliegue la base aún no existe) y `git fetch --tags` sin `--prune` (podar etiquetas locales quitaría el destino de un rollback).
- Variable `RCLONE_DESTINO` (B4) en lugar de `RESPALDO_RCLONE_REMOTO`.
- La API y el bot reciben del `.env` solo las variables que usan (listadas en `environment:` del Compose), no `env_file: .env` completo: así `POSTGRES_PASSWORD`, `BOT_CLAVE_CIFRADO` y los secretos de respaldo no entran a contenedores que no los necesitan, y no hace falta un `.env` dentro del clon.
- Los temporizadores de `archivar-logs.sh` y `errores-ayer.sh` también son de systemd (no cron), por coherencia con B16.
