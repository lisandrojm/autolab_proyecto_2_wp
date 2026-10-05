import { Types } from "mongoose";
import { pathToFileURL } from "node:url";
import fs from "fs";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { abrirSesionArca, credencialesDe, guardarSesion } from "./navegador.js";
import { MOTOR, MOTOR_ALTAS } from "./motor.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
import { guardarPdfDeAlta, registrarAltaDeContrato } from "../altaTempranaService.js";

/**
 * BAJAR DE ARCA LAS CONSTANCIAS DE ALTA TEMPRANA de lo ya presentado, y mandarlas a donde va cada
 * una (Outbox si se firma, «Alta temprana de Arca/No firmar» si no).
 *
 * Es lo que antes se hacía a mano: Relaciones Laborales → Consultas → por CUIL → tildar la relación →
 * ícono de impresora, persona por persona. SOLO LEE en ARCA.
 *
 * Mismo mecanismo que las otras corridas: arranca, vuelve enseguida, se sigue por eventos, y toma el
 * candado de ARCA del tenant (una sola sesión por vez). Va de a una persona y con pausa.
 *
 * Cada PDF pasa por `registrarAltaDeContrato`, el mismo camino que la subida a mano: si no es la
 * constancia de ALTA de ese contrato (ARCA entrega la de BAJA cuando la relación ya tiene cese) no se
 * guarda ni se envía, y queda dicho por qué.
 */
export type EventoConstancias =
  | { tipo: "abriendo" }
  | { tipo: "sesion"; seLogueo: boolean }
  | { tipo: "persona"; cuil: string; nombre: string; estado: "descargando" | "lista" | "rechazada" | "sin_constancia" | "error"; detalle?: string }
  | { tipo: "fin"; listas: number; total: number }
  | { tipo: "fallo"; mensaje: string };

interface DescargaConstancias {
  empresaId: string;
  empresaRazonSocial: string;
  total: number;
  eventos: EventoConstancias[];
  terminada: boolean;
  arrancadaEl: Date;
}

interface Pendiente {
  userProjectId: string;
  contractIndex: number;
  userId: string;
  cuil: string;
  nombre: string;
  /** ddmmaaaa, como lo muestra ARCA sin las barras. */
  fechaInicio: string;
}

/** Una por tenant, en memoria, como las demás corridas de ARCA. */
const descargas = new Map<string, DescargaConstancias>();
export const descargaConstanciasDe = (tenantId: string): DescargaConstancias | undefined => descargas.get(tenantId);

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const pausa = () => new Promise<void>((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1500)));

/** Los contratos de esa empleadora presentados en ARCA que todavía no tienen su constancia validada. */
export async function pendientesDeConstancia(tenantObjectId: any, empresaId: string): Promise<Pendiente[]> {
  if (!Types.ObjectId.isValid(empresaId)) return [];
  const proyectos = await Project.find({ tenantId: tenantObjectId }).select("_id").lean();
  const ups: any[] = await UserProject.find({
    projectId: { $in: proyectos.map((p: any) => p._id) },
    contracts: { $elemMatch: { empresaContratoId: { $in: [new Types.ObjectId(empresaId), empresaId] }, "altaArcaPresentada.resultado": "presentada" } },
  })
    .select("userId contracts.empresaContratoId contracts.altaArcaPresentada contracts.altaConstancia contracts.fecha_alta_contrato")
    .lean();
  const usuarios: any[] = await User.find({ _id: { $in: ups.map((u) => u.userId) }, tenantId: tenantObjectId }).select("firstName lastName metadata.cuit").lean();
  const porId = new Map(usuarios.map((u) => [String(u._id), u]));
  const out: Pendiente[] = [];
  for (const up of ups) {
    (up.contracts || []).forEach((c: any, i: number) => {
      if (String(c.empresaContratoId || "") !== empresaId || c.altaArcaPresentada?.resultado !== "presentada" || c.altaConstancia?.validadaEl) return;
      const u = porId.get(String(up.userId));
      const cuil = digitos(u?.metadata?.cuit);
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c.fecha_alta_contrato || ""));
      if (cuil.length !== 11 || !m) return;
      out.push({ userProjectId: String(up._id), contractIndex: i, userId: String(up.userId), cuil, nombre: `${u?.firstName || ""} ${u?.lastName || ""}`.trim(), fechaInicio: `${m[3]}${m[2]}${m[1]}` });
    });
  }
  return out;
}

export async function arrancarDescargaConstancias(o: { tenantId: string; tenantObjectId: any; tenantCarpeta: string; empresaId: string }): Promise<{ total: number }> {
  const { tenantId, tenantObjectId } = o;
  // El candado ANTES de cualquier await, como en las altas: dos clicks no arrancan dos corridas.
  tomarCandado(tenantId, "constancias");
  try {
    const empresa: any = Types.ObjectId.isValid(o.empresaId) ? await Company.findById(o.empresaId).select("cuit razonSocial").lean() : null;
    const cuit = digitos(empresa?.cuit);
    if (!empresa || cuit.length !== 11) throw new Error("Elegí la pestaña de UNA empresa con CUIT: las constancias se bajan logueado como esa empleadora.");
    const pendientes = await pendientesDeConstancia(tenantObjectId, o.empresaId);
    if (pendientes.length === 0) throw new Error("No hay altas presentadas de esa empleadora esperando su constancia.");
    const cred = await credencialesDe(tenantId);
    if (!cred) throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
    const d: DescargaConstancias = { empresaId: o.empresaId, empresaRazonSocial: String(empresa.razonSocial || ""), total: pendientes.length, eventos: [], terminada: false, arrancadaEl: new Date() };
    descargas.set(tenantId, d);
    void correr({ d, pendientes, cuit, cred, ...o });
    return { total: pendientes.length };
  } catch (e) {
    soltarCandado(tenantId, "constancias");
    throw e;
  }
}

async function correr(o: { d: DescargaConstancias; pendientes: Pendiente[]; cuit: string; cred: NonNullable<Awaited<ReturnType<typeof credencialesDe>>>; tenantId: string; tenantObjectId: any; tenantCarpeta: string }) {
  const { d, pendientes, tenantId, tenantObjectId } = o;
  const emitir = (e: EventoConstancias) => d.eventos.push(e);
  let sesion: Awaited<ReturnType<typeof abrirSesionArca>> | null = null;
  let fallo = false;
  let listas = 0;
  try {
    emitir({ tipo: "abriendo" });
    sesion = await abrirSesionArca(tenantId, o.cred);
    emitir({ tipo: "sesion", seLogueo: sesion.seLogueo });
    const { aceptarSelectorDeCuit } = (await import(pathToFileURL(MOTOR).href)) as any;
    const motor = (await import(pathToFileURL(MOTOR_ALTAS).href)) as any;
    let page = sesion.page;
    // Por el selector se entra UNA vez: volver a él estando adentro cierra la sesión de ARCA.
    if (!(await aceptarSelectorDeCuit(page, o.cuit))) throw new Error(`No pude elegir la empleadora ${o.cuit} en ARCA (¿el usuario delegado la tiene?).`);
    const base = page.url().split("/app/")[0];
    /*
      LA PESTAÑA SE CAE A VECES AL SALIR DE LA PANTALLA DEL SELECTOR («Page crashed»), vaya a donde
      vaya: pasó yendo a Consultas y pasó yendo a Registrar Nuevas Altas. La sesión y la empleadora
      elegida viven en el navegador (cookies) y en ARCA, no en la pestaña: se abre OTRA pestaña del
      mismo navegador y se sigue desde ahí. No se vuelve a loguear ni se toca el selector.

      Es solo lectura, así que reintentar acá no repite nada en el organismo. Hasta 3 pestañas.
    */
    const seCayo = (e: any) => /crash|Target (page|closed)|page has been closed/i.test(String(e?.message || e));
    let pestañasNuevas = 0;
    const otraPestaña = async () => {
      if (++pestañasNuevas > 3) throw new Error("La pestaña de ARCA se cayó cuatro veces seguidas. Probá de nuevo en unos minutos.");
      await page.close().catch(() => {});
      page = await sesion!.ctx.newPage();
      await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
    };
    const conPestañaViva = async <T>(hacer: () => Promise<T>): Promise<T> => {
      for (;;) {
        try {
          return await hacer();
        } catch (e) {
          if (!seCayo(e)) throw e;
          // Si la pestaña nueva también se cae al abrir, se vuelve a intentar (hasta el tope).
          for (;;) {
            try {
              await otraPestaña();
              break;
            } catch (e2) {
              if (!seCayo(e2)) throw e2;
            }
          }
        }
      }
    };
    // Se le da un respiro a la pantalla del selector antes de salir de ella, y recién después se navega.
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1500).catch(() => {});
    await conPestañaViva(() => motor.entrarARelacionesLaborales({ page }));

    for (const [i, p] of pendientes.entries()) {
      if (i > 0) await pausa();
      emitir({ tipo: "persona", cuil: p.cuil, nombre: p.nombre, estado: "descargando" });
      try {
        const r = await conPestañaViva<any>(() => motor.descargarConstanciaDeAlta({ page, cuil: p.cuil, fechaInicio: p.fechaInicio }));
        if (r.resultado !== "descargada" || !r.pdf) {
          // Lo que la pantalla tenía queda en el log del servidor: con eso se ajusta el lector.
          console.warn(`[CONSTANCIAS-ARCA] ${p.cuil}: ${r.resultado} — ${r.detalle || ""}`);
          emitir({ tipo: "persona", cuil: p.cuil, nombre: p.nombre, estado: "sin_constancia", detalle: r.detalle || "ARCA no mostró la constancia de esa relación." });
          continue;
        }
        const buffer: Buffer = Buffer.from(r.pdf);
        const up = await UserProject.findById(p.userProjectId);
        if (!up || !up.contracts[p.contractIndex]) throw new Error("El contrato ya no existe.");
        const guardado = await guardarPdfDeAlta({ tenantCarpeta: o.tenantCarpeta, userId: p.userId, buffer });
        const res = await registrarAltaDeContrato({ tenantObjectId, up, idx: p.contractIndex, userId: p.userId, buffer, altaDocumentoUrl: guardado.url, altaDocumentoNombre: `Constancia de alta ${p.cuil}.pdf`, exigirConstancia: true });
        if ("problemas" in res) {
          fs.promises.unlink(guardado.ruta).catch(() => {});
          emitir({ tipo: "persona", cuil: p.cuil, nombre: p.nombre, estado: "rechazada", detalle: res.problemas.join(" ") });
          continue;
        }
        listas++;
        const destino = !res.ruteo?.archivadaEn ? res.ruteo?.aviso || "Quedó cargada en el contrato." : res.ruteo.vaAFirma ? "En el Outbox, lista para enviar a firmar." : "Archivada en «Alta temprana de Arca / No firmar».";
        emitir({ tipo: "persona", cuil: p.cuil, nombre: p.nombre, estado: "lista", detalle: `${destino}${res.ruteo?.estado ? ` El contrato pasó a «${res.ruteo.estado}».` : ""}` });
      } catch (e: any) {
        const mensaje = String(e?.message || e);
        emitir({ tipo: "persona", cuil: p.cuil, nombre: p.nombre, estado: "error", detalle: mensaje });
        // Sesión caída o pantalla que no es: no tiene sentido seguir con los demás.
        if (/sesi[oó]n|No llegu[eé]|Target closed|browser has been closed|crash/i.test(mensaje)) throw e;
      }
    }
    emitir({ tipo: "fin", listas, total: pendientes.length });
  } catch (e: any) {
    fallo = true;
    emitir({ tipo: "fallo", mensaje: String(e?.message || e) });
  } finally {
    const s: any = sesion;
    if (s && !fallo) await guardarSesion(tenantId, s.ctx).catch(() => {});
    await s?.browser.close().catch(() => {});
    soltarCandado(tenantId, "constancias");
    d.terminada = true;
  }
}
