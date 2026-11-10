import { fechaISO, getContratoActivo, hoyArgentina } from "./contratoVigencia.js";
import { claveEstado } from "./estadoClave.js";

/**
 * LOS NÚMEROS DE LAS BANDEJAS DE CONTRATACIÓN QUE VIVEN EN LA BASE (11/11/2026): Trámite impositivo
 * (Alta temprana de ARCA / Constancia de CUIT / Sin CUIT) y Generar documentos.
 *
 * El menú lateral los muestra sin entrar a la bandeja, así que tienen que dar LO MISMO que la pantalla.
 * La regla es la de `contracts-overview` con `estados` más el corte de `ContractBulkAfipTab`:
 *
 *  · Sólo contratos creados en WeProdu (Solicitudes o «Agregar miembro»).
 *  · De cada vínculo, el contrato que rige y los que arrancaron hace hasta `DIAS_ATRAS_BANDEJA` días
 *    (o arrancan más adelante): los viejos que quedaron en un estado de trámite no son trabajo pendiente.
 *  · Quien no tiene CUIT va a «Sin CUIT», cualquiera sea el trámite de su estado, y no se cuenta en los otros dos.
 *  · Generar documentos: los que están en el estado de envío de documentación y todavía no se enviaron a firmar.
 *
 * Puro, para probarlo sin base.
 */

export const DIAS_ATRAS_BANDEJA = 90;

export interface ContratoParaContar {
  fecha_alta_contrato?: string;
  fecha_baja_contrato?: string;
  fecha_carga?: string;
  nombre_estado_empleado?: string | null;
  delSistema?: boolean;
  firmaEnviadaAt?: unknown;
}

export interface VinculoParaContar {
  userId: string;
  contracts: ContratoParaContar[];
}

export interface ContadoresDeLaBase {
  alta: number;
  cuit: number;
  sinCuit: number;
  generarDocumentos: number;
}

/** Sin CUIT: marcado, vacío o todo el mismo dígito (como `noPoseeCuit` de la pantalla). */
export const noPoseeCuit = (cuit: unknown, sinCuit: unknown): boolean => {
  if (sinCuit === true) return true;
  const d = String(cuit || "").replace(/\D/g, "");
  return d.length === 0 || /^(\d)\1*$/.test(d);
};

export function contarBandejasDeLaBase(
  vinculos: VinculoParaContar[],
  opciones: {
    /** Los estados impositivos del ABM con su trámite (`data.tipoImpositivo`). */
    estadosImpositivos: { name: string; tipoImpositivo?: string | null }[];
    /** El estado que alimenta Generar documentos (envío de documentación). Sin él, esa bandeja da 0. */
    estadoEnvio?: string | null;
    /** userId → sin CUIT. Quien no está en el mapa se cuenta como sin CUIT (no hay dato). */
    sinCuitDe: (userId: string) => boolean;
    hoy?: string;
  },
): ContadoresDeLaBase {
  const hoy = opciones.hoy || hoyArgentina();
  const desde = (() => {
    const d = new Date(`${hoy}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - DIAS_ATRAS_BANDEJA);
    return d.toISOString().slice(0, 10);
  })();
  const tipoPorClave = new Map(opciones.estadosImpositivos.filter((e) => e.name).map((e) => [claveEstado(e.name), e.tipoImpositivo || ""]));
  const claveEnvio = opciones.estadoEnvio ? claveEstado(opciones.estadoEnvio) : "";

  const out: ContadoresDeLaBase = { alta: 0, cuit: 0, sinCuit: 0, generarDocumentos: 0 };
  for (const v of vinculos) {
    const contratos = v.contracts || [];
    const activo = getContratoActivo(contratos, hoy);
    if (!activo) continue;
    for (const c of contratos) {
      if (!c.delSistema) continue;
      const clave = claveEstado(String(c.nombre_estado_empleado ?? ""));
      const esImpositivo = tipoPorClave.has(clave);
      const esEnvio = !!claveEnvio && clave === claveEnvio;
      if (!esImpositivo && !esEnvio) continue;
      if (c !== activo && fechaISO(c.fecha_alta_contrato) < desde) continue;

      if (esEnvio && !c.firmaEnviadaAt) out.generarDocumentos++;
      if (!esImpositivo) continue;
      if (opciones.sinCuitDe(v.userId)) out.sinCuit++;
      else if (tipoPorClave.get(clave) === "alta_temprana_afip") out.alta++;
      else if (tipoPorClave.get(clave) === "constancia_cuit") out.cuit++;
    }
  }
  return out;
}
