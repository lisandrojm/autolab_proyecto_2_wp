import { Router } from "express";
import mongoose from "mongoose";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { TIPOS_NOMENCLATURA, VARIABLES_POR_TIPO, PATRON_POR_DEFECTO, TIPOS_NOMBRE_SE_LEE_DE_VUELTA, ORDEN_GRUPOS, validarPatron, renderNomenclatura, campoNomenclatura, MAX_NOMBRE, largoEnBytes } from "../utils/nomenclatura.js";
import { emailNomenclatura } from "../utils/employeeDocData.js";
const router = Router();
router.use(requireTenant, authenticateToken);
const esTipo = (t) => TIPOS_NOMENCLATURA.includes(t);
/**
 * Datos de ejemplo para la previsualización del ABM.
 *
 * Se muestran mientras se edita, que es cuando alguien decide si el patrón le sirve. Un ABM que
 * guarda a ciegas obliga a generar un documento de verdad para ver el resultado — y si salió mal, ya
 * quedó un archivo con el nombre equivocado.
 */
const EJEMPLO = {
    apellido: "gonzalez-rotstein",
    nombres: "juan-manuel",
    proyecto: "426_LN+",
    proyectoId: "705",
    tipo: "Contrato",
    contrato: "Jornada-2030-SRL",
    docName: "Acuerdo-de-titularidad-de-la-obra",
    fechaAlta: "20260810",
    fechaBaja: "-",
    identidad: "CUIL-20331501027_DNI-33150102",
    email: "juanmanuel.gonzalezrotstein-ARROBA-gmail.com",
    extra: "Alta-Temprana-de-ARCA",
    numero: "1042",
    timestamp: "20260821-143012",
    anio: "2026",
    fecha: "20260821",
    empresa: "FZERO S.R.L",
    empresaCuit: "CUIT-30710295839",
};
/** Solo los valores de las variables que ESE tipo ofrece: mostrar el resto confunde más que ayuda. */
const valoresDe = (tipo) => Object.fromEntries(VARIABLES_POR_TIPO[tipo].map((v) => [v.variable, EJEMPLO[v.variable.replace(/[{}]/g, "")] ?? ""]));
/**
 * El peor caso REAL de largo, para avisar antes de guardar y no después de generar.
 *
 * El ejemplo de la previsualización usa valores cómodos, así que un patrón puede verse holgado ahí y
 * pasarse del tope de Dropbox con la persona de nombre más largo del padrón. Esto arma el mismo
 * nombre con los valores más largos que HOY existen en la base — no con valores inventados.
 *
 * Sin este número, el problema solo aparece cuando el archivo no se sube, que es la peor forma de
 * enterarse: el contrato queda afuera del circuito de firma y nadie mira los logs.
 *
 * Se cachea unos minutos porque son cinco consultas y el ABM previsualiza en cada tecla.
 */
const CACHE_MS = 5 * 60 * 1000;
let cacheMaximos = null;
const masLargo = (vs) => vs.map((v) => campoNomenclatura(v)).sort((a, b) => b.length - a.length)[0] || "";
async function valoresMasLargos() {
    if (cacheMaximos && cacheMaximos.venceEn > Date.now())
        return cacheMaximos.valores;
    const db = mongoose.connection.db;
    const vacio = () => [];
    const col = (n, f) => (db ? db.collection(n).find({ [f]: { $type: "string" } }).project({ [f]: 1 }).toArray().catch(vacio) : Promise.resolve([]));
    const [proyectos, contratos, plantillas, empresas, usuarios] = await Promise.all([
        col("projects", "name"),
        col("contratos", "name"),
        col("contratos-frame", "name"),
        col("companies", "razonSocial"),
        db ? db.collection("users").find({}).project({ lastName: 1, firstName: 1, email: 1 }).toArray().catch(vacio) : Promise.resolve([]),
    ]);
    // La persona se mide como BLOQUE: apellido, nombres y email salen del mismo registro, así que el
    // peor caso es el de UNA persona y no la suma de tres máximos de personas distintas.
    const persona = usuarios
        .map((u) => ({ apellido: campoNomenclatura(u.lastName), nombres: campoNomenclatura(u.firstName), email: emailNomenclatura(u.email) }))
        .sort((a, b) => b.apellido.length + b.nombres.length + b.email.length - (a.apellido.length + a.nombres.length + a.email.length))[0];
    const valores = {
        ...EJEMPLO,
        proyecto: masLargo(proyectos.map((p) => p.name)) || EJEMPLO.proyecto,
        contrato: masLargo(contratos.map((c) => c.name)) || EJEMPLO.contrato,
        docName: masLargo(plantillas.map((p) => p.name)) || EJEMPLO.docName,
        empresa: masLargo(empresas.map((e) => e.razonSocial)) || EJEMPLO.empresa,
        ...(persona ? { apellido: persona.apellido, nombres: persona.nombres, email: persona.email } : {}),
    };
    cacheMaximos = { valores, venceEn: Date.now() + CACHE_MS };
    return valores;
}
/** Lo que el ABM necesita para pintar el semáforo de largo. Los `+ 4` son la extensión. */
async function medirLargo(tipo, patron) {
    // En BYTES, que es como lo mide la guarda: una tilde ocupa dos y el tope del filesystem cuenta bytes.
    const ejemplo = largoEnBytes(renderNomenclatura(patron, { ...EJEMPLO, tipo })) + 4;
    let peorCaso = ejemplo;
    try {
        peorCaso = largoEnBytes(renderNomenclatura(patron, { ...(await valoresMasLargos()), tipo })) + 4;
    }
    catch (e) {
        // Sin el peor caso el ABM muestra solo el del ejemplo: es peor información, no un error.
        console.warn("[NOMENCLATURA] No pude calcular el peor caso de largo:", e?.message || e);
    }
    return { ejemplo, peorCaso, maximo: MAX_NOMBRE, recortaria: peorCaso > MAX_NOMBRE };
}
/**
 * GET /nomenclaturas
 *
 * Todos los tipos con su patrón vigente, su default y sus variables. Una sola respuesta para pintar
 * el ABM entero: el catálogo de variables vive en el SERVER porque es el mismo que usa la validación,
 * y tenerlo duplicado en el front es cómo terminan discrepando (el ABM ofrece una variable que el
 * validador rechaza).
 */
router.get("/", async (req, res) => {
    try {
        const guardadas = await NomenclaturaArchivo.find({ tenantId: req.tenantObjectId }).lean();
        const porTipo = new Map(guardadas.map((n) => [n.tipo, n]));
        res.json(await Promise.all(TIPOS_NOMENCLATURA.map(async (tipo) => {
            const fila = porTipo.get(tipo);
            const patron = fila?.patron || PATRON_POR_DEFECTO[tipo];
            return {
                tipo,
                patron,
                patronPorDefecto: PATRON_POR_DEFECTO[tipo],
                personalizado: !!fila,
                seLeeDeVuelta: TIPOS_NOMBRE_SE_LEE_DE_VUELTA.includes(tipo),
                variables: VARIABLES_POR_TIPO[tipo],
                grupos: ORDEN_GRUPOS.filter((g) => VARIABLES_POR_TIPO[tipo].some((v) => v.grupo === g)),
                ejemplo: renderNomenclatura(patron, { ...EJEMPLO, tipo }),
                valores: valoresDe(tipo),
                actualizadoEl: fila?.updatedAt || null,
                largo: await medirLargo(tipo, patron),
            };
        })));
    }
    catch (error) {
        console.error("Nomenclaturas get error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * POST /nomenclaturas/previsualizar  { tipo, patron }
 *
 * Valida y renderiza sin guardar. Es lo que alimenta el preview en vivo del ABM, y usa las MISMAS
 * funciones que el guardado: un preview que recorra otro camino puede prometer un resultado distinto
 * del que después ocurre, y entonces no sirve para decidir.
 */
router.post("/previsualizar", async (req, res) => {
    const tipo = String(req.body?.tipo || "");
    if (!esTipo(tipo)) {
        res.status(400).json({ error: "Tipo de documento desconocido." });
        return;
    }
    const patron = String(req.body?.patron ?? "");
    res.json({ errores: validarPatron(tipo, patron), ejemplo: renderNomenclatura(patron, { ...EJEMPLO, tipo }), valores: valoresDe(tipo), largo: await medirLargo(tipo, patron) });
});
/**
 * PUT /nomenclaturas/:tipo  { patron }
 *
 * NO guarda un patrón inválido. Es la validación que importa: la del front se puede saltear —otra
 * pestaña, un request a mano— y lo que está en juego es que los documentos firmados vuelvan a
 * encontrar a su persona. Ver `validarPatron`.
 */
router.put("/:tipo", async (req, res) => {
    try {
        const tipo = String(req.params.tipo || "");
        if (!esTipo(tipo)) {
            res.status(400).json({ error: "Tipo de documento desconocido." });
            return;
        }
        const patron = String(req.body?.patron ?? "").trim();
        const errores = validarPatron(tipo, patron);
        if (errores.length > 0) {
            res.status(400).json({ error: errores.map((e) => e.motivo).join(" "), errores });
            return;
        }
        const fila = await NomenclaturaArchivo.findOneAndUpdate({ tenantId: req.tenantObjectId, tipo }, { $set: { patron, actualizadoPor: req.user?.userId || null } }, { new: true, upsert: true });
        res.json({ tipo, patron: fila.patron, personalizado: true, ejemplo: renderNomenclatura(fila.patron, { ...EJEMPLO, tipo }) });
    }
    catch (error) {
        console.error("Nomenclaturas put error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/** DELETE /nomenclaturas/:tipo — vuelve al patrón por defecto (borra la personalización). */
router.delete("/:tipo", async (req, res) => {
    try {
        const tipo = String(req.params.tipo || "");
        if (!esTipo(tipo)) {
            res.status(400).json({ error: "Tipo de documento desconocido." });
            return;
        }
        await NomenclaturaArchivo.deleteOne({ tenantId: req.tenantObjectId, tipo });
        res.json({ tipo, patron: PATRON_POR_DEFECTO[tipo], personalizado: false, ejemplo: renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...EJEMPLO, tipo }) });
    }
    catch (error) {
        console.error("Nomenclaturas delete error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as nomenclaturaRoutes };
export default router;
