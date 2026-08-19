import { Router } from "express";
import { listarCategoriasCompat } from "../utils/categoriaCompat.js";
import { authenticateToken } from "../middleware/auth.js";
/**
 * Vista PLANA y de SOLO LECTURA de las categorías, en la forma vieja de `categorias-sat`
 * (`data.sueldoBruto`, `data.codigoAfip`, `data.numeroCategoria`).
 *
 * Sobrevive porque la consumen el generador del TXT de ARCA, el chequeo de completitud, las
 * Funciones FRAME y los PDFs. El aplanado —incluida la resolución de la escala desde el grupo— vive
 * en `utils/categoriaCompat.ts` y NO se duplica acá: cuando esta ruta y `/role-frames` resolvían por
 * su cuenta, una quedó leyendo `categorias` y la otra `categorias-sat`, y guardar una función FRAME
 * borraba sus categorías.
 *
 * La ESCRITURA se mudó entera a `routes/arcaCategorias.ts` (`/api/v1/arca/categorias`), que trabaja
 * sobre el modelo real: convenio → grupo (escala) → categoría (código + nombre). Acá no quedó ningún
 * endpoint de escritura a propósito — mientras existieran, seguía habiendo un camino para crear una
 * categoría sin convenio o con código `0`, que es exactamente lo que hay que dejar de poder hacer.
 */
const router = Router();
/**
 * GET /api/v1/categorias-sat
 * Todas las categorías, aplanadas. Devuelve también las no elegibles (`isActive: false`): filtrar es
 * responsabilidad de cada selector, nunca de la resolución — si el TXT las filtrara, los contratos
 * históricos que las usan saldrían sin sueldo y sin código.
 */
router.get("/", authenticateToken, async (_req, res) => {
    try {
        res.json(await listarCategoriasCompat());
    }
    catch (error) {
        console.error("Get categorias-sat error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as categoriasSatRoutes };
