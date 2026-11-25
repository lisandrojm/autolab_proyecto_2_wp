# Proveedores: datos de ARCA en Tango

Al dar de alta un proveedor, además del CUIT hay que consultar en ARCA la **Constancia de
Inscripción**: a qué impuestos y regímenes está inscripto. Esos datos se cargan en Tango.
Este documento responde tres preguntas:

1. En qué campos de Tango va cada dato de la constancia.
2. Cuáles incluye el formulario acotado de lumba-tango.
3. Si en las empresas reales ya se cargan.

- **Fuentes:** el formulario real de Tango (`catalogo/2026-10-08/procesos/Compras/3142/3142-form.json`),
  el formulario simplificado de lumba-tango
  (`server/assets/process/simplified-forms/3142-simplified-form.json`) y lecturas por API
  de las empresas reales.
- **Relevado el 2026-10-08.** Solo lectura en las empresas reales; acá van solo
  estadísticas, sin datos de proveedores.

## 1 y 2. Dónde va cada dato en Tango

El formulario de Proveedores de Tango tiene las solapas Principal, Impuestos,
Resoluciones, Comprobantes, Pagos, Artículos/Conceptos, Contactos, Clasificación,
Sucursales y Observaciones. Los datos fiscales están en **Principal** e **Impuestos**.

| Dato de la constancia | Campo en Tango (solapa) | Valores | En el form de lumba-tango |
| --------------------- | ----------------------- | ------- | ------------------------- |
| CUIT | `ID_TIPO_DOCUMENTO_GV` (80, C.U.I.T.) y `N_CUIT` (Principal) | `XX-XXXXXXXX-X` | Sí |
| Razón social | `NOM_PROVEE` (Principal) | | Sí |
| Domicilio fiscal | `DOMICILIO`, `LOCALIDAD`, `C_POSTAL`, `ID_CPA57` (provincia) (Principal) | | Sí |
| Actividad principal | `N_IVA`, "Actividad" (Principal) | Texto, hasta 160 caracteres | Sí |
| IVA: inscripto, exento o monotributo | `ID_CATEGORIA_IVA_COND_IVA`, "Categoría IVA" (Impuestos) | RI, RS (monotributista), EX, CF, … | Sí |
| Liquida IVA / percepciones de IVA | `IVA_L`, `IVA_S` (Impuestos) | | Sí |
| Ganancias: inscripto y régimen de retención | `CALCU_RET`, "Aplica retenciones en los pagos" (Impuestos) | S o N | **No** |
| | Sub-tabla **`RETENCIONES`**: una fila por retención, con `TIPO_RETEN` y `COD_RETEN` (Impuestos > Retenciones) | Ver tabla de retenciones abajo | **No** |
| | `ID_CLASIFICACION_RETENCION` (Impuestos) | En las empresas reales solo existe 1, "SIN CLASIFICAR" | **No** |
| Monotributo: retenciones | Sub-tabla `RETENCIONES`, códigos `O M1` a `M4` | | **No** |
| Ingresos Brutos (provincial, no viene en la constancia) | `TIPO` (régimen), `N_ING_BRUT`, `CM_VIGENCIA_COEFICIENTE` y sub-tabla `PROVEEDOR_CM_JURISDICCION` (Impuestos) | | Sí |
| Exenciones (certificado) | En cada fila de `RETENCIONES`: `CERT_EXEN`, `PORC_EXEN`, `DESDE_EXEN`, `HASTA_EXEN` | | **No** |

- **La sub-tabla Retenciones tiene un botón "Actualizar según padrones".** Tango puede
  completar retenciones desde padrones. No se probó y no está en la API.
- **Lo que le falta al form de lumba-tango para la constancia** es la parte de
  retenciones: `CALCU_RET`, la sub-tabla `RETENCIONES` y la clasificación. Lo de IVA,
  actividad, domicilio y CUIT ya está.

### Tabla de retenciones

Es el proceso **Retenciones (19706)**, igual en las empresas reales. Este es el contenido de
FZERO SRL:

| Tipo | Código | Descripción |
| ---- | ------ | ----------- |
| G (Ganancias) | 01 | Compra de Bienes |
| G | 02 | Honorarios |
| G | 03 | Alquiler muebles e inmuebles |
| G | 04 | Intereses en otras operaciones |
| G | 05 | Honorarios sujetos No Inscript |
| G | 06 | Facturas M |
| G | 15 | Locación de obra y servicios |
| I (IVA) | 01 | Ret. IVA Compra de Bienes |
| I | 02 | Ret. IVA Honorarios |
| I | 03 | Ret. IVA Facturas M |
| O (Otras) | 1 | Otras retenciones |
| O | 2 | Retención AR.CI.BA |
| O | M1 | Monotributo - Gcias - Servicio |
| O | M2 | Monotributo - Gcias - Bienes |
| O | M3 | Monotributo - IVA - Serv. 21% |
| O | M4 | Monotributo - IVA - Bs. 21% |

## 3. Qué se carga en las empresas reales

Empresas con proveedores: FZERO SRL (3), 2030 SRL Gestion (8), FZERO CORP (9) y GRINI SRL
(12). 2030 SRL (6) no tiene proveedores. "Recientes" son las últimas 200 altas de cada
empresa, por fecha de alta.

| | FZERO SRL (3) | 2030 Gestion (8) | FZERO CORP (9) | GRINI (12) |
| - | -: | -: | -: | -: |
| Proveedores | 5.696 | 4.595 | 4.355 | 59 |
| Tipo de documento CUIT (recientes) | 100% | 100% | 97% (2 CUIL, 4 sin identificar) | 100% |
| Categoría IVA (recientes) | RI 146, RS 44, CF 6, EX 4 | RS 139, RI 56, CF 4, EX 1 | RI 119, RS 56, EX 18, CF 7 | RI 33, RS 24, CF 2 |
| **Actividad (`N_IVA`)** cargada, total / recientes | 38% / **96%** | 23% / **98%** | 18% / **86%** | 93% / 93% |
| `CALCU_RET = S`, total / recientes | 41% / 49% | 29% / **96%** | 26% / **97%** | 100% |
| **Con retenciones cargadas** (`RETENCIONES`) | 102 (1,8%) | 87 (1,9%) | 83 (1,9%) | 1 |
| Tipos de retención (muestra) | Solo **G**: 03, 15 | Solo **G**: 01, 02, 03, 15 | Solo **G**: 01, 02, 03, 15 | G 02 |
| Ingresos Brutos (`TIPO`, `N_ING_BRUT`) | 4 de 5.696 | 3 | 3 | 0 |
| Jurisdicciones CM | 0 en la muestra | 0 | 0 | 0 |
| Exenciones cargadas | 0 en la muestra | 0 | 0 | 0 |

Lo que se ve:

- **Se carga en la práctica:** CUIT, categoría de IVA y **actividad**. En las altas
  recientes, la actividad tiene el texto de ARCA (por ejemplo, "VENTA AL POR MENOR DE
  ARTÍCULOS DE FERRETERÍA Y MATERIALES ELÉCTRICOS"). Antes casi no se cargaba, así que es
  una práctica nueva.
- **"Aplica retenciones" (`CALCU_RET`):** en 2030 Gestion y FZERO CORP las altas recientes
  casi siempre van con `S`. En FZERO SRL, la mitad.
- **El régimen de retención de Ganancias** se carga en pocos proveedores, en la
  sub-tabla `RETENCIONES`. Siempre tipo G, con el código del concepto: bienes, honorarios,
  alquileres, locación de obra y servicios. En FZERO SRL, 13 de los 102 son altas de 2026.
- **No se carga:** Ingresos Brutos, Convenio Multilateral, exenciones, retenciones de IVA
  ni de Monotributo, y la clasificación de retención (todos "SIN CLASIFICAR").

## Para el connector y el Excel

- **Lo mínimo para un alta "como se hace hoy":** los 10 campos obligatorios
  (`api-escritura.md`), más actividad (`N_IVA`), categoría de IVA y `CALCU_RET`.
- **Retenciones de Ganancias:** van en la sub-tabla `RETENCIONES` del body de `Create`,
  con `TIPO_RETEN = G` y el `COD_RETEN` del concepto. **El alta con sub-tablas todavía no
  se probó** (está en los pendientes de `api-escritura.md`).
- **Qué retención corresponde según la constancia** es una regla del contador: qué
  concepto de Ganancias según la actividad, y qué hacer con monotributistas y exentos.
  Hay que definirla con él antes de automatizarla.
- **`N_IVA` tiene un máximo de 160 caracteres.** En las 4 empresas hay actividades que
  llegan justo a 160: se cortan. Si un proveedor tiene varias actividades en ARCA, hay que
  decidir cuál va (la principal) o cómo se resume.
