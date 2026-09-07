import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { ArcaDefault, getArcaDefaults } from "../models/ArcaDefault.js";
import { tipoPerteneceAlGrupo } from "../utils/grupoTipoServicio.js";
/**
 * Los valores por defecto de ARCA de la instalación. Ver `models/ArcaDefault.ts` para la cascada.
 *
 * Un solo documento, así que no hay ABM: se lee entero y se parchea campo por campo. Cada pantalla
 * de nomenclador manda SOLO su campo (la ★ de esa pantalla), y los que no vienen no se tocan — si
 * mandara el objeto completo, abrir dos pantallas en dos pestañas haría que la última en guardar
 * borrara lo que marcó la otra.
 */
const router = Router();
/**
 * `null` y `""` son "sin default", y hay que poder mandarlos: es cómo se DESmarca la ★.
 *
 * TODOS los campos aceptan `null`, también los que se guardan como código.
 *
 * Los de código estaban declarados `z.string()` y el cliente manda `null` para desmarcar —la ★ no
 * distingue si el campo guarda una referencia o un código, ni tiene por qué—, así que la validación
 * los rechazaba con 400 «Datos inválidos» y no había forma de sacar un default una vez puesto: ni
 * volviendo a clickear la estrella encendida, ni con el botón de limpiar. El handler ya normalizaba
 * bien (`valor || ""`); lo único que faltaba era dejarlos pasar.
 */
const nullable = z.union([z.string(), z.null()]).optional();
const patchSchema = z.object({
    sucursalId: nullable,
    convenioId: nullable,
    grupoTipoServicio: nullable,
    tipoServicio: nullable,
    modalidadContratacion: nullable,
    modalidadLiquidacion: nullable,
    obraSocial: nullable,
    actividad: nullable,
    categoria: nullable,
    fuenteParitariaId: nullable,
});
router.get("/", requireTenant, authenticateToken, async (_req, res) => {
    try {
        const doc = await getArcaDefaults();
        res.json(doc.toObject());
    }
    catch (error) {
        console.error("Get arca defaults error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.patch("/", requireTenant, authenticateToken, async (req, res) => {
    try {
        const parsed = patchSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            /*
              El mensaje NOMBRA los campos. «Datos inválidos» a secas fue exactamente lo que hizo que este
              400 se viera en pantalla como un fallo genérico durante semanas: el detalle viajaba en otra
              clave que el cliente no muestra.
            */
            const campos = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
            res.status(400).json({ error: campos ? `Datos inválidos en: ${campos}` : "Datos inválidos", detalle: parsed.error.flatten() });
            return;
        }
        const actual = await getArcaDefaults();
        /*
          Solo las claves que vinieron. `hasOwnProperty` y no un truthy check: mandar `null` o `""` es
          justamente desmarcar la ★, y con un truthy esas dos cosas serían indistinguibles de "no lo
          mandé", así que no se podría sacar un default una vez puesto.
        */
        const set = {};
        for (const [clave, valor] of Object.entries(parsed.data)) {
            if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, clave))
                continue;
            // Las referencias vacías se guardan como `null`; los códigos, como "".
            const esReferencia = clave === "sucursalId" || clave === "convenioId" || clave === "fuenteParitariaId";
            set[clave] = esReferencia ? valor || null : valor || "";
        }
        /*
          Cambiar el GRUPO limpia el TIPO si el que estaba ya no pertenece.
    
          El grupo no viaja al TXT: filtra qué tipos se ofrecen. Si quedaran desalineados, el default
          global mandaría al TXT un tipo de servicio de otro grupo — que es exactamente el error que la
          pantalla evita al obligar a elegir el grupo primero. La misma regla que ya aplica la ficha de
          empresa cuando se cambia su ★ de grupo.
        */
        if (Object.prototype.hasOwnProperty.call(set, "grupoTipoServicio") && set.grupoTipoServicio !== actual.grupoTipoServicio) {
            const tipoActual = actual.tipoServicio || "";
            if (tipoActual && !tipoPerteneceAlGrupo(tipoActual, set.grupoTipoServicio))
                set.tipoServicio = "";
        }
        const actualizado = await ArcaDefault.findByIdAndUpdate(actual._id, { $set: set }, { new: true });
        res.json(actualizado?.toObject() ?? {});
    }
    catch (error) {
        console.error("Patch arca defaults error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as arcaDefaultsRoutes };
