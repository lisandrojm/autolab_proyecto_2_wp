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

---

## ⚠ Lo que seguía acá abajo está ABANDONADO

Todo lo que este documento explicaba a continuación —instalar **Tampermonkey**, activar el «Modo de
desarrollador» de Chrome, el permiso «Permitir scripts de usuario», el botón «Instalar el script»—
**ya no se usa**, y el archivo al que apuntaba (`frontend/public/scripts/weprodu-obra-social.user.js`)
está borrado desde el commit `915ad98b`.

Se sacó por completo. No falló el problema: falló el mecanismo. El sandbox de la extensión, un
permiso de Chrome que viene apagado por defecto —y cuyo síntoma era idéntico a no tener nada
instalado—, listeners que no veían los eventos, versiones que había que reinstalar a mano, copias
duplicadas peleándose la misma cola, contenido mixto al traer la lógica desde WeProdu. Cada arreglo
destapaba el siguiente y ninguno tenía que ver con leer una obra social.

**Si te encontraste con este archivo buscando cómo instalar algo, el camino de hoy es otro:**

| Qué | Dónde |
|---|---|
| El programa que hace el trabajo | `frontend/tools/asistente/` — se baja desde la pantalla de validación y se empareja solo |
| El motor que opera ARCA | `frontend/tools/validar-obras-sociales.mjs` (lee) y `registrar-obras-sociales.mjs` (escribe) |
| La guía para el usuario | «Validar obras sociales», en Configuración → ARCA |

Si todavía tenés el userscript viejo instalado, **desinstalalo**: sigue pidiendo un archivo que ya no
existe y llena la pantalla de errores. Panel de Tampermonkey → borrar «WeProdu — Puente ARCA» y
cualquier otra copia.

Este archivo se conserva recortado y no se borra porque la primera mitad sigue siendo cierta y es la
que explica **por qué** todo esto existe: que ARCA no publica la obra social por ningún webservice, y
que la clave fiscal no se guarda en ningún lado a propósito.
