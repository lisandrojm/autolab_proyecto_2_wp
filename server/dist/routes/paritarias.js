import { Router } from "express";
import { z } from "zod";
import { FuenteParitaria } from "../models/FuenteParitaria.js";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { Convenio } from "../models/Convenio.js";
import { Company } from "../models/Company.js";
import { authenticateToken } from "../middleware/auth.js";
import { revisarFuente, revisarTodas, fuenteConProblema } from "../services/paritariasVigilanciaService.js";
import { esDeclarable } from "../utils/estadoFuenteConvenio.js";
import { vistaDeFuente } from "../utils/vistaFuenteParitaria.js";
import { rutaAbsoluta, existeArchivo, borrarArchivo } from "../services/archivoParitariaService.js";
/**
 * ABM de fuentes de paritarias, lectura de lo detectado y descarga del PDF guardado.
 *
 * DETECTA Y GUARDA. NO LEE.
 *
 * El archivo se conserva y se puede descargar, pero ningún endpoint lo ABRE: no se extrae texto, no
 * se leen importes y no se toca ninguna escala. Son tres capas con confiabilidad distinta —el
 * archivo es evidencia, la lectura es interpretación, la aplicación es una decisión humana— y
 * mezclarlas es exactamente lo que haría que un número inventado por un parser termine declarado
 * ante ARCA. Si alguna vez aparece acá un endpoint que lea el PDF, se fue de alcance.
 */
const router = Router();
const fuenteSchema = z.object({
    entidad: z.string().min(1, "La entidad es obligatoria"),
    nombre: z.string().min(1, "El nombre es obligatorio"),
    url: z.string().url("La URL no es válida"),
    convenios: z.array(z.string()).default([]),
    /**
     * Cómo se mira. `manual` = se registra dónde se consulta, sin vigilancia automática: es lo que
     * permite anotar el buscador oficial del Ministerio, que cubre todo el catálogo pero es un
     * formulario y no un listado raspable.
     */
    tipo: z.enum(["listado_html", "manual"]).default("listado_html"),
    // Sin `.min(1)`: a una fuente `manual` pedirle un patrón sería pedirle una regla para un
    // mecanismo que no va a correr. La obligatoriedad real se valida abajo, contra el tipo.
    patronIncluir: z.string().default(""),
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
 * Una fuente que se raspa SIN patrón de inclusión se traga cualquier PDF de la página.
 *
 * Se valida acá y no en el schema porque depende del tipo: la misma ausencia que es un error en
 * `listado_html` es lo correcto en `manual`.
 */
const faltaPatron = (tipo, patronIncluir) => tipo !== "manual" && !String(patronIncluir || "").trim() ? "Sin patrón de inclusión entraría cualquier PDF de la página. (Si esta fuente no se raspa, marcala como de consulta manual.)" : null;
/**
 * UN CONVENIO TIENE UNA SOLA FUENTE QUE LO VIGILA. Puede tener además una de consulta manual.
 *
 * Al revés sí es de a muchos: un acuerdo del SATSAID cubre 0131/75 y 0634/11 a la vez. Pero dos
 * fuentes VIGILANDO el mismo convenio significarían dos páginas anunciando el mismo acuerdo, y el
 * mismo PDF entraría dos veces —con hash distinto si cada sitio lo republica— como dos
 * publicaciones. El aviso diría que salieron dos paritarias donde salió una.
 *
 * POR QUÉ UNA `manual` NO CUENTA PARA ESTE CHOQUE
 *
 * La regla existe por las publicaciones duplicadas, no por prolijidad. Una fuente `manual` no se
 * raspa y por lo tanto NO PRODUCE publicaciones: nunca puede duplicar un aviso. Y el modelo de dos
 * niveles la necesita conviviendo con la sindical — el gremio avisa cuando firma, el buscador
 * oficial confirma cuando homologa—, así que si el choque la incluyera, registrar la oficial
 * obligaría a borrar la del gremio, que es exactamente lo contrario de lo que se quiere.
 *
 * Devuelve el mensaje del rechazo, o `null`.
 */
const convenioYaVigilado = async (convenios, exceptoId, tipo) => {
    if (!Array.isArray(convenios) || convenios.length === 0)
        return null;
    // La que se está guardando no vigila: no puede duplicar nada.
    if (tipo === "manual")
        return null;
    const otras = await FuenteParitaria.find({ convenios: { $in: convenios }, tipo: { $ne: "manual" }, ...(exceptoId ? { _id: { $ne: exceptoId } } : {}) })
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
    return `${choques.join("; ")}. Un convenio tiene una sola fuente que lo vigila: sacalo de la otra primero. (Una fuente de consulta manual sí puede convivir.)`;
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
        // El spread trae lo propio del ABM (patrones, convenios, url) y `vistaDeFuente` PISA el estado
        // compartido: así `activa` y `ultimaRevision` salen del mismo lugar que en `/estado`, y no de
        // dos lecturas paralelas que hay que acordarse de mantener iguales.
        res.json(fuentes.map((f) => ({ ...f, ...vistaDeFuente(f), publicaciones: total.get(String(f._id)) || 0, sinVer: sinVer.get(String(f._id)) || 0 })));
    }
    catch (error) {
        console.error("List fuentes paritaria error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
router.post("/fuentes", authenticateToken, async (req, res) => {
    try {
        const data = fuenteSchema.parse(req.body);
        const sinPatron = faltaPatron(data.tipo, data.patronIncluir);
        if (sinPatron)
            return res.status(400).json({ error: sinPatron });
        for (const p of [data.patronIncluir, data.patronExcluir]) {
            const err = patronInvalido(p);
            if (err)
                return res.status(400).json({ error: err });
        }
        const tomado = await convenioYaVigilado(data.convenios, undefined, data.tipo);
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
        const previa = await FuenteParitaria.findById(req.params.id);
        if (!previa)
            return res.status(404).json({ error: "Fuente no encontrada" });
        // El tipo que va a quedar, que puede venir en el parche o ya estar guardado.
        const tipoFinal = data.tipo ?? previa.tipo ?? "listado_html";
        const sinPatron = faltaPatron(tipoFinal, data.patronIncluir ?? previa.patronIncluir);
        if (sinPatron)
            return res.status(400).json({ error: sinPatron });
        const tomado = await convenioYaVigilado(data.convenios, req.params.id, tipoFinal);
        if (tomado)
            return res.status(409).json({ error: tomado });
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
/**
 * Declara el estado de VARIOS convenios de una. El de a uno es este mismo, con una lista de uno.
 *
 * POR QUÉ TIENE QUE SER MASIVO
 *
 * Muchos gremios no publican escalas en una página estable: publican en noticias sueltas, en redes,
 * o directamente no publican. `sin_fuente_conocida` va a ser un resultado FRECUENTE Y LEGÍTIMO, y
 * una entidad que no publica cubre todos sus convenios de una — la Federación de la Alimentación
 * firma once. Si hay que marcarlos de a uno, no se marca ninguno, y esos once vuelven a
 * «nadie miró» para la próxima persona que los mire.
 *
 * Los rechazos NO frenan al lote: el que tiene una fuente que lo vigila se saltea y se informa por
 * nombre. Abortar los cincuenta por uno obligaría a rehacer el trabajo entero.
 */
const declararConvenios = async (ids, estado, nota, quien) => {
    const hechos = [];
    const salteados = [];
    for (const id of ids) {
        const convenio = await Convenio.findById(id);
        if (!convenio) {
            salteados.push(`${id}: no existe`);
            continue;
        }
        const codigo = String(convenio.externalId || "").trim();
        if (codigo && estado !== "sin_revisar") {
            /*
              Solo choca contra una fuente que VIGILA. Una `manual` convive: el buscador oficial cubre el
              catálogo entero, y si contara acá, registrarlo bloquearía marcar cualquier cosa.
            */
            const vigilante = await FuenteParitaria.findOne({ convenios: codigo, tipo: { $ne: "manual" } })
                .select("nombre")
                .lean();
            if (vigilante) {
                salteados.push(`${codigo}: lo vigila «${vigilante.nombre}»`);
                continue;
            }
        }
        convenio.fuenteEstadoDeclarado = estado;
        convenio.fuenteNota = nota;
        // Se estampa también en `sin_revisar`: volver algo a «nadie buscó» es una decisión y conviene
        // saber quién la tomó. La AUSENCIA del sello es lo que distingue a los que nunca nadie tocó.
        convenio.fuenteRevisadaPor = quien;
        convenio.fuenteRevisadaEl = new Date();
        await convenio.save();
        hechos.push(codigo || String(convenio._id));
    }
    return { hechos, salteados };
};
/**
 * DECLARAR EN QUÉ ESTADO ESTÁ EL CONOCIMIENTO SOBRE UNO O VARIOS CONVENIOS.
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
 *   409  TODOS los convenios del lote tienen una fuente que los vigila. Declarar «no hay fuente»
 *        ahí sería guardar una contradicción que la derivación después ignora.
 */
router.put("/convenios/estado-fuente", authenticateToken, async (req, res) => {
    try {
        const { convenioIds, estado, nota } = req.body;
        if (estado === "con_fuente") {
            return res.status(400).json({ error: "«Con fuente» no se marca: se obtiene asignándole una fuente al convenio. Es un estado derivado de los enlaces, no una declaración." });
        }
        if (!esDeclarable(estado))
            return res.status(400).json({ error: "Estado inválido. Los declarables son: sin_revisar, sin_fuente_conocida, no_aplica." });
        const ids = Array.isArray(convenioIds) ? convenioIds.map(String).filter(Boolean) : [];
        if (ids.length === 0)
            return res.status(400).json({ error: "No se indicó ningún convenio." });
        const { hechos, salteados } = await declararConvenios(ids, estado, String(nota || "").trim(), req.user?.email || req.user?.userId || "");
        // Si no se pudo marcar NINGUNO es un rechazo; si se marcó alguno es un resultado parcial, y
        // devolverlo como error haría pensar que no se guardó nada.
        if (hechos.length === 0)
            return res.status(409).json({ error: `No se marcó ninguno. ${salteados.join("; ")}` });
        res.json({ marcados: hechos.length, salteados });
    }
    catch (error) {
        console.error("Estado fuente convenios error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * LAS PUBLICACIONES DE UNA FUENTE. La pantalla que faltaba.
 *
 * El ABM decía «31 publicación(es)» y no había ninguna forma de verlas: ni lista, ni enlace, ni
 * archivo. El sistema avisaba de algo que nadie podía abrir, que es la mitad de un aviso.
 *
 * Se devuelven TODAS, no solo las sin ver: la pregunta «¿qué acuerdos hubo?» es tan legítima como
 * «¿qué salió hoy?», y para la segunda ya está el banner.
 */
router.get("/fuentes/:id/publicaciones", authenticateToken, async (req, res) => {
    try {
        /*
          El BUSCADOR sobre el texto de las publicaciones de esta fuente.
    
          Con 31 acuerdos del SATSAID, «¿cuál cubría julio?» no puede exigir abrir PDFs de a uno. La
          búsqueda se resuelve en Mongo con el índice de texto y NO trayendo los 31 textos completos
          —más de 800 KB— para filtrarlos en Node.
        */
        const q = String(req.query.q || "").trim();
        const filtro = { fuente: req.params.id };
        if (q)
            filtro.$text = { $search: q };
        /*
          El TEXTO COMPLETO NO VIAJA EN LA LISTA. Son ~25 KB por publicación: mandar los 31 convierte una
          lista de 8 KB en una de 800 KB cada vez que se abre el modal. Va aparte, cuando alguien pide
          «Ver texto» de una en particular.
        */
        const pubs = await PublicacionParitaria.find(filtro).select("-extraccion.texto").sort({ detectadaEl: -1 }).lean();
        /*
          Se comprueba que el archivo EXISTA, no que el registro diga que existe.
    
          Son dos cosas distintas y confundirlas es lo que haría ofrecer una descarga que devuelve 404.
          El caso real: una restauración de base sin la carpeta `storage`, o un borrado a mano.
        */
        res.json(await Promise.all(pubs.map(async (p) => ({
            _id: String(p._id),
            url: p.url,
            textoEnlace: p.textoEnlace,
            hash: p.hash,
            detectadaEl: p.detectadaEl,
            vista: p.vista,
            estado: p.estado,
            archivo: p.archivo ? { nombreOriginal: p.archivo.nombreOriginal, bytes: p.archivo.bytes, descargadoEl: p.archivo.descargadoEl, disponible: await existeArchivo(p.archivo.ruta) } : null,
            archivoError: p.archivoError || "",
            /* Las señales, cada una con el fragmento del que salió: sin eso no se pueden verificar. */
            extraccion: p.extraccion
                ? {
                    paginas: p.extraccion.paginas || 0,
                    extraidoEl: p.extraccion.extraidoEl,
                    estado: p.extraccion.estado,
                    motivo: p.extraccion.motivo || "",
                    extractor: p.extraccion.extractor || null,
                    conveniosMencionados: p.extraccion.conveniosMencionados || [],
                    periodoMencionado: p.extraccion.periodoMencionado || null,
                    expediente: p.extraccion.expediente || null,
                    unidadSospechosa: p.extraccion.unidadSospechosa || null,
                    cotejoConvenios: p.extraccion.cotejoConvenios || "sin_mencion",
                    periodoCoincide: p.extraccion.periodoCoincide ?? null,
                }
                : null,
            /* Puntero de conveniencia. La descarga NO sale de acá: sale del disco del server. */
            dropbox: p.dropbox ? { path: p.dropbox.path || "", estado: p.dropbox.estado, motivo: p.dropbox.motivo || "", subidoEl: p.dropbox.subidoEl || null } : null,
        }))));
    }
    catch (error) {
        console.error("List publicaciones de fuente error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * GET /paritarias/publicaciones/:id/texto
 *
 * El texto plano extraído, para leerlo sin abrir el PDF. Aparte de la lista a propósito: son ~25 KB
 * por publicación y mandarlos todos juntos haría pesar 800 KB cada apertura del modal.
 *
 * NO SIRVE EL PDF NI TOCA DROPBOX: devuelve lo que se extrajo del archivo del disco.
 */
router.get("/publicaciones/:id/texto", authenticateToken, async (req, res) => {
    try {
        const p = await PublicacionParitaria.findById(req.params.id).select("textoEnlace archivo.nombreOriginal extraccion").lean();
        if (!p)
            return res.status(404).json({ error: "Publicación no encontrada" });
        if (!p.extraccion?.extraidoEl)
            return res.status(409).json({ error: "Esta publicación todavía no tiene texto extraído. Corré: npm run paritarias-texto" });
        res.json({
            texto: p.extraccion.texto || "",
            paginas: p.extraccion.paginas || 0,
            estado: p.extraccion.estado,
            motivo: p.extraccion.motivo || "",
            extractor: p.extraccion.extractor || null,
            nombreArchivo: p.archivo?.nombreOriginal || p.textoEnlace || "",
            caracteres: (p.extraccion.texto || "").length,
        });
    }
    catch (error) {
        console.error("Texto de publicación error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * Descarga el PDF guardado, con el nombre que tenía en la página del gremio.
 *
 * Va por acá y no por la URL estática de `storage/` para devolver el nombre original —que es el
 * que la persona reconoce— y para que la descarga pase por un token. El archivo igual es legible
 * por la ruta estática si alguien la adivina: son PDF públicos del sitio del sindicato, sin ningún
 * dato de nadie adentro, y se acepta a sabiendas.
 */
router.get("/publicaciones/:id/archivo", authenticateToken, async (req, res) => {
    try {
        const p = await PublicacionParitaria.findById(req.params.id).lean();
        if (!p)
            return res.status(404).json({ error: "Publicación no encontrada" });
        const a = p.archivo;
        if (!a?.ruta) {
            // Se distingue «nunca se guardó» de «se intentó y falló»: la segunda tiene un motivo y la
            // primera solo significa que la publicación es anterior a que se guardaran los archivos.
            return res.status(404).json({ error: p.archivoError || "Esta publicación no tiene el PDF guardado. Se detectó antes de que el sistema guardara los archivos: se puede rebajar con el script de respaldo." });
        }
        if (!(await existeArchivo(a.ruta)))
            return res.status(410).json({ error: "El registro tiene un archivo pero el archivo no está en el disco." });
        res.download(rutaAbsoluta(a.ruta), a.nombreOriginal || "acuerdo.pdf");
    }
    catch (error) {
        console.error("Descargar archivo publicacion error:", error);
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
        /*
          Los ARCHIVOS se borran junto con sus publicaciones: dejarlos sería acumular PDF que ya no
          tienen quién los explique.
    
          Cuando exista la capa de aplicación, acá va el guard: el archivo de una publicación que
          derivó en una escala aplicada NO se borra nunca, porque es el respaldo del importe que se
          declaró ante ARCA. Hoy no hay ninguna aplicada, así que no hay nada que proteger todavía.
        */
        const pubs = await PublicacionParitaria.find({ fuente: req.params.id }).select("archivo").lean();
        let archivos = 0;
        /*
          SE BORRA EL DISCO, NO EL ESPEJO EN DROPBOX. Es deliberado.
    
          Si borrar una fuente borrara también su copia de Dropbox, el respaldo no sería un respaldo:
          sería una segunda copia del mismo error, que desaparece junto con el original en el mismo
          click. La copia de Dropbox existe precisamente para sobrevivir a lo que le pase a este disco
          —incluido que alguien borre acá lo que no quería—. Limpiarla, si alguna vez hace falta, es a
          mano y deliberado.
        */
        for (const p of pubs)
            if (await borrarArchivo(p.archivo?.ruta))
                archivos++;
        const { deletedCount } = await PublicacionParitaria.deleteMany({ fuente: req.params.id });
        res.json({ message: `Fuente eliminada junto con ${deletedCount} publicación(es) y ${archivos} archivo(s).` });
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
            // EL MISMO mapper que `/fuentes`. Que las dos pantallas puedan decir cosas distintas de la
            // misma fuente era el bug de fondo, no el campo que faltaba en una de las dos.
            for (const c of f.convenios || [])
                (porConvenio[c] ??= []).push(vistaDeFuente(f));
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
        /*
          Qué convenios EN USO no tiene nadie revisados.
    
          «En uso» es que alguna empresa lo tenga en su padrón — la de `empresaId` si vino, cualquiera si
          no. Se resuelve contra las mismas dos fuentes de verdad que la columna: los enlaces (una fuente
          que lo lista ⇒ `con_fuente`) y lo declarado. Lo que sobra es lo que nadie miró.
        */
        const registrados = new Set();
        for (const e of (await Company.find(empresaId ? { _id: empresaId } : {})
            .select("convenioIds")
            .lean())) {
            for (const id of e.convenioIds || [])
                registrados.add(String(id));
        }
        const declaradoPorId = new Set(declarados.map((c) => String(c._id)));
        const enUsoSinRevisar = (await Convenio.find({ _id: { $in: [...registrados] } })
            .select("externalId name")
            .lean())
            .filter((c) => !declaradoPorId.has(String(c._id)) && (porConvenio[String(c.externalId || "").trim()] || []).length === 0)
            .map((c) => ({ _id: String(c._id), externalId: String(c.externalId || ""), name: c.name }));
        res.json({
            porConvenio,
            declarado: Object.fromEntries(declarados.map((c) => [String(c._id), { estado: c.fuenteEstadoDeclarado, nota: c.fuenteNota || "", revisadaPor: c.fuenteRevisadaPor || "", revisadaEl: c.fuenteRevisadaEl ?? null }])),
            sinVer: sinVer.map((p) => ({ _id: String(p._id), url: p.url, textoEnlace: p.textoEnlace, detectadaEl: p.detectadaEl, fuente: p.fuente })),
            conProblema: fuentes
                .filter((f) => f.activa && fuenteConProblema(f) && leImporta(f.convenios))
                .map((f) => ({ ...vistaDeFuente(f), url: f.url })),
            /**
             * Fuentes activas que nunca se revisaron: no están rotas, pero todavía no vigilan nada.
             * Las `manual` no cuentan: no se revisan por diseño, no por olvido.
             */
            sinRevisar: fuentes.filter((f) => f.activa && f.tipo !== "manual" && !f.ultimaRevision && leImporta(f.convenios)).length,
            /**
             * LA TAREA CONCRETA: convenios que alguna empresa USA y que nadie revisó todavía.
             *
             * Es la regla que evita que esto se vuelva una lista de deudas. Un convenio que ninguna empresa
             * registra no necesita fuente todavía — la necesita el día que se registra, y ese día el trabajo
             * es de UNA entidad. Sobre los 2.669 del catálogo, «sin revisar» es cobertura preventiva y se
             * mide en porcentaje; acá es trabajo que alguien pidió sin saberlo.
             *
             * Van los datos para hacerla, no un número: un contador manda a buscar cuáles son.
             */
            enUsoSinRevisar,
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
