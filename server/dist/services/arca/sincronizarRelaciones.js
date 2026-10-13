import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { Company } from "../../models/Company.js";
import { abrirSesionArca, credencialesDe, guardarSesion, revalidarSesionArca } from "./navegador.js";
import { dejarSesionTibia, tomarSesionTibia } from "./sesionTibia.js";
import { soltarCandado, tomarCandado } from "./candadoArca.js";
import { MOTOR_RELACIONES, RAIZ_REPO } from "./motor.js";
import { parsearBytesRelaciones } from "../../compartido/arca/relacionesLaboralesTxt.js";
import { cuilsConRelacionAbierta, guardarRelaciones, recalcularAntiguedad } from "./relacionesArcaStore.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
const enCurso = new Map();
/** La corrida en curso de ese tenant, o `null`. Lo lee la pantalla mientras espera. */
export const syncEnCurso = (tenantId) => enCurso.get(tenantId) || null;
const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const CARPETA_HTML = resolve(RAIZ_REPO, "server/tmp/arca-relaciones");
/** Los últimos `n` meses contando el de `hoy`: "2026-10-12", 2 → ["2026-10", "2026-09"]. */
export function mesesAtras(hoy, n) {
    const [a, m] = hoy.split("-").map(Number);
    const out = [];
    for (let i = 0; i < Math.max(1, Math.min(24, Math.floor(n))); i++) {
        const d = new Date(Date.UTC(a, m - 1 - i, 1));
        out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
}
export async function sincronizarRelacionesTenant(tenantId, o = {}) {
    // El candado se toma antes de cualquier `await`: dos pedidos simultáneos no pasan los dos.
    tomarCandado(tenantId, "relaciones");
    const estado = { desde: new Date(), automatica: !!o.automatica, progreso: [] };
    enCurso.set(tenantId, estado);
    const avisar = (s) => { estado.progreso.push(s); if (estado.progreso.length > 200)
        estado.progreso.shift(); };
    const inicio = Date.now();
    const hoy = hoyArgentina();
    const meses = mesesAtras(hoy, o.meses ?? 1);
    const resumen = { fecha: new Date().toISOString(), hoy, meses, automatica: !!o.automatica, empresas: [], cuilsRecalculados: 0, filasAntiguedad: 0, duracionMs: 0 };
    const tenantObjectId = new Types.ObjectId(tenantId);
    let sesion = null;
    let error;
    let sesionCaida = false;
    try {
        const cred = await credencialesDe(tenantId);
        if (!cred)
            throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
        // Las empresas son globales en esta instalación (Company no tiene tenantId): todas las que tengan CUIT.
        const empresas = (await Company.find({ cuit: { $exists: true, $ne: "" } }).select("cuit razonSocial").sort({ razonSocial: 1 }).lean()).filter((e) => soloDigitos(e.cuit).length === 11);
        if (empresas.length === 0)
            throw new Error("No hay ninguna empresa con CUIT de 11 dígitos cargado.");
        const abrir = async (motivo) => {
            if (motivo === "inicio") {
                const tibia = await tomarSesionTibia(tenantId, revalidarSesionArca);
                if (tibia) {
                    sesion = tibia;
                    avisar("Sesión de ARCA reutilizada");
                    return;
                }
            }
            avisar(motivo === "inicio" ? "Abriendo sesión en ARCA…" : `La sesión se cayó: abriendo otra (${motivo})`);
            sesion = await abrirSesionArca(tenantId, cred);
        };
        await abrir("inicio");
        const motor = (await import(pathToFileURL(MOTOR_RELACIONES).href));
        const cuilsTocados = new Set();
        /**
         * UNA SESIÓN POR EMPLEADORA. Volver al selector de CUIT estando ya adentro hace que ARCA cierre la
         * sesión (comprobado el 2026-10-12: cayó al pasar a la segunda y a la tercera empleadora). Así que
         * cambiar de empleadora es cerrar el navegador y abrir otra sesión (~10 s): no es una caída, es el
         * camino. La sesión tibia sólo sirve si quedó parada en el selector.
         */
        const sesionEnElSelector = async (motivo) => {
            const enSelector = !!sesion && !sesion.page.isClosed() && /\/login\/IndexContribuyente\.aspx/i.test(sesion.page.url());
            if (enSelector)
                return;
            await sesion?.browser.close().catch(() => { });
            sesion = null;
            await abrir(motivo);
        };
        /** Una caída de verdad (a mitad de una consulta) se reintenta UNA vez por empleadora. */
        const reabrir = async (motivo) => {
            await sesion?.browser.close().catch(() => { });
            sesion = null;
            await abrir(motivo);
        };
        for (const e of empresas) {
            const cuit = soloDigitos(e.cuit);
            const re = { cuit, razonSocial: String(e.razonSocial || ""), meses: [], nuevas: 0, actualizadas: 0, bajasAplicadas: 0, sinCambios: 0 };
            resumen.empresas.push(re);
            let reabiertaParaEsta = false;
            try {
                avisar(`${re.razonSocial}: eligiendo la empleadora en ARCA`);
                await sesionEnElSelector(`cambio de empleadora: ${re.razonSocial}`);
                try {
                    await motor.entrarComoEmpleadora(sesion.page, cuit);
                }
                catch (err) {
                    if (String(err?.message) !== "sin_sesion")
                        throw err;
                    reabiertaParaEsta = true;
                    await reabrir("al elegir la empleadora");
                    await motor.entrarComoEmpleadora(sesion.page, cuit);
                }
                for (const mes of meses) {
                    avisar(`${re.razonSocial}: consultando los movimientos de ${mes}`);
                    const onProgreso = (p) => { if (p?.tipo === "pagina")
                        avisar(`${re.razonSocial} · ${mes}: página ${p.numero}`); };
                    let r = await motor.consultarMovimientosDelMes({ page: sesion.page, mes, onProgreso });
                    if (r.resultado === "sin_sesion") {
                        if (reabiertaParaEsta) {
                            sesionCaida = true;
                            throw new Error(`La sesión de ARCA se cayó dos veces con ${re.razonSocial} (consultando ${mes}). Se deja esta empleadora para la próxima corrida.`);
                        }
                        reabiertaParaEsta = true;
                        await reabrir(`consultando ${mes}`);
                        await motor.entrarComoEmpleadora(sesion.page, cuit);
                        r = await motor.consultarMovimientosDelMes({ page: sesion.page, mes, onProgreso });
                    }
                    if (r.resultado === "sin_datos") {
                        re.meses.push({ mes, resultado: "sin_datos", paginas: 0, filas: 0, descartes: 0 });
                        continue;
                    }
                    if (r.resultado !== "ok") {
                        const ruta = await guardarHtml(tenantId, cuit, mes, r.html);
                        resumen.htmlGuardado = ruta;
                        throw new Error(`ARCA mostró una pantalla que el motor no reconoce (${r.detalle}). ${ruta ? `El HTML quedó en ${ruta}.` : ""}`);
                    }
                    // Una página «redonda» (múltiplo de 30) sin paginador detectado puede ser un paginador que no
                    // se reconoció: se guarda la pantalla para mirarla, sin frenar nada.
                    if (r.htmlDiagnostico) {
                        const ruta = await guardarHtml(tenantId, cuit, `${mes}_paginador`, r.htmlDiagnostico);
                        if (ruta) {
                            resumen.htmlGuardado = ruta;
                            avisar(`${re.razonSocial} · ${mes}: ${r.paginas.length} página(s) y no vi paginador; guardé la pantalla en ${ruta}`);
                        }
                    }
                    let filas = [];
                    let descartes = 0;
                    for (const pagina of r.paginas) {
                        const p = parsearBytesRelaciones(new Uint8Array(pagina));
                        filas = filas.concat(p.filas);
                        descartes += p.descartes.length;
                    }
                    const g = await guardarRelaciones({ tenantId: tenantObjectId, empleadoraCuit: cuit, empleadoraCompanyId: e._id, filas, origen: "sync", modo: "sync" });
                    for (const c of g.cuilsTocados)
                        cuilsTocados.add(c);
                    re.nuevas += g.nuevas;
                    re.actualizadas += g.actualizadas;
                    re.bajasAplicadas += g.bajasAplicadas;
                    re.sinCambios += g.sinCambios;
                    re.meses.push({ mes, resultado: "ok", paginas: r.paginas.length, filas: filas.length, descartes });
                    avisar(`${re.razonSocial} · ${mes}: ${filas.length} movimientos → ${g.nuevas} nuevas, ${g.actualizadas} actualizadas (${g.bajasAplicadas} bajas)`);
                }
            }
            catch (err) {
                re.error = String(err?.message || err);
                avisar(`${re.razonSocial}: ${re.error}`);
                // Una pantalla desconocida va a repetirse con la empleadora siguiente: se corta. Lo demás (una
                // sesión que se cayó dos veces, un CUIT que el delegado no tiene) es de ESTA empleadora: se sigue
                // con la próxima, y lo que quedó se reintenta en la corrida siguiente.
                if (resumen.htmlGuardado && /no reconoce/.test(re.error))
                    throw err;
                sesionCaida = false;
            }
        }
        if (resumen.empresas.some((x) => x.error))
            resumen.error = `Con error: ${resumen.empresas.filter((x) => x.error).map((x) => x.razonSocial).join(", ")}. Lo demás se sincronizó.`;
        avisar("Recalculando la antigüedad…");
        const abiertas = await cuilsConRelacionAbierta(tenantObjectId);
        const aRecalcular = new Set([...cuilsTocados, ...abiertas]);
        resumen.cuilsRecalculados = aRecalcular.size;
        resumen.filasAntiguedad = await recalcularAntiguedad(tenantObjectId, aRecalcular, hoy);
    }
    catch (e) {
        error = String(e?.message || e);
        resumen.error = error;
    }
    finally {
        resumen.duracionMs = Date.now() - inicio;
        const s = sesion;
        const sana = !!s && !error && !sesionCaida;
        if (sana)
            await guardarSesion(tenantId, s.ctx).catch(() => { });
        if (!(sana && dejarSesionTibia(tenantId, s)))
            await s?.browser.close().catch(() => { });
        await Tenant.updateOne({ _id: tenantObjectId }, { $set: { "integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync": resumen } }).catch(() => { });
        enCurso.delete(tenantId);
        soltarCandado(tenantId, "relaciones");
    }
    return resumen;
}
async function guardarHtml(tenantId, cuit, mes, html) {
    if (!html || typeof html !== "string")
        return undefined;
    try {
        await mkdir(CARPETA_HTML, { recursive: true });
        const ruta = resolve(CARPETA_HTML, `${new Date().toISOString().replace(/[:.]/g, "-")}_${tenantId}_${cuit}_${mes}.html`);
        await writeFile(ruta, html, "utf8");
        return ruta;
    }
    catch {
        return undefined;
    }
}
