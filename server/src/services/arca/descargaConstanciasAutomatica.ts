import { Types } from "mongoose";
import { Company } from "../../models/Company.js";
import { arrancarDescargaConstancias, descargaConstanciasDe, pendientesDeConstancia } from "./constanciasAltas.js";
import { quienTiene } from "./candadoArca.js";
import { credencialesDe } from "./navegador.js";
import { type ConfigAltasAutomaticas, momentoDeCorrida, sumarDias } from "./horarioAltasAutomaticas.js";

/**
 * DESCARGA AUTOMÁTICA DE LAS CONSTANCIAS DE ALTA TEMPRANA (pedido del 18/10/2026). Una vez por día, a la
 * hora configurada por el tenant, se bajan de ARCA las constancias de las altas ya presentadas que
 * todavía no la tienen, y cada una sigue su camino (Outbox si se firma, «No firmar» si no). Es lo mismo
 * que el botón «Descargar altas tempranas» del registro de Altas Masivas, empleadora por empleadora.
 *
 * CÓMO NO COLGAR A ARCA. La descarga ya va con cuidado (ver `constanciasAltas.ts`): una persona por vez,
 * pausa de 1,5 a 3 s entre personas, una pestaña por descarga, y lo que ARCA no entrega a tiempo se
 * vuelve a pedir al final (hasta 3 vueltas). ARCA no publica un tope de consultas, pero una corrida de
 * cientos seguidas es justo lo que la sesión no aguanta; por eso acá además hay un TOPE POR EMPLEADORA Y
 * POR CORRIDA (`MAX_POR_EMPLEADORA`): lo que sobra sale al día siguiente. Las empleadoras van en fila,
 * esperando el candado de ARCA entre una y otra (otra corrida en curso —altas, obras sociales— no se pisa).
 */

export const MAX_POR_EMPLEADORA = 40;
/** Cuánto se espera a que termine la descarga de una empleadora antes de seguir con la siguiente. */
const ESPERA_MAX_MS = 60 * 60_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ResumenEmpresaConstancias {
  empresa: string;
  pendientes: number;
  pedidas: number;
  listas: number;
  error?: string;
}

export interface ResumenDescargaConstancias {
  fecha: string;
  dia: string;
  empresas: ResumenEmpresaConstancias[];
  error?: string;
}

/**
 * La PRÓXIMA descarga automática: la de hoy si su hora no pasó y hoy todavía no corrió; si no, la de
 * mañana. ISO. `null` si está apagada.
 */
export function proximaDescarga(cfg: Pick<ConfigAltasAutomaticas, "hora" | "minuto">, activa: boolean, ultimoDia: string | undefined, ahora: Date, hoy: string): string | null {
  if (!activa) return null;
  const c = { ...cfg, diasAntes: 0 };
  const deHoy = momentoDeCorrida(hoy, c);
  if (deHoy.getTime() > ahora.getTime() && ultimoDia !== hoy) return deHoy.toISOString();
  return momentoDeCorrida(sumarDias(hoy, 1), c).toISOString();
}

/** Lo que está forzándose ahora (varias empleadoras en fila), para que la pantalla lo cuente. */
export interface ForzadoEnCurso {
  arrancadoEl: Date;
  total: number;
  empresas: string[];
  empresaActual: string;
  terminadas: number;
  listas: number;
  terminado: boolean;
  errores: string[];
}
const forzados = new Map<string, ForzadoEnCurso>();
export const forzadoDe = (tenantId: string): ForzadoEnCurso | undefined => forzados.get(tenantId);

/**
 * FORZAR LA DESCARGA de algunas (o todas) las pendientes, sin esperar la hora: se agrupan por empleadora
 * y van en fila, en segundo plano, con el mismo cuidado que la automática (ver arriba). Devuelve
 * enseguida; el avance se sigue con `forzadoDe` y con el estado de la descarga en curso.
 */
export async function forzarDescargaConstancias(tenantId: string, tenantObjectId: Types.ObjectId, tenantCarpeta: string, items: Array<{ userProjectId: string; contractIndex: number }>, usuarioId?: string | null): Promise<{ total: number; empresas: string[]; omitidas: number }> {
  if (!(await credencialesDe(tenantId))) throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
  const enCurso = forzados.get(tenantId);
  if (enCurso && !enCurso.terminado) throw new Error("Ya hay una descarga forzada en curso: esperá a que termine.");
  const empresas: any[] = await Company.find({}).select("razonSocial cuit").lean();
  const grupos: Array<{ empresaId: string; razonSocial: string; items: Array<{ userProjectId: string; contractIndex: number }> }> = [];
  let total = 0;
  for (const e of empresas) {
    if (String(e.cuit || "").replace(/\D/g, "").length !== 11) continue;
    const pendientes = await pendientesDeConstancia(tenantObjectId, String(e._id));
    const propios = pendientes.filter((p) => items.some((i) => i.userProjectId === p.userProjectId && Number(i.contractIndex) === p.contractIndex));
    if (propios.length === 0) continue;
    grupos.push({ empresaId: String(e._id), razonSocial: String(e.razonSocial || ""), items: propios.map((p) => ({ userProjectId: p.userProjectId, contractIndex: p.contractIndex })) });
    total += propios.length;
  }
  if (total === 0) throw new Error("Ninguna de las seleccionadas espera su constancia.");
  const estado: ForzadoEnCurso = { arrancadoEl: new Date(), total, empresas: grupos.map((g) => g.razonSocial), empresaActual: "", terminadas: 0, listas: 0, terminado: false, errores: [] };
  forzados.set(tenantId, estado);
  void (async () => {
    try {
      for (const g of grupos) {
        estado.empresaActual = g.razonSocial;
        if (!(await esperarCandadoLibre(tenantId, 30 * 60_000))) {
          estado.errores.push(`${g.razonSocial}: había otra corrida de ARCA en curso y no terminó en 30 minutos.`);
          continue;
        }
        try {
          await arrancarDescargaConstancias({ tenantId, tenantObjectId, tenantCarpeta, empresaId: g.empresaId, soloItems: g.items, usuarioId });
          const fin = Date.now() + ESPERA_MAX_MS;
          while (Date.now() < fin) {
            const d = descargaConstanciasDe(tenantId);
            if (!d || d.terminada) break;
            await esperar(4000);
          }
          const d = descargaConstanciasDe(tenantId);
          const ev: any = (d?.eventos || []).find((x: any) => x.tipo === "fin");
          const fallo: any = (d?.eventos || []).find((x: any) => x.tipo === "fallo");
          estado.listas += Number(ev?.listas || 0);
          if (fallo) estado.errores.push(`${g.razonSocial}: ${fallo.mensaje}`);
        } catch (err: any) {
          estado.errores.push(`${g.razonSocial}: ${String(err?.message || err)}`);
        }
        estado.terminadas++;
      }
    } finally {
      estado.terminado = true;
      estado.empresaActual = "";
    }
  })();
  return { total, empresas: estado.empresas, omitidas: items.length - total };
}

async function esperarCandadoLibre(tenantId: string, ms: number): Promise<boolean> {
  const fin = Date.now() + ms;
  while (quienTiene(tenantId)) {
    if (Date.now() > fin) return false;
    await esperar(5000);
  }
  return true;
}

/** La corrida del día de UN tenant. Devuelve el resumen que se guarda en el tenant y se muestra en la pantalla. */
export async function correrDescargaConstanciasDelDia(tenantId: string, tenantObjectId: Types.ObjectId, tenantCarpeta: string, dia: string): Promise<ResumenDescargaConstancias> {
  const resumen: ResumenDescargaConstancias = { fecha: new Date().toISOString(), dia, empresas: [] };
  if (!(await credencialesDe(tenantId))) {
    resumen.error = "Faltan las credenciales de ARCA (Configuración → ARCA → Conexión).";
    return resumen;
  }
  const empresas: any[] = await Company.find({}).select("razonSocial cuit").lean();
  for (const e of empresas) {
    const cuit = String(e.cuit || "").replace(/\D/g, "");
    if (cuit.length !== 11) continue;
    const pendientes = await pendientesDeConstancia(tenantObjectId, String(e._id));
    if (pendientes.length === 0) continue;
    const fila: ResumenEmpresaConstancias = { empresa: String(e.razonSocial || cuit), pendientes: pendientes.length, pedidas: 0, listas: 0 };
    resumen.empresas.push(fila);
    // Otra corrida de ARCA en curso (altas, obras sociales): se espera; si no se libera, esta empleadora queda para mañana.
    if (!(await esperarCandadoLibre(tenantId, 30 * 60_000))) {
      fila.error = "Había otra corrida de ARCA en curso y no terminó en 30 minutos.";
      continue;
    }
    try {
      const r = await arrancarDescargaConstancias({ tenantId, tenantObjectId, tenantCarpeta, empresaId: String(e._id), maximo: MAX_POR_EMPLEADORA, automatica: true });
      fila.pedidas = r.total;
      const fin = Date.now() + ESPERA_MAX_MS;
      while (Date.now() < fin) {
        const d = descargaConstanciasDe(tenantId);
        if (!d || d.terminada) break;
        await esperar(5000);
      }
      const d = descargaConstanciasDe(tenantId);
      const ev: any = (d?.eventos || []).find((x: any) => x.tipo === "fin");
      const fallo: any = (d?.eventos || []).find((x: any) => x.tipo === "fallo");
      fila.listas = Number(ev?.listas || 0);
      if (fallo) fila.error = String(fallo.mensaje || "La descarga falló.");
      else if (d && !d.terminada) fila.error = "La descarga no terminó en una hora: se sigue mañana.";
    } catch (err: any) {
      fila.error = String(err?.message || err);
    }
  }
  return resumen;
}
