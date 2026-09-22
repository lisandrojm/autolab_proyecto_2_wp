# Valoraciones en WeProdu: guía para armar un ejemplo

**Tu tarea:** en WeProdu, dejar armado un ejemplo completo de valoraciones con un proyecto real. Tiene que verse que, cuando el proyecto tiene una valoración baja (Plata), al contratar para una función se ofrece **solo la categoría más barata** de esa función, y cuando es alta (Oro), solo las caras.

Trabajás sobre el WeProdu que el usuario tenga abierto en el navegador. Las rutas de esta guía son relativas a esa dirección (por ejemplo `/valoraciones` = `<dirección de WeProdu>/valoraciones`).

---

## 1. Cómo funciona (leelo antes de tocar nada)

Una **valoración** es un nivel comercial de la productora: Plata, Oro, etc. Se configura en tres lugares:

| Dónde | Qué se define | Pantalla |
|---|---|---|
| Catálogo de valoraciones | Los niveles y el **rango de margen (%)** de cada uno | Configuración → **Valoraciones** (`/valoraciones`) |
| Roles Empresa | Para cada función, **qué valoración tiene cada una de sus categorías SAT** | **Roles Empresa** (`/roles-empresa`) |
| Proyecto | El **margen (%)** del proyecto; de ahí sale su valoración | Ficha del proyecto → tarjeta **«Valoración del Proyecto»** |

Al armar un contrato, las categorías que se ofrecen pasan por cuatro filtros, en este orden:

1. **Función** (Role Frame): solo las categorías asociadas a esa función en Roles Empresa.
2. **Convenios de la empleadora**: solo las de convenios que tiene la empresa del contrato.
3. **Convenio elegido** en el desplegable «Convenio (CCT)».
4. **Valoración**: solo las categorías que en esa función tienen la **misma valoración que el proyecto**.

Reglas que vas a ver en acción:

- **Decide el margen, no el presupuesto.** El presupuesto se carga pero no define el nivel.
- **Rangos semiabiertos:** «hasta 20» no incluye el 20. Con Plata hasta 20 y Oro desde 20, un margen de 20 % cae en Oro. Dos valoraciones activas no pueden tener rangos que se pisen: la pantalla lo rechaza.
- **La categoría «más barata» se marca en Roles Empresa**, no se calcula al contratar. El 22/9/2026 se valoraron de una vez 36 funciones con esta regla: dentro de cada convenio, la de menor **Bruto** = Plata y las demás = Oro (script `valorar:funciones`). Las 46 funciones con una sola categoría, o con todas al mismo bruto, quedaron **sin valorar a propósito**: no hay elección por precio, y el alta elige sola la única que hay.
- **Modo permisivo:** si una función no tiene ninguna categoría valorada, no se filtra nada; se comporta como siempre. Por eso cargar valoraciones no frena la contratación de las funciones que todavía no se valoraron.
- **Una categoría «Sin valorar»** dentro de una función que sí tiene otras valoradas **no se ofrece** en un proyecto valorado.
- Si la función tiene categorías valoradas pero **ninguna de la valoración del proyecto**, se muestran todas con un aviso, nunca una lista vacía.
- **Escape manual:** en la contratación hay un link **«Elegir de todas formas»**. Muestra las categorías ocultas y pide un **motivo obligatorio**, que queda guardado en el contrato.
- **Cambiar el margen no modifica contratos ya hechos.** Los que quedan con otra valoración aparecen como **«Contratos desalineados»** en la tarjeta del proyecto, para revisarlos uno por uno.
- **Valoración «por defecto»:** es a donde cae un proyecto cuyo margen no entra en ningún rango o que no tiene margen. **En este ejemplo NO se marca ninguna** (ver sección 5).

---

## 2. Reglas para vos

Esto es **producción**: los proyectos, funciones y personas son reales.

1. **No guardes ningún contrato ni asignación.** En la contratación, llegá hasta ver el desplegable de categorías, sacá la captura y **cancelá**.
2. **No borres** valoraciones, funciones ni categorías.
3. En Roles Empresa, **modificá solo la función elegida** para el ejemplo, y solo el desplegable de valoración de sus categorías. No agregues ni quites categorías.
4. **No marques ninguna valoración como «Por defecto».**
5. **Antes de cambiar un valor, anotá el que tenía** (margen, presupuesto, valoración de cada categoría). Los vas a necesitar para el informe y para revertir.
6. **Confirmá con el usuario el proyecto y la función** antes de modificarlos (paso 2).
7. Si una pantalla, un texto o un botón **no coincide con esta guía**, o aparece un error, **frená y reportá** qué viste. No improvises otro camino.

---

## 3. Pasos

### Paso 0: Verificar que el servidor tenga esta versión

Abrí `/valoraciones`.

- **Bien:** se ve la tabla (aunque esté vacía) con columnas Orden, Desde %, Hasta %, Color, Por defecto, Estado.
- **Mal:** un mensaje que dice que el servidor «no conoce esta ruta» (HTTP 404). **Frená y avisá** al usuario: el backend no tiene esta versión deployada.

### Paso 1: Catálogo de valoraciones

En `/valoraciones`:

- **Si ya existen Plata y Oro** con rangos que no se pisan, **usalas como están** y anotá sus rangos.
- **Si no existen**, creá estas dos con el botón de alta:

| Campo | Plata | Oro |
|---|---|---|
| Nombre | Plata | Oro |
| Orden | 1 | 2 |
| Margen desde (%) | *(vacío = sin mínimo)* | 20 |
| Margen hasta (%) | 20 | *(vacío = sin tope)* |
| Color | `#9ca3af` | `#d4af37` |
| Es la valoración por defecto | **No** | **No** |
| Activa | Activa | Activa |

**Resultado esperado:** dos filas, Plata «– / 20» y Oro «20 / –», ambas Activas y con «Por defecto» en No.

### Paso 2: Elegir el proyecto y la función (confirmar con el usuario)

**Proyecto.** En **Proyectos** (`/admin/projects`), buscá uno:

- activo;
- con equipo asignado;
- que no esté ya valorado, salvo que el usuario haya indicado cuál usar.

Abrilo y anotá su **nombre** y el **id** que aparece en la dirección (`/projects/<id>`).

**Función.** En **Roles Empresa** (`/roles-empresa`), buscá una función que:

- tenga **al menos dos categorías del mismo convenio** con **Bruto distinto**;
- idealmente, sea una función que se contrata en el proyecto elegido.

Hacé clic en la función para abrir su detalle. La tabla muestra **Convenio · Cód. ARCA · Nombre · Valoración · Bruto · Neto**. Anotá **todas las filas**.

> **Pedile confirmación al usuario:** «Voy a usar el proyecto X y la función Y, con estas categorías: …». Seguí recién cuando confirme.

### Paso 3: Valorar las categorías de la función

**La mayoría ya está valorada.** Si en el detalle la columna **Valoración** ya muestra Plata en la más barata de cada convenio y Oro en el resto, **no toques nada**: anotalo y seguí con el paso 4. Hacé lo que sigue solo si la función está «sin valorar» y tiene al menos dos categorías con distinto Bruto.

1. En `/roles-empresa`, tocá el **ícono de editar (lápiz)** de la función.
2. Se abre el formulario con «Nombre de la Función *» y la lista **«Categorías \*»**. Cada categoría tildada tiene al lado un desplegable con **Sin valorar / Plata / Oro**.
3. Aplicá esta regla **dentro de cada convenio**:
   - la categoría de **menor Bruto** → **Plata**;
   - las demás del mismo convenio → **Oro**.

   Se hace por convenio porque el filtro de convenio va antes que el de valoración. Así, sea cual sea el convenio que se elija al contratar, hay una opción Plata y es la barata.
4. No toques los tildes ni el nombre. Guardá.
5. Volvé a abrir el detalle de la función.

**Resultado esperado:**

- la columna **Valoración** muestra Plata en la más barata de cada convenio y Oro en el resto;
- ninguna categoría queda «sin valorar».

Si aparece un aviso tipo «1 de 2 valoraciones», la función no cubre alguno de los niveles: revisá que haya al menos una Plata y una Oro.

### Paso 4: Valorar el proyecto con margen bajo (Plata)

1. Abrí la ficha del proyecto (`/projects/<id>`).
2. Buscá la tarjeta **«Valoración del Proyecto»** y hacé clic. Se abre una ventana con:
   - **Nivel actual**;
   - campos **Margen (%)** y **Presupuesto**, con el botón **«Guardar margen»**;
   - sección **Fijar a mano**, con un botón por valoración;
   - sección **Contratos desalineados**.
3. **Anotá** el margen, el presupuesto y el nivel actuales.
4. En **Margen (%)** poné `8` y tocá **«Guardar margen»**.

**Resultado esperado:**

- **Nivel actual:** Plata, con el texto «Calculada según el margen»;
- al cerrar la ventana, la tarjeta dice **«Plata · 8% de margen»**.

### Paso 5: Ver el filtro en la contratación (SIN GUARDAR)

1. Desde la ventana, tocá **«Ir al equipo»**, o abrí `/projects/<id>/team`.
2. Tocá el botón **«Agregar miembro»**. Se abre **«Agregar Miembros al Equipo»**.
3. Elegí **cualquier persona** y avanzá hasta el paso del contrato.
4. Completá:
   - **Empresa del Contrato:** la que tenga el proyecto, o cualquiera que tenga el convenio de las categorías del paso 2;
   - **Role Frame a Desempeñar:** la función del ejemplo. Si no está en el desplegable, usá el buscador de al lado para elegirla entre todas;
   - **Convenio (CCT):** el convenio de las categorías.
5. Abrí el desplegable **«Categoría \*»**.

**Resultado esperado con Plata:**

- aparece **solo la categoría más barata**, y si es la única ya viene elegida;
- abajo se lee **«Se ocultaron N de otra valoración. Elegir de todas formas»**.

6. Tocá **«Elegir de todas formas»**. Tienen que aparecer todas las categorías, el aviso «Estás viendo categorías de otras valoraciones» y un campo de motivo. **Sacá captura.**
7. **Cancelá / cerrá la ventana sin guardar.**

**Ahora con Oro.** Volvé a la tarjeta «Valoración del Proyecto», poné margen `25` y tocá «Guardar margen». El nivel tiene que pasar a **Oro**. Repetí el paso 5: ahora el desplegable tiene que ofrecer **solo las categorías Oro**, es decir, las caras. **Cancelá sin guardar.**

Por último, dejá el margen en `8` para que el proyecto quede como **Plata**, salvo que el usuario pida otra cosa.

### Paso 6: Contratos desalineados

En la ventana de la tarjeta, mirá la sección **«Contratos desalineados»**. Lo más probable es que esté **vacía**, y es correcto: los contratos hechos antes de esta función no tienen valoración guardada, así que no cuentan como desalineados. Aparecen solo los contratos armados con una categoría valorada distinta de la del proyecto.

---

## 4. Informe final para el usuario

Reportá, en este orden:

1. **Valoraciones:** si las creaste o ya existían, con sus rangos.
2. **Proyecto:** nombre, id, y margen/presupuesto/nivel **antes y después**.
3. **Función:** nombre, y una tabla con cada categoría: convenio, código ARCA, nombre, Bruto, valoración anterior y valoración nueva.
4. **Qué ofreció el desplegable de categorías** con Plata y con Oro (captura de cada uno), y qué pasó con «Elegir de todas formas».
5. Todo lo que **no coincidió** con esta guía, con captura.
6. Confirmación de que **no se guardó ningún contrato**.

---

## 5. Para después (no es parte del ejemplo)

**La valoración por defecto.** Si se marca Plata como «por defecto», todo proyecto sin margen cargado pasa a Plata **la próxima vez que alguien lo edite**. Esto vale para cualquier edición, aunque sea del nombre, porque al guardar se recalcula la valoración. Desde ahí, en todas las funciones valoradas se le ofrece solo la categoría barata. Probablemente sea el comportamiento buscado, pero es una decisión de toda la productora: la toma el usuario, no el ejemplo.

**Cómo revertir el ejemplo:**

- **Proyecto:** en la tarjeta, borrá el margen (dejalo vacío) y guardá. Sin valoración por defecto, vuelve a «Sin valorar». Si estaba fijado a mano, primero tocá **«Volver al cálculo automático»**.
- **Función:** editala y poné cada categoría de nuevo en **«Sin valorar»**. Vuelve al modo permisivo.
- **Valoraciones:** no se borran si están en uso. Para dejar de usarlas, se pasan a **Inactiva**.
