import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { normalizarNombre } from "../compartido/catalogoArca.js";
import { ESPERADO_0634_11 } from "../compartido/correccion063411.js";
import { claveEstado } from "../utils/estadoClave.js";

/**
 * SOLO LECTURA. Los contratos que usan alguna de las 41 categorías cruzadas del 0634/11 y que ya
 * tienen el alta hecha: esas altas se presentaron en ARCA con el código de OTRA categoría.
 *
 * Es para que el contador decida si rectifica en ARCA. El sistema no rectifica nada solo.
 *
 * Funciona antes o después de aplicar `corregirCodigosCategorias`: identifica las categorías por
 * NOMBRE (las de `correccion063411.ts`), y el «código declarado» es el que tenían hasta la corrección.
 *
 * «Alta hecha» = alguna de estas señales (la columna `senal` dice cuál, para poder filtrar):
 *   presentada_auto   la corrida automática la presentó (`altaArcaPresentada`)
 *   documento_alta    tiene el PDF de alta cargado (`altaDocumentoUrl`)
 *   firma             ya pasó a firma (`firmaGeneradoAt` / `firmaEnviadaAt`)
 *   estado            su estado ya no es el del trámite impositivo («Pedido de AFIP» / «de Servicios»)
 * La última es la más amplia —incluye los contratos importados de FRAME ya firmados— y la menos
 * segura: un contrato que nunca generó alta también puede estar en otro estado.
 *
 * Uso (desde server/): npm run categorias:altas-cruzadas    → server/respaldos/altas-categorias-cruzadas-<db>-<fecha>.csv
 */

const ESTADOS_TRAMITE = new Set(["pedido de afip", "pedido de servicios"]);

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db!;

  const porNombre = new Map(ESPERADO_0634_11.map(([, nombre, de, a]) => [normalizarNombre(nombre), { nombre, de, a }]));
  const cats: any[] = await db.collection("categorias").find({ convenio: "0634/11" }).project({ nombre: 1, legacyId: 1 }).toArray();
  const porLegacy = new Map<number, { nombre: string; de: string; a: string }>();
  for (const c of cats) {
    const e = porNombre.get(normalizarNombre(c.nombre));
    if (e && c.legacyId != null) porLegacy.set(Number(c.legacyId), e);
  }
  if (porLegacy.size !== ESPERADO_0634_11.length) console.log(`⚠ Encontré ${porLegacy.size} de las ${ESPERADO_0634_11.length} categorías por nombre.`);

  const ups: any[] = await db
    .collection("users_&_projects")
    .find({ "contracts.categoria_sat_id": { $in: [...porLegacy.keys()] } })
    .project({ userId: 1, contracts: 1 })
    .toArray();
  const usuarios = new Map(
    (await db.collection("users").find({ _id: { $in: ups.map((u) => u.userId) } }).project({ firstName: 1, lastName: 1, "metadata.cuit": 1 }).toArray()).map((u: any) => [String(u._id), u]),
  );
  const empresas = new Map((await db.collection("companies").find({}).project({ razonSocial: 1, cuit: 1 }).toArray()).map((e: any) => [String(e._id), e]));

  const filas: string[][] = [];
  const porSenal: Record<string, number> = {};
  for (const up of ups) {
    (up.contracts || []).forEach((c: any, idx: number) => {
      const cat = porLegacy.get(Number(c?.categoria_sat_id));
      if (!cat) return;
      const senal =
        c.altaArcaPresentada && c.altaArcaPresentada.resultado !== "fallida"
          ? "presentada_auto"
          : c.altaDocumentoUrl
            ? "documento_alta"
            : c.firmaEnviadaAt || c.firmaGeneradoAt
              ? "firma"
              : c.nombre_estado_empleado && !ESTADOS_TRAMITE.has(claveEstado(String(c.nombre_estado_empleado)))
                ? "estado"
                : "";
      if (!senal) return;
      porSenal[senal] = (porSenal[senal] || 0) + 1;
      const u = usuarios.get(String(up.userId));
      const e = empresas.get(String(c.empresaContratoId || ""));
      filas.push([
        `${u?.lastName || ""} ${u?.firstName || ""}`.trim(),
        String(u?.metadata?.cuit || "").replace(/\D/g, ""),
        e?.razonSocial || c.nombre_empresa_contrato || "",
        String(e?.cuit || "").replace(/\D/g, ""),
        String(c.fecha_alta_contrato || ""),
        String(c.fecha_baja_contrato || ""),
        cat.nombre,
        cat.de,
        cat.a,
        String(c.nombre_estado_empleado || ""),
        senal,
        String(up._id),
        String(idx),
      ]);
    });
  }
  filas.sort((a, b) => a[2].localeCompare(b[2]) || a[4].localeCompare(b[4]));

  const cab = ["persona", "cuil", "empleadora", "cuit_empleadora", "fecha_inicio", "fecha_fin", "categoria", "codigo_declarado", "codigo_correcto", "estado", "senal", "userProjectId", "indice_contrato"];
  const carpeta = path.resolve("respaldos");
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `altas-categorias-cruzadas-${dbName}-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(archivo, "﻿" + [cab, ...filas].map((f) => f.map(csv).join(",")).join("\n") + "\n", "utf8");
  console.log(`${filas.length} contrato(s) con alta hecha y categoría cruzada → ${archivo}`);
  console.log(`Por señal: ${Object.entries(porSenal).map(([k, v]) => `${k} ${v}`).join(" · ") || "ninguno"}`);
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
