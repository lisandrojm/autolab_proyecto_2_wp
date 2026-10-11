import type { ContractOverviewRow } from "./tiposArca.js";
import type { CategoriaSatItem } from "./tiposArca.js";
import type { ContratoItem } from "./tiposArca.js";
import type { SimpleCatalogItem } from "./tiposArca.js";
import type { InfoItem } from "./tiposArca.js";
import { DefaultsArca, OrigenValorArca } from "./cascadaArca.js";
import type { ArcaSucursal } from "./tiposArca.js";
import { type EstadoCategoriaArca } from "../catalogoArca.js";
import type { ProblemaDeSucursal } from "../sucursalesDeEmpresa.js";
export interface AfipCatalogs {
    categorias: CategoriaSatItem[];
    tipos: ContratoItem[];
    obrasSociales: SimpleCatalogItem[];
    sedes: InfoItem[];
    /**
     * Los Estados, para derivar si el contrato genera alta temprana.
     *
     * OPCIONAL a propósito: sin ellos se cae al booleano persistido del tipo de contrato, que es lo
     * que había antes de que el estado impositivo fuera la única fuente. Es una red de contención de
     * la transición, no un segundo criterio — la expresión sigue siendo una sola (`altaTemprana.ts`).
     */
    estados?: InfoItem[];
    /**
     * Empleadoras, con lo que cada una tiene REGISTRADO ante ARCA. Los nomencladores son universales;
     * cada CUIT registra su subconjunto, y ARCA solo acepta altas dentro de él.
     */
    empresas?: Array<{
        _id: string;
        /** Obra social de los EXCLUIDOS DE CONVENIO (9999/99). No aplica al resto. */
        obraSocialDefaultId?: number | null;
        /** Excepciones por convenio: para ese CCT esta empleadora usa otra obra social que la sindical. */
        /** @deprecated Nombre viejo de `obraSocialDefaultId`; se sigue leyendo durante la transición. */
        obraSocialId?: number | null;
        /** Obras sociales registradas para este CUIT (ids del catálogo). Vacío = todavía no se extrajo el padrón. */
        obrasSocialesIds?: string[];
        sucursalIds?: string[];
        /** Qué actividades declaró ESTA empleadora en cada domicilio. Ver `Company.sucursalActividades`. */
        sucursalActividades?: Array<{
            sucursalId: string;
            codigo?: string;
            actividadHabitual?: string;
            origen?: "arca" | "manual";
            actividades: Array<{
                codigo: string;
                descripcion?: string;
            }>;
        }>;
        convenioIds?: string[];
        /**
         * La elección habitual de esta empleadora dentro del nomenclador (ARCA → Defaults).
         *
         * Es el valor de ARRANQUE, no una regla: si el Tipo de Contrato trae su propio código, manda el
         * del contrato. Solo entra cuando el tipo de contrato no lo tiene cargado, que hoy deja el campo
         * vacío y bloquea el TXT.
         */
        defaultsArca?: DefaultsArca;
    }>;
    /**
     * Los valores por defecto de la INSTALACIÓN (Configuración → ARCA, la ★ de cada nomenclador).
     *
     * Es el último escalón de la cascada: rige cuando ni el contrato ni la empleadora dijeron nada.
     * Opcional a propósito — sin él la resolución es la de antes, contrato → empresa, así que ninguna
     * pantalla que todavía no lo pase cambia de comportamiento.
     */
    defaultsArcaGlobales?: DefaultsArca;
    /** Catálogo de Sucursales de ARCA: de acá salen el código de sucursal y las actividades. */
    sucursales?: ArcaSucursal[];
    /**
     * Catálogo de Convenios: solo para traducir los `convenioIds` de la empresa (que son refs) al
     * código de CCT ("0131/75") con el que se compara el convenio de la categoría.
     */
    convenios?: Array<SimpleCatalogItem & {
        obraSocialDefaultId?: number | null;
        puestoDesempenadoDefault?: string | null;
    }>;
    /**
     * Los Roles Empresa (funciones): de la del contrato (`rol_frame_id` = `data.rol.id`) sale PRIMERO el
     * puesto desempeñado del registro de 85. Opcional: sin ellos se resuelve desde la categoría.
     */
    roleFrames?: Array<{
        data?: {
            rol?: {
                id?: number;
            };
            puestoDesempenado?: string;
        };
    }>;
}
/**
 * Cómo se resolvió la actividad del domicilio de desempeño. Sirve para explicar en el checklist qué
 * falta y dónde cargarlo, en vez de mostrar un genérico "falta la actividad".
 */
export type ActividadOrigen = 
/** La sucursal tiene una sola actividad: el contrato la hereda. */
"unica"
/** La sucursal tiene varias actividades y el contrato eligió una. */
 | "elegida"
/** Varias actividades, el contrato no eligió, y rige la HABITUAL de la empresa en esa sucursal (la ★). */
 | "habitual"
/** Todavía no se sabe la empleadora, así que no se sabe qué sucursales se pueden elegir. */
 | "sin_empresa"
/** El contrato todavía no eligió sucursal. */
 | "sin_sucursal"
/** La sucursal elegida no está asignada a la empresa del contrato (o ya no existe). */
 | "sucursal_invalida"
/** La sucursal no tiene ninguna actividad cargada. */
 | "sin_actividades"
/** La sucursal tiene varias actividades y el contrato todavía no eligió cuál declara. */
 | "ambigua";
/**
 * De dónde sale el dato. Es la clave del rediseño: el operador no arregla campos del TXT, arregla
 * ORÍGENES. Un tipo de contrato sin códigos ARCA se ve como tres faltantes distintos, pero es una
 * sola cosa que ir a cargar, en un solo lugar.
 */
export type OrigenDato = "persona" | "contrato" | "tipo_contrato" | "categoria_sat" | "obra_social" | "empresa" | "sucursal";
/**
 * Estado de un campo:
 *  - `ok`         resuelto.
 *  - `falta`      no está cargado y se puede cargar ya.
 *  - `error`      está cargado pero mal (inconsistente). Es MÁS grave que `falta`: hoy pasa
 *                 desapercibido y llega mal a ARCA.
 *  - `bloqueado`  no se puede resolver todavía porque depende de otro origen sin resolver. No se
 *                 cuenta como problema propio: contarlo es lo que inflaba el "Faltan 6".
 *  - `aviso`      el dato ESTÁ y el alta se puede generar, pero hay algo que conviene mirar. No
 *                 bloquea ni cuenta como pendiente: es el caso de una obra social heredada de la
 *                 ficha de la persona, que puede estar vencida pero es mejor que nada.
 */
export type EstadoCheck = "ok" | "falta" | "error" | "bloqueado" | "aviso";
export interface AfipFieldCheck {
    key: string;
    label: string;
    /** Valor resuelto para mostrar; "" si falta. */
    value: string;
    estado: EstadoCheck;
    origen: OrigenDato;
    /** Qué origen hay que resolver antes (solo si `estado === "bloqueado"`). */
    dependeDe?: OrigenDato;
    /** Detalle del problema, para `falta` / `error` / `bloqueado`. */
    detalle?: string;
    /**
     * El campo NO CORRESPONDE para este contrato, y por eso no entra en la cuenta de avance.
     *
     * Hoy lo usa solo Fecha de Fin: con una modalidad por tiempo indeterminado el registro la exige en
     * blanco, así que el chequeo da «ok» —está bien vacía— pero contarla como un campo resuelto infla
     * el denominador con algo que nunca hubo que completar. «5 de 5» y «4 de 4» dicen cosas distintas
     * y las dos son correctas según la modalidad; «5 de 5» cuando uno de los cinco no aplicaba, no.
     *
     * No es lo mismo que `bloqueado`: bloqueado es «todavía no», esto es «acá no va».
     */
    noAplica?: boolean;
    /** Compatibilidad con el consumo previo (`!ok` = hay algo que hacer). */
    ok: boolean;
}
/** Un origen con problemas: es la unidad en la que se le habla al operador. */
export interface GrupoFaltante {
    origen: OrigenDato;
    titulo: string;
    /** Qué hay que hacer, en una línea. */
    accion: string;
    /** A dónde ir a resolverlo. `enFila` = se resuelve en la misma grilla, no hay a dónde navegar. */
    link?: {
        to: string;
        label: string;
    } | {
        enFila: string;
    };
    checks: AfipFieldCheck[];
    /** Si está bloqueado, por cuál otro origen. */
    bloqueadoPor?: OrigenDato;
    /** true si el grupo tiene al menos un `error` (dato cargado mal, no faltante). */
    tieneErrores: boolean;
    /** true si NO es configuración de ARCA sino un selector de la propia fila (ver `ORIGENES_EN_FILA`). */
    enFila: boolean;
}
/**
 * Orígenes que no son configuración de ARCA: son opciones que ya están en pantalla y solo hay que
 * ELEGIR. La empresa, en su columna de la grilla; la sucursal y su actividad, en este mismo
 * formulario de Datos ARCA (tenían columna propia y se sacaron: la grilla no daba abasto y el lugar
 * natural de esos dos códigos es el checklist del alta).
 *
 * Se separan del conteo por eso mismo. "Faltan 2" en la columna ARCA, con una de las dos siendo la
 * empresa que la columna de al lado ya está pidiendo en ámbar, cuenta el mismo pendiente dos veces y
 * manda a configurar algo que no hay que ir a configurar a ningún lado. Siguen frenando el TXT —
 * `completo` los sigue exigiendo—, pero no se cuentan como configuración pendiente.
 */
export declare const ORIGENES_EN_FILA: OrigenDato[];
export interface AfipRowResult {
    checks: AfipFieldCheck[];
    /** Campos con algo pendiente (incluye bloqueados). Se mantiene por compatibilidad. */
    faltantes: number;
    completo: boolean;
    /** Orígenes con problemas, que es lo que hay que ir a resolver. */
    grupos: GrupoFaltante[];
    /**
     * Cuántas CONFIGURACIONES de ARCA hay que tocar AHORA. Excluye las bloqueadas por otro origen
     * (se destraban solas) y las que se eligen en la propia fila (ver `ORIGENES_EN_FILA`).
     */
    configuracionesPendientes: number;
    /** Cuántos selectores de la propia fila están sin elegir (empresa, sucursal/actividad). */
    pendientesEnFila: number;
    /** Cuántos campos están cargados MAL (no faltantes). */
    errores: number;
    /** Cuántos avisos hay: no bloquean el alta, pero conviene mirarlos. */
    avisos: number;
}
/**
 * Modalidades de contratación a plazo determinado: exigen fecha de fin en el alta.
 * (021 tiempo parcial determinado · 022 tiempo completo determinado · 012 trabajo eventual)
 */
export declare const MODALIDADES_PLAZO_DETERMINADO: string[];
/**
 * Modalidades por tiempo indeterminado: la fecha de fin tiene que ir EN BLANCO.
 * (008 tiempo completo indeterminado · 001 tiempo parcial indeterminado)
 *
 * Las modalidades que no están en ninguna de las dos listas no se chequean: sin saber la regla,
 * inventarla sería peor que no validar.
 */
export declare const MODALIDADES_TIEMPO_INDETERMINADO: string[];
/**
 * LAS ONCE MODALIDADES QUE UNA PRODUCTORA USA, de las 153 del nomenclador.
 *
 * El catálogo entero es una trampa en un desplegable: varias entradas son de leyes derogadas y otras
 * de regímenes que no son de una productora. Ofrecerlas todas no es neutral — es poner al lado de la
 * opción correcta una docena que declaran mal.
 *
 * LO QUE QUEDA AFUERA, Y POR QUÉ:
 *
 *   000, 004, 005, 006 · modalidades promovidas y de fomento de las leyes 24.013 y 24.465. Derogadas.
 *   003, 007           · aprendizaje (ley 25.013) y período de prueba (24.465/25.013): las leyes que
 *                        las crearon ya no rigen.
 *   102                · «Empleado Servicio Eventual en Usuaria DTO 762» es la modalidad de una
 *                        EMPRESA DE SERVICIOS EVENTUALES que cede personal a una usuaria. Una
 *                        productora que contrata directo usa 012. Es la confusión más fácil de esta
 *                        lista y la más cara: se elige por el nombre y declara otra relación.
 *   3xx, 6xx           · regímenes con reducción de contribuciones (art. 19 y 24 ley 26.940, dcto.
 *                        551/22 y 1085/24). Si alguna aplica es una decisión contable, no del catálogo.
 *
 * No es un candado del modelo: el campo acepta cualquier código y lo ya cargado se sigue mostrando.
 * Es qué se OFRECE.
 */
export declare const MODALIDADES_OFRECIDAS: string[];
/**
 * Código de CCT de "EXCLUIDO DE CONVENIO" en el nomenclador de ARCA.
 *
 * No es la ausencia de convenio: es un convenio más de la lista, con una sola categoría (999999).
 * Se nombra acá porque es el único caso donde la EMPLEADORA define la obra social — quien está
 * excluido no tiene sindicato, y por lo tanto no hay obra social sindical de la que heredar.
 */
export declare const CONVENIO_EXCLUIDO = "9999/99";
/** Valores ARCA resueltos de un contrato (crudos, para construir el registro del TXT). */
export interface AfipValues {
    cuil: string;
    /** El CUIL pasa prefijo + dígito verificador, no solo "tiene 11 dígitos". */
    cuilValido: boolean;
    /** La retribución es > 0 y entra en las 15 posiciones del campo. */
    retribucionOk: boolean;
    fechaInicio: string;
    fechaFin: string;
    retribucion: number;
    categoriaProf: string;
    /** `false` = el tipo de contrato no genera alta temprana. */
    generaAlta: boolean;
    modalidadContrato: string;
    /** De dónde salió la modalidad de contrato. Ver `cascadaArca.ts`. */
    modalidadContratoOrigen: OrigenValorArca;
    tipoServicio: string;
    /**
     * De dónde salió el tipo de servicio: del tipo de contrato, del default de la empleadora, del de la
     * instalación, o de ningún lado.
     *
     * NO es cosmético: el checklist manda a corregir a un lugar distinto según el origen, y culpar al
     * tipo de contrato por un valor que puso un default manda a editar lo que no está mal.
     */
    tipoServicioOrigen: OrigenValorArca;
    actividad: string;
    modalidadLiq: string;
    /** De dónde salió la modalidad de liquidación. Ver `cascadaArca.ts`. */
    modalidadLiqOrigen: OrigenValorArca;
    rnos: string;
    /** El RNOS no es de la persona: se heredó del convenio o de la empleadora. */
    rnosPorDefecto: boolean;
    /**
     * De dónde salió el RNOS. `ninguno` = no se pudo resolver y el campo FALTA (ya no hay una obra
     * social global que lo rellene: ver la cascada en `resolveAfipValues`).
     */
    rnosOrigen: "constatada" | "manual" | "heredada-usuario" | "override" | "convenio" | "empresa" | "ninguno";
    /** Nombre del Agente del Seguro. El RNOS solo no le dice nada a nadie: se muestran los dos. */
    nombreObraSocial: string;
    sucursal: string;
    /** Cómo se resolvió la actividad (o por qué no se pudo). */
    actividadOrigen: ActividadOrigen;
    /** Actividades declaradas para esa sucursal (para poder elegir en la UI). */
    actividadesDisponibles: ArcaSucursal["actividades"];
    /** Domicilio de la sucursal del contrato, para los mensajes del checklist. */
    nombreSucursal: string;
    /** Sucursales que el contrato puede elegir: las asignadas a su empresa empleadora. */
    sucursalesDisponibles: ArcaSucursal[];
    /** Código de CCT de la categoría del contrato ("" si la categoría no lo tiene cargado). */
    convenioCategoria: string;
    /** Códigos de CCT habilitados para la empleadora del contrato. */
    conveniosEmpresa: string[];
    /**
     * `true` si la obra social resuelta está entre las REGISTRADAS por la empleadora ante ARCA.
     * `null` cuando no se puede saber: la empleadora todavía no tiene el padrón extraído, o no hay
     * empresa ni obra social. No se asume que esté bien ni que esté mal.
     */
    obraSocialRegistrada: boolean | null;
    /**
     * Estado de la constatación en ARCA (Relaciones Laborales → Registrar Nuevas Altas). Son TRES:
     *  - `afiliada`     se consultó y ARCA devolvió esta obra social. Queda fija.
     *  - `no_figura`    se consultó y ARCA no devolvió ninguna: rige la del convenio. Es una RESPUESTA.
     *  - `sin_constatar` nadie consultó: el valor que se muestra es una suposición.
     */
    constatacion: "afiliada" | "no_figura" | "sin_constatar";
    /** Cuándo se constató ("" si no se constató). */
    constatadaEl: string;
    /**
     * Lo que la cascada resolvería si ARCA no devuelve una obra social propia.
     *
     * Se expone aparte de `rnos` porque antes de validar NO es el valor del contrato: es una
     * referencia para decir "esto es lo que va a quedar". `rnos` está vacío hasta que se valida.
     */
    rnosSugerido: string;
    nombreObraSocialSugerida: string;
    /**
     * Puesto desempeñado (4 díg.). SOLO lo informa el registro de 85 (Altas Masivas): el de 130 lo deja
     * en blanco. Cascada: categoría → empleadora → instalación.
     */
    puesto: string;
    puestoOrigen: OrigenValorArca;
    /** El puesto que le toca por defecto, sin mirar lo elegido en el contrato. */
    puestoPorDefecto: string;
    puestoPorDefectoOrigen: OrigenValorArca;
    /**
     * Situación de revista (2 díg.). SOLO la informa el registro de 85. Cascada: empleadora →
     * instalación → «01» (Activo), que es lo que es toda alta nueva.
     */
    situacionRevista: string;
    situacionRevistaOrigen: OrigenValorArca;
    /** La categoría contra el espejo de ARCA (ver `compartido/catalogoArca.ts`). `null` = sin espejo. */
    estadoArcaCategoria: EstadoCategoriaArca | null;
    estadoArcaCategoriaConfirmada: boolean;
    /** Lo que ARCA dice del código de la categoría. */
    descripcionArcaCategoria: string;
    /** Nombre propio de la categoría, para los mensajes. */
    nombreCategoria: string;
}
/** Situación de revista de un alta nueva cuando nadie configuró otra: «01 — Activo». */
export declare const SITUACION_REVISTA_ALTA = "01";
/**
 * EL CATÁLOGO ES LA AUTORIDAD, no un regex sobre nombres de empresa.
 *
 * En vez de adivinar dónde termina el tipo y empieza la empleadora, se busca qué tipo del catálogo
 * es PREFIJO del nombre del contrato y se toma el más largo. Así «Plazo fijo 5x7 part-time 2030 SRL»
 * cae en «Plazo fijo 5x7 part-time» y no en «Plazo fijo 5x7», que es el error que un recorte a ciegas
 * comete y que además no se nota: los dos son tipos válidos y el TXT saldría con la modalidad del
 * equivocado.
 */
export declare const buscarTipoContrato: <T extends {
    name: string;
}>(tipos: T[], nombreContrato?: string | null) => T | undefined;
/** Resuelve los valores ARCA de un contrato contra los catálogos (sin validar). */
export declare function resolveAfipValues(row: ContractOverviewRow, cat: AfipCatalogs): AfipValues;
/**
 * Resuelve y valida los datos ARCA de un contrato.
 *
 * Dos cosas lo distinguen de un checklist de presencia:
 *
 *  1. Distingue FALTA (no está cargado) de ERROR (está cargado pero es inconsistente). El segundo es
 *     más grave: hoy pasa desapercibido y llega mal a ARCA.
 *  2. Marca como BLOQUEADO lo que no se puede resolver todavía porque depende de otro origen. Antes
 *     esos campos se contaban como faltantes propios, y un contrato con 2 cosas para configurar
 *     decía "Faltan 6".
 */
export declare function resolveAfip(row: ContractOverviewRow, cat: AfipCatalogs): AfipRowResult;
/**
 * Un campo cuenta como RESUELTO si el TXT se puede generar con él: `ok` y también `aviso`.
 *
 * Un aviso no es un faltante. El caso que lo obliga es la obra social: si ARCA no devolvió ninguna,
 * rige la del convenio y el registro sale igual — que esté sin constatar es una verificación
 * pendiente, no un dato ausente. Contándolo como no resuelto, un contrato perfectamente generable
 * mostraba 5/15 y quedaba pidiendo trabajo que no cambiaba el archivo. Es el mismo error que ya se
 * corrigió con Puesto Desempeñado y Situación de Revista.
 *
 * La regla vive acá para que la fracción del badge, la barra del pie y `completo` no puedan
 * discrepar: los tres dicen lo mismo sobre el mismo contrato.
 */
export declare const esResuelto: (c: AfipFieldCheck) => boolean;
/** Tono del resumen: define el color del badge y del encabezado del detalle. */
export type TonoArca = "ok" | "error" | "falta" | "en_fila";
/**
 * Qué decir en una línea sobre el estado ARCA de un contrato. Vive acá y no en el badge porque lo
 * consumen tres lugares (las dos vistas de la grilla y el encabezado del detalle) y tienen que
 * coincidir: un badge que dice una cosa abriendo un detalle que dice otra es peor que cualquiera de
 * los dos textos.
 *
 * Habla en CAMPOS y no en configuraciones. "1 configuración" era exacto —un tipo de contrato sin
 * códigos es una sola cosa que ir a cargar— pero no se entendía al lado de la barra que marcaba
 * 5/14: dos unidades distintas para la misma fila se leen como una contradicción. Ahora el badge y
 * la barra dicen el MISMO número en la MISMA dirección (resueltos sobre el total), y el desglose de
 * cuántos "lugares" hay que tocar queda para los pasos numerados del detalle, que es donde importa.
 *
 * El tono sigue distinguiendo la gravedad: rojo si hay datos mal cargados, ámbar si falta cargar,
 * gris si solo falta elegir algo que ya está en pantalla.
 */
export declare function resumenArca(r: AfipRowResult): {
    tono: TonoArca;
    texto: string;
};
/**
 * LO QUE AGREGA EL REGISTRO DE 85 (Altas Masivas) SOBRE EL DE 130.
 *
 * Es una función aparte y no dos checks más dentro de `resolveAfip` a propósito: el de 130 no
 * informa ni el puesto ni la situación de revista, y sumarlos a sus checks dejaría «incompleto» un
 * contrato que se puede presentar perfectamente por Carga Masiva. `completo` acá = completo para el
 * de 130 Y con los dos campos propios del de 85 resueltos.
 *
 * El convenio NO es un check nuevo: el de 85 lo informa, pero sale de la categoría y `resolveAfip`
 * ya lo exige y lo valida contra los convenios de la empleadora.
 */
export declare function resolveAfip85(row: ContractOverviewRow, cat: AfipCatalogs, base?: AfipRowResult): {
    checks: AfipFieldCheck[];
    completo: boolean;
};
/**
 * VALIDACIÓN PREVIA A GENERAR LOS TXT: sucursal y actividad contra la empresa del contrato.
 *
 * Qué contratos de los que se van a mandar tienen una sucursal que NO es de su empresa, o una
 * actividad que esa empresa no tiene habilitada en esa sucursal. Con eso ARCA no rechaza: cambia la
 * sucursal por otra y deja la actividad vacía, sin decir nada, y uno se entera recién mirando la
 * grilla. Por eso los dos botones («Generar TXT Masivo» y el URGENTE) FRENAN en vez de omitir la
 * fila: omitirla es otra forma de que pase desapercibido.
 *
 * Sale de `resolveAfipValues`, que ya resuelve por empresa (`compartido/sucursalesDeEmpresa.ts`):
 *
 *   · `sucursal_invalida`                       → la sucursal no es de la empresa
 *   · `sin_actividades`                         → la empresa no tiene ninguna habilitada ahí
 *   · `ambigua` con una actividad ESCRITA       → la escrita no está habilitada ahí para esa empresa
 *
 * «Varias y todavía no eligió» NO entra acá: es un dato que falta, y eso lo dice el checklist como
 * siempre (la fila queda incompleta y no entra al archivo). Tampoco una actividad escrita que no vale
 * cuando la sucursal tiene UNA sola: ahí rige la única, que es la correcta.
 */
export declare function problemasDeSucursalParaTxt(rows: ContractOverviewRow[], cat: AfipCatalogs): Array<{
    row: ContractOverviewRow;
    problema: ProblemaDeSucursal;
    sucursal: string;
}>;
/** El cartel con el que frenan los dos TXT: quiénes, por qué y dónde se corrige. */
export declare function mensajeDeSucursalParaTxt(problemas: ReturnType<typeof problemasDeSucursalParaTxt>, razonSocial: string): string;
