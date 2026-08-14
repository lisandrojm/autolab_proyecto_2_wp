import { Router, Response } from "express";
import { z } from "zod";
import multer from "multer";
import xlsx from "xlsx";
import { ArcaSucursal } from "../models/ArcaSucursal.js";
import { Company } from "../models/Company.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

/**
 * ABM de Sucursales de ARCA (Simplificación Registral). Catálogo global, mismo criterio que el resto
 * de la configuración: sin tenantId, solo `authenticateToken`.
 *
 * Acá se cargan TODOS los datos de la sucursal (código, domicilio, actividades). Las empresas
 * después solo eligen cuáles les corresponden.
 */
const router = Router();

const actividadSchema = z.object({
  codigo: z.string().regex(/^\d{1,6}$/, "El código de actividad son hasta 6 dígitos"),
  descripcion: z.string().optional().default(""),
});

const sucursalSchema = z.object({
  codigo: z.string().regex(/^\d{1,5}$/, "El código de sucursal son hasta 5 dígitos"),
  domicilio: z.string().min(1, "El domicilio es obligatorio"),
  localidad: z.string().optional().default(""),
  codigoPostal: z.string().optional().default(""),
  actividades: z.array(actividadSchema).optional().default([]),
  isActive: z.boolean().optional(),
});

/** Los códigos se guardan con los ceros a la izquierda: es lo que espera el TXT de alta. */
const pad = (valor: string, largo: number): string => valor.replace(/\D/g, "").padStart(largo, "0").slice(-largo);

const normalizar = (data: z.infer<typeof sucursalSchema>) => ({
  ...data,
  codigo: pad(data.codigo, 5),
  actividades: (data.actividades || []).map((a) => ({ codigo: pad(a.codigo, 6), descripcion: a.descripcion || "" })),
});

// GET /arca/sucursales
router.get("/", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await ArcaSucursal.find().sort({ codigo: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("List arca sucursales error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /arca/sucursales
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = normalizar(sucursalSchema.parse(req.body));
    // El código es la identidad de la sucursal dentro del padrón: repetirlo sería declarar dos
    // domicilios distintos con el mismo número y romper el TXT sin que se note.
    if (await ArcaSucursal.findOne({ codigo: data.codigo })) {
      return res.status(400).json({ error: `Ya existe una sucursal con el código ${data.codigo}` });
    }
    const created = await ArcaSucursal.create(data);
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    console.error("Create arca sucursal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /arca/sucursales/:id
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = sucursalSchema.partial().parse(req.body);
    const data = normalizar({ ...(parsed as z.infer<typeof sucursalSchema>), codigo: parsed.codigo ?? "0", actividades: parsed.actividades ?? [] });
    const update: Record<string, unknown> = {};
    if (parsed.codigo !== undefined) update.codigo = data.codigo;
    if (parsed.domicilio !== undefined) update.domicilio = parsed.domicilio;
    if (parsed.localidad !== undefined) update.localidad = parsed.localidad;
    if (parsed.codigoPostal !== undefined) update.codigoPostal = parsed.codigoPostal;
    if (parsed.actividades !== undefined) update.actividades = data.actividades;
    if (parsed.isActive !== undefined) update.isActive = parsed.isActive;

    if (update.codigo && (await ArcaSucursal.findOne({ codigo: update.codigo, _id: { $ne: req.params.id } }))) {
      return res.status(400).json({ error: `Ya existe otra sucursal con el código ${update.codigo}` });
    }

    const updated = await ArcaSucursal.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ error: "Sucursal no encontrada" });
    res.json(updated);
  } catch (error: any) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    console.error("Update arca sucursal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /arca/sucursales/:id
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Borrarla dejaría a las empresas apuntando a una sucursal inexistente y sus contratos sin poder
    // generar el alta, sin ninguna pista de por qué.
    const enUso = await Company.find({ sucursalIds: req.params.id }).select("razonSocial").lean();
    if (enUso.length > 0) {
      return res.status(400).json({ error: `No se puede eliminar: la usan ${enUso.map((e: any) => e.razonSocial).join(", ")}. Quitala de esas empresas primero.` });
    }
    const deleted = await ArcaSucursal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Sucursal no encontrada" });
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete arca sucursal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ *
 * Importación desde el export de ARCA
 *
 * Las sucursales y sus actividades se declaran en ARCA (Datos del Empleador → Domicilios de
 * Explotación, `Domicilios.aspx`), que tiene "Exportar lista a archivo". Acá NO se declaran: se
 * sincronizan. Por eso el importador pisa las actividades con lo que traiga el archivo — el padrón
 * de ARCA es la fuente de verdad, y una actividad dada de baja allá tiene que desaparecer acá.
 *
 * Los encabezados se buscan por alias porque el export de ARCA no está documentado y puede cambiar
 * de nombre entre pantallas. Si ninguno matchea, el error devuelve los encabezados encontrados para
 * poder sumarlos a la lista en vez de dejar al usuario adivinando.
 * ------------------------------------------------------------------ */
const upload = multer({ storage: multer.memoryStorage() });

// Los nombres reales del export de ARCA van primeros: SUCURSAL | DIRECCION | TIPO | ID ACT. | ACT.ECO.
const ALIAS_CODIGO = ["SUCURSAL", "Sucursal", "Código de sucursal", "Codigo de sucursal", "Código", "Codigo", "codigo", "Nro. Sucursal", "Nro Sucursal", "N° Sucursal"];
const ALIAS_DOMICILIO = ["DIRECCION", "DIRECCIÓN", "Dirección", "Direccion", "Domicilio", "domicilio", "Domicilio de Explotación", "Domicilio de Explotacion", "Calle"];
const ALIAS_LOCALIDAD = ["Localidad", "localidad", "Provincia", "Ciudad"];
const ALIAS_CP = ["Código Postal", "Codigo Postal", "Cod. Postal", "CP", "cp"];
const ALIAS_ACT_CODIGO = ["ID ACT.", "ID ACT", "IDACT", "Código de actividad", "Codigo de actividad", "Actividad", "actividad", "Cód. Actividad", "Cod. Actividad"];
const ALIAS_ACT_DESC = ["ACT.ECO.", "ACT ECO", "ACTECO", "Descripción de actividad", "Descripcion de actividad", "Descripción", "Descripcion", "Detalle actividad"];

/**
 * La columna DIRECCION del export viene con el CP y la localidad adentro, en una sola línea:
 *   "VALDENEGRO 4867  Cod. Postal 1430, CIUDAD AUTONOMA BUENOS AIRES"
 * Se parte en domicilio / CP / localidad; si no matchea, va entera al domicilio.
 */
const partirDireccion = (texto: string): { domicilio: string; codigoPostal: string; localidad: string } => {
  const m = /^(.*?)\s*Cod\.?\s*Postal\s*(\d+)\s*,?\s*(.*)$/i.exec(texto.trim());
  return m ? { domicilio: m[1].trim(), codigoPostal: m[2].trim(), localidad: m[3].trim() } : { domicilio: texto.trim(), codigoPostal: "", localidad: "" };
};

/**
 * Encabezado normalizado para comparar: sin acentos, sin mayúsculas y sin nada que no sea
 * alfanumérico. Así "Código de sucursal", "CODIGO DE SUCURSAL" y "codigo_de_sucursal" son lo mismo.
 */
const normHeader = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Primer valor no vacío de la fila entre los encabezados candidatos (comparando normalizado). */
const leer = (row: Record<string, unknown>, alias: string[]): string => {
  const buscados = alias.map(normHeader);
  for (const clave of Object.keys(row)) {
    if (!buscados.includes(normHeader(clave))) continue;
    const v = row[clave];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

/** Cuántos grupos de columnas se reconocieron en una fila: sirve para elegir la codificación. */
const columnasReconocidas = (row: Record<string, unknown>): number => [ALIAS_CODIGO, ALIAS_DOMICILIO, ALIAS_LOCALIDAD, ALIAS_CP, ALIAS_ACT_CODIGO, ALIAS_ACT_DESC].filter((alias) => leer(row, alias) !== "").length;

// GET /arca/sucursales/template - plantilla con el formato que espera el importador
router.get("/template", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Una fila por (sucursal, actividad): así viene el padrón, que es 1-a-N. Las filas de la misma
    // sucursal se agrupan por código al importar, repitiendo domicilio/CP/localidad.
    // Mismas columnas que el export real de ARCA, para que un archivo bajado de ahí entre sin tocar
    // nada. La segunda actividad de la 00002 va en fila de continuación, igual que en el original.
    const wsData: (string | number)[][] = [
      ["SUCURSAL", "DIRECCION", "TIPO", "ID ACT.", "ACT.ECO."],
      ["00001", "ZAPIOLA 392  Cod. Postal 1426, CIUDAD AUTONOMA BUENOS AIRES", "1", "921430", "SERVICIOS CONEXOS A LA PRODUCCION DE ESPECTACULOS TEATRALES Y MUSICALES"],
      ["00002", "TRONADOR 671  Cod. Postal 1427, CIUDAD AUTONOMA BUENOS AIRES", "99", "900030", "SERVICIOS CONEXOS A LA PRODUCCION DE ESPECTACULOS TEATRALES Y MUSICALES"],
      ["", "", "", "921430", "SERVICIOS CONEXOS A LA PRODUCCION DE ESPECTACULOS TEATRALES Y MUSICALES"],
    ];
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 12 }, { wch: 62 }, { wch: 8 }, { wch: 12 }, { wch: 70 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Sucursales");
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=plantilla_arca_sucursales.xlsx");
    res.send(buffer);
  } catch (error) {
    console.error("Download arca sucursales template error:", error);
    res.status(500).json({ error: "No se pudo generar la plantilla" });
  }
});

/**
 * Fallback para cuando el export no es una planilla sino texto de ancho fijo (columnas alineadas con
 * espacios), como se ve en pantalla:
 *
 *   SUCURSAL  DIRECCION                          TIPO  ID ACT.  ACT.ECO.
 *   00004     VALDENEGRO 4867  Cod. Postal ...   99    591120   POSTPRODUCCIÓN DE FILMES
 *
 * Las posiciones de corte se sacan del propio encabezado (dónde arranca cada nombre de columna), que
 * es la forma confiable de leer ancho fijo: partir por "2 o más espacios" rompe con las direcciones,
 * que traen espacios dobles adentro. Devuelve filas con la misma forma que `sheet_to_json` para que
 * el resto del parseo no cambie. Si no encuentra un encabezado reconocible, devuelve [].
 */
function parsearTextoAnchoFijo(texto: string): Record<string, unknown>[] {
  const lineas = texto.split(/\r?\n/);
  const iCabecera = lineas.findIndex((l) => {
    const n = normHeader(l);
    return n.includes("sucursal") && (n.includes("direccion") || n.includes("domicilio"));
  });
  if (iCabecera < 0) return [];

  const cabecera = lineas[iCabecera];
  // Nombre de cada columna + dónde arranca. Un token es texto separado por 2+ espacios.
  const columnas: Array<{ nombre: string; desde: number }> = [];
  const re = /\S(?:.*?\S)?(?=\s{2,}|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cabecera)) !== null) {
    if (m[0].trim()) columnas.push({ nombre: m[0].trim(), desde: m.index });
  }
  if (columnas.length < 2) return [];

  const filas: Record<string, unknown>[] = [];
  for (const linea of lineas.slice(iCabecera + 1)) {
    if (!linea.trim()) continue;
    const fila: Record<string, unknown> = {};
    columnas.forEach((col, i) => {
      const hasta = i + 1 < columnas.length ? columnas[i + 1].desde : linea.length;
      fila[col.nombre] = linea.slice(col.desde, hasta).trim();
    });
    filas.push(fila);
  }
  return filas;
}

export interface SucursalParseada {
  codigo: string;
  domicilio: string;
  localidad: string;
  codigoPostal: string;
  actividades: Array<{ codigo: string; descripcion: string }>;
}

/**
 * Parsea el archivo del export de ARCA (o la plantilla) a sucursales agrupadas por código.
 *
 * Exportada para poder testearla sin levantar el server ni tocar la base: el parseo es la parte
 * frágil (encabezados desconocidos, una fila por actividad), el upsert es trivial.
 *
 * Lanza `Error` con un mensaje para el usuario si el archivo está vacío o no se reconocen columnas.
 */
export function parsearExportSucursales(buffer: Buffer): { sucursales: SucursalParseada[]; errores: string[] } {
  // `xlsx.read` se banca .xlsx, .xls y .csv, que es lo que puede salir del export de ARCA.
  //
  // Con CSV hay que adivinar la codificación: `xlsx` asume Windows-1252 y, si el archivo vino en
  // UTF-8, "Domicilio de Explotación" llega como "Domicilio de ExplotaciÃ³n" y no matchea ningún
  // alias. Se prueban las dos y gana la que reconozca más columnas. En .xlsx la codificación viene
  // en el propio archivo, así que ambas pasadas dan igual y no cambia nada.
  const intentos = [65001, 1252].map((codepage) => {
    try {
      const wb = xlsx.read(buffer, { type: "buffer", codepage });
      const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      return { rows, puntaje: rows.length > 0 ? columnasReconocidas(rows[0]) : -1 };
    } catch {
      return { rows: [] as Record<string, unknown>[], puntaje: -1 };
    }
  });
  let rows = intentos.reduce((mejor, actual) => (actual.puntaje > mejor.puntaje ? actual : mejor)).rows;

  // Si como planilla no se reconoció nada, puede ser un .txt de ancho fijo (ver más arriba). Se
  // prueban las dos codificaciones habituales por el mismo motivo que con el CSV.
  if (rows.length === 0 || columnasReconocidas(rows[0]) === 0) {
    for (const enc of ["utf8", "latin1"] as const) {
      const filas = parsearTextoAnchoFijo(buffer.toString(enc));
      if (filas.length > 0 && columnasReconocidas(filas[0]) > 0) {
        rows = filas;
        break;
      }
    }
  }

  if (rows.length === 0) throw new Error("El archivo está vacío");

  const encabezados = Object.keys(rows[0] || {});
  // Alcanza con reconocer el código: en el export de ARCA las filas de continuación traen la
  // dirección en blanco, así que exigir las dos en la primera fila sería frágil.
  if (columnasReconocidas(rows[0]) === 0) {
    throw new Error(`No se reconocieron las columnas del archivo. Trae: ${encabezados.join(" | ") || "(sin encabezados)"}. Descargá la plantilla para ver el formato esperado.`);
  }

  // Agrupado por código: el padrón trae una fila por actividad, con el domicilio repetido.
  const porCodigo = new Map<string, SucursalParseada>();
  const errores: string[] = [];

  // Las sucursales con varias actividades vienen en filas de CONTINUACIÓN: la segunda actividad
  // llega con SUCURSAL y DIRECCION en blanco (así sale la 00002 de FZERO, con 900030 y 921430).
  // Sin arrastrar el último código, esas actividades se perderían en silencio.
  let ultimoCodigo = "";

  rows.forEach((row, i) => {
    const fila = i + 2;
    const codigoRaw = leer(row, ALIAS_CODIGO);
    const direccion = leer(row, ALIAS_DOMICILIO);
    const actCodigo = leer(row, ALIAS_ACT_CODIGO).replace(/\D/g, "");
    if (!codigoRaw && !direccion && !actCodigo) return; // fila vacía de relleno

    let codigo: string;
    if (codigoRaw) {
      const soloDigitos = codigoRaw.replace(/\D/g, "");
      if (!soloDigitos || soloDigitos.length > 5) return void errores.push(`Fila ${fila}: código de sucursal inválido ("${codigoRaw}")`);
      codigo = pad(codigoRaw, 5);
      ultimoCodigo = codigo;
    } else if (ultimoCodigo) {
      codigo = ultimoCodigo; // fila de continuación: otra actividad de la sucursal anterior
    } else {
      return void errores.push(`Fila ${fila}: falta el código de sucursal`);
    }

    const actual = porCodigo.get(codigo) || { codigo, domicilio: "", localidad: "", codigoPostal: "", actividades: [] };
    // El domicilio trae CP y localidad adentro; se toma de la primera fila del grupo que lo traiga.
    if (!actual.domicilio && direccion) {
      const partes = partirDireccion(direccion);
      actual.domicilio = partes.domicilio;
      actual.codigoPostal = partes.codigoPostal;
      actual.localidad = partes.localidad;
    }
    // Columnas propias, por si el archivo las trae separadas en vez de dentro de la dirección.
    if (!actual.localidad) actual.localidad = leer(row, ALIAS_LOCALIDAD);
    if (!actual.codigoPostal) actual.codigoPostal = leer(row, ALIAS_CP).replace(/\D/g, "");

    if (actCodigo && !actual.actividades.some((a) => a.codigo === pad(actCodigo, 6))) {
      actual.actividades.push({ codigo: pad(actCodigo, 6), descripcion: leer(row, ALIAS_ACT_DESC) });
    }
    porCodigo.set(codigo, actual);
  });

  if (porCodigo.size === 0) {
    throw new Error(`No se pudo leer ninguna sucursal del archivo.${errores.length ? ` Primeros problemas: ${errores.slice(0, 3).join("; ")}` : ""}`);
  }
  return { sucursales: Array.from(porCodigo.values()), errores };
}

// POST /arca/sucursales/import - importa el export de ARCA (o la plantilla)
router.post("/import", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Debe subir un archivo" });

    let parseado;
    try {
      parseado = parsearExportSucursales(req.file.buffer);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "No se pudo leer el archivo" });
    }
    const { sucursales, errores } = parseado;

    let creadas = 0;
    let actualizadas = 0;
    let iguales = 0;
    const sinDomicilio: string[] = [];

    for (const s of sucursales) {
      if (!s.domicilio) {
        sinDomicilio.push(s.codigo);
        continue;
      }
      const previa = await ArcaSucursal.findOne({ codigo: s.codigo });
      if (!previa) {
        await ArcaSucursal.create(s);
        creadas++;
        continue;
      }
      const mismasActividades = previa.actividades.length === s.actividades.length && previa.actividades.every((a) => s.actividades.some((b) => b.codigo === a.codigo));
      const sinCambios = previa.domicilio === s.domicilio && (previa.localidad || "") === s.localidad && (previa.codigoPostal || "") === s.codigoPostal && mismasActividades;
      if (sinCambios) {
        iguales++;
        continue;
      }
      // Las actividades se reemplazan, no se mergean: si ARCA le dio de baja una, tiene que
      // desaparecer. Es una sincronización del padrón, no una edición.
      previa.set({ domicilio: s.domicilio, localidad: s.localidad, codigoPostal: s.codigoPostal, actividades: s.actividades });
      await previa.save();
      actualizadas++;
    }

    // Las que están en la base y no en el archivo NO se borran: puede haber contratos usándolas.
    const codigosArchivo = new Set(sucursales.map((s) => s.codigo));
    const sobrantes = (await ArcaSucursal.find().select("codigo").lean()).map((s: any) => String(s.codigo)).filter((c) => !codigosArchivo.has(c));

    res.json({ creadas, actualizadas, iguales, sobrantes, sinDomicilio, errores });
  } catch (error) {
    console.error("Import arca sucursales error:", error);
    res.status(500).json({ error: "No se pudo importar el archivo" });
  }
});

export { router as arcaSucursalRoutes };
