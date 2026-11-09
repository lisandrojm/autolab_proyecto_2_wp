import type { ContractOverviewRow } from "../../api/users";
import type { ConstanciaArcaEnPantalla } from "../../api/projects";

/*
  EN UN SOLO LUGAR, QUÉ ESTÁ DADO DE ALTA EN ARCA Y QUÉ NO (09/11/2026, pedido del usuario). El padrón de
  Contratados mezcla los dos trámites, y cada uno se prueba con algo distinto:

   - ARCA (alta temprana): el alta presentada —por la corrida automática, adoptada al sincronizar, o
     porque está su constancia— y, si la hay, la constancia: su archivo y por dónde va en el circuito.
   - Servicios (constancia de CUIT): no lleva alta. Lo que vale es el JSON del Padrón que confirma el CUIT
     activo, archivado en Dropbox al validar.
*/

export type GrupoArca = "con_alta" | "sin_alta" | "sin_confirmar" | "servicios" | "no_corresponde";

/** Lo que la columna necesita de la fila: la del padrón trae además la constancia del ciclo. */
export type FilaConArca = ContractOverviewRow & { constanciaArca?: ConstanciaArcaEnPantalla | null };

export interface SituacionArca {
  grupo: GrupoArca;
  texto: string;
  titulo: string;
  clase: string;
  /** Cuándo se presentó el alta ("" si no se sabe). */
  fecha: string;
}

const VERDE = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
const ROJO = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
const AMBAR = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
const GRIS = "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

/**
 * La situación ante ARCA de una fila. `tipo` es el trámite del tipo de contrato
 * (`estadoImpositivoDelContrato(...).data.tipoImpositivo`); una solicitud sin aprobar todavía no es un
 * contrato, así que no cuenta ni como alta ni como falta.
 */
export function situacionArca(r: FilaConArca, tipo: string | undefined, o: { pendiente?: boolean } = {}): SituacionArca {
  const nada = { fecha: "" };
  if (o.pendiente) return { ...nada, grupo: "no_corresponde", texto: "", titulo: "Solicitud sin aprobar: todavía no hay contrato", clase: "" };
  if (r.sinCuit) return { ...nada, grupo: "no_corresponde", texto: "Sin CUIT", titulo: "La persona no tiene CUIT/CUIL argentino: no va por ARCA", clase: GRIS };
  if (tipo === "constancia_cuit") {
    if (r.constanciaAfipDropboxSubidaAt) return { ...nada, grupo: "servicios", texto: "CUIT validado", titulo: "Servicios no lleva alta en ARCA. El CUIT figura activo en el Padrón y el JSON quedó archivado en Dropbox.", clase: VERDE };
    if (r.constanciaAfipEstado === "inactivo") return { ...nada, grupo: "servicios", texto: "CUIT inactivo", titulo: "Servicios no lleva alta en ARCA, pero el Padrón dice que el CUIT está inactivo.", clase: ROJO };
    return { ...nada, grupo: "servicios", texto: "CUIT sin validar", titulo: "Servicios no lleva alta en ARCA. Falta validar el CUIT en el Padrón (Trámite impositivo → Constancia de CUIT).", clase: GRIS };
  }
  if (tipo !== "alta_temprana_afip") return { ...nada, grupo: "no_corresponde", texto: "", titulo: "Este tipo de contrato no tiene trámite en ARCA", clase: "" };

  const a = r.altaArcaPresentada;
  const ciclo = r.constanciaArca;
  const fecha = ciclo?.presentadaEl || (a?.resultado === "presentada" ? a.fecha : "") || "";
  // La fila del ciclo nace cuando el alta se presentó; la constancia bajada también lo prueba.
  if (ciclo || a?.resultado === "presentada" || r.altaDocumentoUrl) {
    const como = a?.via === "externa" ? "Hecha a mano en ARCA y adoptada al sincronizar." : a?.via === "verificacion" ? "Ya estaba hecha en ARCA (se encontró al verificar)." : "";
    return { grupo: "con_alta", texto: "Alta en ARCA", titulo: ["El alta está presentada en ARCA.", como].filter(Boolean).join(" "), clase: VERDE, fecha };
  }
  if (a?.resultado === "indeterminado" || a?.resultado === "presentando") {
    return { grupo: "sin_confirmar", texto: "Sin confirmar", titulo: "Se presentó y no se pudo leer el resultado: mirá en ARCA si figura antes de volver a presentarla.", clase: AMBAR, fecha: "" };
  }
  if (a?.resultado === "fallida") return { ...nada, grupo: "sin_alta", texto: "Rechazada por ARCA", titulo: a.motivo || "ARCA rechazó el alta", clase: ROJO };
  return { ...nada, grupo: "sin_alta", texto: "Sin alta en ARCA", titulo: "No hay alta presentada en ARCA para este contrato", clase: ROJO };
}

/** El orden de la columna al ordenar: primero lo que falta. */
export const ORDEN_GRUPO_ARCA: Record<GrupoArca, number> = { sin_alta: 0, sin_confirmar: 1, con_alta: 2, servicios: 3, no_corresponde: 4 };

export const OPCIONES_FILTRO_ARCA: { label: string; value: "" | GrupoArca }[] = [
  { label: "Todos", value: "" },
  { label: "Con alta en ARCA", value: "con_alta" },
  { label: "Sin alta en ARCA", value: "sin_alta" },
  { label: "Alta sin confirmar", value: "sin_confirmar" },
  { label: "Servicios (no llevan alta)", value: "servicios" },
];
