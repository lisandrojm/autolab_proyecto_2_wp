import { Company } from "../../models/Company.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { abrirSesionArca, credencialesDe } from "./navegador.js";
import { aplicarNombreDeArca, Renombre } from "./nombreArca.js";
import { corriendo } from "./corridaServidor.js";
import { MOTOR } from "./motor.js";

/**
 * EL NOMBRE DE LOS QUE EL PADRÓN NO PUEDE RESOLVER, leído de la pantalla de altas.
 *
 * POR QUÉ EXISTE
 *
 * «Validar nombres» consulta el Padrón (webservice A13) porque es el único lugar donde el nombre y el
 * apellido vienen SEPARADOS. Pero el padrón rechaza los CUIT dados de baja: contesta un fault y no
 * devuelve nada. Esas personas quedaban sin nombre corregido y sin sello, para siempre.
 *
 * La pantalla de Simplificación Registral los muestra igual —`Empleado: 20-41292376-7 - CASTRO BRIAN
 * EMANUEL`— aunque el CUIT esté inactivo. Es la MISMA pantalla que ya se opera para leer obras
 * sociales, con el mismo motor y la misma sesión: acá no se inventa ningún camino nuevo, se usa el que
 * ya existe para los que el otro no alcanza.
 *
 * QUÉ CUESTA, Y POR QUÉ SE HACE IGUAL EN EL MISMO REQUEST
 *
 * Abre un Chromium y navega, así que son segundos y no milisegundos — bastante más caro que una
 * consulta SOAP. Se banca porque son POCOS: en el log de producción, 6 CUIT inactivos sobre 273
 * consultas. Y por eso hay un tope (`LIMITE`): si algún día son cientos, la corrida de obras sociales
 * es el lugar para eso, no un botón que responde en segundos.
 *
 * LA EMPLEADORA SALE DEL CONTRATO DE CADA PERSONA. La pantalla de ARCA trabaja por CUIT de empleador,
 * así que no se puede consultar «en general». Se agrupa por empleadora y se hace una pasada por cada
 * una, reusando la misma sesión. Quien no tiene contrato con empresa queda sin resolver, y se dice.
 *
 * NUNCA ESCRIBE EN ARCA. El motor va en modo lectura y jamás aprieta «Aceptar» — esa garantía está en
 * `validar-obras-sociales.mjs` y no se toca desde acá.
 */

/** Cuántos CUIT inactivos se reintentan por pantalla en un mismo pedido. Ver el comentario de arriba. */
const LIMITE = 25;

export interface ResultadoNombresPantalla {
  /** Los que se pudieron corregir con el nombre de la pantalla. */
  renombrados: Renombre[];
  /** CUIL a los que la pantalla les confirmó el nombre (haya cambiado o no). */
  confirmados: string[];
  /** Se intentó y no se pudo, con el motivo. */
  sinResolver: Array<{ cuit: string; motivo: string }>;
  /** No se intentó nada, y por qué. Vacío = se intentó. */
  motivoSinIntentar?: string;
}

const vacio = (motivo?: string): ResultadoNombresPantalla => ({ renombrados: [], confirmados: [], sinResolver: [], motivoSinIntentar: motivo });

export async function nombresPorPantalla(opts: { tenantId: string; tenantObjectId: any; cuits: string[] }): Promise<ResultadoNombresPantalla> {
  const { tenantId, tenantObjectId } = opts;
  const cuits = [...new Set(opts.cuits.map((c) => String(c || "").replace(/\D/g, "")).filter((c) => c.length === 11))];
  if (cuits.length === 0) return vacio();

  /*
    UNA SOLA SESIÓN DE ARCA POR TENANT. Si hay una corrida de obras sociales en curso, esta se saltea.

    Las dos operan la misma pantalla del mismo usuario de clave fiscal: abrir una segunda le cambiaría
    el estado a la primera en el medio del trámite. Entre interrumpir una corrida que está registrando
    obras sociales y postergar una corrección de nombre, no hay duda de cuál cede.
  */
  if (corriendo(tenantId)) return vacio("Hay una validación de obras sociales en curso. Los nombres de los CUIT inactivos se corrigen cuando termine.");

  const cred = await credencialesDe(tenantId);
  if (!cred) return vacio("No está configurada la conexión de «Obras sociales, nombres y documentos», que es la única que ve el nombre de un CUIT inactivo.");

  const usuarios: any[] = await User.find({ tenantId: tenantObjectId, "metadata.cuit": { $exists: true, $ne: "" } })
    .select("_id firstName lastName metadata.cuit metadata.nombreValidadoArcaAt")
    .lean();
  const porCuil = new Map<string, any>();
  for (const u of usuarios) {
    const d = String(u?.metadata?.cuit || "").replace(/\D/g, "");
    if (cuits.includes(d)) porCuil.set(d, u);
  }
  if (porCuil.size === 0) return vacio();

  // La empleadora de cada persona sale de su contrato: la pantalla de ARCA trabaja por CUIT de empleador.
  const ups: any[] = await UserProject.find({ userId: { $in: [...porCuil.values()].map((u) => u._id) } })
    .select("userId contracts.empresaContratoId")
    .lean();
  const empresaDeUsuario = new Map<string, string>();
  for (const up of ups) {
    for (const c of up.contracts || []) {
      const emp = String(c?.empresaContratoId || "");
      if (emp) {
        empresaDeUsuario.set(String(up.userId), emp);
        break;
      }
    }
  }

  const porEmpresa = new Map<string, string[]>(); // empresaId → cuils
  const sinResolver: ResultadoNombresPantalla["sinResolver"] = [];
  for (const [cuil, u] of porCuil) {
    const emp = empresaDeUsuario.get(String(u._id));
    if (!emp) {
      sinResolver.push({ cuit: cuil, motivo: "No tiene ningún contrato con empleadora asignada, y la pantalla de ARCA se abre por empleadora." });
      continue;
    }
    porEmpresa.set(emp, [...(porEmpresa.get(emp) || []), cuil]);
  }
  if (porEmpresa.size === 0) return { renombrados: [], confirmados: [], sinResolver };

  const empresas: any[] = await Company.find({ _id: { $in: [...porEmpresa.keys()] } })
    .select("_id cuit razonSocial")
    .lean();
  const cuitDeEmpresa = new Map(empresas.map((e) => [String(e._id), String(e.cuit || "").replace(/\D/g, "")]));

  const renombrados: Renombre[] = [];
  const confirmados: string[] = [];
  let sesion: Awaited<ReturnType<typeof abrirSesionArca>> | null = null;
  let restantes = LIMITE;

  try {
    for (const [empresaId, cuilsDeLaEmpresa] of porEmpresa) {
      if (restantes <= 0) break;
      const empresaCuit = cuitDeEmpresa.get(empresaId) || "";
      if (empresaCuit.length !== 11) {
        for (const c of cuilsDeLaEmpresa) sinResolver.push({ cuit: c, motivo: "Su empleadora no tiene CUIT cargado: sin eso no se puede elegir en ARCA." });
        continue;
      }
      const tanda = cuilsDeLaEmpresa.slice(0, restantes);
      restantes -= tanda.length;

      // El navegador se abre recién cuando hay algo real que consultar, y una sola vez para todas.
      if (!sesion) sesion = await abrirSesionArca(tenantId, cred);

      const { validarObrasSociales } = (await import(MOTOR)) as any;
      const r = await validarObrasSociales({
        empresa: "",
        empresaCuit,
        cuils: tanda,
        soloLeer: true,
        paginaExistente: sesion.page,
        señal: { cortada: false },
      });

      for (const item of r.items || []) {
        const cuil = String(item?.cuil || "").replace(/\D/g, "");
        const nombreArca = String(item?.nombreArca || "").trim();
        const u = porCuil.get(cuil);
        if (!u) continue;
        if (!nombreArca) {
          sinResolver.push({ cuit: cuil, motivo: "La pantalla de ARCA no mostró ningún nombre para este CUIL." });
          continue;
        }
        /*
          `aplicarNombreDeArca` con el nombre en UN campo, que es como lo muestra la pantalla.

          Adentro decide: si las palabras son las mismas, adopta la grafía de ARCA y sella; si no lo
          son, lo parte anclando en el apellido ya guardado. Y si no encuentra el ancla no escribe
          nada — ese es el caso en que el apellido de verdad es otro, y lo mira una persona.
        */
        const cambio = await aplicarNombreDeArca({
          tenantObjectId,
          userId: String(u._id),
          cuil,
          actual: { firstName: u.firstName, lastName: u.lastName },
          arca: { apellido: nombreArca },
        });
        if (cambio) renombrados.push(cambio);

        // Se relee el sello: es la única forma de saber si `aplicarNombreDeArca` escribió o desistió.
        const despues: any = await User.findById(u._id).select("metadata.nombreValidadoArcaAt").lean();
        if (despues?.metadata?.nombreValidadoArcaAt) confirmados.push(cuil);
        else sinResolver.push({ cuit: cuil, motivo: `ARCA muestra «${nombreArca}» y el apellido guardado no aparece ahí. Corregilo a mano: puede ser otro apellido, no otra forma de escribirlo.` });
      }
    }
  } catch (e: any) {
    // Nunca tumba el pedido: lo que se alcanzó a corregir queda corregido y el resto se informa.
    return { renombrados, confirmados, sinResolver, motivoSinIntentar: String(e?.message || e) };
  } finally {
    // El navegador lo abrió esta función, así que lo cierra esta función.
    await sesion?.browser.close().catch(() => {});
  }

  return { renombrados, confirmados, sinResolver };
}
