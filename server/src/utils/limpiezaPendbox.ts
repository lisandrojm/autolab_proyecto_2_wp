import { leerAnclas } from "./anclasNombre.js";
import { MAX_NOMBRE, largoEnBytes } from "./nomenclatura.js";
import { ArchivoConNombre, candidatosPorNombre } from "./coincidenciaDeNombre.js";

/**
 * CUANDO VUELVE EL FIRMADO, EL ORIGINAL SALE DE PENDBOX. La decisión, SIN Dropbox ni base: es lo que
 * se testea. La ejecución está en `services/limpiezaPendboxService.ts`.
 *
 * El circuito es Outbox («Para Firmar») → Pendbox («Enviado a la firma») → Requested signatures
 * («Firmados»). El mail de Dropbox Sign mueve Outbox → Pendbox; el firmado aparece en Requested
 * signatures; y el original quedaba en Pendbox para siempre, con «Enviado a la firma» mostrándolo.
 *
 * Por cada firmado:
 *   · Se busca SU original en Pendbox. Con código («ID-000012») en el nombre, el del mismo código y
 *     nada más. Sin código, el archivo cuyo nombre (sin extensión ni «_ID-NNNNNN») es el comienzo del
 *     nombre del firmado seguido de un separador: la misma regla que el aviso por mail
 *     (`candidatosPorNombre`). Cero o más de un candidato: no se hace nada y se dice por qué. Nunca
 *     se adivina por persona y período.
 *   · Si el firmado no trae código, se renombra insertando el del original justo antes del primer
 *     «.pdf». Lo que Dropbox Sign le agregó después (« Firma solicitada por …») no se toca, salvo que
 *     el nombre pase `MAX_NOMBRE`: entonces se recorta esa cola, nunca un campo ancla.
 *   · Recién con el firmado con código, se borra el original. Quien ejecuta sólo borra si el renombre
 *     terminó bien (`borrarSoloSi`).
 */

export type MotivoOmision =
  | "sin_original" // ningún archivo de Pendbox es el original de este firmado
  | `ambiguo_${number}` // más de un candidato: no se elige
  | "original_sin_codigo" // el original no tiene «_ID-NNNNNN»: no hay código que ponerle al firmado
  | "original_repetido" // otro firmado de esta misma pasada ya se quedó con ese original
  | "sin_pdf_en_nombre" // no hay un «.pdf» delante del cual insertar el código
  | "nombre_largo" // ni recortando la cola entra en MAX_NOMBRE
  | "ya_existe"; // en Firmados ya hay un archivo con el nombre que resultaría

export interface AccionLimpieza {
  firmado: ArchivoConNombre;
  original: ArchivoConNombre;
  codigo: string;
  /** Nuevo nombre del firmado, si hay que renombrarlo. Sin esto, ya tenía el código. */
  renombrarA?: string;
}

export interface OmisionLimpieza {
  firmado: ArchivoConNombre;
  motivo: MotivoOmision;
  candidatos?: string[];
}

export interface PlanLimpieza {
  acciones: AccionLimpieza[];
  omitidos: OmisionLimpieza[];
}

const esPdf = (e: ArchivoConNombre) => !/\.json$/i.test(e.name);

/**
 * El nombre del firmado con el código metido antes del primer «.pdf». Si no entra en `max` bytes se
 * recorta la cola (lo que va después de ese «.pdf»), y si ni así entra, null.
 */
export function nombreConCodigo(nombre: string, codigo: string, max: number = MAX_NOMBRE): string | null {
  const i = nombre.toLowerCase().indexOf(".pdf");
  if (i < 0) return null;
  const cabeza = `${nombre.slice(0, i)}_${codigo}`;
  const extension = /\.[a-z0-9]{2,4}$/i.exec(nombre)?.[0] || ".pdf";
  const resto = nombre.slice(i); // ".pdf_ Firma solicitada por …s.pdf" (cola + extensión final)
  const completo = cabeza + resto;
  if (largoEnBytes(completo) <= max) return completo;
  // La cola es lo único recortable: queda «cabeza.pdf_ Firma soli….pdf», y como mínimo «cabeza.pdf».
  const cola = resto.slice(0, resto.length - extension.length); // sin la extensión final
  for (let largo = cola.length - 1; largo > 4; largo--) {
    const candidato = cabeza + cola.slice(0, largo) + extension;
    if (largoEnBytes(candidato) <= max) return candidato;
  }
  const minimo = cabeza + extension;
  return largoEnBytes(minimo) <= max ? minimo : null;
}

export function planLimpiezaPendbox(firmados: ArchivoConNombre[], pendbox: ArchivoConNombre[], max: number = MAX_NOMBRE): PlanLimpieza {
  const originales = pendbox.filter(esPdf);
  const nombresEnFirmados = new Set(firmados.map((f) => f.name.toLowerCase()));
  const asignados = new Set<string>();
  const plan: PlanLimpieza = { acciones: [], omitidos: [] };

  for (const firmado of firmados.filter(esPdf)) {
    const codigoDelFirmado = leerAnclas(firmado.name).codigo;
    const candidatos = codigoDelFirmado ? originales.filter((o) => leerAnclas(o.name).codigo === codigoDelFirmado) : candidatosPorNombre(originales, firmado.name);
    if (candidatos.length === 0) {
      plan.omitidos.push({ firmado, motivo: "sin_original" });
      continue;
    }
    if (candidatos.length > 1) {
      plan.omitidos.push({ firmado, motivo: `ambiguo_${candidatos.length}`, candidatos: candidatos.map((c) => c.name) });
      continue;
    }
    const original = candidatos[0];
    if (asignados.has(original.path)) {
      plan.omitidos.push({ firmado, motivo: "original_repetido", candidatos: [original.name] });
      continue;
    }
    const codigo = codigoDelFirmado || leerAnclas(original.name).codigo;
    if (!codigo) {
      plan.omitidos.push({ firmado, motivo: "original_sin_codigo", candidatos: [original.name] });
      continue;
    }
    let renombrarA: string | undefined;
    if (!codigoDelFirmado) {
      const nuevo = nombreConCodigo(firmado.name, codigo, max);
      if (!nuevo) {
        plan.omitidos.push({ firmado, motivo: firmado.name.toLowerCase().includes(".pdf") ? "nombre_largo" : "sin_pdf_en_nombre", candidatos: [original.name] });
        continue;
      }
      if (nombresEnFirmados.has(nuevo.toLowerCase())) {
        plan.omitidos.push({ firmado, motivo: "ya_existe", candidatos: [nuevo] });
        continue;
      }
      renombrarA = nuevo;
      nombresEnFirmados.add(nuevo.toLowerCase());
    }
    asignados.add(original.path);
    plan.acciones.push({ firmado, original, codigo, renombrarA });
  }
  return plan;
}

/** Texto de una línea por acción u omisión, para el log y el script. */
export function describirPlan(plan: PlanLimpieza): string[] {
  const lineas: string[] = [];
  for (const a of plan.acciones) {
    if (a.renombrarA) lineas.push(`RENOMBRAR  ${a.firmado.name}\n       →   ${a.renombrarA}`);
    lineas.push(`BORRAR     ${a.original.name}
       por  ${a.renombrarA || a.firmado.name}   (${a.codigo})`);
  }
  for (const o of plan.omitidos) lineas.push(`OMITIR     ${o.firmado.name}   [${o.motivo}]${o.candidatos?.length ? `  candidatos: ${o.candidatos.join(" | ")}` : ""}`);
  return lineas;
}
