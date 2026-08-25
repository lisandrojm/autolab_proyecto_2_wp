import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Company } from "../../models/Company.js";
import { aplicarLoteObrasSociales } from "../obrasSocialesLoteService.js";
import { abrirSesionArca, credencialesDe } from "./navegador.js";
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
const corridas = new Map();
export const corridaDe = (tenantId) => corridas.get(tenantId);
export const corriendo = (tenantId) => {
    const c = corridas.get(tenantId);
    return !!c && !c.terminada;
};
export function detenerCorrida(tenantId) {
    const c = corridas.get(tenantId);
    if (!c || c.terminada)
        return false;
    c.señal.cortada = true;
    return true;
}
/**
 * Arranca la corrida y vuelve enseguida.
 *
 * No se espera a que termine: son minutos, y un request HTTP colgado ese tiempo se corta solo en
 * cualquier proxy. El progreso se sigue por `corridaDe`.
 */
export async function arrancarCorrida(opts) {
    const { tenantId, tenantObjectId, empresaId, cuils, usuarioId } = opts;
    if (corriendo(tenantId))
        throw new Error("Ya hay una validación en curso.");
    if (cuils.length === 0)
        throw new Error("No hay ninguna persona para validar.");
    const cred = await credencialesDe(tenantId);
    if (!cred)
        throw new Error("Faltan las credenciales de ARCA. Cargalas en Configuración → ARCA → Conexión.");
    const empresa = await Company.findById(empresaId).select("cuit razonSocial").lean();
    const empresaCuit = String(empresa?.cuit || "").replace(/\D/g, "");
    if (empresaCuit.length !== 11)
        throw new Error("La empleadora no tiene CUIT cargado: sin eso no se puede elegir en ARCA.");
    const corrida = { tenantId, empresaId, total: cuils.length, eventos: [], terminada: false, señal: { cortada: false }, arrancadaEl: new Date() };
    corridas.set(tenantId, corrida);
    const emitir = (e) => corrida.eventos.push(e);
    // Sin `await`: la corrida sigue por su cuenta y este request vuelve ya.
    void (async () => {
        let sesion = null;
        try {
            emitir({ tipo: "abriendo" });
            sesion = await abrirSesionArca(tenantId, cred);
            const { validarObrasSociales } = (await import(MOTOR));
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
            if (r.items.length > 0) {
                emitir({ tipo: "guardando" });
                const aplicado = await aplicarLoteObrasSociales({
                    tenantObjectId,
                    empresaId,
                    filas: r.items,
                    origen: "panel",
                    usuarioId,
                });
                emitir({
                    tipo: "fin",
                    validadas: aplicado.aplicados,
                    faltaron: r.faltaron,
                    motivo: motivoDeQueFaltaran(r),
                    detalle: detalleDeLoAplicado(aplicado),
                });
            }
            else {
                emitir({ tipo: "fin", validadas: 0, faltaron: r.faltaron, motivo: motivoDeQueFaltaran(r), detalle: [] });
            }
        }
        catch (e) {
            emitir({ tipo: "fallo", mensaje: String(e?.message || e) });
        }
        finally {
            // El navegador lo abrió esta función, así que lo cierra esta función. Cada corrida que se
            // olvide de cerrarlo deja un Chromium vivo comiéndose la memoria del VPS.
            await sesion?.browser.close().catch(() => { });
            corrida.terminada = true;
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
function motivoDeQueFaltaran(r) {
    if (!r.faltaron)
        return "";
    if (r.sinSesion)
        return "Se cortó la sesión de ARCA, o se pidió detener la corrida.";
    if (r.errores?.length)
        return `ARCA no devolvió fila para ${r.errores.length} CUIL. Puede que no tengan relación laboral registrada con esta empleadora.`;
    return "La corrida terminó sin procesar a nadie y el motor no informó ningún error.";
}
/** Lo que el lote NO pudo aplicar, en frases. Es lo que hace falta para saber qué revisar. */
function detalleDeLoAplicado(r) {
    const l = [];
    if (r.sinContrato?.length)
        l.push(`${r.sinContrato.length} sin contrato en esta empleadora.`);
    if (r.yaBloqueados?.length)
        l.push(`${r.yaBloqueados.length} ya estaban validadas y no se pisaron.`);
    if (r.rnosDesconocido?.length)
        l.push(`${r.rnosDesconocido.length} con un código que no está en el catálogo de Obras Sociales.`);
    if (r.noRegistrada?.length)
        l.push(`${r.noRegistrada.length} con una obra social que la empleadora no tiene registrada ante ARCA: el organismo rechazaría el alta.`);
    return l;
}
