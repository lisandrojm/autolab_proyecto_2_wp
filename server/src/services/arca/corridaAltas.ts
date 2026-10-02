import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { ArcaAltasLog } from "../../models/ArcaAltasLog.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR_ALTAS } from "./motor.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
import { ItemLoteAltas, LoteAltasValidado, validarLoteAltas } from "./validarLoteAltas.js";
import type { ModoAltas } from "./cotejoAltas.js";

/**
 * PRESENTAR ALTAS EN ARCA DESDE EL SERVIDOR: Carga Masiva (archivo de 130) o Altas Masivas (pegado
 * de 85, máximo 9).
 *
 * Mismo mecanismo que la validación de obras sociales (`corridaServidor.ts`): arranca, vuelve
 * enseguida, y el progreso se sigue por eventos que el modal pide cada ~2 s. Comparte con ella el
 * CANDADO (`candadoArca.ts`): usan la misma sesión de ARCA y no pueden correr a la vez.
 *
 * Lo que agrega es que ESTA corrida no se deshace. Las reglas:
 *
 *   · El lote lo decide el servidor (`validarLoteAltas.ts`): cada registro se coteja contra la base.
 *   · «Detener» funciona hasta el paso ANTERIOR al envío. Desde el evento `irreversible` ya no.
 *   · Nunca se reintenta un Enviar ni un Aceptar. Si después del click algo falla o no se puede leer,
 *     el resultado es «indeterminado», y queda así en el contrato para que nadie lo vuelva a presentar
 *     sin mirar ARCA primero.
 *   · En desarrollo corre EN SECO por defecto (ver `enSecoForzado`).
 */

export type EventoAltas =
  | { tipo: "abriendo" }
  | { tipo: "sesion"; seLogueo: boolean }
  | { tipo: "empleadoraVerificada"; cuit: string }
  | { tipo: "pantalla"; que: string }
  | { tipo: "novedadCreada"; codigo: string }
  | { tipo: "archivoCargado" }
  | { tipo: "validacion"; estado: string; errores: string; registrosLeidos: number; enviados: number }
  | { tipo: "grillaVacia" }
  | { tipo: "pegado"; registros: number }
  | { tipo: "grillaCargada"; cuils: string[] }
  | { tipo: "irreversible"; que: "enviar" | "aceptar" }
  | { tipo: "enviada"; estado: string; fechaPresentacion: string; nroTransaccion: string }
  | { tipo: "persona"; cuil: string; estado: "alta" | "rechazada" | "indeterminado"; motivo?: string }
  | { tipo: "seco"; codigoNovedad?: string }
  | { tipo: "indeterminado"; comoVerificar: string }
  | { tipo: "fin"; resultado: string }
  | { tipo: "fallo"; mensaje: string; textoArca?: string; codigoNovedad?: string };

interface CorridaAltas {
  tenantId: string;
  tipo: ModoAltas;
  empresaId: string;
  empresaRazonSocial: string;
  empresaCuit: string;
  personas: Array<{ cuil: string; nombre: string }>;
  total: number;
  enSeco: boolean;
  eventos: EventoAltas[];
  terminada: boolean;
  /** Se apretó (o se está por apretar) el botón que no se deshace. Desde acá «Detener» no corta. */
  irreversible: boolean;
  señal: { cortada: boolean };
  arrancadaEl: Date;
}

/** Una por tenant, en memoria, igual que la de obras sociales (ver allí por qué). */
const corridas = new Map<string, CorridaAltas>();

export const corridaAltasDe = (tenantId: string): CorridaAltas | undefined => corridas.get(tenantId);

/**
 * En desarrollo NO se presenta nada de verdad salvo que se pida explícito con
 * `ARCA_ALTAS_EN_SECO=false`. En producción es real salvo `ARCA_ALTAS_EN_SECO=true`. El cliente puede
 * pedir seco, nunca lo contrario.
 */
export const enSecoForzado = (): boolean => {
  const v = String(process.env.ARCA_ALTAS_EN_SECO || "").toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV !== "production";
};

export function detenerCorridaAltas(tenantId: string): { detenida: boolean; motivo?: string } {
  const c = corridas.get(tenantId);
  if (!c || c.terminada) return { detenida: false, motivo: "No hay una corrida de altas en curso." };
  if (c.irreversible) return { detenida: false, motivo: "Ya se apretó el botón que presenta las altas: no se puede detener. Esperá el resultado." };
  c.señal.cortada = true;
  return { detenida: true };
}

export async function arrancarCorridaAltas(opts: {
  tenantId: string;
  tenantObjectId: any;
  usuarioId?: string;
  modo: ModoAltas;
  empresaId: string;
  items: ItemLoteAltas[];
  enSeco?: boolean;
  forzar?: boolean;
}): Promise<{ total: number; enSeco: boolean; empresa: LoteAltasValidado["empresa"] }> {
  const { tenantId, tenantObjectId, usuarioId, modo } = opts;
  // El candado ANTES de cualquier await: dos clicks seguidos no pueden arrancar dos corridas.
  tomarCandado(tenantId, modo);
  try {
    const lote = await validarLoteAltas({ tenantObjectId, modo, empresaId: opts.empresaId, items: opts.items, forzar: !!opts.forzar });
    const cred = await credencialesDe(tenantId);
    if (!cred) throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
    const enSeco = enSecoForzado() || !!opts.enSeco;

    const corrida: CorridaAltas = {
      tenantId,
      tipo: modo,
      empresaId: lote.empresa._id,
      empresaRazonSocial: lote.empresa.razonSocial,
      empresaCuit: lote.empresa.cuit,
      personas: lote.items.map((i) => ({ cuil: i.cuil, nombre: i.nombre })),
      total: lote.items.length,
      enSeco,
      eventos: [],
      terminada: false,
      irreversible: false,
      señal: { cortada: false },
      arrancadaEl: new Date(),
    };
    corridas.set(tenantId, corrida);
    void correr({ corrida, lote, tenantObjectId, usuarioId, cred });
    return { total: lote.items.length, enSeco, empresa: lote.empresa };
  } catch (e) {
    soltarCandado(tenantId, modo);
    throw e;
  }
}

async function correr(o: { corrida: CorridaAltas; lote: LoteAltasValidado; tenantObjectId: any; usuarioId?: string; cred: NonNullable<Awaited<ReturnType<typeof credencialesDe>>> }) {
  const { corrida, lote, tenantObjectId, usuarioId, cred } = o;
  const emitir = (e: EventoAltas) => {
    if (e.tipo === "irreversible") corrida.irreversible = true;
    corrida.eventos.push(e);
  };
  const inicio = Date.now();
  let sesion: Awaited<ReturnType<typeof abrirSesionArca>> | null = null;
  let r: any = null;
  let resultado = "fallo";
  let error: string | undefined;
  let textoArca: string | undefined;
  let codigoNovedad: string | undefined;

  try {
    emitir({ tipo: "abriendo" });
    sesion = await abrirSesionArca(corrida.tenantId, cred);
    emitir({ tipo: "sesion", seLogueo: sesion.seLogueo });
    const motor = (await import(MOTOR_ALTAS)) as any;
    const comun = { page: sesion.page, empresaCuit: lote.empresa.cuit, enSeco: corrida.enSeco, onProgreso: emitir, señal: corrida.señal };
    r =
      lote.modo === "carga_masiva"
        ? await motor.cargaMasiva({ ...comun, txt: lote.texto, registros: lote.items.length })
        : await motor.altasMasivas({ ...comun, texto: lote.texto, cuils: lote.items.map((i) => i.cuil) });
    resultado = r?.resultado || "indeterminado";
    codigoNovedad = r?.codigoNovedad;
    emitir({ tipo: "fin", resultado });
  } catch (e: any) {
    error = String(e?.message || e);
    textoArca = e?.textoArca;
    codigoNovedad = e?.codigoNovedad || codigoNovedad;
    if (corrida.irreversible) {
      // Algo falló DESPUÉS de apretar el botón: no sabemos si ARCA lo tomó. No se reintenta: se marca
      // indeterminado para que alguien lo mire en ARCA antes de volver a presentar.
      resultado = "indeterminado";
      emitir({ tipo: "indeterminado", comoVerificar: `Después de presentar hubo un error (${error}). Revisá en ARCA si las altas figuran antes de hacer nada: NO las vuelvas a presentar desde acá.` });
      emitir({ tipo: "fin", resultado });
    } else {
      resultado = e?.detenido ? "detenida" : "fallo";
      emitir({ tipo: "fallo", mensaje: error, textoArca, codigoNovedad });
    }
  } finally {
    corrida.terminada = true;
    const s: any = sesion;
    if (s && !error) await guardarSesion(corrida.tenantId, s.ctx).catch(() => {});
    await s?.browser.close().catch(() => {});
    soltarCandado(corrida.tenantId, lote.modo);

    // Resultado por contrato. Solo se escribe en el contrato lo que se PRESENTÓ (o puede haberse
    // presentado): un seco, un fallo antes del envío o un «Detener» no dejan marca.
    const porCuil = new Map<string, { estado: string; motivo?: string }>((r?.porPersona || []).map((p: any) => [String(p.cuil), { estado: p.estado, motivo: p.motivo }]));
    const resultadoDe = (cuil: string): { log: string; contrato?: "presentada" | "indeterminado" | "fallida"; motivo?: string } => {
      if (resultado === "seco" || resultado === "detenida" || (resultado === "fallo" && !corrida.irreversible)) return { log: resultado };
      if (lote.modo === "carga_masiva") return resultado === "enviada" ? { log: "presentada", contrato: "presentada" } : { log: "indeterminado", contrato: "indeterminado" };
      const p = porCuil.get(cuil);
      if (p?.estado === "alta") return { log: "presentada", contrato: "presentada" };
      if (p?.estado === "rechazada") return { log: "rechazada", contrato: "fallida", motivo: p.motivo };
      return { log: "indeterminado", contrato: "indeterminado" };
    };

    const log = await ArcaAltasLog.create({
      tenantId: tenantObjectId,
      tipo: lote.modo,
      usuarioId: usuarioId && Types.ObjectId.isValid(usuarioId) ? usuarioId : undefined,
      empresaId: lote.empresa._id,
      empresaCuit: lote.empresa.cuit,
      empresaRazonSocial: lote.empresa.razonSocial,
      enSeco: corrida.enSeco,
      contratos: lote.items.map((i) => {
        const x = resultadoDe(i.cuil);
        return { userProjectId: i.userProjectId, contractIndex: i.contractIndex, cuil: i.cuil, nombre: i.nombre, resultado: x.log, motivo: x.motivo };
      }),
      codigoNovedad,
      nroTransaccion: r?.nroTransaccion,
      fechaPresentacion: r?.fechaPresentacion,
      estadoArca: r?.estado,
      resultado,
      irreversible: corrida.irreversible,
      pasoFallido: error ? corrida.eventos.filter((e) => e.tipo !== "fallo").slice(-1)[0]?.tipo : undefined,
      error,
      textoArca,
      dialogos: r?.dialogos,
      seLogueo: s?.seLogueo,
      tiempos: s?.tiempos,
      duracionMs: Date.now() - inicio,
      htmlResultado: r?.html,
    }).catch((e: any) => {
      console.error("Altas ARCA: no pude guardar el log:", e?.message || e);
      return null;
    });

    for (const i of lote.items) {
      const x = resultadoDe(i.cuil);
      if (!x.contrato) continue;
      await UserProject.updateOne(
        { _id: i.userProjectId },
        {
          $set: {
            [`contracts.${i.contractIndex}.altaArcaPresentada`]: {
              via: lote.modo,
              fecha: new Date(),
              resultado: x.contrato,
              codigoNovedad,
              nroTransaccion: r?.nroTransaccion,
              motivo: x.motivo,
              logId: log?._id,
            },
          },
        },
      ).catch((e: any) => console.error("Altas ARCA: no pude marcar el contrato:", e?.message || e));
    }
  }
}
