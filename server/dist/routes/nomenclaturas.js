import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { TIPOS_NOMENCLATURA, VARIABLES_POR_TIPO, PATRON_POR_DEFECTO, TIPOS_QUE_VUELVEN_DE_LA_FIRMA, validarPatron, renderNomenclatura } from "../utils/nomenclatura.js";
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
    proyecto: "748",
    tipo: "Contrato",
    docName: "Jornada-2030",
    fechaAlta: "20260810",
    fechaBaja: "-",
    identidad: "CUIL-20331501027_DNI-33150102",
    email: "juanmanuel.gonzalezrotstein-gmail.com",
    extra: "Alta-Temprana-de-ARCA",
    numero: "1042",
    timestamp: "20260821-143012",
    anio: "2026",
    fecha: "20260821",
};
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
        res.json(TIPOS_NOMENCLATURA.map((tipo) => {
            const fila = porTipo.get(tipo);
            const patron = fila?.patron || PATRON_POR_DEFECTO[tipo];
            return {
                tipo,
                patron,
                patronPorDefecto: PATRON_POR_DEFECTO[tipo],
                personalizado: !!fila,
                vuelveDeLaFirma: TIPOS_QUE_VUELVEN_DE_LA_FIRMA.includes(tipo),
                variables: VARIABLES_POR_TIPO[tipo],
                ejemplo: renderNomenclatura(patron, { ...EJEMPLO, tipo }),
                actualizadoEl: fila?.updatedAt || null,
            };
        }));
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
    res.json({ errores: validarPatron(tipo, patron), ejemplo: renderNomenclatura(patron, { ...EJEMPLO, tipo }) });
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
