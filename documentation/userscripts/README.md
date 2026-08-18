# Constatar obras sociales en ARCA — dos botones y un login

La obra social que ARCA tiene registrada para un CUIL **no la devuelve ninguna API**: Consulta Padrón
A13 —el único webservice conectado— trae datos del contribuyente y nada de obra social, y
Simplificación Registral es una aplicación de clave fiscal sin webservice. El dato solo aparece
precompletado en la pantalla de altas.

Lo que sí se automatiza es el tipeo, **dentro de la sesión que abrís vos**.

## La decisión: no se guarda la clave fiscal

WeProdu **no guarda la clave fiscal en ningún lado** — ni en base, ni en `.env`, ni junto al
certificado. Te logueás a mano una vez por tanda y el script corre en esa pestaña ya autenticada.

**El login manual no es una limitación pendiente de resolver: es la garantía.** Es lo que hace que el
sistema nunca toque una credencial que no da acceso a esta pantalla, sino a toda la identidad
tributaria del apoderado. Si alguna vez se propone guardarla "para automatizar el login", eso es una
decisión distinta y hay que tomarla a propósito, no heredarla de este archivo.

## Instalación (una sola vez)

1. Instalá **Tampermonkey** en Chrome (o Violentmonkey en Firefox).
2. Panel de la extensión → *Crear nuevo script* → pegá el contenido de
   [`arca-obras-sociales.user.js`](arca-obras-sociales.user.js) → guardar.

Hace falta un userscript y no alcanza un bookmarklet porque **cada *Agregar* es un `__doPostBack` que
recarga la página entera**: el script tiene que volver a inyectarse en cada carga y retomar la cola
donde iba. Por eso la cola vive en `localStorage` y no en memoria.

## Uso

1. **WeProdu** → Contratos → Alta temprana → elegí la empleadora → *"N obras sociales sin constatar"*
   → **Copiar los N CUIL a constatar**.
2. **ARCA** → logueate → Simplificación Registral → elegí el CUIT de esa empleadora → Relaciones
   Laborales → **Registrar Nuevas Altas**.
3. Abajo a la derecha aparece el panel del script → **▶ Constatar obras sociales** → pegá los CUIL.
   Recorre la lista solo; podés frenar y reanudar.
4. Al terminar copia `CUIL,RNOS` al portapapeles → volvé a WeProdu y pegalo → **Revisar lo que
   devolvió ARCA** → confirmás y se aplica.

Un RNOS vacío **no es un error**: significa que ARCA no tiene obra social registrada para esa
persona. WeProdu lo guarda como consultado y rige la del convenio, así que no vuelve a pedirse.

## Lo que el script NO hace

`Registrar Nuevas Altas` es el formulario que **da de alta** relaciones laborales ante el organismo.
Un script suelto ahí puede registrar altas reales, masivas e irreversibles, así que el permiso es una
**lista blanca**: hay una sola función que puede accionar un control (`accionar()`) y solo acepta el
que tenga value exactamente *Agregar*. Cualquiera que mencione aceptar, confirmar, registrar, grabar,
enviar o finalizar queda excluido, y nunca se llama a `__doPostBack` ni a `form.submit()` — eso
saltearía el filtro.

**Si ARCA cambia el flujo y *Agregar* pasa a confirmar el alta, este script deja de ser seguro.**
Antes de tocar la constante `BOTON_AGREGAR`, verificá en la pantalla qué hace el botón nuevo.

## Selectores

| Qué | Dónde |
|---|---|
| CUIL a ingresar | `#ctl00_ContentPlaceHolder1_InputCuil_txtCuil` |
| Botón Agregar | el `input[type=submit]` con value `Agregar` (por value, no por id) |
| Obra social de cada fila | `input[id*="ExtendCodeOS_AutocompleteText"]` |
| CUIL de cada fila | texto `27-40073687-7 - APELLIDO NOMBRE` en el encabezado |

El emparejamiento CUIL ↔ obra social **no usa el índice de posición**: se saca el `ctlNN` del id del
input y el CUIL se busca en el contenedor de esa misma fila. Un desfasaje de uno le asignaría la obra
social de una persona a otra, y las dos filas se seguirían viendo bien.

## Si deja de encontrar algo

Usá el link **diagnóstico** del panel: dice si encontró el campo de CUIL y el botón, cuántas filas
leyó y qué obra social sacó de cada una con su `ctlNN`. Con eso se ajustan `SEL_CUIL`, `SEL_OS` y
`leerFilas()`.

**Probá con 2 o 3 CUIL antes de una tanda entera**, para confirmar los selectores contra la página en
vivo.
