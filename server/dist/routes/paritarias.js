import { Router } from "express";
import { z } from "zod";
import { FuenteParitaria } from "../models/FuenteParitaria.js";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { Convenio } from "../models/Convenio.js";
import { Company } from "../models/Company.js";
import { authenticateToken } from "../middleware/auth.js";
import { revisarFuente, revisarTodas, fuenteConProblema } from "../services/paritariasVigilanciaService.js";
import { esDeclarable } from "../utils/estadoFuenteConvenio.js";
/**
 * ABM de fuentes de paritarias y lectura de lo detectado.
 *
 * Esta entrega SOLO DETECTA: no hay ningún endpoint que abra un PDF, lea importes o toque una escala.
 * Si alguna vez aparece uno acá, se fue de alcance.
 */
const router = Router();
const fuenteSchema = z.object({
    entidad: z.string().min(1, "La entidad es obligatoria"),
    nombre: z.string().min(1, "El nombre es obligatorio"),
    url: z.string().url("La URL no es válida"),
    convenios: z.array(z.string()).default([]),
    patronIncluir: z.string().min(1, "Sin patrón de inclusión entraría cualquier PDF de la página"),
    // Se pide vacío explícito y no opcional: quien da de alta una fuente tiene que haber MIRADO qué
    // más cuelga esa página. El texto del convenio colectivo conviviendo con los acuerdos es la norma.
    patronExcluir: z.string().default(""),
    activa: z.boolean().default(true),
});
/** Valida que los patrones compilen ANTES de guardar: uno roto deja la fuente sin filtrar y en silencio. */
const patronInvalido = (p) => {
    if (!p.trim())
        return null;
    try {
        new RegExp(p, "i");
        return null;
    }
    catch (e) {
        return `«${p}» no es una expresión regular válida: ${e?.message || e}`;
    }
};
/**
 * UN CONVENIO TIENE UNA SOLA FUENTE.
 *
 * Al revés sí es de a muchos: un acuerdo del SATSAID cubre 0131/75 y 0634/11 a la vez. Pero dos
 * fuentes para el MISMO convenio significarían dos páginas anunciando el mismo acuerdo, y el mismo
 * PDF entraría dos veces —con hash distinto si cada sitio lo republica— como dos publicaciones. El
 * aviso diría que salieron dos paritarias donde salió una.
 *
 * La pantalla ya ofrece una sola opción por convenio, pero eso es una convención de la interfaz: el
 * selector del lado de la fuente elige varios convenios y podría tomar uno ya asignado. Acá se
 * rechaza, nombrando la fuente que ya lo tiene — que es lo que hace falta saber para resolverlo.
 *
 * Devuelve el mensaje del rechazo, o `null`.
 */
const convenioYaVigilado = async (convenios, exceptoId) => {
    if (!Array.isArray(convenios) || convenios.length === 0)
        return null;
    const otras = await FuenteParitaria.find({ convenios: { $in: convenios }, ...(exceptoId ? { _id: { $ne: exceptoId } } : {}) })
        .select("nombre convenios")
        .lean();
    const choques = [];
    for (const o of otras) {
        for (const c of o.convenios || [])
            if (convenios.includes(c))
                choques.push(`${c} ya lo vigila «${o.nombre}»`);
    }
    if (choques.length === 0)
        return null;
    return `${choques.join("; ")}. Un convenio tiene una sola fuente: sacalo de la otra primero.`;
};
router.get("/fuentes", authenticateToken, async (_req, res) => {
    try {
        const fuentes = await FuenteParitaria.find().sort({ entidad: 1, nombre: 1 }).lean();
        // El conteo de publicaciones va acá y no en una llamada aparte: es lo que dice si la fuente
        // realmente está encontrando cosas, y sin él la pantalla mostraría una fila que no se sabe si sirve.
        const conteos = await PublicacionParitaria.aggregate([{ $group: { _id: { fuente: "$fuente", vista: "$vista" }, n: { $sum: 1 } } }]);
        const total = new Map();
        const sinVer = new Map();
        for (const c of conteos) {
            const k = String(c._id.fuente);
            total.set(k, (total.get(k) || 0) + c.n);
            if (!c._id.vista)
                sinVer.set(k, (sinVer.get(k) || 0) + c.n);
        }
        res.json(fuentes.map((f) => ({ ...f, publicaciones: total.get(String(f._id)) || 0, sinVer: sinVer.get(String(f._id)) || 0, conProblema: fuenteConProblema(f) })));
    }
    catch (error) {
        console.error("List fuentes paritaria error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
router.post("/fuentes", authenticateToken, async (req, res) => {
    try {
        const data = fuenteSchema.parse(req.body);
        for (const p of [data.patronIncluir, data.patronExcluir]) {
            const err = patronInvalido(p);
            if (err)
                return res.status(400).json({ error: err });
        }
        const tomado = await convenioYaVigilado(data.convenios);
        if (tomado)
            return res.status(409).json({ error: tomado });
        const creada = await FuenteParitaria.create(data);
        res.status(201).json(creada);
    }
    catch (error) {
        if (error?.name === "ZodError")
            return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
        console.error("Create fuente paritaria error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
router.put("/fuentes/:id", authenticateToken, async (req, res) => {
    try {
        const data = fuenteSchema.partial().parse(req.body);
        for (const p of [data.patronIncluir, data.patronExcluir]) {
            if (p === undefined)
                continue;
            const err = patronInvalido(p);
            if (err)
                return res.status(400).json({ error: err });
        }
        const tomado = await convenioYaVigilado(data.convenios, req.params.id);
        if (tomado)
            return res.status(409).json({ error: tomado });
        const previa = await FuenteParitaria.findById(req.params.id);
        if (!previa)
            return res.status(404).json({ error: "Fuente no encontrada" });
        /*
          CAMBIAR UN PATRÓN INVALIDA LA LÍNEA DE BASE.
    
          Los patrones son la definición de QUÉ se considera una escala en esta página. Cambiarlos cambia
          el conjunto de lo que se está mirando, y todo lo que la línea de base había dado por visto se
          calculó con la definición vieja. Si `ultimaRevision` sobreviviera al cambio, un patrón nuevo y
          más ancho traería veinte acuerdos históricos y los reportaría como novedades de hoy; y uno más
          angosto dejaría afuera cosas registradas como vistas sin que nadie lo note.
    
          Se resetea también `enlacesUltimaExitosa`: es el número contra el que se detecta que la fuente
          se quedó ciega, y está medido con los patrones anteriores. Compararlo contra los nuevos
          produciría una falsa alarma de derrumbe en la primera revisión, o —peor— taparía una real.
    
          Pesa más que en la primera entrega: una fuente ahora alimenta convenios de muchas empresas, y
          ninguna de ellas se va a enterar por su cuenta de que su vigilancia empezó a mentir.
        */
        const cambioPatron = (data.patronIncluir !== undefined && data.patronIncluir !== previa.patronIncluir) || (data.patronExcluir !== undefined && data.patronExcluir !== (previa.patronExcluir || ""));
        const actualizada = await FuenteParitaria.findByIdAndUpdate(req.params.id, cambioPatron ? { $set: { ...data, ultimoError: "" }, $unset: { ultimaRevision: 1, ultimoResultado: 1, enlacesUltimaExitosa: 1 } } : { $set: data }, { new: true });
        if (!actualizada)
            return res.status(404).json({ error: "Fuente no encontrada" });
        // El flag va en la respuesta y no en el documento: es un hecho sobre ESTA edición, y quien la
        // hizo tiene que enterarse en el momento. Guardarlo lo dejaría colgado para siempre.
        res.json({ ...actualizada.toObject(), lineaBaseReiniciada: cambioPatron });
    }
    catch (error) {
        if (error?.name === "ZodError")
            return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
        console.error("Update fuente paritaria error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * DECLARAR EN QUÉ ESTADO ESTÁ EL CONOCIMIENTO SOBRE UN CONVENIO.
 *
 * No es una acción de vigilancia: es anotar lo que se averiguó. «Buscamos y no hay página que
 * publique sus acuerdos» es conocimiento durable que le ahorra la búsqueda a la próxima persona, y
 * no tener dónde anotarlo es lo que obliga a rehacer el trabajo cada vez.
 *
 * Va por un endpoint propio y NO por el PUT genérico del catálogo (`_simpleCatalogRouter`) por dos
 * razones: ahí no hay dónde estampar quién y cuándo —que es la mitad del valor del dato—, y ese
 * router escribe cualquier campo que se le declare sin poder rechazar nada.
 *
 * Los dos rechazos son el punto del endpoint:
 *   400  `con_fuente` es DERIVADO. No se declara: se gana asignando una fuente.
 *   409  hay una fuente que lo lista. Declarar «no hay fuente» ahí sería guardar una contradicción
 *        que la derivación después ignora — o sea, basura con cara de dato.
 */
router.put("/convenios/:convenioId/estado-fuente", authenticateToken, async (req, res) => {
    try {
        const { estado, nota } = req.body;
        if (estado === "con_fuente") {
            return res.status(400).json({ error: "«Con fuente» no se marca: se obtiene asignándole una fuente al convenio. Es un estado derivado de los enlaces, no una declaración." });
        }
        if (!esDeclarable(estado))
            return res.status(400).json({ error: "Estado inválido. Los declarables son: sin_revisar, sin_fuente_conocida, no_aplica." });
        const convenio = await Convenio.findById(req.params.convenioId);
        if (!convenio)
            return res.status(404).json({ error: "Convenio no encontrado" });
        const codigo = String(convenio.externalId || "").trim();
        if (codigo && estado !== "sin_revisar") {
            const vigilante = await FuenteParitaria.findOne({ convenios: codigo }).select("nombre").lean();
            if (vigilante) {
                return res.status(409).json({ error: `«${vigilante.nombre}» ya publica las paritarias de ${codigo}. Sacale la fuente primero si querés marcarlo de otra manera.` });
            }
        }
        convenio.fuenteEstadoDeclarado = estado;
        convenio.fuenteNota = String(nota || "").trim();
        // Se estampa también en `sin_revisar`: volver algo a «nadie buscó» es una decisión y conviene
        // saber quién la tomó. La AUSENCIA del sello es lo que distingue a los que nunca nadie tocó.
        convenio.fuenteRevisadaPor = req.user?.email || req.user?.userId || "";
        convenio.fuenteRevisadaEl = new Date();
        await convenio.save();
        res.json(convenio);
    }
    catch (error) {
        console.error("Estado fuente convenio error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * Borra la fuente Y sus publicaciones.
 *
 * Las publicaciones no tienen sentido sin su fuente —no se sabría de dónde salieron ni con qué
 * patrón— y dejarlas huérfanas es exactamente el tipo de puntero a la nada que costó los 163
 * contratos del `legacyId 43`.
 */
router.delete("/fuentes/:id", authenticateToken, async (req, res) => {
    try {
        const r = await FuenteParitaria.deleteOne({ _id: req.params.id });
        if (r.deletedCount === 0)
            return res.status(404).json({ error: "Fuente no encontrada" });
        const { deletedCount } = await PublicacionParitaria.deleteMany({ fuente: req.params.id });
        res.json({ message: `Fuente eliminada junto con ${deletedCount} publicación(es).` });
    }
    catch (error) {
        console.error("Delete fuente paritaria error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * «Revisar ahora»: EL MISMO código que la rutina diaria, con otro disparador.
 *
 * No hay dos caminos a propósito. Un botón que hace «casi lo mismo» que el cron es la forma más
 * segura de que uno de los dos quede atrás y nadie se entere hasta que importe.
 */
router.post("/fuentes/:id/revisar", authenticateToken, async (req, res) => {
    try {
        res.json(await revisarFuente(req.params.id));
    }
    catch (error) {
        console.error("Revisar fuente error:", error);
        res.status(500).json({ error: error?.message || "No se pudo revisar la fuente" });
    }
});
router.post("/revisar", authenticateToken, async (_req, res) => {
    try {
        res.json(await revisarTodas());
    }
    catch (error) {
        console.error("Revisar todas error:", error);
        res.status(500).json({ error: "No se pudieron revisar las fuentes" });
    }
});
/** Las publicaciones detectadas, con su fuente. `?sinVer=1` para el banner. */
router.get("/publicaciones", authenticateToken, async (req, res) => {
    try {
        const filtro = { estado: "detectada" };
        if (String(req.query.sinVer || "") === "1")
            filtro.vista = false;
        const pubs = await PublicacionParitaria.find(filtro).sort({ detectadaEl: -1 }).limit(200).populate("fuente", "entidad nombre convenios").lean();
        res.json(pubs);
    }
    catch (error) {
        console.error("List publicaciones error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/** Marcar como vista. Es lo que saca la publicación del banner sin procesarla. */
router.put("/publicaciones/:id", authenticateToken, async (req, res) => {
    try {
        const patch = {};
        if (req.body.vista !== undefined)
            patch.vista = req.body.vista !== false;
        if (req.body.estado === "descartada" || req.body.estado === "detectada")
            patch.estado = req.body.estado;
        const p = await PublicacionParitaria.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
        if (!p)
            return res.status(404).json({ error: "Publicación no encontrada" });
        res.json(p);
    }
    catch (error) {
        console.error("Update publicacion error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * Lo que alimenta el banner y la columna de `/convenios`.
 *
 * Dos cosas DISTINTAS y por eso van separadas: novedades sin ver (ámbar, hay algo para leer) y
 * fuentes con problema (rojo, la vigilancia está ciega). Mezclarlas haría que una fuente caída se
 * viera como «no hay novedades», que es precisamente lo contrario de lo que pasa.
 */
router.get("/estado", authenticateToken, async (req, res) => {
    try {
        const [fuentes, sinVerTodas, declarados] = await Promise.all([
            FuenteParitaria.find().lean(),
            PublicacionParitaria.find({ vista: false, estado: "detectada" }).sort({ detectadaEl: -1 }).limit(200).populate("fuente", "entidad nombre convenios").lean(),
            /*
              Solo los que alguien DECLARÓ. Los 2.669 restantes son `sin_revisar` por ausencia, y mandarlos
              sería mandar 2.664 veces la palabra "sin_revisar" para no decir nada.
            */
            Convenio.find({ fuenteEstadoDeclarado: { $in: ["sin_fuente_conocida", "no_aplica"] } })
                .select("fuenteEstadoDeclarado fuenteNota fuenteRevisadaPor fuenteRevisadaEl")
                .lean(),
        ]);
        // Por convenio: qué fuente lo vigila. Es lo que dibuja la columna, y sale de acá para que la
        // pantalla no tenga que recorrer las fuentes por su cuenta y llegar a otra conclusión.
        const porConvenio = {};
        for (const f of fuentes) {
            for (const c of f.convenios || []) {
                (porConvenio[c] ??= []).push({ _id: String(f._id), entidad: f.entidad, nombre: f.nombre, activa: !!f.activa, ultimaRevision: f.ultimaRevision ?? null, conProblema: fuenteConProblema(f) });
            }
        }
        /*
          LA VIGILANCIA ES GLOBAL; EL AVISO ES POR EMPRESA.
    
          La página del SATSAID se baja UNA vez por día para toda la plataforma y la publicación se guarda
          UNA vez: bajarla por empresa sería descortés con un sitio del que dependemos y multiplicaría por
          N el trabajo de arreglar un patrón roto. Lo que se filtra es a QUIÉN se le muestra.
    
          Sin `empresaId` no se filtra nada, y eso es deliberado: quien mira el catálogo de la plataforma
          —el que puede arreglar una fuente ciega— tiene que verlas todas. Una fuente rota que solo se le
          muestra a las empresas afectadas es una fuente rota que nadie con permiso para tocarla ve.
        */
        let codigosDeLaEmpresa = null;
        const empresaId = String(req.query.empresaId || "").trim();
        if (empresaId) {
            const empresa = await Company.findById(empresaId).select("convenioIds").lean();
            if (!empresa)
                return res.status(404).json({ error: "Empresa no encontrada" });
            const convenios = await Convenio.find({ _id: { $in: empresa.convenioIds || [] } })
                .select("externalId")
                .lean();
            // Por CÓDIGO y con `.trim()`: la fuente guarda códigos, y "0131/75" y "0131/75 E" son convenios
            // distintos del nomenclador. Una diferencia de espacios acá dejaría a la empresa sin sus avisos.
            codigosDeLaEmpresa = new Set(convenios.map((c) => String(c.externalId || "").trim()).filter(Boolean));
        }
        const leImporta = (convenios) => !codigosDeLaEmpresa || (convenios || []).some((c) => codigosDeLaEmpresa.has(String(c).trim()));
        const sinVer = sinVerTodas.filter((p) => leImporta(p.fuente?.convenios)).slice(0, 50);
        res.json({
            porConvenio,
            declarado: Object.fromEntries(declarados.map((c) => [String(c._id), { estado: c.fuenteEstadoDeclarado, nota: c.fuenteNota || "", revisadaPor: c.fuenteRevisadaPor || "", revisadaEl: c.fuenteRevisadaEl ?? null }])),
            sinVer: sinVer.map((p) => ({ _id: String(p._id), url: p.url, textoEnlace: p.textoEnlace, detectadaEl: p.detectadaEl, fuente: p.fuente })),
            conProblema: fuentes
                .filter((f) => f.activa && fuenteConProblema(f) && leImporta(f.convenios))
                .map((f) => ({ _id: String(f._id), entidad: f.entidad, nombre: f.nombre, url: f.url, ultimoResultado: f.ultimoResultado, ultimoError: f.ultimoError, ultimaRevision: f.ultimaRevision ?? null })),
            /** Fuentes activas que nunca se revisaron: no están rotas, pero todavía no vigilan nada. */
            sinRevisar: fuentes.filter((f) => f.activa && !f.ultimaRevision && leImporta(f.convenios)).length,
            /** `true` cuando lo de arriba está acotado a una empresa. La pantalla lo dice, para no mentir por omisión. */
            filtradoPorEmpresa: !!empresaId,
        });
    }
    catch (error) {
        console.error("Estado paritarias error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
export { router as paritariasRoutes };
