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
2. **ARCA** → entrá por [auth.afip.gob.ar](https://auth.afip.gob.ar/contribuyente_/login.xhtml) con
   clave fiscal → **Simplificación Registral - Empleadores** → elegí el CUIT de esa empleadora →
   Relaciones Laborales → **Registrar Nuevas Altas**.

   No hay atajo por URL: cualquier link profundo a `MiSimplificacion/app/...` —incluidos
   `login/indexContribuyente.aspx` y `Contribuyente/DatosBasicos.aspx`— redirige a `FinSession.aspx`
   ("su tiempo de sesión ha finalizado") si no hay una sesión viva **del servicio**, que es propia y
   no se hereda de estar logueado en ARCA. Por eso WeProdu enlaza siempre el login.
3. Abajo a la derecha aparece el panel del script → **▶ Constatar obras sociales** → pegá los CUIL.
   Recorre la lista solo; podés frenar y reanudar.
4. Al terminar copia `CUIL,RNOS` al portapapeles → volvé a WeProdu y pegalo → **Revisar lo que
   devolvió ARCA** → confirmás y se aplica.

Un RNOS vacío **no es un error**: significa que ARCA no tiene obra social registrada para esa
persona. WeProdu lo guarda como consultado y rige la del convenio, así que no vuelve a pedirse.

## Lo que el script NO hace

`Registrar Nuevas Altas` es el formulario que **da de alta** relaciones laborales ante el organismo.
Un script suelto ahí puede registrar altas reales, masivas e irreversibles. El único control que se
clickea es el que devuelve `btnAgregar()`, y esa función exige que el rótulo sea **exactamente**
*Agregar*. Nunca se llama a `__doPostBack` ni a `form.submit()`: eso saltearía el filtro.

**Si ARCA cambia el flujo y *Agregar* pasa a confirmar el alta, este script deja de ser seguro.**
Antes de tocar `btnAgregar()`, verificá en la pantalla qué hace el botón nuevo.

## Selectores

| Qué | Dónde |
|---|---|
| CUIL a ingresar | `#ctl00_ContentPlaceHolder1_InputCuil_txtCuil` |
| Botón Agregar | el `input[type=submit]` con value `Agregar` (por value, no por id) |
| Obra social de cada fila | `input[id*="ExtendCodeOS_AutocompleteText"]` |
| Código real de la obra social | el hermano oculto `..._AutocompleteValue` (el visible trae la descripción) |
| CUIL de cada fila | texto `27-40073687-7 - APELLIDO NOMBRE` en el encabezado |

El emparejamiento CUIL ↔ obra social sube por los ancestros del input hasta el primero que contenga
**exactamente un** CUIL. El "exactamente uno" es el punto: si el ancestro se pasa de tamaño y salta
al `tbody`, su texto tiene todos los CUIL de la grilla y el primero es el de otra persona — cada
input se emparejaría con el mismo y las obras sociales quedarían corridas, con todas las filas
viéndose bien. Si aparecen dos o más, **la corrida frena** en vez de exportar algo dudoso.

## Dos casos que nunca se resuelven adivinando

Lo que el script devuelve se guarda **fijo, con candado**, del lado de WeProdu: un dato mal leído no
se corrige solo.

- **Emparejamiento ambiguo** → frena y avisa. No exporta nada.
- **CUIL que ARCA rechaza** (mal tipeado, inexistente, ya dado de alta) → tras dos intentos va a la
  lista de *no se pudieron agregar*, y **no** se exporta como `CUIL,` vacío. Un vacío significa "no
  tiene obra social" y se sellaría como constatado: esa persona quedaría con un dato falso e
  inmutable. Así, sigue apareciendo como pendiente.

## Si deja de encontrar algo

El aviso flotante dice cuál de los dos falló: *"No encuentro el campo CUIL o el botón Agregar"* o
*"no pude emparejar N fila(s) con su CUIL"*. Lo primero se ajusta en `inputCuil()` / `btnAgregar()`;
lo segundo en `cuilDeLaFila()`, subiendo o bajando el tope de ancestros.

Para inspeccionar a mano lo que está leyendo, con la grilla ya cargada:

```js
document.querySelectorAll('input[id*="ExtendCodeOS_AutocompleteText"]').length
```

**Probá con 2 o 3 CUIL antes de una tanda entera**, para confirmar los selectores contra la página en
vivo.
