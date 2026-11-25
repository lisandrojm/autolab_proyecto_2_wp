# Deploy y operación

Hay tres instancias:

| Instancia | Dónde | Puerto | URL pública | Base |
| --------- | ----- | -----: | ----------- | ---- |
| local | PC de desarrollo | 3100 | — | Docker, `127.0.0.1:5433` |
| development | VPS, `/home/lumba/apps/development/tango-connector` | 7007 | `https://www.somoslumba.site/development/tango-connector/v1/` | `tango_connector_development` |
| production | VPS, `/home/lumba/apps/production/tango-connector` | 7008 | `https://www.somoslumba.site/production/tango-connector/v1/` | `tango_connector_production` |

En el VPS el servicio escucha **solo en `127.0.0.1`**. La única entrada es nginx, por HTTPS,
y el servicio llega a cada Tango por el túnel FRP en `127.0.0.1:<puerto>`.

## Actualizar una instancia

```bash
bash scripts/deploy/actualizar.sh development   # o production
```

Arma el paquete (`scripts/deploy/empaquetar.sh`): build, `package.json` y el catálogo, solo
`api.csv`, `campos.csv` y los `-api.json`. Después lo sube, corre `npm ci` de producción,
aplica las migraciones, hace `pm2 reload` y prueba `/v1/health`. Conserva el `.env`, los logs
y la base.

## Instalación de una instancia (una sola vez)

Así se instaló development el 2026-10-09. Cada paso cambia el VPS: **requiere aprobación**
(ver `CLAUDE.md`).

1. **Postgres:** rol y base `tango_connector_<entorno>`, con una contraseña generada en el
   VPS. `pg_hba.conf` ya permite `127.0.0.1` con `scram-sha-256`, así que no se toca.
2. **Archivos:** el paquete se descomprime en `/home/lumba/apps/<entorno>/tango-connector` y se
   corre `npm ci --omit=dev`. El `.env` (modo 600) se genera en el VPS:
   - `NODE_ENV=production`;
   - `DB_*`;
   - `CLAVE_CIFRADO` (`openssl rand -base64 32`);
   - `CATALOGO_DIR`, `TANGO_TIMEOUT_MS`, `TANGO_CONCURRENCIA` y `TANGO_PAGE_SIZE_MAX`.

   `HOST` y `PORT` los fija `ecosystem.config.cjs` según la carpeta.
3. **Migraciones:** `npm run migration:run`.
4. **Tenant y empresa:** con el CLI (`node dist/cli`).
   - El token de Tango se pasa por stdin de SSH a `TANGO_API_TOKEN`, solo para
     `empresa:crear`.
   - Después **se borra del `.env`**: el servicio usa la copia cifrada de la base.
5. **PM2:** `pm2 start ecosystem.config.cjs` (app `tango-connector-<entorno>`) y `pm2 save`.
6. **nginx:** en `/etc/nginx/sites-available/somoslumba.conf` se agrega un bloque propio,
   antes del regex genérico `location ~ ^/(production|development)/([^/]+)/api/v1...`.

   ```nginx
   location ^~ /<entorno>/tango-connector/ {
       proxy_pass http://127.0.0.1:<puerto>/;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_read_timeout 180s;
       client_max_body_size 5m;
   }
   ```

   - **Por qué un bloque propio:** el `^~` hace que el regex genérico no se aplique. Así no
     se hereda su `Access-Control-Allow-Origin: *`.
   - **Backup:** antes de editar se guarda una copia en `/home/lumba/backups/nginx/`, nunca en
     `sites-enabled`, porque nginx carga `sites-enabled/*.conf`.
   - **Recarga:** `nginx -t` primero, y `systemctl reload nginx` solo si pasa.
7. **Keys de las plataformas:** `node dist/cli key:crear ...`. La key se muestra una sola vez.

## Administración

Se hace en el VPS, en la carpeta de la instancia:

```bash
node dist/cli tenants:listar
node dist/cli key:listar
node dist/cli key:crear <plataforma> --empresas servertango/pruebas-fzero \
  --procesos "*:Get,GetById,GetByFilter,GetApiLiveQueryData,GetPdf" --filtro-sql
node dist/cli key:permisos <prefijo> --empresas ... --procesos ... [--filtro-sql]   # reemplaza los permisos
node dist/cli key:desactivar <prefijo>
pm2 logs tango-connector-<entorno>
```

## Estado de production (2026-10-21)

Instalada el 2026-10-21 con los pasos de arriba, para comprobantes-to-tango production.

- **URL:** `https://www.somoslumba.site/production/tango-connector/v1`. Desde el VPS:
  `http://127.0.0.1:7008/v1`.
- **Base y PM2:** base `tango_connector_production` y app `tango-connector-production`.
- **nginx:** bloque `^~ /production/tango-connector/`. El backup previo es
  `somoslumba.conf.20261021-121151.antes-tango-connector-production`.
- **Tenant, empresas y credenciales web:** las mismas que en development.
  - Se copiaron en el VPS con un script de una vez. Leyó la base de development, descifró con su
    clave y pasó cada secreto por variables de entorno al CLI de production, que los cifró con la
    suya.
  - Nada pasó por el chat ni quedó en disco.
  - Token y usuario web: los mismos que en development.
- **Keys:** `comprobantes-to-tango`, prefijo `e9e7fbe69f68`, con los mismos permisos que la de
  development.
  - La key se escribió directo en `/home/lumba/apps/production/comprobantes-to-tango/.connector-key`
    (modo 600), para que la plataforma la pase a su `.env` y borre el archivo.
  - **Production escribe de verdad:** altas y cambios de CBU de proveedores en las 4 empresas.
- **Actualizar:** `bash scripts/deploy/actualizar.sh production`.

## Estado de development (2026-10-13)

**Servidor:** `servertango` → `http://127.0.0.1:8003`, el túnel de Frame Zero.

**Empresas registradas:**

| Empresa | Slug | Company |
| ------- | ---- | ------: |
| PRUEBAS FZERO | `servertango/pruebas-fzero` | 13 |
| 2030 SRL Gestion | `servertango/2030-srl-gestion` | 8 |
| FZERO SRL | `servertango/fzero-srl` | 3 |
| GRINI SRL | `servertango/grini-srl` | 12 |

**Keys:**

| Plataforma | Prefijo | Empresas | Permisos |
| ---------- | ------- | -------- | -------- |
| `comprobantes-to-tango` | `aab0ba55090b` | 2030-srl-gestion, fzero-srl, grini-srl, pruebas-fzero | Lectura de todos los procesos, con `filtroSql`; `27:PerfilesDeFacturaDeCompra`, `-14024:CentrosDeCostoDeComprobantesDeCompra`, `3142:AltaDeProveedor,ActualizarProveedor`, `14162:OrdenesDePagoDeFacturaDeCompra,ComprobantesRelacionadosDeCompra`, `14184:OrdenDePago` |
| `plataforma-lecturas` | `92a2f652fe44` | pruebas-fzero | Lectura de todos los procesos, con `filtroSql` (prueba) |

**Convención: toda key incluye `servertango/pruebas-fzero`.** PRUEBAS FZERO es la empresa
de prueba, así cada plataforma puede probar sin tocar datos de una empresa real.

**Cómo se accede a una empresa:**
- Una plataforma solo puede usar empresas que estén **registradas en el connector** y
  **permitidas en su key**.
- La URL usa el slug, no el ID de Tango. Conocer el Company ID no alcanza.
- Agregar una empresa a una plataforma:
  1. `empresa:crear`, si la empresa no está registrada;
  2. `key:permisos <prefijo> --empresas ... --procesos ... [--filtro-sql]`, que reemplaza los
     permisos completos.

**Token de Tango:** es el token personal que se usó en el relevamiento. El ADR 0001 prevé un
usuario técnico por empresa. Cuando exista, se carga con `empresa:crear` en una empresa
nueva, o con un comando para rotar el token, que todavía no existe.

**El puerto 8003 del túnel sigue escuchando en `0.0.0.0`.** Ver
`docs/relevamiento/2026-10-08-vps.md`, punto 3 de la etapa 0: `proxyBindAddr` de frps.

**El PM2 de `lumba` no arranca solo con el VPS.** Hay unidades `pm2-root` y `pm2-martin`,
pero no `pm2-lumba`. Tras el reinicio del 2026-10-17, el connector, frps (el túnel) y las
demás apps de `lumba` quedaron caídos hasta que alguien levantó PM2. Si el connector responde
502 "No se pudo conectar con Tango", revisar `pm2 ls` y que el 8003 escuche.

**Escrituras (ADR 0004):** quedan en la tabla `auditoria_escrituras` (key, empresa,
operación, cuerpo, resultado).
