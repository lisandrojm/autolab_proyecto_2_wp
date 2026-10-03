/**
 * DIAGNÓSTICO, SÓLO LECTURA: qué archivos hay en las carpetas de Dropbox que disparan transiciones
 * automáticas de estado, y cuáles de ellos el cron atribuiría a una persona. Sirve para entender por
 * qué el cron movió (o no) un contrato: muestra el nombre, la fecha de modificación y lo que el cron
 * LEE del nombre (CUIT, fechas, email), y si matchea por CUIT, por email o por el nombre completo
 * (las tres vías de `estadoDropboxCronService`, en ese orden).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagDropboxArchivosDePersona.ts <tenantId> <userId> [<userId> ...]
 *
 * No escribe nada: ni en Dropbox ni en la base.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { Info } from "../models/Info.js";
import { User } from "../models/User.js";
import { getTenantDropboxConfig, listFolder } from "../services/dropboxService.js";
import { leerAnclas, normalizarEmail } from "../utils/anclasNombre.js";
import { normalizarCuit } from "../utils/constanciaPdf.js";
const [tenantId, ...userIds] = process.argv.slice(2);
if (!tenantId || userIds.length === 0 || !userIds.every((id) => Types.ObjectId.isValid(id))) {
    console.error("Uso: <tenantId> <userId> [<userId> ...]");
    process.exit(1);
}
// Mismo criterio que el cron: minúsculas, sin acentos, sólo letras/números separados por un espacio.
const normalizarTexto = (s) => String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const users = await User.find({ _id: { $in: userIds } }).select("firstName lastName email metadata.cuit").lean();
    const personas = users.map((u) => ({ id: String(u._id), nombre: `${u.firstName || ""} ${u.lastName || ""}`.trim(), palabras: normalizarTexto(`${u.firstName || ""} ${u.lastName || ""}`).split(" ").filter(Boolean), cuit: normalizarCuit(u.metadata?.cuit), email: normalizarEmail(u.email) }));
    for (const p of personas)
        console.log(`persona ${p.id} · ${p.nombre} · cuit=${p.cuit || "-"} · email=${p.email || "-"} · palabras=[${p.palabras.join(" ")}]`);
    const tenant = await Tenant.findById(tenantId);
    const cfg = tenant ? getTenantDropboxConfig(tenant) : null;
    if (!cfg)
        throw new Error("El tenant no tiene Dropbox conectado");
    const estados = await Info.find({ type: "estado-empleado", "data.transicionAutomatica.evento": "dropbox_carpeta" }).lean();
    for (const e of estados) {
        for (const { dropboxCarpeta } of e.data?.transicionAutomatica?.carpetas || []) {
            const ruta = String(dropboxCarpeta).startsWith("/") ? String(dropboxCarpeta) : `/${dropboxCarpeta}`;
            let entries = [];
            try {
                ({ entries } = await listFolder(tenantId, cfg, ruta));
            }
            catch (err) {
                console.log(`\n── ${ruta} → ${e.name}: no se pudo listar (${err?.message || err})`);
                continue;
            }
            const archivos = entries.filter((x) => x.tag === "file");
            console.log(`\n── ${ruta} → estado «${e.name}» (orden ${e.data?.ordenDependencia}) · ${archivos.length} archivo(s)`);
            for (const f of archivos.slice(0, 3))
                console.log(`   (muestra) ${f.name}`);
            for (const f of archivos) {
                const a = leerAnclas(f.name);
                const cuit = normalizarCuit(a.cuit);
                const email = normalizarEmail(a.email);
                const sinNombre = normalizarTexto(f.name.replace(/\.[^.]+$/, ""));
                for (const p of personas) {
                    const via = cuit && cuit === p.cuit ? "cuit" : email && email === p.email ? "email" : !cuit && !email && p.palabras.length > 0 && p.palabras.every((w) => sinNombre.includes(w)) ? "nombre" : "";
                    if (!via)
                        continue;
                    console.log(`   ★ ${p.nombre} ← ${f.name}\n      vía=${via} · modificado=${f.serverModified || "-"} · cuit=${a.cuit || "-"} · fechas=[${a.fechas.join(", ")}] · email=${a.email || "-"}`);
                }
            }
        }
    }
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
