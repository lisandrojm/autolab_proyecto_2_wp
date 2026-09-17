import { Types } from "mongoose";
import ExcelJS from "exceljs";
import xlsx from "xlsx";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { Contrato } from "../models/Contrato.js";
import { Convenio } from "../models/Convenio.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { Company } from "../models/Company.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Info } from "../models/Info.js";

/*
  ═══════════════════════════════════════════════════════════════════════════════════════════════
  CARGA MASIVA DE SOLICITUDES DE CONTRATACIÓN
  ═══════════════════════════════════════════════════════════════════════════════════════════════

  Una planilla, una fila por persona, y de cada fila sale una solicitud PENDIENTE: exactamente lo
  mismo que carga la app de a una, y se aprueba con el mismo wizard. La carga masiva acelera la
  carga, no saltea la revisión.

  POR QUÉ ESTO VIVE EN EL SERVER Y NO EN LA PANTALLA

  La plantilla y el import son dos caras del mismo contrato: los encabezados con los que se baja
  tienen que ser los que se leen al subirla, y las listas que ofrece tienen que ser las que el
  importador acepta. Escritos en dos lados, se separan en el primer campo que alguien agregue —y esa
  separación se descubre con la planilla ya repartida—. Acá las columnas se declaran UNA vez
  (`COLUMNAS`) y de esa declaración salen las dos cosas.

  QUÉ RESUELVE CADA FILA Y QUÉ NO

  Los desplegables del archivo son listas SIMPLES (todos los turnos, todas las categorías), no
  dependientes. No es una limitación de ExcelJS: las listas dependientes se hacen con `INDIRECT()`
  sobre rangos con nombre y Google Sheets las descarta al importar, así que la planilla se llenaría
  igual pero sin ninguna ayuda. Las combinaciones —que el turno sea de esa área en ese proyecto, que
  la categoría sea del convenio— se validan ACÁ, al subir, que es el único lugar donde valen para
  las dos formas de completarla.

  LOS ERRORES NO FRENAN LA TANDA. Cada fila se valida sola y se informa con su número de fila y el
  campo que falla; las que están bien se pueden crear igual. Una planilla de cuarenta filas que se
  rechaza entera por un CUIL mal tipeado es una tarde de trabajo perdida.
*/

/** La hoja que se completa y la que guarda los catálogos (la segunda no se toca). */
export const HOJA_DATOS = "Solicitudes";
export const HOJA_CATALOGOS = "Catálogos";

/** Hasta cuántas filas se aceptan de una. Más que esto es un import de sistema, no una carga. */
export const MAX_FILAS = 300;

/** Compara textos como los escribe la gente: sin acentos, sin mayúsculas y sin espacios de más. */
export const clave = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Sólo los dígitos: un CUIL se escribe «20-12345678-3», «20123456783» o con espacios. */
export const soloDigitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** Los días de la semana como los escribe la planilla. El índice es el de `Date.getDay()`. */
const DIAS = [
  { indice: 0, nombres: ["do", "dom", "domingo"] },
  { indice: 1, nombres: ["lu", "lun", "lunes"] },
  { indice: 2, nombres: ["ma", "mar", "martes"] },
  { indice: 3, nombres: ["mi", "mie", "miercoles"] },
  { indice: 4, nombres: ["ju", "jue", "jueves"] },
  { indice: 5, nombres: ["vi", "vie", "viernes"] },
  { indice: 6, nombres: ["sa", "sab", "sabado"] },
];

export interface ColumnaPlantilla {
  /** La clave con la que viaja al validador. */
  key: string;
  /** El encabezado, tal cual se escribe en la planilla. Es el contrato con el archivo. */
  header: string;
  /** Ancho de la columna en el Excel. */
  ancho: number;
  /** Se marca en el encabezado y lo exige el validador (salvo que dependa de otra cosa). */
  obligatorio?: boolean;
  /** De qué catálogo salen los valores del desplegable. */
  catalogo?: keyof Catalogos;
  /** La nota que se lee al pararse en el encabezado. */
  ayuda: string;
}

/*
  LAS COLUMNAS. El orden es el de la carga: quién, dónde, con qué contrato, cuándo, cuánto.

  Los encabezados son el contrato con el archivo: cambiarlos rompe las planillas ya repartidas, así
  que al leer se aceptan también por posición (ver `filasDelArchivo`).
*/
export const COLUMNAS: ColumnaPlantilla[] = [
  { key: "cuil", header: "CUIL o DNI", ancho: 18, obligatorio: true, ayuda: "Con o sin guiones. Si la persona ya está en la plataforma, la solicitud queda atada a su ficha; si no, se crea con el nombre y el email de esta fila." },
  { key: "nombre", header: "Nombre y apellido", ancho: 30, obligatorio: true, ayuda: "Como va en el contrato. Si la persona ya existe, se usa el de su ficha." },
  { key: "email", header: "Email", ancho: 28, ayuda: "Sólo hace falta para alguien que todavía no está en la plataforma: es con lo que después entra." },
  { key: "proyecto", header: "Proyecto", ancho: 32, obligatorio: true, catalogo: "proyectos", ayuda: "Elegilo de la lista. Define qué áreas y turnos se pueden pedir." },
  { key: "area", header: "Área", ancho: 22, obligatorio: true, catalogo: "areas", ayuda: "Tiene que ser un área configurada en ese proyecto." },
  { key: "turno", header: "Turno", ancho: 22, obligatorio: true, catalogo: "turnos", ayuda: "Tiene que ser un turno de esa área en ese proyecto. Su horario completa la entrada y la salida si las dejás vacías." },
  { key: "rol", header: "Rol empresa", ancho: 28, obligatorio: true, catalogo: "roles", ayuda: "El oficio que va a desempeñar (el «rol frame»)." },
  { key: "contrato", header: "Tipo de contrato", ancho: 26, obligatorio: true, catalogo: "contratos", ayuda: "Define el trámite impositivo, el tope de horas y de días, y si lleva fecha de baja." },
  { key: "convenio", header: "Convenio", ancho: 34, catalogo: "convenios", ayuda: "Obligatorio salvo que el tipo de contrato sea de Servicios. Es lo que acota las categorías." },
  { key: "categoria", header: "Categoría", ancho: 34, catalogo: "categorias", ayuda: "Obligatoria salvo Servicios. Tiene que ser del convenio de la fila: ARCA rechaza la combinación cruzada." },
  { key: "empresa", header: "Empresa del contrato", ancho: 28, catalogo: "empresas", ayuda: "Con qué CUIT se contrata. Si el proyecto tiene una sola configurada, se puede dejar vacío." },
  { key: "desde", header: "Desde (dd/mm/aaaa)", ancho: 18, obligatorio: true, ayuda: "Primer día del contrato." },
  { key: "hasta", header: "Hasta (dd/mm/aaaa)", ancho: 18, ayuda: "Último día. Se deja vacío sólo si el tipo de contrato es de tiempo indeterminado." },
  { key: "diasPorSemana", header: "Días por semana", ancho: 16, obligatorio: true, ayuda: "Cuántos días de la semana trabaja. El máximo lo fija el tipo de contrato; si no fija ninguno, son 7." },
  { key: "dias", header: "Días que trabaja", ancho: 24, obligatorio: true, ayuda: "Separados por coma: Lu,Ma,Mi,Ju,Vi. Con días rotativos son los días ENTRE los que rota, y pueden ser más que los de arriba." },
  { key: "rotativos", header: "Días rotativos", ancho: 16, catalogo: "siNo", ayuda: "Sí cuando no trabaja días fijos: los de al lado pasan a ser el conjunto entre el que rota." },
  { key: "entrada", header: "Entrada (HH:MM)", ancho: 16, ayuda: "Si lo dejás vacío, se toma el horario del turno." },
  { key: "salida", header: "Salida (HH:MM)", ancho: 16, ayuda: "Si lo dejás vacío, se toma el horario del turno." },
  { key: "importe", header: "Importe por jornada", ancho: 20, obligatorio: true, ayuda: "Sólo el número, sin símbolo ni puntos de mil. De acá salen el semanal, el mensual y el total." },
  { key: "reemplazaA", header: "Reemplaza a (CUIL)", ancho: 20, ayuda: "El CUIL de la persona que reemplaza. Vacío = no es un reemplazo." },
  { key: "motivoReemplazo", header: "Motivo del reemplazo", ancho: 26, catalogo: "motivos", ayuda: "Por qué falta la persona reemplazada. Obligatorio si completaste el CUIL de al lado." },
  { key: "comentarios", header: "Comentarios", ancho: 40, ayuda: "Lo que haga falta aclarar sobre esta contratación. Se ve en Solicitudes." },
];

/** Una opción de desplegable: lo que se escribe en la planilla y con qué se resuelve. */
export interface OpcionCatalogo {
  /** El texto que va en la celda. */
  etiqueta: string;
  id: string;
  /** Datos extra que la validación cruzada necesita (el CCT de una categoría, por ejemplo). */
  extra?: Record<string, any>;
}

export interface Catalogos {
  proyectos: OpcionCatalogo[];
  areas: OpcionCatalogo[];
  turnos: OpcionCatalogo[];
  roles: OpcionCatalogo[];
  contratos: OpcionCatalogo[];
  convenios: OpcionCatalogo[];
  categorias: OpcionCatalogo[];
  empresas: OpcionCatalogo[];
  motivos: OpcionCatalogo[];
  siNo: OpcionCatalogo[];
}

/**
 * LOS CATÁLOGOS REALES DEL TENANT, los mismos que ofrece la pantalla.
 *
 * Se leen enteros y una vez por pedido: la plantilla los escribe en su hoja y el import los usa para
 * resolver cada celda. Los proyectos traen sus áreas y turnos poblados porque de ahí sale la única
 * validación que la planilla no puede hacer: que ese turno sea de esa área EN ESE proyecto.
 */
export const cargarCatalogos = async (tenantId: Types.ObjectId): Promise<{ catalogos: Catalogos; proyectos: any[]; turnosPorId: Map<string, any>; contratosPorId: Map<string, any>; tramitePorContrato: Map<string, string> }> => {
  const [proyectos, areas, turnos, roles, contratos, convenios, categorias, empresas, motivos, plantillas, estados] = await Promise.all([
    Project.find({ tenantId }).select("name clientId areasConfig contratoEmpresas metadata.responsableId").populate("clientId", "name").lean(),
    Area.find({ tenantId }).select("name").sort({ name: 1 }).lean(),
    Shift.find({ tenantId }).select("name startTime endTime days order").sort({ order: 1, startTime: 1 }).lean(),
    RoleFrame.find({}).select("name data.rol.id").sort({ name: 1 }).lean(),
    Contrato.find({}).select("name data").sort({ name: 1 }).lean(),
    Convenio.find({}).select("name externalId").sort({ externalId: 1 }).lean(),
    CategoriaSat.find({}).select("name externalId data.id data.convenio").sort({ name: 1 }).lean(),
    Company.find({}).select("razonSocial").sort({ razonSocial: 1 }).lean(),
    RequestConfig.find({ tenantId, isActive: true }).select("name").sort({ name: 1 }).lean(),
    ContratoFrame.find({}).select("contratoId").lean(),
    Info.find({ tenantId, type: "estado-empleado", "data.esImpositivo": true }).select("name data").lean(),
  ]);

  /*
    EL TRÁMITE DE CADA TIPO DE CONTRATO: tipo → sus plantillas → el estado impositivo que las reclama.

    Es el mismo camino que hace el formulario (`tipoImpositivoDeContrato` en el front). Hace falta acá
    para saber si la fila es de Servicios, que es lo que decide si el convenio y la categoría son
    obligatorios o sobran.
  */
  const tramitePorContrato = new Map<string, string>();
  for (const estado of estados as any[]) {
    const tipo = estado?.data?.tipoImpositivo;
    if (!tipo) continue;
    const idsPlantillas = new Set(((estado?.data?.contratoFrameIds || []) as any[]).map((id) => String(id)));
    for (const cf of plantillas as any[]) {
      if (idsPlantillas.has(String(cf._id)) && cf.contratoId) tramitePorContrato.set(String(cf.contratoId), tipo);
    }
  }

  const catalogos: Catalogos = {
    // Con el cliente adelante: hay proyectos con el mismo nombre en dos clientes.
    proyectos: (proyectos as any[]).map((p) => ({ etiqueta: `${p.clientId?.name ? `${p.clientId.name} · ` : ""}${p.name}`, id: String(p._id) })),
    areas: (areas as any[]).map((a) => ({ etiqueta: a.name, id: String(a._id) })),
    turnos: (turnos as any[]).map((s) => ({ etiqueta: s.name, id: String(s._id) })),
    roles: (roles as any[]).map((r) => ({ etiqueta: r.name, id: String(r._id), extra: { rolId: r.data?.rol?.id } })),
    contratos: (contratos as any[]).map((c) => ({ etiqueta: c.name, id: String(c._id), extra: { esTiempoIndeterminado: !!c.data?.esTiempoIndeterminado, horasPorJornada: c.data?.horasPorJornada ?? null, diasPorSemana: c.data?.diasPorSemana ?? null, tramite: tramitePorContrato.get(String(c._id)) || "" } })),
    // El código del CCT adelante: es lo que cruza con la categoría, y hay actividades con nombres casi iguales.
    convenios: (convenios as any[]).map((c) => ({ etiqueta: `${c.externalId} · ${c.name}`, id: String(c._id), extra: { cct: String(c.externalId || "").trim() } })),
    categorias: (categorias as any[]).map((c) => ({ etiqueta: `${c.externalId ? `${c.externalId} · ` : ""}${c.name}`, id: String(c._id), extra: { dataId: c.data?.id, cct: String(c.data?.convenio || "").trim() } })),
    empresas: (empresas as any[]).map((e) => ({ etiqueta: e.razonSocial, id: String(e._id) })),
    motivos: (motivos as any[]).filter((m) => !clave(m.name).includes("horas extra")).map((m) => ({ etiqueta: m.name, id: String(m._id) })),
    siNo: [
      { etiqueta: "Sí", id: "si" },
      { etiqueta: "No", id: "no" },
    ],
  };

  return {
    catalogos,
    proyectos: proyectos as any[],
    turnosPorId: new Map((turnos as any[]).map((s) => [String(s._id), s])),
    contratosPorId: new Map((contratos as any[]).map((c) => [String(c._id), c])),
    tramitePorContrato,
  };
};

/**
 * LA PLANILLA, con sus desplegables y sus catálogos adentro.
 *
 * Las listas apuntan a rangos de la hoja «Catálogos» del MISMO archivo: pegar los valores dentro de
 * la validación tiene un tope de 255 caracteres —dos docenas de proyectos ya no entran— y además
 * deja la lista congelada en el archivo, sin forma de ver de dónde salió.
 *
 * `allowBlank` va en true incluso en las obligatorias: Excel bloquearía la celda vacía mientras se
 * está completando la fila, y lo que se quiere frenar es un valor inventado, no una fila a medias.
 * Lo obligatorio lo exige el import, que puede explicar qué falta.
 */
export const construirPlantilla = async (catalogos: Catalogos): Promise<Buffer> => {
  const libro = new ExcelJS.Workbook();
  libro.creator = "WeProdu";
  libro.created = new Date();

  const datos = libro.addWorksheet(HOJA_DATOS, { views: [{ state: "frozen", ySplit: 1 }] });
  const cat = libro.addWorksheet(HOJA_CATALOGOS);

  // 1. Los catálogos, una columna por lista. La hoja queda a la vista a propósito: es de dónde salen
  //    los desplegables, y esconderla hace que un valor que "no está" parezca un error del archivo.
  const rangoDe = new Map<string, string>();
  Object.entries(catalogos).forEach(([nombre, opciones], i) => {
    const col = cat.getColumn(i + 1);
    col.width = 38;
    const celdaTitulo = cat.getCell(1, i + 1);
    celdaTitulo.value = nombre.toUpperCase();
    celdaTitulo.font = { bold: true };
    (opciones as OpcionCatalogo[]).forEach((o, fila) => {
      cat.getCell(fila + 2, i + 1).value = o.etiqueta;
    });
    const letra = cat.getColumn(i + 1).letter;
    const ultima = (opciones as OpcionCatalogo[]).length + 1;
    if (ultima > 1) rangoDe.set(nombre, `'${HOJA_CATALOGOS}'!$${letra}$2:$${letra}$${ultima}`);
  });

  // 2. Los encabezados, con la ayuda de cada campo como nota.
  datos.columns = COLUMNAS.map((c) => ({ header: c.obligatorio ? `${c.header} *` : c.header, key: c.key, width: c.ancho }));
  const encabezado = datos.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.height = 24;
  encabezado.alignment = { vertical: "middle" };
  COLUMNAS.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.obligatorio ? "FF1D4ED8" : "FF475569" } };
    celda.note = `${c.header}${c.obligatorio ? " (obligatorio)" : ""}\n\n${c.ayuda}`;
  });

  /*
    3. Las validaciones, sobre un rango de filas y no sobre las que tienen datos: la planilla se baja
       vacía y hay que poder pegar cien filas y que sigan teniendo su desplegable.
  */
  const HASTA_FILA = MAX_FILAS + 1;
  COLUMNAS.forEach((c, i) => {
    const columna = datos.getColumn(i + 1);
    if (c.catalogo && rangoDe.has(c.catalogo)) {
      for (let fila = 2; fila <= HASTA_FILA; fila++) {
        datos.getCell(fila, i + 1).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [rangoDe.get(c.catalogo)!],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Valor fuera de la lista",
          error: "Elegí uno de los valores del desplegable. Si lo escribís a mano, tiene que coincidir exactamente.",
        };
      }
    }
    // Las fechas y los números se escriben como tales: un «01/09/2026» guardado como texto entra igual,
    // pero con el formato puesto se ve enseguida si Excel lo tomó como fecha o no.
    if (c.key === "desde" || c.key === "hasta") columna.numFmt = "dd/mm/yyyy";
    if (c.key === "importe") columna.numFmt = "#,##0.00";
  });

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

/** Una fila cruda del archivo, con su número real de fila del Excel (la 1 son los encabezados). */
export interface FilaCruda {
  fila: number;
  valores: Record<string, string>;
}

/**
 * Las filas del archivo, mapeadas por ENCABEZADO y, si no matchea, por POSICIÓN.
 *
 * Por encabezado para que agregar una columna al final no rompa las planillas viejas; por posición
 * como red, porque alguien va a renombrar un título o va a pegar los datos en una planilla propia
 * con las columnas en el mismo orden.
 */
export const filasDelArchivo = (buffer: Buffer): FilaCruda[] => {
  const libro = xlsx.read(buffer, { type: "buffer", cellDates: true });
  const hoja = libro.Sheets[HOJA_DATOS] || libro.Sheets[libro.SheetNames[0]];
  if (!hoja) return [];
  const matriz: any[][] = xlsx.utils.sheet_to_json(hoja, { header: 1, blankrows: false, raw: false, dateNF: "dd/mm/yyyy" });
  if (matriz.length === 0) return [];

  const encabezados = (matriz[0] || []).map((h) => clave(String(h ?? "").replace(/\*/g, "")));
  const columnaDe = new Map<string, number>();
  COLUMNAS.forEach((c, i) => {
    const porTitulo = encabezados.indexOf(clave(c.header));
    columnaDe.set(c.key, porTitulo >= 0 ? porTitulo : i);
  });

  const filas: FilaCruda[] = [];
  for (let i = 1; i < matriz.length; i++) {
    const cruda = matriz[i] || [];
    const valores: Record<string, string> = {};
    for (const c of COLUMNAS) valores[c.key] = String(cruda[columnaDe.get(c.key)!] ?? "").trim();
    // Una fila sin nada es el resto de la planilla, no un error.
    if (Object.values(valores).every((v) => v === "")) continue;
    filas.push({ fila: i + 1, valores });
  }
  return filas;
};

export interface ErrorFila {
  fila: number;
  campo: string;
  motivo: string;
}

export interface FilaValidada {
  fila: number;
  /** Cómo se va a mostrar en la vista previa. */
  resumen: { nombre: string; cuil: string; proyecto: string; areaTurno: string; contrato: string; desde: string; hasta: string; personaNueva: boolean };
  /** Todo lo resuelto, listo para crear la solicitud. */
  datos: any;
}

/** Una fecha de la planilla: «01/09/2026», «2026-09-01» o lo que Excel haya guardado como fecha. */
const fechaISO = (texto: string): string | null => {
  const v = String(texto || "").trim();
  if (!v) return null;
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, a] = dmy;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const ymd = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const [, a, m, d] = ymd;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parseada = new Date(v);
  if (!Number.isNaN(parseada.getTime())) return parseada.toISOString().slice(0, 10);
  return null;
};

/** «Lu,Ma,Mi» → [1,2,3]. Devuelve `null` si alguno no se entiende: mejor avisar que adivinar. */
const diasDeTexto = (texto: string): number[] | null => {
  const partes = String(texto || "")
    .split(/[,;/|]+/)
    .map((p) => clave(p))
    .filter(Boolean);
  if (partes.length === 0) return null;
  const indices: number[] = [];
  for (const p of partes) {
    const dia = DIAS.find((d) => d.nombres.includes(p));
    if (!dia) return null;
    if (!indices.includes(dia.indice)) indices.push(dia.indice);
  }
  return indices.sort((a, b) => a - b);
};

/** Un horario «9:00», «09:00» o «9». Devuelve "HH:MM" o `null`. */
const horaValida = (texto: string): string | null => {
  const v = String(texto || "").trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

/** Un importe «45.454,55», «45454.55» o «45454». */
const numero = (texto: string): number | null => {
  const v = String(texto || "").trim();
  if (!v) return null;
  // Con coma decimal: se sacan los puntos de mil. Sin coma, el punto ES el decimal.
  const limpio = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(limpio.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Busca en un catálogo por etiqueta exacta y, si no, por lo que se lee de ella (el nombre sin el código). */
const buscarEnCatalogo = (opciones: OpcionCatalogo[], texto: string): OpcionCatalogo | null => {
  const q = clave(texto);
  if (!q) return null;
  const exacta = opciones.find((o) => clave(o.etiqueta) === q);
  if (exacta) return exacta;
  // «LN+» tiene que encontrar «La Nación · LN+», y «035283» a «035283 · Editor».
  const porParte = opciones.filter((o) => clave(o.etiqueta).split(" · ").some((p) => p === q));
  return porParte.length === 1 ? porParte[0] : null;
};

/**
 * VALIDA UNA FILA CONTRA LOS CATÁLOGOS Y CONTRA SÍ MISMA.
 *
 * El orden importa: primero se resuelve cada celda (existe / no existe) y recién después se cruzan
 * —el turno con el área del proyecto, la categoría con el convenio, la fecha de baja con el tipo de
 * contrato—. Una fila con el proyecto mal escrito no tiene sentido cruzarla: todo lo demás fallaría
 * por lo mismo y el informe diría cinco veces el mismo problema.
 */
export const validarFila = (
  cruda: FilaCruda,
  ctx: { catalogos: Catalogos; proyectos: any[]; turnosPorId: Map<string, any>; usuariosPorCuil: Map<string, any> },
): { ok: FilaValidada | null; errores: ErrorFila[] } => {
  const { valores, fila } = cruda;
  const errores: ErrorFila[] = [];
  const error = (campo: string, motivo: string) => errores.push({ fila, campo, motivo });

  // ── La persona ────────────────────────────────────────────────────────────────────────────────
  const cuil = soloDigitos(valores.cuil);
  if (!cuil) error("CUIL o DNI", "Falta el CUIL o el DNI.");
  else if (cuil.length !== 11 && cuil.length !== 7 && cuil.length !== 8) error("CUIL o DNI", `«${valores.cuil}» no parece un CUIL (11 dígitos) ni un DNI (7 u 8).`);
  const existente = cuil ? ctx.usuariosPorCuil.get(cuil) : null;
  const nombre = valores.nombre.trim();
  if (!existente && !nombre) error("Nombre y apellido", "La persona no está en la plataforma, así que hace falta su nombre para crearla.");
  const email = valores.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error("Email", `«${valores.email}» no es un email válido.`);

  // ── Dónde trabaja ─────────────────────────────────────────────────────────────────────────────
  const proyectoOpt = buscarEnCatalogo(ctx.catalogos.proyectos, valores.proyecto);
  if (!proyectoOpt) error("Proyecto", valores.proyecto ? `No hay ningún proyecto que se llame «${valores.proyecto}».` : "Falta el proyecto.");
  const proyecto = proyectoOpt ? ctx.proyectos.find((p) => String(p._id) === proyectoOpt.id) : null;

  const areaOpt = buscarEnCatalogo(ctx.catalogos.areas, valores.area);
  if (!areaOpt) error("Área", valores.area ? `No hay ningún área que se llame «${valores.area}».` : "Falta el área.");
  const turnoOpt = buscarEnCatalogo(ctx.catalogos.turnos, valores.turno);
  if (!turnoOpt) error("Turno", valores.turno ? `No hay ningún turno que se llame «${valores.turno}».` : "Falta el turno.");

  /*
    EL CRUCE QUE LA PLANILLA NO PUEDE HACER: que ese turno sea de esa área EN ESE proyecto.

    Es la validación que justifica todo el import: los desplegables ofrecen todos los turnos porque
    no saben qué área eligió la fila de al lado.
  */
  if (proyecto && areaOpt && turnoOpt) {
    const config = (proyecto.areasConfig || []).find((ac: any) => String(ac.areaId?._id || ac.areaId) === areaOpt.id);
    if (!config) error("Área", `«${areaOpt.etiqueta}» no está configurada en ${proyectoOpt!.etiqueta}.`);
    else {
      const turnosDelArea = (config.shiftIds || []).map((s: any) => String(s?._id || s));
      if (!turnosDelArea.includes(turnoOpt.id)) error("Turno", `«${turnoOpt.etiqueta}» no es un turno de ${areaOpt.etiqueta} en ${proyectoOpt!.etiqueta}.`);
    }
  }

  const rolOpt = buscarEnCatalogo(ctx.catalogos.roles, valores.rol);
  if (!rolOpt) error("Rol empresa", valores.rol ? `No hay ningún rol empresa que se llame «${valores.rol}».` : "Falta el rol empresa.");

  // ── Con qué contrato ──────────────────────────────────────────────────────────────────────────
  const contratoOpt = buscarEnCatalogo(ctx.catalogos.contratos, valores.contrato);
  if (!contratoOpt) error("Tipo de contrato", valores.contrato ? `No hay ningún tipo de contrato que se llame «${valores.contrato}».` : "Falta el tipo de contrato.");
  const esServicios = contratoOpt?.extra?.tramite === "constancia_cuit";
  const esIndeterminado = !!contratoOpt?.extra?.esTiempoIndeterminado;

  const convenioOpt = buscarEnCatalogo(ctx.catalogos.convenios, valores.convenio);
  if (valores.convenio && !convenioOpt) error("Convenio", `No hay ningún convenio que se llame «${valores.convenio}».`);
  if (!esServicios && contratoOpt && !convenioOpt) error("Convenio", "Falta el convenio: es lo que define qué categorías se pueden dar de alta.");

  const categoriaOpt = buscarEnCatalogo(ctx.catalogos.categorias, valores.categoria);
  if (valores.categoria && !categoriaOpt) error("Categoría", `No hay ninguna categoría que se llame «${valores.categoria}».`);
  if (!esServicios && contratoOpt && !categoriaOpt) error("Categoría", "Falta la categoría.");
  // La categoría tiene que ser del convenio: ARCA rechaza la combinación cruzada sin decir cuál está mal.
  if (convenioOpt && categoriaOpt && categoriaOpt.extra?.cct && convenioOpt.extra?.cct && categoriaOpt.extra.cct !== convenioOpt.extra.cct) {
    error("Categoría", `«${categoriaOpt.etiqueta}» es del convenio ${categoriaOpt.extra.cct} y la fila va por el ${convenioOpt.extra.cct}.`);
  }

  const empresaOpt = buscarEnCatalogo(ctx.catalogos.empresas, valores.empresa);
  if (valores.empresa && !empresaOpt) error("Empresa del contrato", `No hay ninguna empresa que se llame «${valores.empresa}».`);
  // Sin empresa en la fila: la del proyecto, si tiene una sola. Con varias, hay que decir cuál.
  const empresasDelProyecto = (proyecto?.contratoEmpresas || []).map((id: any) => String(id));
  const empresaId = empresaOpt?.id || (empresasDelProyecto.length === 1 ? empresasDelProyecto[0] : "");

  // ── Cuándo ────────────────────────────────────────────────────────────────────────────────────
  const desde = fechaISO(valores.desde);
  if (!desde) error("Desde", valores.desde ? `«${valores.desde}» no es una fecha (usá dd/mm/aaaa).` : "Falta la fecha de inicio.");
  const hasta = fechaISO(valores.hasta);
  if (valores.hasta && !hasta) error("Hasta", `«${valores.hasta}» no es una fecha (usá dd/mm/aaaa).`);
  if (!hasta && contratoOpt && !esIndeterminado) error("Hasta", `«${contratoOpt.etiqueta}» no es de tiempo indeterminado: necesita fecha de baja.`);
  if (desde && hasta && hasta < desde) error("Hasta", "La fecha de baja es anterior a la de alta.");

  // ── Cómo trabaja ──────────────────────────────────────────────────────────────────────────────
  const diasPorSemana = Number(soloDigitos(valores.diasPorSemana));
  const topeDias = Number(contratoOpt?.extra?.diasPorSemana) || 7;
  if (!diasPorSemana) error("Días por semana", "Falta cuántos días por semana trabaja.");
  else if (diasPorSemana > topeDias) error("Días por semana", `«${contratoOpt?.etiqueta}» admite hasta ${topeDias} días por semana.`);

  const rotativos = clave(valores.rotativos).startsWith("s");
  const dias = diasDeTexto(valores.dias);
  if (!dias) error("Días que trabaja", valores.dias ? `No se entiende «${valores.dias}». Escribilos separados por coma: Lu,Ma,Mi,Ju,Vi.` : "Faltan los días que trabaja.");
  else if (!rotativos && diasPorSemana && dias.length !== diasPorSemana) error("Días que trabaja", `Marcaste ${dias.length} día(s) y trabaja ${diasPorSemana}. Con días rotativos pueden ser más; si no, tienen que ser los mismos.`);
  else if (rotativos && diasPorSemana && dias.length < diasPorSemana) error("Días que trabaja", `Rota entre ${dias.length} día(s) y trabaja ${diasPorSemana}: tienen que ser al menos ${diasPorSemana}.`);

  // El horario sale del turno cuando la fila no lo dice: es el mismo default que el formulario.
  const turno = turnoOpt ? ctx.turnosPorId.get(turnoOpt.id) : null;
  const entrada = horaValida(valores.entrada) || (valores.entrada ? null : turno?.startTime || null);
  const salida = horaValida(valores.salida) || (valores.salida ? null : turno?.endTime || null);
  if (valores.entrada && !entrada) error("Entrada", `«${valores.entrada}» no es una hora (usá HH:MM).`);
  if (valores.salida && !salida) error("Salida", `«${valores.salida}» no es una hora (usá HH:MM).`);
  if (!entrada || !salida) error("Entrada", "Falta el horario y el turno elegido tampoco lo trae: cargá entrada y salida.");

  // ── Cuánto ────────────────────────────────────────────────────────────────────────────────────
  const importe = numero(valores.importe);
  if (importe === null || importe <= 0) error("Importe por jornada", valores.importe ? `«${valores.importe}» no es un importe válido.` : "Falta el importe por jornada.");

  // ── Reemplazo ─────────────────────────────────────────────────────────────────────────────────
  const cuilReemplazado = soloDigitos(valores.reemplazaA);
  const reemplazado = cuilReemplazado ? ctx.usuariosPorCuil.get(cuilReemplazado) : null;
  if (cuilReemplazado && !reemplazado) error("Reemplaza a (CUIL)", `No hay nadie en la plataforma con el CUIL ${valores.reemplazaA}.`);
  const motivoOpt = buscarEnCatalogo(ctx.catalogos.motivos, valores.motivoReemplazo);
  if (valores.motivoReemplazo && !motivoOpt) error("Motivo del reemplazo", `No hay ningún motivo que se llame «${valores.motivoReemplazo}».`);
  if (cuilReemplazado && !motivoOpt) error("Motivo del reemplazo", "Marcaste un reemplazo: indicá por qué falta la persona reemplazada.");

  if (errores.length > 0) return { ok: null, errores };

  return {
    errores: [],
    ok: {
      fila,
      resumen: {
        nombre: existente ? `${existente.firstName || ""} ${existente.lastName || ""}`.trim() || existente.metadata?.fullName || nombre : nombre,
        cuil,
        proyecto: proyectoOpt!.etiqueta,
        areaTurno: `${areaOpt!.etiqueta} · ${turnoOpt!.etiqueta}`,
        contrato: contratoOpt!.etiqueta,
        desde: desde!,
        hasta: hasta || "",
        personaNueva: !existente,
      },
      datos: {
        cuil,
        nombre: nombre || `${existente?.firstName || ""} ${existente?.lastName || ""}`.trim(),
        email,
        usuarioExistenteId: existente ? String(existente._id) : "",
        projectId: proyectoOpt!.id,
        areaId: areaOpt!.id,
        shiftId: turnoOpt!.id,
        roleFrameId: rolOpt!.id,
        contratoId: contratoOpt!.id,
        nombreContrato: contratoOpt!.etiqueta,
        tramite: contratoOpt!.extra?.tramite || "",
        convenioId: esServicios ? "" : convenioOpt?.id || "",
        categoriaSatId: esServicios ? "" : categoriaOpt?.id || "",
        empresaContratoId: empresaId,
        desde,
        hasta: hasta || "",
        diasPorSemana,
        dias,
        rotativos,
        entrada,
        salida,
        importe,
        reemplazadoId: reemplazado ? String(reemplazado._id) : "",
        reemplazadoIdFrame: reemplazado ? String(reemplazado.metadata?.id || "") : "",
        motivoReemplazoId: motivoOpt?.id || "",
        comentarios: valores.comentarios.trim(),
      },
    },
  };
};

/**
 * CREA LA SOLICITUD DE UNA FILA, con la misma forma que manda la app.
 *
 * Es un `User` con `metadata.isSolicitud` —una solicitud no es una colección propia— y los mismos
 * campos que guarda `UserRegistrationModal`: el wizard de aprobación lee de ahí para precargarse, así
 * que una solicitud importada tiene que ser indistinguible de una pedida desde el teléfono.
 *
 * Si la persona no estaba, se crea primero su ficha: la solicitud queda atada a ella
 * (`solicitudUserId`) igual que cuando se elige a alguien registrado.
 */
export const crearSolicitud = async (datos: any, tenantId: Types.ObjectId, creadaPor: string, rolPorDefecto?: Types.ObjectId | null): Promise<{ solicitudId: string; personaCreada: boolean }> => {
  let personaId = datos.usuarioExistenteId;
  let personaCreada = false;

  if (!personaId) {
    const timestamp = Date.now();
    const emailFicha = datos.email || `cuil_${datos.cuil}@pendiente.local`;
    const persona = await User.create({
      email: emailFicha,
      password: await bcrypt.hash(`alta_${timestamp}`, 10),
      firstName: String(datos.nombre).split(" ")[0] || "Sin",
      lastName: String(datos.nombre).split(" ").slice(1).join(" ") || "nombre",
      isActive: false,
      tenantId,
      roles: rolPorDefecto ? [rolPorDefecto] : [],
      metadata: { fullName: datos.nombre, cuit: datos.cuil, documento: datos.cuil.length === 11 ? datos.cuil.slice(2, 10) : datos.cuil, activo: false },
    });
    personaId = String(persona._id);
    personaCreada = true;
  }

  const timestamp = Date.now();
  const solicitud = await User.create({
    email: `solicitud_${timestamp}_${datos.cuil}@pending.com`,
    password: await bcrypt.hash(`pass_${timestamp}`, 10),
    firstName: String(datos.nombre).split(" ")[0] || "Pendiente",
    lastName: String(datos.nombre).split(" ").slice(1).join(" ") || "Pendiente",
    isActive: false,
    tenantId,
    hireDate: datos.desde,
    metadata: {
      fullName: datos.nombre,
      isSolicitud: true,
      solicitudStatus: "pendiente",
      solicitudCreadaPor: new Types.ObjectId(creadaPor),
      solicitudUserId: new Types.ObjectId(personaId),
      cuit: datos.cuil,
      projectIds: [new Types.ObjectId(datos.projectId)],
      roles_frame: [new Types.ObjectId(datos.roleFrameId)],
      areaShiftAssignments: [{ areaId: datos.areaId, shiftIds: [datos.shiftId] }],
      contratoId: datos.contratoId,
      nombre_contrato: datos.nombreContrato,
      tipoImpositivo: datos.tramite || undefined,
      convenioId: datos.convenioId || undefined,
      categoriaSatId: datos.categoriaSatId || undefined,
      empresaContratoId: datos.empresaContratoId || undefined,
      startDate: datos.desde,
      dueDate: datos.hasta || undefined,
      diasPorSemana: datos.diasPorSemana,
      diasSemana: datos.dias,
      diasRotativos: datos.rotativos,
      schedule: `${datos.entrada} - ${datos.salida}`,
      dailyRate: datos.importe,
      isReplacement: !!datos.reemplazadoId,
      replacedUserId: datos.reemplazadoId || undefined,
      empleado_id_reemplezado: datos.reemplazadoIdFrame || undefined,
      motivoReemplazoId: datos.motivoReemplazoId || undefined,
      comentarios: datos.comentarios || undefined,
      // De dónde salió: una solicitud importada se reconoce después, sin tener que deducirlo por la hora.
      origenCargaMasiva: true,
    },
  });

  return { solicitudId: String(solicitud._id), personaCreada };
};
