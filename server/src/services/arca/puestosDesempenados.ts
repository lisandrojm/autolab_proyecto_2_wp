import xlsx from "xlsx";
import { ArcaPuestoDesempenado } from "../../models/ArcaPuestoDesempenado.js";
import { ArcaCatalogo } from "../../models/ArcaCatalogo.js";
import { Categoria } from "../../models/Categoria.js";
import { Company } from "../../models/Company.js";
import { RoleFrame } from "../../models/RoleFrame.js";
import { getArcaDefaults } from "../../models/ArcaDefault.js";
import { filasCsvArca } from "../../compartido/catalogoArca.js";
import { codigoPuesto, FilaPuesto, planDeImportacionPuestos } from "../../compartido/puestosDesempenados.js";

/**
 * EL CATÁLOGO DE PUESTOS DESEMPEÑADOS: de dónde se importa y quién lo usa.
 *
 * La tabla oficial es la de la lupa «Puesto Desemp.» de Registrar Nuevas Altas (`window.l_PD`). No
 * hay endpoint de ARCA: se toma del ESPEJO (`arca_catalogo`, tabla PUESTO_DESEMPENADO), que llenan
 * la semilla del CSV del repo y «Leer de ARCA» (Configuración → ARCA → Catálogo de ARCA). Además se
 * puede subir el archivo de la tabla.
 */

/** Dónde se usa un código. `null` = en ningún lado: se puede borrar. */
export async function usosDelPuesto(codigo: string): Promise<string | null> {
  const c = codigoPuesto(codigo);
  if (!c) return null;
  const [cats, roles, empresas, global] = await Promise.all([
    Categoria.find({ puestoDesempenado: c }).select("nombre convenio").limit(5).lean(),
    RoleFrame.find({ "data.puestoDesempenado": c }).select("name").limit(5).lean(),
    Company.find({ "defaultsArca.puestoDesempenado": c }).select("razonSocial").limit(5).lean(),
    getArcaDefaults(),
  ]);
  const partes: string[] = [];
  if (roles.length) partes.push(`Roles Empresa: ${(roles as any[]).map((r) => r.name).join(", ")}`);
  if (cats.length) partes.push(`categorías: ${(cats as any[]).map((x) => `${x.convenio} ${x.nombre}`).join(", ")}`);
  if (empresas.length) partes.push(`default de ${(empresas as any[]).map((e) => e.razonSocial).join(", ")}`);
  if (codigoPuesto((global as any)?.puestoDesempenado) === c) partes.push("default de la instalación");
  return partes.length ? `El puesto ${c} está en uso (${partes.join("; ")}). Desactivalo en lugar de borrarlo.` : null;
}

/** ¿El código existe y está activo en el catálogo? Lo usan los ABM que lo asignan. */
export async function puestoActivo(codigo: string): Promise<boolean> {
  const c = codigoPuesto(codigo);
  if (!c) return false;
  const p: any = await ArcaPuestoDesempenado.findOne({ externalId: c }).select("activo").lean();
  return !!p && p.activo !== false;
}

/** Aplica la importación (upsert por código) y devuelve el resumen. */
export async function importarPuestos(filas: FilaPuesto[]) {
  const existentes: any[] = await ArcaPuestoDesempenado.find().select("externalId name origen").lean();
  const plan = planDeImportacionPuestos(
    existentes.map((e) => ({ codigo: e.externalId, descripcion: e.name, origen: e.origen })),
    filas,
  );
  const ahora = new Date();
  const ops: any[] = [
    ...plan.nuevos.map((n) => ({ insertOne: { document: { externalId: n.codigo, name: n.descripcion, data: { id: Number(n.codigo), nombre: n.descripcion }, activo: true, origen: "arca", sincronizadoEl: ahora, createdAt: ahora, updatedAt: ahora } } })),
    ...plan.actualizados.map((a) => ({ updateOne: { filter: { externalId: a.codigo }, update: { $set: { name: a.descripcion, "data.nombre": a.descripcion, sincronizadoEl: ahora, updatedAt: ahora } } } })),
  ];
  // Los que ya estaban iguales (y son de ARCA) quedan con la fecha de esta sincronización.
  const deArca = plan.sinCambios.filter((c) => existentes.find((e) => e.externalId === c)?.origen !== "manual");
  if (deArca.length) ops.push({ updateMany: { filter: { externalId: { $in: deArca } }, update: { $set: { sincronizadoEl: ahora } } } });
  if (ops.length) await ArcaPuestoDesempenado.collection.bulkWrite(ops, { ordered: false });
  return {
    nuevos: plan.nuevos.length,
    actualizados: plan.actualizados.length,
    sinCambios: plan.sinCambios.length,
    manualesRespetados: plan.manualesRespetados.length,
    descartadas: plan.descartadas,
    detalle: { nuevos: plan.nuevos, actualizados: plan.actualizados, manualesRespetados: plan.manualesRespetados },
  };
}

/** La tabla oficial desde el espejo de ARCA (solo vigentes). */
export async function filasDesdeEspejo(): Promise<FilaPuesto[]> {
  const filas: any[] = await ArcaCatalogo.find({ tabla: "PUESTO_DESEMPENADO", vigente: true }).select("codigo descripcion").lean();
  return filas.map((f) => ({ codigo: f.codigo, descripcion: f.descripcion }));
}

/**
 * Un archivo de la tabla: el CSV oficial (con su encabezado `tabla,…`, se toman las filas
 * PUESTO_DESEMPENADO) o una planilla (Excel/CSV) con una columna de código y otra de descripción.
 */
export function filasDesdeArchivo(buffer: Buffer, nombre: string): FilaPuesto[] {
  const texto = /\.csv$/i.test(nombre) ? buffer.toString("utf8") : "";
  if (texto && /^﻿?tabla,/.test(texto)) {
    return filasCsvArca(texto)
      .filter((f) => f.tabla === "PUESTO_DESEMPENADO")
      .map((f) => ({ codigo: f.codigoPadded || f.codigo, descripcion: f.descripcion }));
  }
  const wb = xlsx.read(buffer, { type: "buffer" });
  const rows = xlsx.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const clave = (r: any, re: RegExp) => Object.keys(r).find((k) => re.test(k.normalize("NFD").replace(/[̀-ͯ]/g, "")));
  return rows
    .map((r) => {
      const kc = clave(r, /^c(o|ó)d/i) ?? Object.keys(r)[0];
      const kd = clave(r, /desc|nombre|puesto/i) ?? Object.keys(r)[1];
      return { codigo: String(r[kc] ?? ""), descripcion: String(r[kd] ?? "") };
    })
    .filter((f) => f.codigo);
}
