# Traer las obras sociales de ARCA en una corrida

El RNOS de cada persona no se puede pedir por API: el único webservice conectado (Consulta Padrón
A13) devuelve datos del contribuyente y no la obra social, y Simplificación Registral es una app de
clave fiscal sin webservice. Lo que sí se puede automatizar es el tipeo, **dentro de la sesión que ya
abriste vos**: sin guardar la clave fiscal en ningún lado y sin captchas que resolver.

## Instalación (una sola vez)

1. Instalá **Tampermonkey** en Chrome (o Violentmonkey en Firefox).
2. Abrí el panel de la extensión → *Crear nuevo script* → pegá el contenido de
   [`arca-obras-sociales.user.js`](arca-obras-sociales.user.js) → guardar.

Hace falta una extensión y no alcanza un bookmarklet porque cada *Agregar* es un postback de ASP.NET
que recarga la página entera: el script tiene que volver a inyectarse en cada carga y retomar la cola
donde iba.

## Uso

1. En WeProdu: **Contratos → Alta temprana → elegí la empleadora** → botón *"N obras sociales sin
   constatar"* → **Copiar los N CUIL**.
2. En ARCA: entrá a Simplificación Registral con tu clave fiscal, elegí el CUIT y andá a
   **Relaciones Laborales → Registrar Nuevas Altas**. Abajo a la derecha aparece el panel del script.
3. Pegá los CUIL → **Arrancar**. El script recorre la lista solo. Podés frenarlo y reanudarlo.
4. Al terminar: **Copiar resultado** → volvé a WeProdu y pegalo en *"Aplicar lo que devolvió ARCA"*.

El resultado es `CUIL,RNOS` por línea. **Un RNOS vacío no es un error**: significa que ARCA no tiene
obra social registrada para esa persona, y WeProdu lo guarda como consultado aplicando la del
convenio.

## Lo que el script NO hace

`Registrar Nuevas Altas` es el formulario que **da de alta** relaciones laborales ante el organismo.
Un script suelto ahí puede registrar altas reales y sin vuelta atrás, así que el permiso está escrito
como **lista blanca**: hay una sola función que puede accionar un control, y solo acepta el botón
cuyo texto es exactamente *Agregar*. Cualquier control que mencione confirmar, registrar, aceptar,
grabar, enviar o alta queda excluido, y nunca se llama a `__doPostBack` ni a `form.submit()` a mano
(eso saltearía el filtro).

**Si ARCA cambia el flujo y *Agregar* pasa a confirmar el alta, este script deja de ser seguro.**
Antes de tocar la constante `BOTON_SEGURO`, verificá en la pantalla qué hace el botón nuevo.

## Si deja de encontrar los campos

Los ids de WebForms son generados y cambian entre pantallas, así que el script busca por lo que se
ve (el rótulo "CUIL", el botón "Agregar"). Si algo no aparece, usá el link **diagnóstico** del panel:
dice qué encontró y qué RNOS está leyendo en ese momento. Con eso se ajustan las funciones
`inputCuil()`, `botonAgregar()` y `leerRnos()`.
