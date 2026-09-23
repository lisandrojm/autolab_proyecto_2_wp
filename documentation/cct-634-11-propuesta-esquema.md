# CCT 634/11 (SATTSAID – CAPIT) — Propuesta de esquema y migraciones

**Estado: implementado (23/09/2026). Los scripts de carga están escritos pero NO se corrieron: ninguno escribió nada todavía.**

El diseño de abajo es el que se construyó; al final, en «Estado de implementación», está el detalle de qué archivo hace qué y qué queda pendiente.

Fecha: 23/09/2026 · Acta de referencia: ATA – CAPIT – SATTSAID, 2.º tramo (feb–jun 2026), expediente RE-2026-43103223-APN-DTD#JGM, firmada el 28/04/2026, Anexo A.

---

## 1. Lo que hay hoy

### 1.1 Los tres niveles

```
Convenio (0634/11)  →  ConvenioGrupo (1..12)  →  Categoria (código ARCA + nombre)
convenios: 2669        convenio-grupos: 27        categorias: 335
```

- `server/src/models/Convenio.ts` — `externalId` ("0634/11"), `name`, `signatario`, `sindicatoId`, `obraSocialDefaultId`, `fuenteEstadoDeclarado`. **Sin importes.**
- `server/src/models/ConvenioGrupo.ts:25-49` — **acá vive la escala**: `sueldoBasico`, `sueldoAdicional`, `presentismo`, `sueldoBruto`, `sueldoBrutoLetras`, `neto`, `sueldoNetoLetras`, `fechaActualizacion`, `vigenciaHasta`. Único por `{convenio, numero}` → **un solo juego de importes por grupo, sin historial**.
- `server/src/models/Categoria.ts:44-74` — puede tener escala **propia** (para convenios sin grupos). Resolución en `server/src/utils/escalaCategoria.ts`: categoría propia → grupo → ninguna, y devuelve `escalaOrigen`.
- Legacy `categorias-sat` (109 docs, importes bajo `data.*`, `data.numeroCategoria` = el grupo disfrazado).

### 1.2 Cómo se calculan hoy Bruto, Presentismo y Neto

**No se calculan en ningún lado.** Los cuatro importes se tipean a mano (modal de escala del grupo, `CategoriasArcaTab.tsx:1231-1291`) o se pisan por Excel (`POST /arca/categorias/importar`, `routes/arcaCategorias.ts:741`). Lo único derivado en todo el server es `sueldo_diario_neto = neto / 30`. La única fórmula escrita está en un **comentario** (`ProjectTeamPage.tsx:612`).

Pero **los datos sí respetan las fórmulas** (verificado contra producción, los 12 grupos de 0634/11):

| Fórmula | ¿Se cumple? |
|---|---|
| `presentismo = (básico + adicional) × 10 %` | Sí, en los 12 grupos, al centavo |
| `bruto = básico + adicional + presentismo` | Sí, con desvío de **$0,01** en G1, G7 y G8 (valor guardado literal) |
| `neto = bruto × 0,81` | Sí, en los 12 grupos, al centavo |
| `adicional = básico × B%` con B fijo por grupo | Sí: 62,5 / 49 / 38 / 35 / 32 / 29 / 26,5 / **23,5** / 21,5 / 21 / 18,5 / 16 |

Conclusión: la capa de cálculo se puede agregar **sin cambiar ningún número**, porque reproduce lo que ya está cargado. El valor guardado sigue siendo la verdad; el cálculo sirve para proponer y para auditar.

### 1.3 Paritarias

`FuenteParitaria` + `PublicacionParitaria` + cron diario 06:30 (`paritariasCronService.ts:15-16`) **sólo detectan**: bajan el PDF (`storage/paritarias/<fuenteId>/<sha256>.pdf`), extraen texto y señales. Dicho en el código: *"No lleva importes ni tablas. Extraer escalas es la capa 3 y todavía no existe"* (`PublicacionParitaria.ts:67`).

**No existe**: ninguna forma de aplicar un aumento porcentual; ningún vínculo en la base entre una publicación y un grupo/escala; ningún mecanismo de migración (95 scripts ad-hoc en `server/src/scripts` con el triplete `:dry` / aplicar / `:revertir`, `DRY_RUN=true`, respaldo JSON en `server/respaldos`).

---

## 2. Siete hallazgos de producción que cambian el diseño

1. **El tramo de junio 2026 ya está en la base, completo.** Las 106 `categorias-sat` de 0634/11 (fecha 06/07/2026) tienen, por grupo, exactamente la escala de junio: A = 1.187.208,59 para G1, B limpio, C = A×B, D = (A+C)×10 %, total = A+C+D. **Sirve como fuente verificable del seed de junio**, sin depender de que yo transcriba el Anexo A.
2. **La columna A es el básico del CCT 0131/75.** Los 12 grupos de `0131/75` (vigencia 01/06–30/06/2026) tienen el básico **idéntico** al junio de 634/11. Son dos convenios que se mueven juntos: el 131/75 pone el básico, el 634/11 le agrega el % SATTSAID-CAPIT. El diseño tiene que versionar los dos.
3. **Abril se deriva de junio y coincide con el acta.** 1.187.208,59 ÷ 1,048 = **1.132.832,62**, que es exactamente el A del grupo 1 de abril que figura en el acta. Con eso los 12 básicos de abril son derivables — pero quedan marcados `origen: 'derivado'` hasta que confirmes el Anexo A.
4. **La escala vigente de 634/11 es un tramo posterior al acta.** `fechaActualizacion: 15/09/2026`, básicos = junio × **1,06296** (~+6,3 %). O sea: el acta de feb–jun 2026 es **historia**; cargarla no toca lo vigente. Falta el acta de ese tramo (no está cargada).
5. **Los 12 grupos de 634/11 figuran hoy como "escala vencida".** Tienen `fechaActualizacion: 15/09/2026` pero `vigenciaHasta: 30/06/2026` (copiado de la plantilla de junio). Un período que termina antes de empezar. La regla de `utils/auditoriaEscalas.ts:66-70` los marca vencidos y el banner ámbar los muestra. **Es un dato existente: no lo toco sin tu OK.**
6. **G8 no cierra.** En junio B = 23,5 % exacto; en la escala vigente el adicional implica 23,5025 % (C guardado 197.475,87 vs 840.232,85 × 23,5 % = 197.454,72, diferencia $21,15). Es el caso que justifica guardar A y B como origen y además lo que dice el acta.
7. **El PDF del acta no está en el sistema.** 37 publicaciones de paritaria, 33 con texto extraído, **ninguna** menciona 634/11 ni el expediente. Habrá que adjuntarlo a mano.

---

## 3. Esquema propuesto

Regla de oro: **cinco colecciones nuevas, cero cambios destructivos.** `Convenio`, `ConvenioGrupo`, `Categoria` y `CategoriaSat` no cambian de forma y `ConvenioGrupo` sigue siendo lo que leen todas las pantallas actuales, el alta de contratos y los PDFs.

### 3.1 `convenio-escala-periodo` — la escala versionada

Un documento por `(convenio, grupo, desde)`.

| Campo | Tipo | Nota |
|---|---|---|
| `convenio` | string | "0634/11" — indexado |
| `grupo` | number \| null | 1..12; `null` para convenios sin grupos |
| `grupoId` | ObjectId? | ref `ConvenioGrupo`, cuando existe |
| `desde` / `hasta` | Date / Date\|null | `hasta` **inclusivo** (el acta dice "hasta el 30/06"); `null` = vigente |
| `basico` (A) | number | **dato de origen** |
| `adicionalPct` (B) | number \| null | **dato de origen** |
| `presentismoPct` | number | 10 por defecto |
| `adicionalMonto` (C) | number | calculado = A × B |
| `presentismoMonto` (D) | number | calculado = (A + C) × pct |
| `total` | number | calculado = A + C + D |
| `neto` / `netoFactor` | number \| null | factor 0,81 **editable y "a confirmar"** |
| `totalLetras` / `netoLetras` | string? | se conservan (los usa el PDF) |
| `acta*` (4 campos) | number? | lo que dice el acta, literal |
| `diferencias` | array | `{campo, calculado, acta, delta}` cuando \|delta\| > $0,01 |
| `acuerdoId` | ObjectId? | de qué tramo salió |
| `origen` | enum | `acta` \| `excel` \| `manual` \| `estado-actual` \| `derivado` |
| `migracion` / `nota` | string? | marca del script, para poder revertir |

Índices: único `{convenio, grupo, categoriaId, desde}`; `{convenio, desde: -1}`. La `categoriaId` entra en la clave porque en los convenios sin grupos (los de actores) `grupo` es `null` para todas, y sin ella la segunda categoría del convenio chocaría con la primera.

**Por qué colección aparte y no un array dentro de `ConvenioGrupo`:** ese documento lo lee todo el sistema (contratos, PDFs, roles); meterle historial lo engorda y sus campos hoy son `Mixed`. Con colección aparte, ninguna pantalla existente cambia de comportamiento el día 1.

**`ConvenioGrupo` = espejo del período vigente.** Al crear o cerrar un período con `desde <= hoy` y `hasta = null`, se copian los importes a `ConvenioGrupo` (incluido `fechaActualizacion = desde` y `vigenciaHasta = hasta`). Así "aplicar paritaria" sigue impactando en contratos y PDFs como hoy. **La migración inicial no espeja nada**: sólo inserta.

### 3.2 `adicional-convenio` — el catálogo nuevo

`convenio`, `codigo`, `nombre`, `tipoCalculo` (`monto_fijo` \| `por_anio_antiguedad` \| `por_evento` \| `mensual` \| `porcentaje` \| `a_confirmar`), `remunerativo` (bool \| **null = a confirmar**), `confirmado` (bool → la UI muestra chip ámbar "a confirmar"), `base` (sólo si es porcentaje), `unidad` ("por comida", "por año"), `condicion` (texto libre), `conceptoLiquidacion`, `codigoArca`, `capitulo` (`general` \| `pequenas_empresas`), `orden`, `isActive`. Único `{convenio, codigo}`.

### 3.3 `adicional-valor-periodo` — el historial de cada adicional

`adicionalId`, `convenio`, `grupo` (`null` = todos), `desde`, `hasta`, `monto`, `porcentaje`, `acuerdoId`, `origen`, `nota`. Único `{adicionalId, grupo, desde}`.

### 3.4 `escala-pequenas-empresas`

`convenio`, `grupo` (1..12), `desde`, `hasta`, `semana9hsLunVie`, `jornadaAdicional9hs`, `horaExtra50`, `horaExtra100`, `acuerdoId`, `origen`. Validación: si \|`jornadaAdicional9hs` − `semana/5`\| > $0,01 **se guarda igual y se avisa** (no se corrige el dato del acta). Único `{convenio, grupo, desde}`.

### 3.5 `acuerdo-paritario`

`convenios[]` (`["0634/11","0131/75"]`), `partes[]` (`["ATA","CAPIT","SATTSAID"]`), `periodoParitario{desde,hasta}`, `expediente`, `firmadoEl`, `homologacion{estado,resolucion,fecha}` (estado incluye `a_confirmar`), `tramos[]` = `{codigo, desde, porcentaje, base, baseDesde, acumulativo, regimen: 'general'|'alternativo', absorbe, nota}`, `clausulaAbsorcion{texto, aplica}`, `regimenAlternativo{descripcion, empresaIds[]}`, `publicacionParitariaId` (**el vínculo que hoy no existe**), `archivo{ruta,nombreOriginal,contentType,bytes,subidoEl}`.

Para 634/11: tramo 01/04/2026 +9,5 % sobre marzo; tramo 01/06/2026 +4,8 % sobre mayo; régimen alternativo 01/04 +7 %, 01/05 +9,5 % sobre marzo absorbiendo el 7 %, 01/06 +4,8 %.

**Las empresas del régimen alternativo van en `regimenAlternativo.empresaIds`, no en `Company`** — así no se toca el modelo de empresa y la asignación viaja con el acuerdo (se edita con el `EmpresasDelItemArca` que ya existe).

### 3.6 El PDF del acta

Patrón ya probado en el repo: multer a disco bajo `storage/actas/<hash>.pdf` + descarga por endpoint autenticado (igual que `archivoParitariaService.ts` y `GET /paritarias/publicaciones/:id/archivo`). **No** uso "Documentos", que es un explorador de Dropbox, no un adjuntador.

---

## 4. Migraciones (scripts, con `:dry` y `:revertir`)

No hay framework de migración, así que sigo la convención del repo: `DRY_RUN=true` por defecto, respaldo JSON en `server/respaldos`, campo `migracion` en cada documento insertado para poder revertir con exactitud. **Ninguna corre sin que me lo pidas.**

| # | Script | Qué hace | Reversión |
|---|---|---|---|
| 1 | `migrar:escalas-periodo` | Por cada uno de los 27 `ConvenioGrupo` inserta su período "estado actual" (`desde = fechaActualizacion`, `hasta = vigenciaHasta`, `origen: 'estado-actual'`), copiando importes **tal cual**, sin recalcular. No toca `ConvenioGrupo`. Saltea los 2 grupos con `convenio: ""` y el `9999/99`, y los lista. | borra los de `migracion: 'escalas-periodo-v1'` |
| 2 | `seed:634-acuerdo` | El acuerdo con tramos, expediente, régimen alternativo y cláusula de absorción (va primero: los períodos lo referencian) | borra por expediente |
| 3 | `seed:634-junio-2026` | Período 01/06–30/06/2026, 12 grupos, desde `categorias-sat` (verificado) o desde el Anexo A si me lo pasás → `origen: 'acta'` | ídem |
| 4 | `seed:634-abril-2026` | Período 01/04–31/05/2026, A = junio ÷ 1,048 → `origen: 'derivado'`; con `ARCHIVO=<ruta>` toma la tabla real y marca `origen: 'acta'` | ídem |
| 5 | `seed:634-adicionales` | Catálogo de 7 adicionales + valores abril/junio, todos con `confirmado: false` y `remunerativo: null` | ídem |
| 6 | `seed:634-pequenas-empresas` | **Bloqueado**: no tengo los importes. Queda el modelo y el script esperando la tabla | — |

En el caso 1, 634/11 tiene `hasta (30/06)` < `desde (15/09)`: el script guarda `hasta: null` + `nota` explicando el origen y lo reporta. **No corrige el `ConvenioGrupo`** (hallazgo 5, decisión tuya).

---

## 5. API

Router nuevo `server/src/routes/escalasConvenio.ts` montado en `/arca/escalas` (no meto más en `arcaCategorias.ts`, que ya tiene 863 líneas). Permiso: el mismo que usa la pantalla hoy, `config_holidays:view`.

**Lectura**
- `GET /arca/escalas?convenio=0634/11&fecha=2026-05-10` → escala por grupo + adicionales + pequeñas empresas + acuerdo, **vigentes a esa fecha** (el "ver escala a la fecha" de la UI).
- `GET /arca/escalas/periodos?convenio=` → períodos para el selector.

**ABM** (`GET`/`POST`/`PUT`/`DELETE`): `/periodos`, `/adicionales`, `/adicionales/:id/valores`, `/pequenas-empresas`, `/acuerdos`, `POST /acuerdos/:id/archivo` (multipart).

**Aplicar paritaria**
- `POST /arca/escalas/aplicar-paritaria/preview` → `{convenio, porcentaje, baseDesde, desde, regimen, incluirAdicionales, incluirPequenasEmpresas}` → tabla **actual → propuesto** por grupo y por adicional. **No escribe nada.**
- `POST /arca/escalas/aplicar-paritaria` → recibe **las filas finales** (el preview es editable, así podés corregir los centavos), crea el período nuevo, cierra el anterior con `hasta = desde − 1 día` y espeja en `ConvenioGrupo` si es el vigente. Idempotente por `(convenio, desde)`.

**Cálculo**
- `POST /arca/escalas/liquidacion-referencia` → `{categoriaId | (convenio, grupo), fecha, aniosAntiguedad?, comidas?, meriendas?, exteriores?, subidasTorre?, guarderia?, ropa?, pequenaEmpresa?}` → desglose `{basico, adicionalPct, adicionalMonto, presentismo, antiguedad, otros[], brutoRemunerativo, brutoNoRemunerativo, bruto, neto, advertencias[]}`. Todo adicional con `confirmado: false` sale también en `advertencias`.

**Utils puros, testeables, separados de las rutas** (como `valoracionPorBruto.ts`): `escalaCalculo.ts` (`calcularEscalaGrupo` + `compararConActa(tolerancia 0,01)`), `escalaAFecha.ts` (`periodoVigente`, con `hasta` inclusivo — **criterio distinto al semiabierto de valoraciones, queda documentado**), `aplicarParitaria.ts` (`proponerParitaria`), `liquidacionReferencia.ts`. Y `auditoriaEscalas.ts` se extiende para mirar también adicionales y pequeñas empresas.

---

## 6. UI

`CategoriasArcaTab.tsx` ya tiene 1565 líneas: **no le agrego las cuatro sub-pestañas adentro**. Contenedor nuevo `EscalaConvenioTabs.tsx` con `?tab=` en la URL (patrón de `ContratosPage.tsx:132-142`), sticky debajo de la barra de convenios (que ocupa `top-[177px]`):

1. **Escala por grupo** — monta **la tabla que ya existe**, sin moverla, y le agrega las columnas A, %B, C, D, Total, Neto con el chip de diferencia vs acta cuando hay desvío.
2. **Adicionales** (`AdicionalesConvenioTab.tsx`) — Adicional / Tipo / Remunerativo / Valor vigente / Vigencia / Acciones, ABM completo, "ver historial" por adicional, chip ámbar "a confirmar".
3. **Pequeñas empresas** (`PequenasEmpresasTab.tsx`) — 12 grupos × 4 valores.
4. **Acuerdos / Historial** (`AcuerdosParitariosTab.tsx`) — tramos con fecha, %, base, régimen, expediente y PDF; selector **"ver escala a la fecha"** que recalcula las otras sub-pestañas.
5. **Ficha del convenio** — número, nombre, partes, sindicato (reusa `CeldaSindicato`) y régimen alternativo con `EmpresasDelItemArca`.

Selector de período: dos `<input type="date">` al estilo `SearchAndFilters.dateFilter` (no existe un componente de período reutilizable). Fechas con `formatearFechaCalendario`. El botón **«Paritaria»** pasa a ofrecer dos caminos: *desde Excel* (lo de hoy, intacto) y *por porcentaje* (nuevo, con preview editable).

---

## 7. Tests (con valores del acta)

- `escalaCalculo.test.ts` — **G1 abril**: A = 1.132.832,62; B = 62,5 % → C = 708.020,39; D = 184.085,30; total = 2.024.938,31. **G1 junio**: A = 1.187.208,59 → C = 742.005,37; D = 192.921,40; total calculado 2.122.135,36 vs acta 2.122.135,35 → el test verifica que **se reporta la diferencia de $0,01 y no se pisa el valor del acta**. Ídem G7 y G8. G12 junio: A = 615.952,41; B = 16 % → total 785.955,27.
- `escalaAFecha.test.ts` — 15/05/2026 → abril; 01/06 y 30/06 → junio; 01/07 → el siguiente; borde con `hasta: null`.
- `aplicarParitaria.test.ts` — junio = abril × 1,048 reproduce los 12 básicos; y **los adicionales no cierran**: Antigüedad 10.086,75 × 1,048 = 10.570,91 vs acta 10.570,92 (igual Meriendas, Comidas, Guardería, Ropa; sólo Exteriores coincide). El test fija que el preview **avisa y deja corregir**, no fuerza.
- `liquidacionReferencia.test.ts` — G1 junio + 3 años + 2 comidas, y que los "a confirmar" salen en `advertencias`.

---

## 8. Lo que queda "a confirmar" (no lo invento)

| # | Punto | Por qué |
|---|---|---|
| 1 | `tipoCalculo` de los 7 adicionales | No figura en el acta. Mi sugerencia queda cargada con `confirmado: false` |
| 2 | `remunerativo` de cada adicional | No figura en el acta → `null` |
| 3 | Ropa: periodicidad | ¿Mensual, semestral, anual? |
| 4 | Guardería: a quién aplica | Texto de la condición |
| 5 | `netoFactor = 0,81` | Hoy es un número mágico que sólo vive en un comentario y en los datos. ¿Se confirma, o se desagrega en aportes? |
| 6 | `presentismoPct = 10 %` para los 12 grupos | Se cumple en los datos, pero conviene que lo confirmes como regla |
| 7 | Fin del tramo de junio y el acta del tramo vigente | El vigente (15/09/2026, +6,3 % sobre junio) no tiene acta cargada |
| 8 | G8: 23,5 % vs 23,5025 % | ¿Corrijo la escala vigente o sólo lo reporto? |
| 9 | `vigenciaHasta 30/06/2026` en los 12 grupos vigentes | Los marca "vencidos" en el banner. ¿Lo corrijo? Es dato existente |
| 10 | `categorias-sat` quedó en junio | ¿Se sincroniza con el vigente o se deja como está? Afecta lo que muestran contratos viejos |

## 9. Lo que necesito de vos para sembrar

1. **Anexo A completo** (12 grupos × abril y junio) o el PDF del acta → para no sembrar valores derivados. Junio ya lo puedo reconstruir de la base; abril quedaría derivado.
2. **Pequeñas empresas**: los 4 valores × 12 grupos. No están en ningún lado del sistema.
3. **PDF del acta**: no está en paritarias (37 publicaciones, ninguna menciona 634/11).


---

## 10. Estado de implementación

Todo lo de arriba está programado. Lo que **no** pasó: ningún script de carga se corrió, así que la base no cambió en nada — sólo el dry-run de la migración, que por construcción no escribe.

### Server

| Qué | Archivo |
|---|---|
| Cuenta de la escala (A, B → C, D, total, neto) y cotejo con el acta | `server/src/utils/escalaCalculo.ts` |
| Vigencias: qué rige a una fecha, superposiciones, `hasta` inclusivo | `server/src/utils/escalaAFecha.ts` |
| Proponer una paritaria por porcentaje | `server/src/utils/aplicarParitaria.ts` |
| Liquidación de referencia | `server/src/utils/liquidacionReferencia.ts` |
| Lo que comparten rutas y scripts: armar período, validar, **espejar el vigente** | `server/src/services/escalasConvenio.ts` |
| Modelos | `EscalaPeriodo`, `AdicionalConvenio`, `AdicionalValorPeriodo`, `EscalaPequenasEmpresas`, `AcuerdoParitario` |
| API (`/api/v1/arca/escalas`) | `server/src/routes/escalasConvenio.ts` |
| Tests (57, todos con valores del acta) | `npm run test:escalas-634` |

### Scripts (ninguno corrido)

```
npm run escalas-periodo:dry      # ✅ corrido: no escribe. Insertaría 24 períodos
npm run escalas-periodo          # inserta la foto del estado actual, sin tocar convenio-grupos
npm run 634-acuerdo[:dry]        # el acta, sus tramos y el régimen alternativo
npm run 634-tramos[:dry]         # abril y junio 2026 (junio desde categorias-sat; ARCHIVO=<anexo.json> para el Anexo A real)
npm run 634-adicionales[:dry]    # los 7 adicionales con sus dos importes
npm run 634-pequenas             # bloqueado: exige ARCHIVO=<ruta.json>, los importes no están en ningún lado
```

Los tres primeros tienen `:revertir`. El dry-run de la migración ya mostró lo que hay:

- **24 períodos** a insertar (12 de 0634/11 y 12 de 0131/75), 3 grupos salteados (2 sin convenio, 1 sin importe).
- **G8 de 0634/11 no cierra por $99,16** en el total: su adicional implica 23,5025 % en lugar del 23,5 % del acta. Queda registrado en `diferencias`, sin corregir nada.
- Los 12 grupos de 0634/11 tienen la **vigencia imposible** (hallazgo 5): se guardan con `hasta: null` y una nota, y el `ConvenioGrupo` no se toca.

### Frontend

`frontend/src/api/escalasConvenio.ts` y `frontend/src/components/arcaCategorias/escalas/`: las cinco sub-pestañas (`SubPestanasEscala`, `EscalaConvenioTabs`, `AdicionalesConvenioTab`, `PequenasEmpresasTab`, `AcuerdosParitariosTab`, `FichaConvenioTab`), el modal de **aplicar paritaria con preview editable**, el de **liquidación de referencia** y las piezas compartidas (`piezas.tsx`).

En `CategoriasArcaTab.tsx` la intervención fue mínima: la barra de sub-pestañas, una salida temprana para las cuatro nuevas, los dos botones («Paritaria %» y «Liquidación») al lado del de Excel —que **no cambió**— y la columna **% Adic.** en la tabla de grupos, que marca en ámbar los porcentajes que no son redondos.

### Verificado de punta a punta

Con el server local y la base de desarrollo (que no tiene convenios cargados) se probó el circuito completo y después se borró todo lo creado: el período de abril reproduce el acta al centavo, la superposición se rechaza con 409, el espejo se escribe **sólo** cuando el período rige hoy, la lectura al 15/06/2026 devuelve «sin período cargado» (el hueco real entre julio y septiembre), el preview del +4,8 % da 1.187.208,59 de básico y el centavo de diferencia en Antigüedad, y la liquidación sale con sus cuatro advertencias.

### Pendiente

1. **Correr los scripts** (con tu OK, y en este orden): `escalas-periodo` → `634-acuerdo` → `634-tramos` → `634-adicionales`.
2. **Datos que faltan**: el Anexo A completo, los valores de pequeñas empresas y el PDF del acta.
3. **Deploy**: el VPS corre el `dist` commiteado, así que hasta que no se haga `npm run build` en server y frontend y se commitee el `dist`, nada de esto existe en producción.
4. Las tres decisiones de la sección 8 sobre datos existentes (vigenciaHasta, G8, `categorias-sat`).
