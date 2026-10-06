# La demo de Zydesk en el VPS (`desk.zytech.dev`)

> **Estado al cierre de la Fase 9 (2026-10-06).** La demo está desplegada (`v1.0.0-rc.3`) y cargada; quedan pendientes el ensayo de restauración con un respaldo real (sección 9) y el de vuelta atrás por CD (sección 10). Fuentes: `docs/specs/fase-9.md` §0.1, §3, §11, §15.2 y las respuestas B1–B8 y B23 de §19; ADR 0031; `docker/vps/README.md` e `instalar-vps.sh` (que mandan sobre la spec en los detalles). La guía de la instalación definitiva es `docs/despliegue.md`.

## 1. Qué es y qué no es

La demo es Zydesk en **modo producción real** sobre el VPS de Nexus: `NODE_ENV=production`, HTTPS por Cloudflare, cookie `__Host-sesion`, respaldos cifrados, despliegue por CD con aprobación y las mismas imágenes, el mismo `docker-compose.yml` y los mismos scripts que usará la instalación definitiva. Lo único que la distingue: los datos son **100 % ficticios** (semilla `db:demo`, historia «Servicios Técnicos Patagua») y el nombre visible es «Zydesk · Demo Patagua».

No es la instalación definitiva. Si al equipo le gusta, el usuario apaga este contenedor (sección 11) y Zydesk se instala en la infraestructura de la empresa siguiendo `docs/despliegue.md`; los datos de la demo **no se migran**.

### Riesgos aceptados en la demo (spec §19 B3 y B4)

- **Sin Cloudflare Access.** La demo es pública en internet y se protege solo con el ingreso de Zydesk y sus límites de intentos (ADR 0013). Aceptable porque no hay datos reales. `DEMO_PASSWORD` abre las 12 cuentas, incluida Administración: debe ser **fuerte** (`openssl rand -base64 18`) y comunicarse fuera de la app. Access sigue recomendado para la instalación definitiva.
- **Bloqueo de las cuentas públicas por intentos fallidos** (VULN-002 de la revisión de la fase, ADR 0031): como las 12 cuentas son conocidas, cualquiera podría dejarlas bloqueadas con intentos fallidos. Mitigación elegida: una **regla de rate limiting de Cloudflare** sobre `POST /api/auth/ingresar`. En el plan gratis la ventana es de 10 s: frena ráfagas, no un ataque lento o distribuido. Access es la opción fuerte; la regla es suficiente para una demo.
- **Respaldos solo locales** (E2 sigue abierta). `respaldar.sh` cifra y deja el `.tar.age` en `/srv/data/zydesk/respaldos/`, con retención de 14 días; la copia remota con `rclone` está implementada pero desactivada (`RCLONE_DESTINO` vacío). Si se pierde el VPS, se pierde la demo. Igual que hoy el resto de Nexus.
- **Textos legales en borrador.** Siguen con `borrador: true` y marcadores; el equipo verá el aviso de borrador al aceptarlos. E3 queda pendiente para la instalación definitiva.

## 2. El VPS (respuestas B1 y B23)

Ubuntu 26.04, Docker 29 con Compose v5, systemd 259, host en UTC. Redes externas: `web` (`cloudflared`, `nginx-proxy`, `portfolio`) y `db` (Postgres 18 de Nexus, **que Zydesk no usa**: tiene su propio `zydesk-db` con `postgres:16-alpine`, solo en la red interna). `nexus-infra` vive en `/srv/nexus-infra/`; la configuración del proxy en `/srv/nexus-infra/proxy/conf.d/` (montada en `nginx-proxy` como `/etc/nginx/conf.d:ro`).

Cadena: `cloudflared` → `nginx-proxy:80` → `zydesk-web:8080` → `zydesk-api:3000`. Tres saltos escriben `X-Forwarded-For`: **`PROXY_SALTOS=3`**. Convenciones de Nexus que se respetan: un stack por carpeta con su `docker-compose.yml` y su `.env`, sin puertos publicados, datos en `/srv/data/<app>/`, el `.env` respaldado como nota segura en Bitwarden. Excepción: `/srv/apps/zydesk/` y su `.env` son de `zydesk-deploy`, no de `hikki`, porque `desplegar.sh` corre como ese usuario.

## 3. Pasos manuales del usuario en el VPS (F9-T12)

El agente no entra al VPS: el usuario corre los comandos y pega la salida. Orden (el detalle de cada paso está en `docs/despliegue.md` §3 y lo imprime `instalar-vps.sh` al terminar):

1. **Llave del CD**, en el PC: `ssh-keygen -t ed25519 -f zydesk-deploy -N "" -C zydesk-deploy`. La pública sube al VPS; la privada va al environment de GitHub (paso 8).
2. **Clon temporal** del repo en el VPS (con `hikki`) para tener `docker/vps/`.
3. **`instalar-vps.sh`**, como root, desde `docker/vps/` del clon:

   ```sh
   sudo ./instalar-vps.sh --llave /ruta/zydesk-deploy.pub
   ```

   Instala `age`, `rclone` y `shellcheck`; crea `zydesk-deploy` (sin contraseña, sin `sudo`, grupo `docker`); crea `/srv/apps/zydesk` y `/srv/data/zydesk/{postgres,archivos,bot,respaldos,logs}`; copia los scripts; escribe `05-sin-contrasena.conf` (**`PasswordAuthentication no` global**, B2: va antes que `50-cloud-init.conf`, que trae `yes`) y `60-zydesk-deploy.conf`; valida con `sshd -t` y muestra `sshd -T`; instala la llave con `restrict,command=`; copia `zydesk.conf` a `/srv/nexus-infra/proxy/conf.d/` (sin recargar nginx); activa los tres temporizadores de systemd; pide confirmación y recarga `sshd`. **Deja la sesión abierta y prueba la llave de `hikki` desde otra terminal antes de cerrar.** `sudo` sigue pidiendo la contraseña local de `hikki` (solo cambia el login SSH): conservarla en Bitwarden. KVM/rescate de OVH es la vía si se pierden todas las llaves.

4. **Clonar el repo como `zydesk-deploy`**:

   ```sh
   sudo -u zydesk-deploy git clone https://github.com/HikkizZ/Zydesk.git /srv/apps/zydesk/repo
   ```

5. **`.env`** en `/srv/apps/zydesk/.env` (dueño `zydesk-deploy`, 600) desde `.env.produccion.example`. Valores de la demo: `GHCR_OWNER=hikkizz`, `DATOS_DIR=/srv/data/zydesk`, `PROXY_SALTOS=3`, `WEB_URL=https://desk.zytech.dev`, `ZYDESK_DEMO=true`, `DEMO_PASSWORD=<openssl rand -base64 18>`, `ADMIN_PASSWORD` vacía (la demo no usa `admin`), `RCLONE_DESTINO` vacío, `ZYDESK_VERSION` vacía (la escribe `desplegar.sh`). Contraseñas de Postgres con `openssl rand -base64 32 | tr '+/=' 'xyz'`. Copia del `.env` como nota segura en Bitwarden.
6. **Clave `age`**: `install -d -m 700 /root/.config/zydesk && age-keygen -o /root/.config/zydesk/age.txt`; la pública a `RESPALDO_AGE_DESTINATARIO`; la **privada también fuera del VPS** (Bitwarden). El usuario confirma que la copia externa existe.
7. **Túnel y proxy**: ruta en Cloudflare Zero Trust → Conectores → Nexus → Rutas de aplicaciones publicadas: `desk` · `zytech.dev` · HTTP · `nginx-proxy:80`. Recargar el proxy y versionar en `nexus-infra`:

   ```sh
   docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload
   ```

   Web Analytics de Cloudflare **no** se activa para `desk.zytech.dev` (su beacon choca con la CSP).

8. **GitHub** (B6): environment `produccion` con el usuario como **único revisor obligatorio** y los tres secretos `DEPLOY_SSH_KEY` (clave privada del paso 1), `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <host>`). Tras la primera publicación, poner **públicos** los tres paquetes `ghcr.io/hikkizz/zydesk-{api,web,bot}` (una vez, en la configuración de cada paquete): el VPS hace `pull` sin credenciales.
9. **Telegram** (B5): bot **nuevo** en BotFather solo para la demo (distinto del de desarrollo y del definitivo) y un chat para `TELEGRAM_CHAT_ADMIN`; `COMPOSE_PROFILES=bot`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USUARIO`, `BOT_API_KEY` y `BOT_CLAVE_CIFRADO` (`openssl rand -base64 32`) en el `.env`. Los tokens solo en el `.env` del VPS. Vincular Telegram de personas reales es opcional; los `chat_id` quedan en la base de la demo y se borran al apagarla.
10. **Prueba del cierre**: `ssh zydesk-deploy@<host> 'ls /'` → `etiqueta inválida` y nada más. `sshd -T -C user=zydesk-deploy` debe mostrar `passwordauthentication no`, `permittty no` y `forcecommand /srv/apps/zydesk/desplegar.sh`.

**Resultado de F9-T12**: completado por el usuario el 2026-10-06, antes del primer despliegue; la cadena del túnel y el cierre de `zydesk-deploy` quedaron verificados con los despliegues de la sección 4.

### 3.1 Actualizar los scripts instalados (antes de cada despliegue que los cambie)

Los scripts de `/srv/apps/zydesk/` son **copias**: el despliegue no los toca (`docker/vps/README.md`). Cuando un commit cambia algo de `docker/vps/`, hay que repetir la copia **antes** de desplegar la etiqueta que lo necesite. Caso concreto: desde `f41c050` `desplegar.sh` migra con el servicio `zydesk-herramientas` (ADR 0031); con la copia anterior instalada, la migración falla y el despliegue se revierte.

```sh
cd /srv/apps/zydesk/repo && sudo -u zydesk-deploy git fetch --tags && sudo -u zydesk-deploy git checkout <etiqueta>
cd docker/vps && sudo ./instalar-vps.sh --llave /ruta/zydesk-deploy.pub
```

`instalar-vps.sh` es idempotente: vuelve a copiar los scripts, los temporizadores y la configuración, no crea nada que ya exista (la llave ya instalada no se duplica) y pide confirmación al principio y antes de recargar `sshd` (se puede responder que no a la recarga si `sshd` no cambió).

## 4. Primer despliegue: `v1.0.0-rc.1` (F9-T13)

Las etiquetas `rc` existen para ensayar el CD completo antes de `v1.0.0` (ADR 0032) y pueden apuntar a la rama de la fase. El usuario crea la etiqueta **con confirmación explícita** y la empuja; el workflow `Desplegar` valida la etiqueta, espera CI verde del commit, publica las tres imágenes y se detiene hasta que el usuario aprueba el environment; aprobado, `desplegar.sh v1.0.0-rc.1` corre en el VPS. Alternativa a mano en el VPS: `sudo -u zydesk-deploy /srv/apps/zydesk/desplegar.sh v1.0.0-rc.1`.

Primer despliegue: sin respaldo previo (no hay versión anterior), el volumen vacío de Postgres ejecuta `01-roles.sh`, `migrar` aplica las 15 migraciones, salud con `"version":"1.0.0-rc.1"`.

Comprobaciones (spec §17):

- `curl -s https://desk.zytech.dev/api/salud` → `{"estado":"ok","version":"1.0.0-rc.1","bd":"ok"}`.
- `curl -sI https://desk.zytech.dev/` → `200`, `Content-Security-Policy`, `X-Frame-Options: DENY`, sin `Server: nginx/x.y`.
- `docker compose ps` en el VPS: 3 (o 4) servicios `healthy`/`running`; `docker compose config` sin `published`.
- Ingreso con una cuenta de la demo → `Set-Cookie: __Host-sesion=…; Path=/; HttpOnly; Secure; SameSite=Lax`; en `auditoria`, `ingreso_ok.ip` = la IP pública real del usuario, no una `172.x` (si no, `PROXY_SALTOS` está mal).
- Aviso de Telegram «Zydesk desplegado: v1.0.0-rc.1 (antes ninguna)» en el chat de administración.

**Resultado de F9-T13 (2026-10-06).** Tres despliegues de ensayo, todos con aprobación manual del environment `produccion`:

- **`v1.0.0-rc.1`**: el primer intento falló porque `desplegar.sh` hacía el `pull` antes de fijar `ZYDESK_VERSION` y, con el `.env` vacío, Compose pedía una imagen sin etiqueta (corregido en `2160168`). El segundo intento levantó la app (migraciones y salud `200`), pero `desplegar.sh` lo dio por **fallido**: la etiqueta apuntaba a un commit con `version` `1.0.0` en los `package.json` y la salud devolvía `"version":"1.0.0"`, no `"1.0.0-rc.1"` (ADR 0032.2). Desde `d32e857` el workflow compara la etiqueta con los cinco `package.json` del commit y falla antes de construir imágenes.
- **`v1.0.0-rc.2`** y **`v1.0.0-rc.3`**: desplegados bien; salud con la `version` pedida, contenedores `healthy`, sin puertos publicados, cookie `__Host-sesion` guardada e IP pública real en `auditoria`.
- La **base quedó vacía** tras el primer despliegue (`desplegar.sh` solo migra): la demo se cargó a mano con el comando de la sección 5.
- Verificado en el VPS durante la revisión de seguridad: `nginx-proxy` no publica puertos al host (solo `80/tcp` interno) y nada escucha en 80/443 del host; todo entra por el túnel de Cloudflare y `CF-Connecting-IP` es confiable.

**Cómo se fija una versión** (ADR 0031 y 0032): `npm run version:fijar -- X.Y.Z[-rc.N]` → `npm run api:openapi` → commit → CI verde del commit por la rama → `git tag -a vX.Y.Z[-rc.N] -m "Zydesk vX.Y.Z[-rc.N]"` sobre ese commit → `git push` de la rama y la etiqueta. El CI no corre en los `push` de etiquetas: `Desplegar` exige el CI verde que llegó por la rama.

## 5. Cargar y recargar los datos de la demo

Comando exacto (spec §11.1), desde `/srv/apps/zydesk/repo` o con `--project-directory`, con el `.env` de la demo (`ZYDESK_DEMO=true` y `DEMO_PASSWORD` ya están ahí; `ZYDESK_DEMO_CONFIRMAR` se pasa solo en la línea):

```sh
docker compose --env-file ../.env run --rm --no-deps -e ZYDESK_DEMO=true -e ZYDESK_DEMO_CONFIRMAR=zydesk zydesk-herramientas demo --reiniciar
```

Lo mismo con el invocador de los scripts (`dc`, definido en `docs/despliegue.md` §5): `dc run --rm --no-deps -e ZYDESK_DEMO=true -e ZYDESK_DEMO_CONFIRMAR=zydesk zydesk-herramientas demo --reiniciar`.

- **Sin `--reiniciar`** la semilla es idempotente (dos cargas dejan lo mismo), pero se niega si la base tiene algún usuario cuyo correo no termine en `@demo.zytech.dev` (guarda 3): con las cuentas del equipo creadas, solo sirve `--reiniciar`.
- **`--reiniciar` borra TODO** (`TRUNCATE` de todas las tablas salvo `migracion`, también las cuentas del equipo y sus observaciones) y los archivos de la semilla bajo `ARCHIVOS_DIR/demo/`; después vuelve a sembrar. Los archivos que el equipo subió a mano quedan **huérfanos en disco** (fuera de `demo/`; no se borran solos; se limpian al apagar la demo). Avísale al equipo antes de recargar.
- Guardas: sin `ZYDESK_DEMO=true` sale con 1 **antes de conectar**; sin `DEMO_PASSWORD` válida, sale con 1; `--reiniciar` sin `ZYDESK_DEMO_CONFIRMAR=zydesk` (el nombre de la base), sale con 1 y no cambia nada.
- Las fechas de la historia son relativas al día de carga (últimas 10 semanas): recargar «rejuvenece» la demo. Conviene recargar antes de cada presentación.

Cifras tras la carga (spec §11.4): 12 usuarios (1 inactivo), 3 departamentos, 7 categorías, 10 clientes (7 externos), 36 tickets (6 archivados), 11 OT, 8 cotizaciones, 3 plantillas, 10 filas de `indicador_uf`, ≥ 14 archivos en disco, ≥ 60 avisos. Desviaciones registradas en spec §21: horas facturables a 90 días ≈ 50 % (no 55–65 %); la cotización sin IVA está en la OT de la Panadería; «En espera interno» se sembró como `aprobacion`; las fotos son PNG sintéticos.

## 6. Cuentas

Dos tipos de cuenta conviven en la demo (B8):

**Las 12 cuentas ficticias** (`<usuario>@demo.zytech.dev`, todas con la misma `DEMO_PASSWORD`, sin cambio obligatorio y con los términos ya aceptados). La contraseña se comunica fuera de la app; **no se escribe aquí**.

| Cuenta                                        | Rol            | Departamento  | Qué ve / para qué sirve                                                                                 |
| --------------------------------------------- | -------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `phidalgo` · Paula Hidalgo                    | Administración | Coordinación  | Configuración completa, registro de seguridad, `/api/docs`, facturar OT, reportes                       |
| `ralamos` · Rodrigo Álamos                    | Coordinación   | Mesa de ayuda | Mi día con las cinco listas, aprobar y cerrar OT, cotizador, planilla propia (registra horas), reportes |
| `cbustos` · Carolina Bustos                   | Coordinación   | Coordinación  | «OT por aprobar» (OT-0307) en Mi día, facturación, horas de todo el equipo                              |
| `aloyola`, `dpizarro`, `asepulveda`, `gtapia` | Técnico        | Mesa de ayuda | Tickets y tareas propios, planilla de horas, OT en ejecución                                            |
| `fcarrasco`, `mnunez`, `jriquelme`            | Técnico        | Terreno       | Lo mismo, con fotos de terreno y la OT de Base Rancagua                                                 |
| `xarrau` · Ximena Arrau                       | Solo lectura   | Coordinación  | Gerencia: reportes y montos sin editar                                                                  |
| `ivera` · Ignacio Vera                        | Solo lectura   | Coordinación  | **Desactivado**: muestra el estado; no puede ingresar                                                   |

**Las cuentas del equipo real**: el usuario las crea desde **Configuración → Equipo** con el correo real de cada persona (es solo el identificador; no se envía correo) y una contraseña temporal. Sirven para que cada quien registre observaciones con su nombre. La semilla no las crea y **`demo --reiniciar` las borra** junto con lo que escribieron.

## 7. Guion de demostración (20 minutos)

Orden sugerido de pantallas, con los hechos de la historia que conviene mostrar:

1. **Ingreso como Álamos → Mi día** (2 min): vencen hoy, vencidos, por aprobar, menciones, tareas. Versión en el pie («Zydesk v1.0.0-rc.N»; tras el merge, «v1.0.0»).
2. **Tablero y Tabla** (2 min): las cuatro columnas pobladas; filtros; solo lectura (el estado se cambia en el detalle). **Línea de tiempo** con vencidos.
3. **Detalle de un ticket de terreno** (3 min): fotos, tareas, seguimiento con mención, correo original (`.eml`) con adjunto, OT vinculadas. Cambiar estado desde el detalle.
4. **Órdenes de trabajo** (4 min): `/ots` con los cuatro indicadores y «Exportar para facturación»; OT-0302 Transportes (en ejecución, cotización aprobada con OC); OT-0303 Constructora (v1 rechazada, v2 enviada); OT-0301 Clínica (en UF, por facturar); OT-0305 Panadería (cancelada con motivo); OT-0308 Base Rancagua (cerrada sin resolver el ticket).
5. **Cotizador** (3 min): CLP y UF con «Valor UF» y procedencia, importar horas, plantilla «Visita técnica estándar», descuentos, descarga `.xlsx` y PDF.
6. **Como Bustos** (1 min): aprobar OT-0307 desde Mi día.
7. **Horas** (1 min): planilla de 8 semanas de un técnico; vista de todo el equipo como Coordinación.
8. **Reportes** (2 min): mes y últimos 90 días; carga por persona (dos sobre el 100 %); resolución por prioridad.
9. **Como Hidalgo → Configuración** (1 min): departamentos, feriados, categorías, tarifas con «UF del día», plantillas, numeración, marca, registro de seguridad.
10. **Avisos, Ayuda y Telegram** (1 min): avisos sin leer, Ayuda con capturas, vinculación por QR si el bot de la demo está arriba.

## 8. Cómo reportar observaciones

Un ticket **en la propia demo**, con categoría «Proyectos y mejoras» y asunto que empiece por «[Demo] », escrito con la cuenta propia de cada persona. El usuario los revisa antes de cada `demo --reiniciar` (que los borra): anota lo relevante en `docs/specs/fase-9.md` §21 o en un issue.

## 9. Respaldo real y ensayo de restauración (F9-T14)

- El timer `zydesk-respaldo.timer` corre `/srv/apps/zydesk/respaldar.sh` a las 02:30 (Santiago). Comprobar al día siguiente: `respaldo-<marca>-v1.0.0-rc.N.tar.age` en `/srv/data/zydesk/respaldos/`, la línea del día en `/var/log/zydesk-respaldo.log` con `remoto=no`, y que `age -d` falle sin la clave. A demanda: `/srv/apps/zydesk/respaldar.sh` como root.
- Ensayo (es una demo: se restaura sobre sí misma): anotar conteos (`usuario`, `ticket`, `ot`, `cotizacion`, `registro_horas`, `aviso`, `archivo`, `evento`, `auditoria`, `indicador_uf`) y hashes de `archivos/`; `/srv/apps/zydesk/restaurar.sh /srv/data/zydesk/respaldos/<respaldo>.tar.age` (pide escribir `zydesk`); comparar; salud 200; ingresar con una cuenta de la demo y descargar un archivo; `UPDATE evento` como `zydesk_app` → `permission denied`.
- El usuario confirma que la clave privada `age` está **también fuera del VPS**.

**Resultado de F9-T14: pendiente** por decisión del usuario (2026-10-06); no bloquea la v1.0.0 porque el ensayo local completo (`ensayar-restauracion.sh`, 39 s) ya pasó. Cuando se haga, anotar aquí fecha, tamaño del `.tar.age`, tiempos de respaldo y restauración y los conteos; si los conteos o los hashes difieren, es un hallazgo que se registra en una ADR antes de la instalación definitiva.

## 10. Actualización y rollback con `rc` (F9-T16)

La **actualización** se ensayó: `rc.1` → `rc.2` → `rc.3` (sección 4), cada una con salud `200` y la `version` pedida, y con su volcado en `respaldos/pre-despliegue/<marca>-<anterior>.dump` (se conservan 5).

**La vuelta atrás por CD queda pendiente** por decisión del usuario (2026-10-06). Motivo práctico: el botón `Run workflow` (`workflow_dispatch`) solo aparece en GitHub cuando `desplegar.yml` está en `main`; mientras la fase vivía en su rama, la vuelta atrás se hacía **re-ejecutando el despliegue de la etiqueta anterior** (volver a correr el workflow de esa etiqueta desde Actions, con la misma aprobación). Procedimiento para cuando se ensaye, tras el merge:

1. Antes: actualizar los scripts instalados si cambiaron (sección 3.1); anotar `ZYDESK_VERSION` del `.env`.
2. `Actions → Desplegar → Run workflow` con la etiqueta **anterior** (pasa de nuevo por la aprobación). Esperar la salud `200` con esa `version`, el aviso de Telegram «Zydesk desplegado: <anterior> (antes <actual>)» y el volcado nuevo en `pre-despliegue/`.
3. Volver a la etiqueta actual del mismo modo. Comprobar además `ssh zydesk-deploy@host 'v9.9.9'` → falla en el `checkout` (código 6) sin tocar los contenedores.
4. Anotar aquí fechas, tiempos y los avisos recibidos.

Recordatorio: las migraciones no se revierten; con las `rc` sobre el mismo esquema (15 migraciones) el rollback no necesita el `.dump`. Si una versión futura trae migraciones y hay que volver atrás con una incompatible: `restaurar.sh <pre-despliegue/…dump> --solo-bd` (`docs/despliegue.md` §6.2). Toda migración debe ser compatible con la versión anterior de la API (`CLAUDE.md` §2).

Tras el merge a `main`, el usuario etiqueta `v1.0.0` (procedimiento de la sección 4) y el CD la despliega en la demo con aprobación; `/api/salud` → `"version":"1.0.0"`. Las etiquetas `rc` se conservan (historia del ensayo).

## 11. Qué se borra al terminar

La demo queda encendida con `v1.0.0` hasta que el equipo decida (B22), con respaldos y actualizaciones. Al apagarla se siguen los pasos de `docs/despliegue.md` §10: respaldo final, `down`, borrar `/srv/data/zydesk`, desactivar los temporizadores, quitar la ruta del túnel y `zydesk.conf` de `nexus-infra`, borrar a `zydesk-deploy` y su `60-zydesk-deploy.conf`, borrar los secretos del environment, revocar el token del bot de la demo. Se borra con ella todo lo que el equipo escribió y los `chat_id` de Telegram vinculados.

## 12. Verificación opcional: Playwright contra la demo (F9-T17)

Sin Access ni Service Token, la suite de `test:movil` podría correr contra `https://desk.zytech.dev` con `E2E_URL`, `E2E_PASSWORD` (= `DEMO_PASSWORD`) y cuentas de la demo equivalentes a las de las semillas (Álamos / Loyola / Hidalgo), excluyendo los tests `@escribe` (dejan seguimientos). **No se hizo en la Fase 9** (ADR 0031): no existe `apps/web/playwright.demo.config.ts` ni la parametrización por `E2E_URL`; la suite sigue corriendo contra las semillas locales en CI. Si alguna vez se implementa, se decide en ese momento (spec §13.3).
