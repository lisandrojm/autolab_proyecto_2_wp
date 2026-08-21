# Validar obras sociales contra ARCA

```bash
npm run chrome-arca                                    # 1. Chrome dedicado (una vez cada varios días)
npm run validar-obras-sociales -- --empresa <id>       # 2. la corrida
npm run validar-obras-sociales -- --empresa <id> -n    # ...o en seco, sin escribir nada
```

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
npm run test:validar-obras-sociales      # el script (frontend/)
npm run test:obras-sociales              # las reglas del server (server/)
```

Los cuatro primeros son sobre **Aceptar** y no se tocan: uno prueba que `boton()` se niega, otro que
la lista blanca son exactamente `Agregar` y `Reiniciar`, otro escanea la fuente buscando `.click()`
fuera de `boton()`, y el último que los botones se buscan por texto y nunca por posición.
