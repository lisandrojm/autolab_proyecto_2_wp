import { fuenteConProblema } from "../services/paritariasVigilanciaService.js";
export const vistaDeFuente = (f) => ({
    _id: String(f._id),
    entidad: f.entidad,
    nombre: f.nombre,
    // `!!` y no `?? true`: el default del modelo ya es `true`, así que un documento sin el campo es
    // uno de antes de que existiera. Asumirlo activo diría «vigilando» sobre algo que nadie prendió.
    activa: !!f.activa,
    // El default es el tipo que ya existía: los documentos anteriores a este campo son todos listados.
    tipo: f.tipo === "manual" ? "manual" : "listado_html",
    ultimaRevision: f.ultimaRevision ? new Date(f.ultimaRevision).toISOString() : null,
    ultimoResultado: f.ultimoResultado,
    ultimoError: f.ultimoError || "",
    conProblema: fuenteConProblema(f),
});
