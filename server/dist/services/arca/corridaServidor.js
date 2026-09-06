import { Company } from "../../models/Company.js";
import { ArcaObrasSocialesLog } from "../../models/ArcaObrasSocialesLog.js";
import { aplicarLoteObrasSociales } from "../obrasSocialesLoteService.js";
import { abrirSesionArca, credencialesDe } from "./navegador.js";
import { aplicarNombreDeArca, confirmarNombresConElPadron, mismoNombre } from "./nombreArca.js";
import { User } from "../../models/User.js";
import { MOTOR } from "./motor.js";
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
    const { tenantId, tenantObjectId, empresaId, cuils, usuarioId, userIds = [] } = opts;
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
    /*
      EL NOMBRE SE COMPARA CON EL QUE YA TRAJO LA PANTALLA.
  
      ARCA precompleta el nombre en el mismo bloque del que se lee la obra social, así que el motor lo
      devuelve en el mismo evento (ver `leerFilas`). Comparar acá no cuesta ninguna consulta: es un
      string contra otro, en memoria, mientras la corrida sigue.
  
      Solo los que DIFIEREN van al padrón, y solo al final — porque para escribir el nombre hacen falta
      apellido y nombre por separado, y la pantalla los muestra pegados.
    */
    const personas = await User.find({ _id: { $in: userIds }, tenantId: tenantObjectId })
        .select("_id firstName lastName metadata.cuit metadata.nombreValidadoArcaAt")
        .lean();
    const porCuil = new Map(personas.map((u) => [String(u?.metadata?.cuit || "").replace(/\D/g, ""), u]));
    const nombresOk = [];
    const nombresQueDifieren = new Map(); // userId → cuil
    /**
     * El nombre que la PANTALLA mostró para cada CUIL. Se guarda para todos, no solo para los que difieren.
     *
     * Es lo que permite validar sin el padrón: el organismo ya lo dijo en la misma consulta de la que
     * salió la obra social. Ver el bloque que lo usa, después del padrón.
     */
    const nombreDePantalla = new Map(); // cuil en dígitos → nombre
    /** Los que el padrón resolvió: no se vuelven a tocar con el nombre de la pantalla. */
    const resueltosPorPadron = new Set();
    const emitir = (e) => {
        if (e.tipo === "resultado" && e.nombreArca) {
            const u = porCuil.get(String(e.cuil).replace(/\D/g, ""));
            // Se guarda SIEMPRE, coincida o no: es el nombre que dio el organismo, y con él se valida
            // después a los que el padrón no puede resolver (los de CUIT inactivo).
            nombreDePantalla.set(String(e.cuil).replace(/\D/g, ""), e.nombreArca);
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
                if (ok)
                    nombresOk.push(String(e.cuil).replace(/\D/g, ""));
                else
                    nombresQueDifieren.set(String(u._id), String(e.cuil).replace(/\D/g, ""));
            }
        }
        corrida.eventos.push(e);
    };
    // Sin `await`: la corrida sigue por su cuenta y este request vuelve ya.
    void (async () => {
        let sesion = null;
        let renombrados = [];
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
            error: undefined,
        };
        try {
            emitir({ tipo: "abriendo" });
            sesion = await abrirSesionArca(tenantId, cred);
            log.seLogueo = sesion.seLogueo;
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
            // `rnos` vacío no es un error: ARCA contestó que esa persona no tiene afiliación propia y rige
            // la del convenio. Se cuenta aparte para que no infle ni los aciertos ni las fallas.
            log.validadas = r.items.filter((i) => i.rnos).length;
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
                for (const c of r2.confirmados)
                    resueltosPorPadron.add(String(c).replace(/\D/g, ""));
                for (const x of r2.renombrados)
                    if (x.cuil)
                        resueltosPorPadron.add(String(x.cuil).replace(/\D/g, ""));
            }
            /*
              EL NOMBRE DE LA PANTALLA TAMBIÉN VALIDA. Es el mismo organismo diciendo la misma cosa.
      
              Cierra dos huecos que dejaba apoyarse solo en el padrón:
      
              1. EL QUE YA COINCIDÍA no recibía el sello. La pantalla de ARCA mostró su nombre, se comparó
                 y dio igual —una confirmación del organismo, no una suposición—, pero como no iba al padrón
                 nadie escribía `nombreValidadoArcaAt`. En Usuarios seguía diciendo «Validar» y la corrida
                 siguiente lo volvía a mirar, para llegar a la misma conclusión.
      
              2. EL CUIT INACTIVO quedaba sin resolver. El padrón contesta esos con un fault y no devuelve
                 nada, así que su nombre no se podía confirmar por ningún lado — aunque la pantalla de altas
                 lo estaba mostrando, que es de donde salió el `nombreArca` que ya tenemos en memoria.
      
              NO PARTE NADA. `aplicarNombreDeArca` con el nombre en UN solo campo solo escribe si las
              palabras son exactamente las que ya están guardadas: ahí adopta la grafía de ARCA —«martina
              moreno» queda «MARTINA MORENO»— sin decidir dónde termina el apellido. Si no coinciden no
              toca nada y el caso queda para que alguien lo mire, que es lo correcto: «DEL VALLE ROJAS ANA»
              no se puede separar sin equivocarse.
      
              No cuesta ninguna consulta: el nombre ya vino en el evento, junto con la obra social.
            */
            for (const [cuilDigitos, nombreArca] of nombreDePantalla) {
                const u = porCuil.get(cuilDigitos);
                if (!u)
                    continue;
                /*
                  Se saltean solo dos: el que YA tenía el sello de antes —re-sellarlo movería una fecha que
                  significa «cuándo lo confirmó ARCA» sin que ARCA haya dicho nada nuevo— y el que el padrón
                  acaba de resolver, que además lo resolvió mejor (nombre y apellido por separado).
        
                  El que coincidía y NO estaba sellado no entra en ninguna de las dos: ese es el hueco.
                */
                if (u?.metadata?.nombreValidadoArcaAt)
                    continue;
                if (resueltosPorPadron.has(cuilDigitos))
                    continue;
                const cambio = await aplicarNombreDeArca({
                    tenantObjectId,
                    userId: String(u._id),
                    cuil: cuilDigitos,
                    actual: { firstName: u.firstName, lastName: u.lastName },
                    // En UN campo, tal como lo muestra la pantalla. Ver el bloque de arriba.
                    arca: { apellido: nombreArca },
                });
                if (cambio)
                    renombrados.push(cambio);
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
            }
            else {
                emitir({ tipo: "fin", validadas: 0, faltaron: r.faltaron, motivo: motivoDeQueFaltaran(r), detalle: [] });
            }
        }
        catch (e) {
            log.error = String(e?.message || e);
            emitir({ tipo: "fallo", mensaje: log.error });
        }
        finally {
            // El navegador lo abrió esta función, así que lo cierra esta función. Cada corrida que se
            // olvide de cerrarlo deja un Chromium vivo comiéndose la memoria del VPS.
            await sesion?.browser.close().catch(() => { });
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
            }).catch(() => { });
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
/**
 * Qué contestó ARCA para cada persona, sacado de los eventos de la corrida.
 *
 * Se arma de los eventos y no del resultado final porque los eventos existen aunque la corrida se
 * caiga: si se cortó la sesión en la persona doce, quedan las once que sí se leyeron.
 */
function detallePorPersona(eventos) {
    const out = [];
    for (const e of eventos) {
        if (e.tipo === "resultado")
            out.push({ cuil: e.cuil, rnos: e.rnos });
        else if (e.tipo === "error")
            out.push({ cuil: e.cuil, error: e.motivo || "ARCA no devolvió fila." });
    }
    return out;
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
