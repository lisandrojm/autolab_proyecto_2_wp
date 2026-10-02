# Obras sociales contra ARCA

Dos comandos, dos pantallas de ARCA, el mismo Chrome dedicado.

| | qué hace | escribe en ARCA |
|---|---|---|
| `validar-obras-sociales` | lee qué obra social tiene cada persona | **no** — solo lee |
| `arca:registrar-obras-sociales` | completa el padrón de obras sociales de la empleadora | **sí** |

```bash
npm run chrome-arca                                    # 1. Chrome dedicado (una vez cada varios días)
npm run validar-obras-sociales -- --empresa <id>       # 2. la corrida
npm run validar-obras-sociales -- --empresa <id> -n    # ...o en seco, sin escribir nada
```

## Registrar obras sociales de la empleadora

Para que ARCA acepte un alta, la obra social declarada tiene que estar **registrada por esa
empleadora**. Si no lo está, el alta se rechaza. A mano son cientos de altas de a una.

```bash
npm run arca:registrar-obras-sociales -- --empleadora 30717068374              # dry-run: no escribe
npm run arca:registrar-obras-sociales -- --empleadora 30717068374 --si         # ejecuta
npm run arca:registrar-obras-sociales -- --empleadora 30717068374 --si -l 5    # ...de a 5, para probar
```

Pantalla: **Datos del Empleador → Obras Sociales** (no la de altas de trabajadores).

- **Sin `--si` no escribe nada.** La corrida por defecto informa cuántas faltan y sale.
- **Verifica el CUIT en pantalla antes de escribir.** Si el pedido no está, aborta. No hay flag para
  saltearlo: registrar bajo la empleadora equivocada no avisa, y el error aparece recién cuando
  alguien audita el padrón.
- **Solo agrega.** Nunca da de baja. Cada fila ya registrada tiene su propio botón de baja en la
  misma pantalla, y son los dos `input[type=image]`: por eso el de alta se busca por su id exacto
  (`btnAceptaAltaOS`) y nunca por tipo.
- **Idempotente.** Recalcula contra lo ya registrado, así que si se corta a la mitad se vuelve a
  correr y retoma. Correrlo de nuevo con todo registrado no hace nada.
- **Va de a una**, con ~120 ms entre altas: es ASP.NET con `__VIEWSTATE` y dos postbacks encimados
  mandan un viewstate viejo.
- **Confirma por conteo.** Un alta vale si sube el número de registradas — ARCA no siempre avisa
  cuando algo no toma. La que no sube se anota como fallida y la corrida **sigue**; al final se
  listan.
- El catálogo sale de `window.l_OS` de la propia página. No está hardcodeado: las de hoy pueden ser
  otras mañana.

### Por qué son dos archivos y no un comando más del otro

La protección más fuerte de `validar-obras-sociales` es un test que escanea **su** fuente y falla
ante cualquier `.click()` fuera de su lista blanca de `Agregar` y `Reiniciar` — la que garantiza que
nunca se apriete **Aceptar**. Meter ahí adentro un click que sí escribe obligaría a aflojar ese
escaneo, y el escaneo vale precisamente porque no admite excepciones.

Separados, cada script tiene su propia lista blanca, total y verificada por su propio test: el de
validación no puede tocar nada de la pantalla de obras sociales, y el de registro no puede tocar nada
de la de altas. Lo único que se repite son ~30 líneas de conexión CDP.

## Por qué hay un navegador en el medio

La pantalla de ARCA (Relaciones Laborales → Registrar Nuevas Altas) es **la única fuente que
devuelve el código RNOS**. La Superintendencia de Servicios de Salud no lo publica y ningún
webservice de ARCA lo expone. No hay forma de sacar el navegador del circuito: la automatización va
alrededor de la pantalla, no en lugar de ella.

## Configuración

El script habla con la API de WeProdu en las dos puntas — de dónde salen los pendientes y a dónde va
el resultado — así que necesita un token. **Sale del entorno, nunca de un archivo del repo:**

```bash
export WEPRODU_API_URL='http://localhost:7001/api/v1'   # default
export WEPRODU_TOKEN='...'                              # DevTools → Application → Local Storage → token
export WEPRODU_TENANT='<slug o id del tenant>'
```

## El perfil dedicado

`npm run chrome-arca` abre un Chrome **aparte**, con `--user-data-dir` propio y el puerto de
depuración. Dos cosas que el instructivo viejo no daba:

- no hay que cerrar el Chrome de todos los días;
- el puerto abierto **solo alcanza a esa ventana**. Antes quedaba expuesto tu perfil entero — mail,
  banco, todo. Ahora ahí adentro solo vive la sesión de ARCA.

Y como el perfil persiste, **la sesión de ARCA sobrevive días**: el login deja de ser un peaje por
corrida. Si no está, el script abre el login, dice qué falta y espera (`--espera <minutos>`, default
5). Al vencerse sale con código 1 y explica; no reintenta a ciegas.

El perfil está en `.gitignore`: adentro hay una sesión de clave fiscal.

## Por qué no hay `--login-automatico`

Estaba previsto y se descartó, por una razón concreta: tipear CUIT y clave obliga a apretar botones
que no son `Agregar` ni `Reiniciar`, y eso rompe la lista blanca de `boton()` — la única protección
real de este script, la que garantiza que nunca se apriete **Aceptar** y se registren altas de
verdad. Hay un test que escanea la fuente y falla ante cualquier `.click()` fuera de esa función.

Relajarlo habría cambiado la garantía más importante del proyecto por ahorrar un login cada varios
días, poniendo además la clave fiscal en juego y abortando igual ante el segundo factor, que ARCA
pide cada vez más seguido. No compensa.

## Qué valida el servidor antes de guardar

El endpoint de escritura corre **el mismo servicio** que el panel de pegado
(`server/src/services/obrasSocialesLoteService.ts`). Escribir por API saltea la previsualización
humana, así que la red vive del lado del server:

| Caso | Qué pasa |
|---|---|
| RNOS fuera del catálogo de Obras Sociales | rechazado, con motivo |
| RNOS que la empleadora no tiene registrado ante ARCA | rechazado, con motivo |
| RNOS vacío | **se guarda**: es «ARCA no tiene ninguna», rige la del convenio |
| contrato ya constatado | no se pisa (salvo `--forzar`) |
| mismo CUIL con dos RNOS distintos | no se aplica **nada**: el lote entero se rechaza |
| CUIL sin contratos en esa empleadora | rechazado, con motivo |

Es **idempotente**: la primera pasada deja los contratos bloqueados y la segunda cae entera en «ya
estaba constatada». Correr el mismo lote dos veces no cambia nada.

## Un botón en WeProdu

No se puede hacer solo con el frontend: el navegador no arranca procesos locales. Haría falta un
agente chico corriendo en la máquina del operador —un HTTP local en, digamos, 7788— que escuche el
pedido y ejecute `validarObrasSociales()`, que ya está exportada justamente para eso: el CLI es una
cáscara fina encima. Ese agente necesitaría autenticarse contra WeProdu y aceptar pedidos solo de
`localhost`. No está construido.

## Tests

```bash
npm run test:validar-obras-sociales           # el script de lectura (frontend/)
npm run test:arca:registrar-obras-sociales    # el script de escritura (frontend/)
npm run test:obras-sociales                   # las reglas del server (server/)
```

Los cuatro primeros son sobre **Aceptar** y no se tocan: uno prueba que `boton()` se niega, otro que
la lista blanca son exactamente `Agregar` y `Reiniciar`, otro escanea la fuente buscando `.click()`
fuera de `boton()`, y el último que los botones se buscan por texto y nunca por posición.

## Altas en ARCA desde el servidor (Carga Masiva y Altas Masivas)

`altas-arca.mjs` es el tercer motor y el único que **presenta altas**. Lo corre el servidor
(`server/src/services/arca/corridaAltas.ts`) en el Chromium del usuario delegado: no hay pestañas en
el navegador del operador ni se pide clave fiscal en la app. Los dos botones de Contratos → Trámite
impositivo → Alta temprana lo disparan:

| Botón | Formato | Camino en ARCA | Termina en |
|---|---|---|---|
| Generar TXT Masivo (ARCA) | archivo de 130 (`afipTxt.ts`), se baja igual de respaldo | Relaciones Laborales → Carga Masiva: Nuevo → archivo → Cargar → validación → **Enviar** | la novedad enviada, con Nro. de Transacción |
| Generar TXT Masivo URGENTE | pegado de 85 (`afipTxt85.ts`), máx. 9, va al portapapeles | Registrar Nuevas Altas → Altas Masivas: pegar → Aceptar → grilla → **Aceptar** | resultado por persona |

Las posiciones de los dos formatos viven en `server/src/compartido/layoutAltaArca.ts`: el frontend arma
los registros con ellas y el servidor las usa para partirlos y cotejarlos.

### Las garantías

- **Dos botones irreversibles, cada uno en su función.** `enviarNovedad` (Button_envio) y
  `aceptarGrilla` (el `btnAceptar` de Altas.aspx). Un click, sin reintento. El test escanea la fuente
  y exige exactamente tres `btn.click()`: `apretar`, y esos dos.
- **Botones por id exacto y atados a su pantalla.** `boton(page, clave)` tira si la pantalla actual no
  es la del botón: el mismo `btnAceptar` pasa el texto a la grilla en `ArchivoAltas.aspx` y registra
  en `Altas.aspx`.
- **La pantalla se reconoce por el formulario, no por la URL.** El sitio usa `Server.Transfer` y la
  barra queda una pantalla atrás. `pantallaAltas({ accion, ids })` es puro y se testea.
- **CUIT de la empleadora verificado en pantalla antes de escribir.** Sin flag para saltearlo.
- **Altas Masivas: grilla vacía antes de pegar, y exactamente los CUIL del lote antes de aceptar.** La
  grilla persiste en ARCA entre sesiones y su «Aceptar» registra todo lo que tenga. Nunca se aprieta
  «Reiniciar».
- **Nunca se reintenta un envío.** Si después del click no se puede leer el resultado, la corrida y el
  contrato quedan en «indeterminado» y se resuelve leyendo en ARCA. El servidor rechaza volver a
  presentar un contrato con `altaArcaPresentada` (salvo `fallida`).
- **«Detener» solo hasta el paso anterior al envío.** Desde el evento `irreversible` el servidor
  contesta 409.
- **En seco por defecto en desarrollo** (`ARCA_ALTAS_EN_SECO`; en producción, real salvo `=true`).
  Carga Masiva llega hasta la validación y deja la novedad sin enviar. Altas Masivas corta **antes**
  de pasar el texto a la grilla: dejarla cargada «para probar» deja altas a medio dar.
- **El lote lo decide el servidor.** `validarLoteAltas.ts` coteja cada registro contra la base (CUIL,
  fechas, categoría, convenio, obra social, retribución, sucursal/actividad de la empleadora,
  códigos de los nomencladores, puesto y revista): una línea que no coincide rechaza el lote entero.
- **Una corrida de ARCA por tenant**, compartida con la validación de obras sociales y la lectura de
  nombres (`candadoArca.ts`): usan la misma sesión.
- **Registro persistente** en `arca_altas_logs` (sin TTL): quién, cuándo, empleadora, contratos,
  novedad, transacción, resultado por persona, tiempos y el HTML anonimizado de la pantalla de
  resultado. Sin claves; el TXT y los CUIL no van a la consola.

### Lo que todavía hay que relevar

El `input type=file` y el botón «Cargar» de Carga Masiva no se vieron nunca: están como `POR_RELEVAR`
y la corrida se frena ahí con un error que lo dice. Se relevan con el reconocimiento, con alguien
mirando:

```bash
cd server
./node_modules/.bin/dotenv -e .env.production -v TENANT=<slug> -v EMPRESA_CUIT=<cuit> -- tsx src/scripts/reconocerAltasArca.ts
```

Abre un Chromium visible y en cada pantalla guarda un fixture anonimizado en
`server/src/services/arca/fixtures/` (revisalo antes de commitear). No aprieta nunca «Enviar», el
«Aceptar» de la grilla ni «Reiniciar»; «Nuevo» y el «Aceptar» del pegado piden escribir SI. Lo que pasa
**después** de Enviar y del Aceptar de la grilla no se puede relevar sin presentar de verdad: la
primera corrida real guarda esa pantalla en el log, y con eso se cierra el lector del resultado.

```bash
npm run test:arca:altas        # el motor de altas (frontend/)
npm run test:afip85            # el registro de 85 (frontend/)
npm run test:arca-altas        # el cotejo del lote y el candado (server/)
```

## Catálogos de ARCA (`catalogos-arca.mjs`)

Lee los nomencladores que publica «Registrar Nuevas Altas» (`window.l_CCT`, `l_CatCCT`, `l_PD`, `l_SR`, `l_GTS`, `l_TS`, `l_MC`, `l_ML`, `l_Dom`, `l_ActDom`) y las obras sociales (`leerCatalogo` de `registrar-obras-sociales.mjs`, reutilizado). **Cero clicks propios**: la única interacción es elegir la empleadora con `aceptarSelectorDeCuit`, y verifica su CUIT en pantalla antes de leer. Lo corre el servidor (`server/src/services/arca/catalogoArcaSync.ts`), con el mismo candado de una corrida por tenant. Ver `documentation/catalogo-arca.md`.

```bash
npm run test:arca:catalogos   # cero .click(), CUIT antes de leer, mapeo de variables a tablas
```
