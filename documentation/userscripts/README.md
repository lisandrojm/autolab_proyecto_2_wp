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

Desde la app: **Contratos → Constatar obras sociales**, o **Configuración → ARCA → Conexión**. El
bloque "Requisito: extensión de validación" tiene los dos botones y dice si ya está instalada.

1. Instalá **Tampermonkey** desde [tampermonkey.net](https://www.tampermonkey.net/).
2. En Chrome, entrá a `chrome://extensions` y activá el **Modo de desarrollador** (arriba a la
   derecha). Chrome lo exige para que Tampermonkey pueda ejecutar userscripts; sin eso queda
   instalado pero no corre — y el síntoma es idéntico a no tenerlo: "No detectada".
3. En Tampermonkey → **Detalles** (en `chrome://extensions`), activá **Permitir scripts de usuario**.
   Es un permiso aparte del Modo de desarrollador y viene apagado: sin él el script carga pero queda
   **mudo** —los eventos no cruzan— y la app dice "detectada" sin que funcione nada.
4. En la app, botón **Instalar el script**: abre el `.user.js`, Tampermonkey muestra su pantalla de
   instalación y se aprieta **Instalar**.

   Instalado **desde la URL** queda vinculado a su origen (`@updateURL`) y Tampermonkey lo actualiza
   solo. Copiado y pegado a mano **no tiene de dónde actualizarse**: se queda en la versión del día
   que se pegó mientras el archivo servido avanza, y desde afuera se ve igual que "funciona" aunque
   le falten arreglos. El botón «¿Problemas? Copiar y pegar» está como salida de emergencia.
5. Volvé a la app y apretá **Probar la extensión**: tiene que decir *"Extensión activa"*.

### Los tres estados, y por qué importan

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| ✅ **Extensión activa (vX)** | el canal funciona y la versión es la vigente | nada |
| ⚠ **vX · hay vY** | responde, pero con una versión vieja | reinstalar desde el link, o *Buscar actualizaciones* |
| ⚠ **Instalada pero no responde** | el script cargó y quedó mudo | activar *Permitir secuencias de comandos del usuario* |
| ⚠ **No detectada** | no está instalado | los pasos de arriba |

Son **cuatro**, no dos. Los dos del medio se ven iguales desde afuera —"algo pasa"— pero se arreglan
de forma distinta, y confundirlos manda a reinstalar lo que ya está o a buscar un permiso que ya está
puesto.

El del medio es el caro: se parece al bueno —la marca está— y sin embargo no arranca nada, sin ningún
error que lo explique. Por eso existe el botón **Probar la extensión**: hace un ping y espera el pong.
La marca en el DOM solo prueba que el script se ejecutó una vez; el pong prueba que los eventos
cruzan, que es lo que hace falta saber ANTES de mandar a alguien a validar 21 personas.

### Por qué no se instala con un click

Chrome **intercepta cualquier `.user.js`** y corta la instalación con *"No es posible añadir
aplicaciones, extensiones ni secuencias de comandos de usuario desde este sitio web"*. No es algo que
se pueda evitar desde el servidor: pasa por la extensión del archivo en la URL, sin importar el
content-type. Por eso la vía buena es copiar y pegar en el editor de Tampermonkey, donde Chrome no
interviene.

El archivo vive en
[`frontend/public/scripts/weprodu-obra-social.user.js`](../../frontend/public/scripts/weprodu-obra-social.user.js).
Es **una sola copia**: se sirve desde donde se edita, así que no hay forma de que el que se instala
quede atrasado respecto del que está en el repo.

### Cómo sabe la app que está instalada

El script también corre en WeProdu (`autolab.fun` y `localhost:5173`), donde **no hace nada** salvo
dejar `data-weprodu-os="<versión>"` en el `<html>`. La app lee ese atributo —y no `window.__weproduOS`,
porque Tampermonkey puede correr el script en un sandbox donde el `window` no se comparte, mientras
que el DOM siempre sí— y muestra "detectada" o las instrucciones según corresponda.

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

## La sesión de ARCA dura poco — y el script cuenta con eso

Verificado en la pantalla real: la sesión se vence **en medio de una tanda** con toda naturalidad. En
20 personas es probable que pase. No es una falla: es parte del flujo normal.

Cuando pasa, el script **frena y conserva la cola**:

> ⏸ Se venció la sesión de ARCA. Volvé a loguearte y reabrí "Registrar Nuevas Altas".
> Quedan 14 por constatar — el script sigue solo.

Volvés a entrar, abrís esa pantalla y retoma donde iba. Contá con loguearte **una o dos veces** por
tanda; todo lo demás lo hace el script.

## El tope de 10 de ARCA

«Registrar Nuevas Altas» **no acepta más de 10 relaciones laborales cargadas a la vez**. Al intentar
la 11 no agrega la fila y contesta *"No es posible ingresar mas de 10 relaciones laborales a la vez"*.

El script trabaja **en tandas de 10**: carga 10, lee las 10, aprieta **Reiniciar** y sigue con las
siguientes. El progreso lo muestra — *"Validando 14 / 21 · tanda 2 de 3"*.

> **`Reiniciar` vacía la grilla sin registrar nada. Es lo contrario de `Aceptar`.** Están uno al lado
> del otro y confundirlos registraría altas reales, masivas e irreversibles por fuera del TXT. Por eso
> los dos botones se buscan por su **rótulo exacto**, nunca por posición, y `botonPorRotulo()` es el
> único lugar del script que devuelve un control accionable.

Al terminar **la grilla queda vacía**: filas cargadas son altas a medio hacer que alguien puede
confirmar por error más adelante. Si una corrida se cancela a mitad de camino, el panel ofrece un
botón **«Limpiar pantalla de ARCA»**.

## Tres casos que nunca se resuelven adivinando

Lo que el script devuelve se guarda **fijo, con candado**, del lado de WeProdu: un dato mal leído no
se corrige solo. Un vacío en el pegado significa *"ARCA dijo que esta persona no tiene obra social"*,
así que solo se emite cuando la fila apareció y el campo vino en blanco.

- **Sesión vencida** → frena sin tocar los pendientes. Se chequea **antes** de leer nada del DOM: con
  la sesión caída, cualquier cosa que se dedujera de la página sería falsa.
- **La fila no apareció** → solo cuenta como error de ESE CUIL si la sesión está viva **y** no se
  alcanzó el tope de 10. Cualquier otra causa se reintenta o frena; nunca se descarta a la persona.
  Cuando sí es error suyo (CUIL inválido, ya con relación activa, un popup) va a *no se pudieron
  consultar*, se lista aparte y **no** se exporta: sigue apareciendo como pendiente.
- **Emparejamiento ambiguo** → frena y avisa. No exporta nada.

El error que estas tres reglas evitan es el mismo: declarar en silencio *"sin obra social"* a alguien
que sí tiene, sellarlo con candado, y que sus aportes vayan a la obra social equivocada sin que nadie
se entere.

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
