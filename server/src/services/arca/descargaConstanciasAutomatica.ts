import { Types } from "mongoose";
import { Company } from "../../models/Company.js";
import { arrancarDescargaConstancias, descargaConstanciasDe, pendientesDeConstancia } from "./constanciasAltas.js";
import { quienTiene } from "./candadoArca.js";
import { credencialesDe } from "./navegador.js";

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
      const r = await arrancarDescargaConstancias({ tenantId, tenantObjectId, tenantCarpeta, empresaId: String(e._id), maximo: MAX_POR_EMPLEADORA });
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
