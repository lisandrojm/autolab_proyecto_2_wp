# Catálogo de ARCA y categorías

Cómo se mantiene el catálogo de ARCA y qué significa el estado de cada categoría.

## El problema que resuelve

El código de ARCA de una categoría era un texto libre, en la misma fila que el nombre y la escala, sin nada contra qué validarlo. Así 41 categorías del 0634/11 (grupos 2, 5 y 7) quedaron con el código de otra categoría de su grupo, y unos 1.400 contratos declararon ante ARCA una categoría que no era la de la persona.

- **Origen:** el cruce venía de FRAME (`categorias-sat` tenía los mismos códigos).
- **Antecedente:** se corrigió el 17/08/2026 y el 22/09/2026 algo volvió a escribir los códigos viejos.
- **Corrección vigente:** se volvió a corregir el 2/10/2026 con `npm run categorias:codigos`.

## Las dos capas

**1. El espejo de ARCA** (colección `arca_catalogo`, modelo `ArcaCatalogo`). Es lo que ARCA publica, tal cual.

- Tiene una fila por `(tabla, filtroPadre, codigo)`, con clave única. En las categorías, `filtroPadre` es el convenio.
- Guarda la descripción literal, si está vigente, cuándo se vio por primera y por última vez, y desde qué CUIT (`fuentes`).
- **No se edita a mano.** Solo escriben la semilla desde el CSV y la aplicación de una lectura de ARCA confirmada. Un test (`espejoSoloLectura.test.ts`) falla si una ruta de ABM lo toca.
- **Nada se borra.** Lo que ARCA deja de publicar pasa a `vigente: false`.
- Cada lectura queda en `arca_catalogo_lecturas` (modelo `ArcaCatalogoLectura`): quién, cuándo, con qué empleadora, cantidad y hash por tabla, y el diff.

**2. Las categorías de WeProdu** (`categorias`).

- Conservan nombre propio, grupo y escala.
- El código **se elige** de las filas vigentes del espejo para el convenio; ya no se tipea.
- La «Descripción de ARCA» sale del espejo.
- El índice `{convenio, codigoArca}` es **único** entre las activas con código.

## Estado de una categoría

Lo calcula `estadoCategoria` en `server/src/compartido/catalogoArca.ts`:

| Estado | Qué significa | ¿Permite el alta? |
|---|---|---|
| `ok` | El código existe, está vigente, el grupo coincide y el nombre corresponde a la descripción de ARCA | Sí |
| `nombre_distinto` | El nombre no se parece a lo que ARCA dice de ese código | Solo si alguien lo confirmó para esa misma descripción |
| `grupo_distinto` | ARCA ubica el código en otro grupo («- GRUPO N») | No |
| `no_existe_en_arca` | ARCA no tiene ese código para el convenio | No |
| `no_vigente` | ARCA dejó de publicar ese código | No |

Sin espejo sembrado el estado es `null`: no se sabe y no se bloquea.

**Dónde se aplica:**
- en el servidor, al crear, editar o reactivar una categoría (`validarCategoriaArca.ts`; con nombre distinto contesta 409 y pide confirmación);
- en la importación de escalas por Excel;
- en el chequeo de completitud del alta (`afipCompleteness.ts`, check `categoriaArca`);
- en la validación del lote de altas del servidor (`validarLoteAltas.ts`).

En la pantalla de Categorías, un banner rojo lista las categorías que no están `ok` y cuántos contratos afectan.

## Cómo se actualiza el catálogo

1. **Semilla desde el CSV del repo:** `npm run catalogo-arca:sembrar:dry` y después `npm run catalogo-arca:sembrar` (desde `server/`).
2. **Lectura desde ARCA:** Configuración → ARCA → **Catálogo de ARCA** → «Leer de ARCA» en la empleadora.
   - Lee los `window.l_*` de Registrar Nuevas Altas y las obras sociales, sin apretar ningún botón.
   - Deja un diff **pendiente** (nuevos, dejaron de publicarse, descripción cambiada) con las categorías y los contratos que toca cada cambio.
   - Se aplica o se descarta ahí mismo.
   - Las tablas que dependen de la empleadora (convenios, domicilios, actividades) nunca dan de baja nada desde una sola lectura.
   - Aplicar una descripción cambiada en un código que usa una categoría le quita la confirmación: vuelve a `nombre_distinto` hasta que alguien la revise.
3. **Regenerar el CSV desde el espejo:** `npm run catalogo-arca:exportar-csv`. Escribe el archivo con su formato exacto (BOM, CRLF), así la actualización es un commit revisable.
4. **Aviso:** en Contratos, en la pestaña de una empresa, aparece un aviso ámbar si el catálogo no se leyó desde ARCA con esa empleadora en los últimos **30 días**. Solo avisa.

⚠ **Sin confirmar:** si los `window.l_*` existen con la grilla de altas vacía. Se verifica con el comando `catalogos` de `server/src/scripts/reconocerAltasArca.ts`.

## Scripts

| Script | Qué hace |
|---|---|
| `categorias:codigos[:dry]` / `:revertir -- <respaldo>` | Corrige el código de las categorías del 0634/11 por nombre (también `categorias-sat`) y completa la descripción. Respaldo en `server/respaldos/`. `CONVENIOS=…` audita otros convenios, solo reporte |
| `categorias:altas-cruzadas` | Solo lectura: CSV con las altas ya hechas con alguna de las 41 categorías cruzadas, para decidir rectificaciones |
| `categorias:indice-unico[:dry]` | Crea el índice único (verifica duplicados antes) |
| `catalogo-arca:sembrar[:dry]` | Siembra el espejo desde el CSV |
| `catalogo-arca:exportar-csv` | Regenera el CSV desde el espejo |

## Datos del CSV

- `0131/75` tiene una línea repetida idéntica (`000401`): por eso son 219 filas y 218 categorías.
- En el 0131/75 la «Nª CATEGORIA» de ARCA es la categoría de la emisora, no una escala, y los nombres se repiten (hay tres «UTILERO»). Ahí la consistencia se valida por código.
