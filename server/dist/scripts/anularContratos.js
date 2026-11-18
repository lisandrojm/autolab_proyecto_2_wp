/**
 * LIMPIEZA DE CONTRATOS POR CLAVE (18/11/2026): anula contratos y reasigna recibos de sueldo, nombrando
 * cada contrato por su `contratoKey`, no por su posición.
 *
 *   # dry-run (por defecto): muestra qué haría y qué referencias cuelgan de cada contrato
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/anularContratos.ts \
 *       --anular 6afdb3ca0fc132faeab899ac "Duplicado del 01/05/2026: ARCA tiene la relación con FZERO, no con 2030"
 *
 *   # reasignar los recibos de un contrato a otro DEL MISMO vínculo (antes de anular el primero)
 *   ... --recibos <claveOrigen> <claveDestino>
 *
 *   # las dos cosas, desde un archivo: [{ "anular": "<clave>", "motivo": "..." }, { "recibosDe": "<clave>", "a": "<clave>" }]
 *   ... --archivo limpieza.json
 *
 *   --commit                    escribe (sin esto no toca nada)
 *   --por <userId>              quién figura como autor de la anulación (si no, «script anularContratos»)
 *   --permitir-borrar-vinculo   anular aunque sea el último contrato de verdad de la persona en el proyecto
 *                               (en ese caso el vínculo se borra, como hacía el borrado físico)
 *
 * QUÉ SE NIEGA A HACER, aunque se pida con --commit:
 *  - anular un contrato del que todavía cuelgan recibos de sueldo o renovaciones (la misma regla que el
 *    panel, `services/referenciasContrato.ts`): primero se mueven (`--recibos`) o se resuelven. Las
 *    reasignaciones de la misma corrida se aplican ANTES de revisar esto. Las verificaciones, constancias
 *    y logs de ARCA son registro: se informan y quedan apuntando a la lápida;
 *  - lo que también rechaza el panel: un alta ya presentada en ARCA, un contrato ya anulado, sin motivo.
 *
 * Idempotente: un contrato ya anulado se informa y se saltea; una reasignación ya hecha no encuentra nada
 * que mover. Las reasignaciones dejan respaldo en `migraciones-respaldo/` (las anulaciones ya quedan en
 * `contratos_anulados`, con el contrato entero).
 *
 * Después de cada anulación imprime las claves de todas las posiciones del vínculo, antes y después:
 * la anulación no tiene que mover ninguna.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { ReciboSueldoEnviado } from "../models/ReciboSueldoEnviado.js";
import { LoteRecibosSueldo } from "../models/LoteRecibosSueldo.js";
import { anularContrato } from "../services/anulacionContrato.js";
import { moverRecibos, referenciasDeContrato } from "../services/referenciasContrato.js";
import { esLapida, quedanContratosSiSeAnula } from "../utils/anulacionContrato.js";
const esClave = (s) => /^[a-f\d]{24}$/i.test(String(s || ""));
const dia = (v) => (v instanceof Date ? v.toISOString() : String(v || "")).slice(0, 10) || "—";
function leerPedidos(argv) {
    const pedidos = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--anular")
            pedidos.push({ tipo: "anular", clave: argv[++i], motivo: argv[++i] });
        else if (argv[i] === "--recibos")
            pedidos.push({ tipo: "recibos", de: argv[++i], a: argv[++i] });
        else if (argv[i] === "--archivo") {
            for (const p of JSON.parse(fs.readFileSync(argv[++i], "utf8"))) {
                if (p.anular)
                    pedidos.push({ tipo: "anular", clave: p.anular, motivo: p.motivo });
                else if (p.recibosDe)
                    pedidos.push({ tipo: "recibos", de: p.recibosDe, a: p.a });
            }
        }
    }
    for (const p of pedidos) {
        if (p.tipo === "anular" && (!esClave(p.clave) || !String(p.motivo || "").trim()))
            throw new Error(`--anular necesita una clave de 24 hex y un motivo: ${JSON.stringify(p)}`);
        if (p.tipo === "recibos" && (!esClave(p.de) || !esClave(p.a)))
            throw new Error(`--recibos necesita dos claves de 24 hex: ${JSON.stringify(p)}`);
    }
    // Las reasignaciones primero: liberan los contratos que después se anulan.
    return [...pedidos.filter((p) => p.tipo === "recibos"), ...pedidos.filter((p) => p.tipo === "anular")];
}
/** El vínculo y la posición de un contrato, por su clave. */
async function ubicar(clave) {
    const up = await UserProject.findOne({ "contracts.contratoKey": new Types.ObjectId(clave) });
    if (!up)
        return null;
    const idx = (up.contracts || []).findIndex((c) => String(c?.contratoKey || "") === clave);
    return idx >= 0 ? { up, idx } : null;
}
/** Lo que cuelga de su posición, con la MISMA regla que el panel (`services/referenciasContrato.ts`). */
async function referencias(upId, idx) {
    const r = await referenciasDeContrato(upId, idx);
    const texto = [r.textoBloqueantes && `bloquean: ${r.textoBloqueantes}`, r.textoInformativas && `informativas (quedan apuntando a la lápida): ${r.textoInformativas}`].filter(Boolean).join(" · ") || "ninguna";
    return { total: r.totalBloqueantes, deRecibos: r.bloqueantes.recibos.length || r.bloqueantes.lotesDeRecibos, texto };
}
async function main() {
    const argv = process.argv.slice(2);
    const commit = argv.includes("--commit");
    const permitirBorrarVinculo = argv.includes("--permitir-borrar-vinculo");
    const iPor = argv.indexOf("--por");
    const por = iPor >= 0 ? argv[iPor + 1] : null;
    const pedidos = leerPedidos(argv);
    if (pedidos.length === 0)
        throw new Error("Nada que hacer: pasá --anular <clave> <motivo>, --recibos <de> <a> o --archivo <json>.");
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const empresas = await Company.find({}).select("razonSocial").lean();
    const empresa = new Map(empresas.map((e) => [String(e._id), String(e.razonSocial || "")]));
    const describir = (c) => `${c.nombre_contrato || "?"} · ${empresa.get(String(c.empresaContratoId)) || "sin empresa"} · alta ${dia(c.fecha_alta_contrato)} · baja ${dia(c.fecha_baja_contrato)} · estado «${c.nombre_estado_empleado || "?"}»`;
    const nombreDe = async (userId) => {
        const u = await User.findById(userId).select("firstName lastName metadata.fullName").lean();
        return u?.metadata?.fullName || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || String(userId);
    };
    const respaldo = [];
    let errores = 0;
    /** En dry-run: posiciones cuyos recibos ya se habrían movido en esta misma corrida (para no rechazar de mentira). */
    const recibosMovidosEnSimulacion = new Set();
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    for (const p of pedidos) {
        if (p.tipo === "recibos") {
            const [de, a] = await Promise.all([ubicar(p.de), ubicar(p.a)]);
            console.log(`▸ Recibos de ${p.de} → ${p.a}`);
            if (!de || !a) {
                console.log(`  ✖ No encuentro ${!de ? p.de : p.a}.`);
                errores++;
                continue;
            }
            if (String(de.up._id) !== String(a.up._id)) {
                console.log("  ✖ Las dos claves son de vínculos distintos: los recibos sólo se mueven dentro del mismo vínculo.");
                errores++;
                continue;
            }
            if (esLapida(a.up.contracts[a.idx])) {
                console.log("  ✖ El destino está anulado.");
                errores++;
                continue;
            }
            console.log(`  ${await nombreDe(de.up.userId)} · vínculo ${de.up._id}`);
            console.log(`  de  #${de.idx} ${describir(de.up.contracts[de.idx])}`);
            console.log(`  a   #${a.idx} ${describir(a.up.contracts[a.idx])}`);
            const recibos = await ReciboSueldoEnviado.find({ userProjectId: de.up._id, contractIndex: de.idx }).select("_id periodo estado").lean();
            const lotes = await LoteRecibosSueldo.find({ recibos: { $elemMatch: { userProjectId: de.up._id, contractIndex: de.idx } } }).select("_id").lean();
            console.log(`  ${recibos.length} recibos enviados (${recibos.map((r) => `${r.periodo} ${r.estado}`).join(", ") || "—"}) y ${lotes.length} lotes`);
            if (!commit) {
                recibosMovidosEnSimulacion.add(`${de.up._id}|${de.idx}`);
                continue;
            }
            if (!recibos.length && !lotes.length)
                continue;
            const r = await moverRecibos(de.up._id, de.idx, a.idx);
            respaldo.push({ tipo: "recibos", userProjectId: String(de.up._id), deIndice: de.idx, aIndice: a.idx, deClave: p.de, aClave: p.a, recibos: r.recibos, lotes: r.lotes });
            console.log(`  ✔ movidos: ${r.movidos} recibos enviados, ${r.lotesMovidos} lotes`);
            continue;
        }
        // Anular
        console.log(`▸ Anular ${p.clave}`);
        const u = await ubicar(p.clave);
        if (!u) {
            console.log("  ✖ No encuentro esa clave en ningún vínculo.");
            errores++;
            continue;
        }
        const { up, idx } = u;
        const c = up.contracts[idx];
        const proyecto = await Project.findById(up.projectId).select("name tenantId").lean();
        console.log(`  ${await nombreDe(up.userId)} · ${proyecto?.name || up.projectId} · vínculo ${up._id} · posición #${idx} de ${up.contracts.length}`);
        if (esLapida(c)) {
            console.log("  = Ya está anulado: nada que hacer.");
            continue;
        }
        console.log(`  ${describir(c)}`);
        const arca = String(c.altaArcaPresentada?.resultado || "");
        console.log(`  Guarda ARCA: altaArcaPresentada = «${arca || "no tiene"}»${["presentada", "indeterminado", "presentando"].includes(arca) ? " → NO SE PUEDE ANULAR (necesita baja)" : ""}`);
        const refs = await referencias(up._id, idx);
        console.log(`  Referencias por posición: ${refs.texto}`);
        // Dry-run: si las únicas referencias son recibos que esta corrida mueve antes, con --commit ya no van a estar.
        if (!commit && refs.total > 0 && refs.total === refs.deRecibos && recibosMovidosEnSimulacion.has(`${up._id}|${idx}`)) {
            console.log("  (los recibos se mueven antes en esta misma corrida: con --commit se anularía)");
            refs.total = 0;
        }
        const ultimo = !quedanContratosSiSeAnula(up.contracts, idx);
        if (ultimo)
            console.log(`  ⚠ Es el último contrato de verdad: anularlo BORRA el vínculo con el proyecto${permitirBorrarVinculo ? " (permitido)" : " (pasá --permitir-borrar-vinculo para hacerlo)"}.`);
        if (refs.total > 0) {
            console.log("  ✖ No se anula mientras cuelguen referencias de su posición: movelas primero.");
            errores++;
            continue;
        }
        if (ultimo && !permitirBorrarVinculo) {
            errores++;
            continue;
        }
        if (!commit)
            continue;
        const antes = up.contracts.map((x, i) => `#${i} ${String(x.contratoKey || "sin clave")}${esLapida(x) ? " (anulado)" : ""}`);
        try {
            const r = await anularContrato({ up, idx, tenantId: proyecto?.tenantId ?? null, por, porNombre: por ? "" : "script anularContratos", motivo: p.motivo, origen: "script" });
            console.log(`  ✔ Anulado${r.vinculoEliminado ? " (se borró el vínculo)" : ""}.`);
            if (!r.vinculoEliminado) {
                const despues = await UserProject.findById(up._id).select("contracts.contratoKey contracts.estadoContrato").lean();
                const lista = (despues?.contracts || []).map((x, i) => `#${i} ${String(x.contratoKey || "sin clave")}${esLapida(x) ? " (anulado)" : ""}`);
                console.log(`  Posiciones antes:   ${antes.join(" | ")}`);
                console.log(`  Posiciones después: ${lista.join(" | ")}`);
                const movidas = antes.map((a, i) => a.split(" ")[1] !== (lista[i] || "").split(" ")[1]).filter(Boolean).length;
                console.log(movidas === 0 && lista.length === antes.length ? "  ✔ Ninguna clave se movió y el array tiene el mismo largo." : `  ✖ ATENCIÓN: ${movidas} posiciones cambiaron de clave o cambió el largo.`);
            }
        }
        catch (e) {
            console.log(`  ✖ ${e?.message || e}`);
            errores++;
        }
    }
    if (commit && respaldo.length) {
        const dir = path.resolve(process.cwd(), "migraciones-respaldo");
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `anular-contratos-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
        console.log(`\nRespaldo de las reasignaciones: ${archivo}`);
    }
    console.log(`\n${errores ? `${errores} pedido(s) no se hicieron (ver ✖ arriba).` : "Listo."}`);
    if (errores)
        process.exitCode = 1;
}
main()
    .catch((e) => {
    console.error(e);
    process.exitCode = 1;
})
    .finally(() => mongoose.disconnect());
