import mongoose from "mongoose";
import { PATRON_POR_DEFECTO, TIPOS_NOMENCLATURA, renderNomenclatura, campoNomenclatura, largoEnBytes, MAX_NOMBRE, variablesUsadas, TOPES_CAMPO } from "../utils/nomenclatura.js";
import { emailNomenclatura, buildIdentidadTag } from "../utils/employeeDocData.js";
/**
 * ¿Alguno de los nombres que la plataforma va a generar se pasa de los 255?
 *
 * El patrón se arma con datos de ejemplo cómodos, así que en el ABM siempre "entra". Lo que decide es
 * el peor caso REAL: el proyecto, el apellido, el tipo de contrato y el email más largos que hoy
 * existen en la base. Este script arma el nombre de CADA contrato real y mide.
 *
 * Mide en BYTES y no en caracteres: el tope del filesystem cuenta bytes, y una tilde ocupa dos. Medir
 * en caracteres ya dejó pasar un nombre de 255 caracteres y 256 bytes que reventó al escribirse.
 *
 * Además dice CUÁL de los campos variables se está comiendo el nombre, que es lo único accionable:
 * los literales del patrón (`Alta-`, `Empresa-`) los podés acortar a ojo, pero un tipo de contrato de
 * 49 caracteres solo se arregla renombrándolo en su ABM.
 *
 * SALE CON CÓDIGO 1 si algo se pasa, así que sirve como control antes de soltar un patrón nuevo.
 *
 * Uso (desde server/):  npm run nomenclatura:medir
 */
/** Los campos cuyo largo NO controla el patrón: dependen de lo que alguien cargó en su ABM. */
const CAMPOS_VARIABLES = ["proyecto", "apellido", "nombres", "contrato", "docName", "email", "empresa", "extra"];
const pct = (n, total) => `${n} (${((n / total) * 100).toFixed(1)}%)`;
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    console.log(`\nDB: ${dbName}   |   tope: ${MAX_NOMBRE} bytes\n`);
    // Los patrones vigentes: el personalizado del tenant si lo hay, si no el de fábrica.
    const guardados = new Map((await db.collection("nomenclaturaarchivos").find({}).toArray()).map((f) => [f.tipo, f.patron]));
    const patronDe = (t) => guardados.get(t) || PATRON_POR_DEFECTO[t];
    const users = new Map((await db.collection("users").find({}).project({ lastName: 1, firstName: 1, email: 1, metadata: 1 }).toArray()).map((u) => [String(u._id), u]));
    const empresas = new Map((await db.collection("companies").find({}).project({ cuit: 1, razonSocial: 1 }).toArray()).map((c) => [String(c._id), c]));
    const plantillas = (await db.collection("contratos-frame").find({}).project({ name: 1 }).toArray()).map((f) => campoNomenclatura(f.name)).sort((a, b) => b.length - a.length);
    const ups = await db.collection("users_&_projects").find({}).project({ userId: 1, contracts: 1, nombre_proyecto: 1 }).toArray();
    let huboExceso = false;
    // Los valores SIN tope aplicado, para poder decir cuántos se están cortando.
    const valoresPorCampo = new Map();
    for (const tipo of TIPOS_NOMENCLATURA) {
        const patron = patronDe(tipo);
        const usa = variablesUsadas(patron).map((v) => v.replace(/[{}]/g, ""));
        // La plantilla más larga solo cuenta si el patrón la usa: si no está, no ocupa nada.
        const docName = usa.includes("docName") ? plantillas[0] || "" : "";
        const medidos = [];
        for (const up of ups) {
            const u = users.get(String(up.userId));
            if (!u)
                continue;
            for (const c of up.contracts || []) {
                const emp = empresas.get(String(c.empresaContratoId || ""));
                const datos = {
                    proyecto: campoNomenclatura(c.nombre_proyecto || up.nombre_proyecto),
                    apellido: campoNomenclatura(u.lastName),
                    nombres: campoNomenclatura(u.firstName),
                    tipo,
                    contrato: campoNomenclatura(c.nombre_contrato),
                    docName,
                    fechaAlta: "20260810",
                    fechaBaja: "-",
                    cuit: buildIdentidadTag(u),
                    email: emailNomenclatura(u.email),
                    extra: "Alta-Temprana-de-ARCA",
                    numero: "1042",
                    fecha: "20260821",
                    anio: "2026",
                    timestamp: "20260821-143012",
                    proyectoId: String(up.externalProjectId || ""),
                    empresa: campoNomenclatura(emp?.razonSocial || c.nombre_empresa_contrato),
                    empresaCuit: String(emp?.cuit || "").replace(/\D/g, ""),
                };
                const crudo = renderNomenclatura(patron, datos) + ".pdf";
                const campos = {};
                for (const k of CAMPOS_VARIABLES) {
                    if (!usa.includes(k))
                        continue;
                    campos[k] = largoEnBytes(datos[k] || "");
                    if (!valoresPorCampo.has(k))
                        valoresPorCampo.set(k, []);
                    valoresPorCampo.get(k).push(datos[k] || "");
                }
                medidos.push({ bytes: largoEnBytes(crudo), nombre: crudo, campos });
            }
        }
        if (medidos.length === 0)
            continue;
        medidos.sort((a, b) => b.bytes - a.bytes);
        const peor = medidos[0];
        const exceden = medidos.filter((m) => m.bytes > MAX_NOMBRE);
        const promedio = Math.round(medidos.reduce((n, m) => n + m.bytes, 0) / medidos.length);
        // Se recorta solo, pero conviene saberlo: el recorte pierde caracteres del final de los campos.
        if (exceden.length > 0)
            huboExceso = true;
        const marca = exceden.length > 0 ? "✖" : peor.bytes > MAX_NOMBRE * 0.9 ? "⚠" : "✓";
        console.log(`${marca} ${tipo}${guardados.has(tipo) ? " (patrón personalizado)" : ""}`);
        console.log(`   ${medidos.length} documentos · promedio ${promedio} · peor ${peor.bytes} de ${MAX_NOMBRE}`);
        if (exceden.length > 0)
            console.log(`   SE PASAN: ${pct(exceden.length, medidos.length)} — el generador los va a recortar`);
        // Qué campo variable pesa más en el peor caso: es lo único que se puede acortar de verdad.
        const ranking = Object.entries(peor.campos).sort((a, b) => b[1] - a[1]);
        const fijo = peor.bytes - ranking.reduce((n, [, v]) => n + v, 0);
        console.log(`   en el peor caso: ${ranking.map(([k, v]) => `${k} ${v}`).join(" · ")} · (patrón fijo ${fijo})`);
        console.log(`   ${peor.nombre}\n`);
    }
    // Cuánto está cortando cada tope: si uno corta demasiado, o el tope quedó chico o hay nombres que
    // conviene acortar en su propio ABM, que es donde el recorte no pierde información.
    console.log("Topes por campo — cuántos valores reales se cortan:");
    for (const [campo, tope] of Object.entries(TOPES_CAMPO)) {
        const vals = valoresPorCampo.get(campo) || [];
        if (vals.length === 0)
            continue;
        const cortados = vals.filter((v) => [...v].length > tope).length;
        const masLargo = vals.slice().sort((x, y) => [...y].length - [...x].length)[0] || "";
        const detalle = cortados > 0 ? `   el más largo: ${[...masLargo].length} «${masLargo}»` : "";
        console.log(`   ${campo.padEnd(11)} tope ${String(tope).padStart(2)} → corta ${String(cortados).padStart(5)} de ${vals.length} (${((cortados / vals.length) * 100).toFixed(1)}%)${detalle}`);
    }
    console.log("   (email, cuit, fechas y CUIT de la empleadora NO tienen tope: ver TOPES_CAMPO)");
    await mongoose.disconnect();
    if (huboExceso) {
        console.log(`✖ Hay nombres que se pasan de ${MAX_NOMBRE} bytes. Se generan igual —el recorte los acorta— pero se pierden caracteres del final de los campos más largos.`);
        process.exit(1);
    }
    console.log(`✓ Ningún nombre se pasa de ${MAX_NOMBRE} bytes.`);
}
run().catch(async (e) => {
    console.error("\n✖", e.message);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
