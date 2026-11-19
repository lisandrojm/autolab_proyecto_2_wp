/**
 * SINCRONIZAR BAJAS DE ARCA A LOS CONTRATOS (etapa 3, paso 2, 19/11/2026).
 *
 * Lleva al CONTRATO las bajas que ARCA ya tiene en el espejo de Relaciones Laborales, sólo con evidencia
 * fuerte (`utils/bajasArcaContrato.ts`: misma persona, empleadora y fecha de alta exacta). Lo usan la
 * migración (`scripts/persistirBajasArca.ts`) y el botón «Sincronizar bajas» de la pestaña Antigüedad
 * ARCA: los dos primero miran (`planDeBajasArca`) y después aplican (`aplicarBajasArca`), que vuelve a
 * calcular el plan en el server —nunca escribe lo que mande el cliente— y escribe sólo lo que sigue igual
 * que cuando se calculó (la baja vieja va en el filtro).
 *
 * Lee el ESPEJO, no ARCA: lo que ARCA cambió después de la última sincronización de relaciones no está.
 * Por eso el plan dice cuándo fue esa sincronización.
 *
 * Cada escritura pasa por el modelo, así que queda en la auditoría de contratos con quién la hizo, y el
 * contrato guarda `origenBaja: "ARCA_SYNC"` y `bajaArca` (fin, situación de baja, empleadora y la baja que
 * tenía antes). El estado del contrato se recalcula con la baja nueva.
 */
import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { Tenant } from "../../models/Tenant.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { fechaISO, hoyArgentina } from "../../utils/contratoVigencia.js";
import { bajaConFormatoDelAlta, cambioDeBajaSegunArca } from "../../utils/bajasArcaContrato.js";
import { enContexto } from "../../utils/contextoAuditoria.js";
import { estadoAlEscribir } from "../estadoContratoAlGuardar.js";
const dig = (v) => String(v ?? "").replace(/\D/g, "");
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const fechaDe = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(v));
export async function planDeBajasArca(tenantId, opciones = {}) {
    const tid = new Types.ObjectId(String(tenantId));
    const hoy = hoyArgentina();
    const filtroUsuarios = { tenantId: tid, "metadata.cuit": { $exists: true, $nin: ["", null] } };
    if (opciones.userIds?.length)
        filtroUsuarios._id = { $in: opciones.userIds.filter((x) => Types.ObjectId.isValid(x)).map((x) => new Types.ObjectId(x)) };
    const usuarios = await User.find(filtroUsuarios).select("firstName lastName metadata.cuit").lean();
    const porUsuario = new Map(usuarios.filter((u) => dig(u.metadata?.cuit).length === 11).map((u) => [String(u._id), u]));
    const cuils = [...new Set([...porUsuario.values()].map((u) => dig(u.metadata.cuit)))];
    const [ups, empresas, rels, t] = await Promise.all([
        // Sin filtrar por empleadora acá: en un array, `contracts.empresaContratoId: {$ne: null}` exige que
        // NINGÚN contrato la tenga vacía, y una lápida (sin datos) dejaba afuera el vínculo entero (Barbona).
        UserProject.find({ userId: { $in: [...porUsuario.keys()].map((x) => new Types.ObjectId(x)) } })
            .select("userId nombre_proyecto contracts.contratoKey contracts.estadoContrato contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.empresaContratoId contracts.nombre_contrato")
            .lean(),
        Company.find({}).select("cuit razonSocial").lean(),
        cuils.length ? RelacionLaboralArca.find({ tenantId: tid, cuil: { $in: cuils } }).select("-_id cuil empleadoraCuit fechaInicio fechaFin situacionBaja").lean() : Promise.resolve([]),
        Tenant.findById(tid).select("integrations.arcaSimplificacion.sincronizacionRelaciones.ultimaSync.fecha").lean(),
    ]);
    const empresa = new Map(empresas.map((e) => [String(e._id), { cuit: dig(e.cuit), nombre: String(e.razonSocial || "") }]));
    const relaciones = rels.map((r) => ({ cuil: r.cuil, empleadoraCuit: r.empleadoraCuit, inicio: iso(r.fechaInicio), fin: iso(r.fechaFin), situacionBaja: r.situacionBaja || "" }));
    const relsPorCuil = new Map();
    for (const r of relaciones)
        (relsPorCuil.get(r.cuil) || relsPorCuil.set(r.cuil, []).get(r.cuil)).push(r);
    const items = [];
    for (const up of ups) {
        const u = porUsuario.get(String(up.userId));
        if (!u)
            continue;
        const cuil = dig(u.metadata.cuit);
        const suyas = relsPorCuil.get(cuil) || [];
        if (!suyas.length)
            continue;
        (up.contracts || []).forEach((c, i) => {
            if (!c?.contratoKey || !c.empresaContratoId)
                return;
            const e = empresa.get(String(c.empresaContratoId));
            if (!e)
                return;
            const cambio = cambioDeBajaSegunArca(c, cuil, e.cuit, suyas, hoy);
            if (!cambio)
                return;
            items.push({
                userProjectId: String(up._id),
                userId: String(up.userId),
                persona: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
                cuil,
                proyecto: up.nombre_proyecto || "",
                contratoKey: String(c.contratoKey),
                posicion: i,
                contrato: c.nombre_contrato || "",
                alta: fechaDe(c.fecha_alta_contrato),
                empleadora: e.nombre,
                empleadoraCuit: e.cuit,
                bajaCruda: c.fecha_baja_contrato ?? null,
                altaCruda: c.fecha_alta_contrato,
                ...cambio,
            });
        });
    }
    const resumen = { baja_nueva: 0, baja_por_tramos: 0, baja_anterior: 0, arca_granularidad: 0, revision_manual: 0, arca_posterior: 0, arca_abierta: 0 };
    for (const x of items)
        resumen[x.tipo]++;
    items.sort((a, b) => Number(b.aplicar) - Number(a.aplicar) || a.persona.localeCompare(b.persona));
    return { hoy, espejoAl: t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones?.ultimaSync?.fecha || null, items, resumen };
}
/**
 * Escribe las bajas del plan que se aplican. `claves`: sólo esos contratos (por `contratoKey`); sin
 * `claves`, todos los aplicables. Devuelve qué se escribió y qué no (porque cambió en el medio).
 */
export async function aplicarBajasArca(tenantId, opciones = {}) {
    const plan = await planDeBajasArca(tenantId, { userIds: opciones.userIds });
    const pedidas = opciones.claves ? new Set(opciones.claves) : null;
    const aplicar = plan.items.filter((x) => x.aplicar && (!pedidas || pedidas.has(x.contratoKey)));
    const porVinculo = new Map();
    for (const x of aplicar)
        (porVinculo.get(x.userProjectId) || porVinculo.set(x.userProjectId, []).get(x.userProjectId)).push(x);
    const escritos = [];
    const cambiaron = [];
    const motivo = "Baja según ARCA (misma persona, misma empleadora y fecha de alta exacta)";
    await enContexto({ motivo }, async () => {
        for (const [upId, lista] of porVinculo) {
            // De a un contrato: el filtro lleva la baja que tenía, así lo que cambió en el medio no se pisa.
            for (const x of lista) {
                const fin = bajaConFormatoDelAlta(x.finArca, x.altaCruda);
                // Con baja el tipo no hace falta: el cálculo compartido nunca devuelve null acá.
                const estado = estadoAlEscribir({ fecha_alta_contrato: x.altaCruda, fecha_baja_contrato: fin }, null, plan.hoy);
                const vacia = x.bajaCruda === null || x.bajaCruda === undefined || x.bajaCruda === "" || x.bajaCruda === "null";
                const r = await UserProject.updateOne({ _id: new Types.ObjectId(upId) }, {
                    $set: {
                        "contracts.$[c].fecha_baja_contrato": fin,
                        "contracts.$[c].origenBaja": "ARCA_SYNC",
                        "contracts.$[c].bajaArca": { fin: x.finArca, situacionBaja: x.situacionBaja, empleadoraCuit: x.empleadoraCuit, bajaAnterior: vacia ? null : String(x.bajaCruda), aplicadaEl: new Date(), tipo: x.tipo },
                        "contracts.$[c].estadoContrato": estado.estadoContrato,
                        ...(estado.estadoContratoMotivo ? { "contracts.$[c].estadoContratoMotivo": estado.estadoContratoMotivo } : {}),
                    },
                    ...(estado.estadoContratoMotivo ? {} : { $unset: { "contracts.$[c].estadoContratoMotivo": "" } }),
                }, { arrayFilters: [{ "c.contratoKey": new Types.ObjectId(x.contratoKey), "c.estadoContrato": { $ne: "ANULADO" }, "c.fecha_baja_contrato": vacia ? { $in: [null, "", "null"] } : x.bajaCruda }] });
                (r.modifiedCount ? escritos : cambiaron).push(x);
            }
        }
    });
    return { escritos, cambiaron, plan };
}
