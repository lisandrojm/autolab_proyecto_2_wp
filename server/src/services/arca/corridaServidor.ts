import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Company } from "../../models/Company.js";
import { ArcaObrasSocialesLog } from "../../models/ArcaObrasSocialesLog.js";
import { aplicarLoteObrasSociales } from "../obrasSocialesLoteService.js";
import { abrirSesionArca, credencialesDe } from "./navegador.js";
import { confirmarNombresConElPadron, mismoNombre, Renombre } from "./nombreArca.js";
import { User } from "../../models/User.js";

/**
 * Validar obras sociales contra ARCA desde el SERVIDOR, sin que nadie tenga que instalar nada.
 *
 * Reemplaza al camino que exigía el Asistente WeProdu en la máquina de cada administrativo. La
 * diferencia es de dónde sale la sesión de ARCA: antes la abría una persona en su Chrome, ahora la
 * abre el servidor con un usuario delegado (ver `navegador.ts`, y la advertencia de seguridad que
 * está ahí y en el modelo).
 *
 * LO QUE NO CAMBIA es el trámite: las reglas contra ARCA —las tandas, el «Aceptar» que no se toca,
 * el ciclo de a uno con la pantalla vaciada y verificada— son el MISMO código que corre en el
 * Asistente. Se importa, no se reescribe. Dos copias de las reglas del organismo se separan solas, y
 * lo que se separa es lo que decide qué obra social se le declara a una persona.
 */

/**
 * El motor vive en `frontend/tools/` y se importa en tiempo de ejecución.
 *
 * Es JavaScript plano fuera del `rootDir` del server, así que `tsc` ni lo mira: se resuelve con una
 * ruta calculada desde este archivo. La cuenta funciona igual en desarrollo y en producción porque
 * `src/services/arca/` y `dist/services/arca/` están a la misma profundidad — cuatro niveles bajo la
 * raíz del repo, que es lo que se despliega en el VPS.
 *
 * Está acá y no copiado adentro del server justamente para que haya UNA sola copia. Si algún día
 * `frontend/tools/` se mueve, esta constante es el único lugar que hay que tocar.
 */
const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MOTOR = resolve(RAIZ_REPO, "frontend/tools/validar-obras-sociales.mjs");

export type EventoCorrida =
  | { tipo: "abriendo" }
  | { tipo: "conectando" }
  | { tipo: "conectado" }
  | { tipo: "esperando"; que: string; restanMs: number }
  | { tipo: "listo" }
  | { tipo: "consultando"; cuil: string }
  | { tipo: "resultado"; cuil: string; rnos: string; nombreArca?: string; /** El nombre guardado coincide con el que ARCA muestra. `false` = hay que resolverlo con el padrón. */ nombreOk?: boolean; hechas: number; total: number }
  | { tipo: "error"; cuil: string; motivo?: string; hechas: number; total: number }
  | { tipo: "guardando" }
  | { tipo: "nombres"; renombrados: Renombre[]; confirmados: string[] }
  | { tipo: "fin"; validadas: number; faltaron: number; motivo: string; detalle: string[] }
  | { tipo: "fallo"; mensaje: string };

interface Corrida {
  tenantId: string;
  empresaId: string;
  total: number;
  eventos: EventoCorrida[];
  terminada: boolean;
  señal: { cortada: boolean };
  arrancadaEl: Date;
}

/**
 * Una corrida por tenant, en memoria.
 *
 * En memoria y no en una cola porque no hay Redis configurado, y montar la infraestructura para esto
 * sería resolver un problema que no existe: una corrida dura minutos y hay una sola por vez. Lo que
 * se pierde es que no sobrevive a un reinicio del servidor — y eso es aceptable porque la corrida se
 * puede volver a disparar, y lo ya guardado quedó guardado (se aplica de a una persona).
 *
 * UNA POR TENANT, y no una global: dos corridas del mismo tenant compartirían la sesión de ARCA y se
 * pisarían la pantalla. Dos tenants distintos tienen usuarios de AFIP distintos y no se estorban.
 */
const corridas = new Map<string, Corrida>();

export const corridaDe = (tenantId: string): Corrida | undefined => corridas.get(tenantId);
export const corriendo = (tenantId: string): boolean => {
  const c = corridas.get(tenantId);
  return !!c && !c.terminada;
};

export function detenerCorrida(tenantId: string): boolean {
  const c = corridas.get(tenantId);
  if (!c || c.terminada) return false;
  c.señal.cortada = true;
  return true;
}

/**
 * Arranca la corrida y vuelve enseguida.
 *
 * No se espera a que termine: son minutos, y un request HTTP colgado ese tiempo se corta solo en
 * cualquier proxy. El progreso se sigue por `corridaDe`.
 */
export async function arrancarCorrida(opts: { tenantId: string; tenantObjectId: any; empresaId: string; cuils: string[]; usuarioId?: string; userIds?: string[] }): Promise<{ total: number }> {
  const { tenantId, tenantObjectId, empresaId, cuils, usuarioId, userIds = [] } = opts;

  if (corriendo(tenantId)) throw new Error("Ya hay una validación en curso.");
  if (cuils.length === 0) throw new Error("No hay ninguna persona para validar.");

  const cred = await credencialesDe(tenantId);
  if (!cred) throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");

  const empresa: any = await Company.findById(empresaId).select("cuit razonSocial").lean();
  const empresaCuit = String(empresa?.cuit || "").replace(/\D/g, "");
  if (empresaCuit.length !== 11) throw new Error("La empleadora no tiene CUIT cargado: sin eso no se puede elegir en ARCA.");

  const corrida: Corrida = { tenantId, empresaId, total: cuils.length, eventos: [], terminada: false, señal: { cortada: false }, arrancadaEl: new Date() };
  corridas.set(tenantId, corrida);

  /*
    EL NOMBRE SE COMPARA CON EL QUE YA TRAJO LA PANTALLA.

    ARCA precompleta el nombre en el mismo bloque del que se lee la obra social, así que el motor lo
    devuelve en el mismo evento (ver `leerFilas`). Comparar acá no cuesta ninguna consulta: es un
    string contra otro, en memoria, mientras la corrida sigue.

    Solo los que DIFIEREN van al padrón, y solo al final — porque para escribir el nombre hacen falta
    apellido y nombre por separado, y la pantalla los muestra pegados.
  */
  const personas: any[] = await User.find({ _id: { $in: userIds }, tenantId: tenantObjectId })
    .select("_id firstName lastName metadata.cuit metadata.nombreValidadoArcaAt")
    .lean();
  const porCuil = new Map(personas.map((u) => [String(u?.metadata?.cuit || "").replace(/\D/g, ""), u]));
  const nombresOk: string[] = [];
  const nombresQueDifieren = new Map<string, string>(); // userId → cuil

  const emitir = (e: EventoCorrida) => {
    if (e.tipo === "resultado" && e.nombreArca) {
      const u = porCuil.get(String(e.cuil).replace(/\D/g, ""));
      if (u) {
        /*
          EL SELLO ES LA COMPUERTA: quien ya tiene el nombre validado no se vuelve a mirar.

          `nombreValidadoArcaAt` significa que ARCA ya confirmó ese nombre. Volver a compararlo y —peor—
          volver a consultarle al organismo es hacer trabajar al sistema para llegar a la conclusión
          que ya estaba guardada. Se lo cuenta como confirmado y se sigue.
        */
        if (u?.metadata?.nombreValidadoArcaAt) {
          e.nombreOk = true;
          nombresOk.push(String(e.cuil).replace(/\D/g, ""));
          corrida.eventos.push(e);
          return;
        }
        const guardado = `${u.firstName || ""} ${u.lastName || ""}`.trim();
        const ok = mismoNombre(e.nombreArca, guardado);
        // El veredicto viaja en el MISMO evento: así la pantalla marca cada persona apenas se la lee,
        // en vez de quedarse en blanco hasta que termine toda la corrida.
        e.nombreOk = ok;
        if (ok) nombresOk.push(String(e.cuil).replace(/\D/g, ""));
        else nombresQueDifieren.set(String(u._id), String(e.cuil).replace(/\D/g, ""));
      }
    }
    corrida.eventos.push(e);
  };

  // Sin `await`: la corrida sigue por su cuenta y este request vuelve ya.
  void (async () => {
    let sesion: Awaited<ReturnType<typeof abrirSesionArca>> | null = null;
    let renombrados: Renombre[] = [];
    // Lo que va al log. Se completa a medida que se sabe, para que una corrida que se cae a la mitad
    // igual deje registro: es JUSTO la que hay que poder mirar después.
    const log = {
      seLogueo: false,
      validadas: 0,
      guardadas: 0,
      sinDeclarar: 0,
      errores: 0,
      faltaron: cuils.length,
      motivo: "",
      error: undefined as string | undefined,
    };
    try {
      emitir({ tipo: "abriendo" });
      sesion = await abrirSesionArca(tenantId, cred);
      log.seLogueo = sesion.seLogueo;

      const { validarObrasSociales } = (await import(MOTOR)) as any;
      const r = await validarObrasSociales({
        empresa: "",
        empresaCuit,
        cuils,
        // `soloLeer`: el motor NO escribe en WeProdu. Lo que guarda es la línea de abajo, con el
        // servicio que ya valida contra las obras sociales registradas por la empleadora.
        soloLeer: true,
        paginaExistente: sesion.page,
        onProgreso: emitir,
        señal: corrida.señal,
      });

      // `rnos` vacío no es un error: ARCA contestó que esa persona no tiene afiliación propia y rige
      // la del convenio. Se cuenta aparte para que no infle ni los aciertos ni las fallas.
      log.validadas = r.items.filter((i: any) => i.rnos).length;
      log.sinDeclarar = r.items.length - log.validadas;
      log.errores = r.errores?.length || 0;
      log.faltaron = r.faltaron;
      log.motivo = motivoDeQueFaltaran(r);

      /*
        Los que difieren, y NADA MÁS que esos.

        En una corrida donde los nombres están bien —lo normal— acá no sale ni una consulta: la
        comparación ya se hizo contra lo que la pantalla mostró. Se paga una consulta por cada persona
        cuyo nombre de verdad hay que corregir.
      */
      if (nombresQueDifieren.size > 0) {
        const r2 = await confirmarNombresConElPadron({ tenantObjectId, tenantId, userIds: [...nombresQueDifieren.keys()] });
        renombrados = r2.renombrados;
        // Los que el padrón confirmó también quedan como confirmados en la pantalla.
        nombresOk.push(...r2.confirmados);
      }
      corrida.eventos.push({ tipo: "nombres", renombrados, confirmados: nombresOk });

      if (r.items.length > 0) {
        emitir({ tipo: "guardando" });
        const aplicado = await aplicarLoteObrasSociales({
          tenantObjectId,
          empresaId,
          filas: r.items,
          origen: "panel",
          usuarioId,
        });
        log.guardadas = aplicado.aplicados;
        emitir({
          tipo: "fin",
          validadas: aplicado.aplicados,
          faltaron: r.faltaron,
          motivo: motivoDeQueFaltaran(r),
          detalle: detalleDeLoAplicado(aplicado),
        });
      } else {
        emitir({ tipo: "fin", validadas: 0, faltaron: r.faltaron, motivo: motivoDeQueFaltaran(r), detalle: [] });
      }
    } catch (e: any) {
      log.error = String(e?.message || e);
      emitir({ tipo: "fallo", mensaje: log.error });
    } finally {
      // El navegador lo abrió esta función, así que lo cierra esta función. Cada corrida que se
      // olvide de cerrarlo deja un Chromium vivo comiéndose la memoria del VPS.
      await sesion?.browser.close().catch(() => {});
      corrida.terminada = true;

      // El log se escribe al final y de una sola vez, no evento por evento: una corrida son minutos
      // y cientos de eventos, y guardar cada uno sería escribir en Mongo mientras se maneja el
      // navegador de ARCA. `catch` vacío a propósito — que falle el log no puede tumbar la corrida
      // ni tapar el error real con otro.
      await ArcaObrasSocialesLog.create({
        tenantId: tenantObjectId,
        empresaId,
        empresaRazonSocial: empresa?.razonSocial,
        empresaCuit,
        usuarioId,
        total: cuils.length,
        validadas: log.validadas,
        guardadas: log.guardadas,
        sinDeclarar: log.sinDeclarar,
        errores: log.errores,
        faltaron: log.faltaron,
        motivo: log.motivo,
        seLogueo: log.seLogueo,
        duracionMs: Date.now() - corrida.arrancadaEl.getTime(),
        error: log.error,
        renombrados,
        detalle: detallePorPersona(corrida.eventos),
      }).catch(() => {});
    }
  })();

  return { total: cuils.length };
}

/**
 * Por qué faltaron personas. Un final con `faltaron > 0` y sin motivo es un bug en sí mismo.
 *
 * Ya pasó en el camino del Asistente: el motor abortaba antes de la primera persona, devolvía cero
 * hechas y cero errores, y la pantalla lo mostraba como un final exitoso — veinte filas «en cola»
 * para siempre, sin nada que explicara nada.
 */
function motivoDeQueFaltaran(r: any): string {
  if (!r.faltaron) return "";
  if (r.sinSesion) return "Se cortó la sesión de ARCA, o se pidió detener la corrida.";
  if (r.errores?.length) return `ARCA no devolvió fila para ${r.errores.length} CUIL. Puede que no tengan relación laboral registrada con esta empleadora.`;
  return "La corrida terminó sin procesar a nadie y el motor no informó ningún error.";
}

/**
 * Qué contestó ARCA para cada persona, sacado de los eventos de la corrida.
 *
 * Se arma de los eventos y no del resultado final porque los eventos existen aunque la corrida se
 * caiga: si se cortó la sesión en la persona doce, quedan las once que sí se leyeron.
 */
function detallePorPersona(eventos: EventoCorrida[]): Array<{ cuil: string; rnos?: string; error?: string }> {
  const out: Array<{ cuil: string; rnos?: string; error?: string }> = [];
  for (const e of eventos) {
    if (e.tipo === "resultado") out.push({ cuil: e.cuil, rnos: e.rnos });
    else if (e.tipo === "error") out.push({ cuil: e.cuil, error: e.motivo || "ARCA no devolvió fila." });
  }
  return out;
}

/** Lo que el lote NO pudo aplicar, en frases. Es lo que hace falta para saber qué revisar. */
function detalleDeLoAplicado(r: any): string[] {
  const l: string[] = [];
  if (r.sinContrato?.length) l.push(`${r.sinContrato.length} sin contrato en esta empleadora.`);
  if (r.yaBloqueados?.length) l.push(`${r.yaBloqueados.length} ya estaban validadas y no se pisaron.`);
  if (r.rnosDesconocido?.length) l.push(`${r.rnosDesconocido.length} con un código que no está en el catálogo de Obras Sociales.`);
  if (r.noRegistrada?.length) l.push(`${r.noRegistrada.length} con una obra social que la empleadora no tiene registrada ante ARCA: el organismo rechazaría el alta.`);
  return l;
}
