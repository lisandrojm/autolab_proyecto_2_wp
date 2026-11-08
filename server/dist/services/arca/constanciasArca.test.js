import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actualizarUbicaciones, filaDesdeContrato, huellaDelNombre, huellaDe, planDeRedescarga, retomarCircuito } from "./constanciasArca.js";
import { elegirParaCorrida, puedeRetomarCircuito, puedeVolverABajarse } from "./cicloConstancia.js";
import { leerConstanciaTrabajador } from "../../utils/constanciaTrabajadorPdf.js";
/*
  LA TRAZABILIDAD DEL DOCUMENTO, con Dropbox de mentira: las carpetas son listas en memoria y el
  «borrado» es lo que dice `borradoEl`. Todo en seco: no toca la base.
*/
const CARPETAS = { outbox: "/HelloSign/Outbox", pendbox: "/HelloSign/Pendbox", firmados: "/HelloSign/Requested signatures", altaTemprana: "/WEPRODU/ARCA/Alta temprana de Arca" };
const TIERO = "426_LN+_TIERO_AltaAFIP_Jornada_D-20261024_H-20261024_20327243994_damiantiero5-ARROBA-gmail.com_Empresa-30717068374_ID-000663.pdf";
const nombre = (apellido, cuil, cod) => `426_LN+_${apellido}_AltaArca_Jornada_D-20261107_H-20261107_${cuil}_x-ARROBA-gmail.com_Empresa-30717068374${cod ? `_${cod}` : ""}.pdf`;
function dropboxDeMentira(carpetas, borrados = {}, movidos = {}) {
    const copias = [];
    return {
        copias,
        listar: async (path) => (carpetas[path] || []).map((name) => ({ tag: "file", name, path: `${path}/${name}`, id: `id:${name}` })),
        copiar: async (desde, hacia) => {
            copias.push(hacia);
            return { path: hacia, name: hacia.split("/").pop(), id: "id:copia" };
        },
        ubicar: async (ref) => (movidos[ref] ? { path: movidos[ref], name: movidos[ref].split("/").pop() } : borrados[ref] ? { path: ref, borrado: true } : null),
        borradoEl: async (path) => borrados[path] || null,
    };
}
const doc = (clave, estado, documento, extra = {}) => ({ clave, estado, cuil: "20111111112", empresaCuit: "30717068374", fechaAlta: "2026-11-07", tipoConstancia: "alta", documento, ...extra });
describe("filaDesdeContrato: el punto de partida de cada presentación", () => {
    const up = { _id: "6a0000000000000000000001", userId: "6a0000000000000000000002" };
    const user = { firstName: "SERGIO DAMIAN", lastName: "TIERO", metadata: { cuit: "20-32724399-4" } };
    const empresa = { _id: "6a0000000000000000000003", cuit: "30-71706837-4", razonSocial: "2030 S.R.L." };
    it("presentada y sin constancia → «presentada», con la clave de siempre", () => {
        const f = filaDesdeContrato({ up, idx: 63, c: { fecha_alta_contrato: "2026-10-24", fecha_baja_contrato: "2026-10-24", altaArcaPresentada: { resultado: "presentada", fecha: "2026-10-24T03:06:28.801Z" } }, user, empresa });
        assert.equal(f.estado, "presentada");
        assert.equal(f.clave, "20327243994|30717068374|2026-10-24");
        assert.equal(f.documento, null);
    });
    it("con la constancia en el Outbox → «constancia_descargada», con su código", () => {
        const f = filaDesdeContrato({ up, idx: 63, c: { fecha_alta_contrato: "2026-10-24", fecha_baja_contrato: "2026-10-24", altaArcaPresentada: { resultado: "presentada" }, altaConstancia: { validadaEl: new Date(), vaAFirma: true, archivadaEn: `/HelloSign/Outbox/${TIERO}`, enviadaComo: TIERO } }, user, empresa });
        assert.equal(f.estado, "constancia_descargada");
        assert.equal(f.documento?.codigo, "ID-000663");
        assert.equal(f.documento?.carpeta, "outbox");
    });
    it("la de baja archivada en «No firmar» → «baja_mismo_dia_ok», marcada como mismo día", () => {
        const f = filaDesdeContrato({ up, idx: 1, c: { fecha_alta_contrato: "2026-11-07", fecha_baja_contrato: "2026-11-07", altaArcaPresentada: { resultado: "presentada" }, altaConstancia: { validadaEl: new Date(), vaAFirma: false, tipo: "baja", archivadaEn: "/WEPRODU/ARCA/Alta temprana de Arca/No firmar/x.pdf" } }, user, empresa });
        assert.equal(f.estado, "baja_mismo_dia_ok");
        assert.equal(f.mismoDia, true);
    });
});
describe("la huella de las constancias de antes de los códigos", () => {
    it("CUIL + fecha de alta + CUIT de la empleadora, del nombre y de la fila", () => {
        assert.equal(huellaDelNombre(TIERO), "20327243994|20261024|30717068374");
        assert.equal(huellaDe({ cuil: "20-32724399-4", fechaAlta: "2026-10-24", empresaCuit: "30717068374" }), "20327243994|20261024|30717068374");
    });
    it("un contrato o un release no es una constancia de alta", () => {
        assert.equal(huellaDelNombre("703_TELECOM_Contrato_PEREZ_JUAN-x-ARROBA-gmail.com_20111111112_D-20261101_H-20261130_ID-000965.pdf"), "");
    });
});
describe("actualizarUbicaciones: el estado sale de dónde está el documento hoy", () => {
    it("bajada → en Outbox; en Pendbox → enviada a firmar; firmada → se archiva; nunca para atrás", async () => {
        const dbx = dropboxDeMentira({
            [CARPETAS.outbox]: [nombre("A", "20111111112", "ID-000001")],
            [CARPETAS.pendbox]: [nombre("B", "20111111113", "ID-000002"), nombre("F", "20111111117", "ID-000006")],
            [CARPETAS.firmados]: [nombre("C", "20111111114", "ID-000003")],
        });
        const docs = [
            doc("A", "constancia_descargada", { codigo: "ID-000001" }),
            doc("B", "constancia_descargada", { codigo: "ID-000002" }),
            doc("C", "enviada_a_firmar", { codigo: "ID-000003" }),
            // Ya firmada, y un listado viejo todavía la ve en Pendbox: no vuelve a «en firma».
            doc("F", "firmada", { codigo: "ID-000006" }),
        ];
        const r = await actualizarUbicaciones("t", null, { enSeco: true, docs, dropbox: dbx, carpetas: CARPETAS });
        assert.deepEqual(r.cambios.map((c) => [c.clave, c.a]), [["B", "enviada_a_firmar"], ["C", "archivada"]]);
        assert.equal(r.archivadas, 1);
        assert.equal(r.noUbicadas, 0);
    });
    it("la firmada se archiva en «Alta temprana de Arca/Firmadas» una sola vez (re-ejecutar no duplica)", async () => {
        const dbx = dropboxDeMentira({ [CARPETAS.firmados]: [nombre("C", "20111111114", "ID-000003")] });
        const r = await actualizarUbicaciones("t", null, { enSeco: true, docs: [doc("C", "firmada", { codigo: "ID-000003" })], dropbox: dbx, carpetas: CARPETAS });
        assert.equal(r.archivadas, 1);
        assert.deepEqual(r.cambios.map((c) => c.a), ["archivada"]);
        // Ya archivada: la carpeta más avanzada es «Firmadas», no se vuelve a copiar.
        const dbx2 = dropboxDeMentira({ [CARPETAS.firmados]: [nombre("C", "20111111114", "ID-000003")], [`${CARPETAS.altaTemprana}/Firmadas`]: [nombre("C", "20111111114", "ID-000003")] });
        const r2 = await actualizarUbicaciones("t", null, { enSeco: true, docs: [doc("C", "archivada", { codigo: "ID-000003", firmadaEl: new Date() })], dropbox: dbx2, carpetas: CARPETAS });
        assert.equal(r2.archivadas, 0);
        assert.equal(r2.cambios.length, 0);
    });
    it("una constancia de antes de los códigos se encuentra por su huella", async () => {
        const dbx = dropboxDeMentira({ [CARPETAS.pendbox]: [nombre("VIEJA", "20111111112")] });
        const r = await actualizarUbicaciones("t", null, { enSeco: true, docs: [doc("V", "constancia_descargada", { nombre: "otro nombre de entonces.pdf", path: "/HelloSign/Outbox/otro nombre de entonces.pdf" })], dropbox: dbx, carpetas: CARPETAS });
        assert.deepEqual(r.cambios.map((c) => c.a), ["enviada_a_firmar"]);
    });
    it("el caso Tiero: borrada del Outbox y en ninguna otra carpeta → revisión, «documento no ubicado», con la fecha en hora argentina", async () => {
        const path = `${CARPETAS.outbox}/${TIERO}`;
        const dbx = dropboxDeMentira({ [CARPETAS.outbox]: [], [CARPETAS.pendbox]: [], [CARPETAS.firmados]: [] }, { [path]: "2026-10-24T20:59:36Z" });
        const r = await actualizarUbicaciones("t", null, { enSeco: true, docs: [doc("TIERO", "constancia_descargada", { codigo: "ID-000663", path })], dropbox: dbx, carpetas: CARPETAS });
        assert.equal(r.noUbicadas, 1);
        assert.equal(r.cambios[0].a, "requiere_revision");
        assert.equal(r.cambios[0].motivo, "Documento no ubicado: se borró de /HelloSign/Outbox el 24/10/2026 17:59 y no está en Outbox, Pendbox, Requested signatures ni «Alta temprana de Arca». No se envió a firmar.");
    });
    it("un documento que reaparece sale de revisión", async () => {
        const dbx = dropboxDeMentira({ [CARPETAS.pendbox]: [nombre("R", "20111111112", "ID-000009")] });
        const r = await actualizarUbicaciones("t", null, { enSeco: true, docs: [doc("R", "requiere_revision", { codigo: "ID-000009", noUbicadoDesde: new Date() })], dropbox: dbx, carpetas: CARPETAS });
        assert.deepEqual(r.cambios.map((c) => c.a), ["enviada_a_firmar"]);
    });
});
describe("«Volver a bajar»: la constancia cuyo documento se borró vuelve a la cola", () => {
    // Tiero tal como está en la base el 07/11/2026: validada el 24/10 15:03, borrada del Outbox a las 17:59.
    const AHORA = new Date("2026-11-07T22:00:00.000Z");
    const pathOutbox = `${CARPETAS.outbox}/${TIERO}`;
    const fila = { clave: "20327243994|30717068374|2026-10-24", estado: "requiere_revision", cuil: "20327243994", empresaCuit: "30717068374", fechaAlta: "2026-10-24", tipoConstancia: "alta", intentos: [], documento: { codigo: "ID-000663", nombre: TIERO, path: pathOutbox, carpeta: "outbox", noUbicadoDesde: new Date("2026-11-08T00:53:50.877Z") }, redescarga: null };
    const contrato = { fecha_alta_contrato: "2026-10-24", fecha_baja_contrato: "2026-10-24", altaArcaPresentada: { resultado: "presentada" }, altaConstancia: { clave: "CA47302115734083081971", validadaEl: new Date("2026-10-24T18:03:46.854Z"), vaAFirma: true, archivadaEn: pathOutbox, enviadaComo: TIERO, origen: "automatica" } };
    const up = { _id: "6a0000000000000000000001", userId: "6a0000000000000000000002" };
    const user = { firstName: "SERGIO DAMIAN", lastName: "TIERO", metadata: { cuit: "20-32724399-4" } };
    const empresa = { _id: "6a0000000000000000000003", cuit: "30-71706837-4", razonSocial: "2030 S.R.L." };
    it("limpia la validación del contrato (queda anotada en el intento) y re-encola como nueva, primera en el cupo", () => {
        const r = planDeRedescarga(fila, contrato, { ahora: AHORA, porUsuarioId: "u1" });
        assert.ok(r.ok);
        if (!r.ok)
            return;
        assert.equal(r.contrato.altaConstancia.validadaEl, undefined);
        assert.equal(r.contrato.altaConstancia.clave, "CA47302115734083081971", "lo demás de la constancia anterior no se toca");
        assert.equal(r.intento.resultado, "redescarga");
        assert.equal(r.intento.detalle, "Re-descarga pedida: documento no ubicado (ID-000663). La constancia anterior se había validado el 24/10/2026 15:03.");
        assert.deepEqual(r.fila.redescarga.validadaElAnterior, contrato.altaConstancia.validadaEl);
        assert.equal(r.fila.redescarga.documentoAnterior?.codigo, "ID-000663");
        assert.equal(r.fila.documento, null);
        // El contrato sin validación es otra vez una presentada sin constancia: lo que la descarga va a pedir.
        assert.equal(filaDesdeContrato({ up, idx: 63, c: r.contrato, user, empresa }).estado, "presentada");
        const otraEsperando = { estado: "constancia_pendiente", fechaAlta: "2026-10-01", proximoIntentoEl: new Date(AHORA.getTime() - 1) };
        const { elegidas } = elegirParaCorrida([otraEsperando, { ...fila, ...r.fila }], { ahora: AHORA, tope: 1 });
        assert.equal(elegidas[0].fechaAlta, "2026-10-24", "entra como nueva, antes que los reintentos");
    });
    it("no re-encola dos veces: con la re-descarga en curso, un segundo pedido no hace nada", () => {
        const r = planDeRedescarga(fila, contrato, { ahora: AHORA });
        assert.ok(r.ok);
        if (!r.ok)
            return;
        const segunda = planDeRedescarga({ ...fila, ...r.fila }, r.contrato, { ahora: new Date(AHORA.getTime() + 1000) });
        assert.deepEqual(segunda, { ok: false, motivo: "Ya se pidió volver a bajarla: está en la cola." });
    });
    it("el documento reapareció: el escaneo lo saca de revisión y la re-descarga ya no lo toca", async () => {
        const dbx = dropboxDeMentira({ [CARPETAS.pendbox]: [TIERO] });
        const u = await actualizarUbicaciones("t", null, { enSeco: true, docs: [fila], dropbox: dbx, carpetas: CARPETAS });
        assert.deepEqual(u.cambios.map((c) => c.a), ["enviada_a_firmar"]);
        const r = planDeRedescarga({ ...fila, estado: "enviada_a_firmar", documento: { ...fila.documento, carpeta: "pendbox", noUbicadoDesde: null } }, contrato, { ahora: AHORA });
        assert.equal(r.ok, false);
        assert.equal(contrato.altaConstancia.validadaEl instanceof Date, true, "el contrato sigue validado");
    });
    it("si el contrato ya no es el de esa constancia (otra fecha de alta), no se toca", () => {
        const r = planDeRedescarga(fila, { ...contrato, fecha_alta_contrato: "2026-10-25" }, { ahora: AHORA });
        assert.equal(r.ok, false);
    });
});
describe("documento movido FUERA del circuito (07/11/2026): no queda en el limbo", () => {
    const AHORA = new Date("2026-11-07T22:00:00.000Z");
    const pathOutbox = `${CARPETAS.outbox}/${TIERO}`;
    const pathFuera = `/WEPRODU/Personal/Revisar/${TIERO}`;
    // Como quedaba la fila después del escaneo viejo: en revisión, con el motivo de «no ubicado».
    const enRevision = () => ({ _id: "x1", clave: "20327243994|30717068374|2026-10-24", nombre: "SERGIO DAMIAN TIERO", estado: "requiere_revision", cuil: "20327243994", empresaCuit: "30717068374", fechaAlta: "2026-10-24", fechaBaja: "2026-10-24", tipoConstancia: "alta", userProjectId: "u", contractIndex: 63, intentos: [], motivoRevision: "Documento no ubicado: se borró de /HelloSign/Outbox el 24/10/2026 17:59 y no está en Outbox, Pendbox, Requested signatures ni «Alta temprana de Arca». No se envió a firmar.", documento: { codigo: "ID-000663", nombre: TIERO, path: pathOutbox, vaAFirma: true, noUbicadoDesde: new Date("2026-11-08T00:53:50.877Z") } });
    // El talón de ARCA de esa jornada: constancia de BAJA, inicio y cese el 24/10 (la que vale con la regla nueva).
    const talon = (cuil = "20-32724399-4") => leerConstanciaTrabajador(`Simplificación Registral
CONSTANCIA DEL TRABAJADOR
Baja
 Empleador: CUIT: 30-71706837-4
Nombre y apellido o Denominación: 2030 S. R. L.
Datos del Empleado
Apellido y nombre: TIERO SERGIO DAMIAN
CUIL: ${cuil}
Fecha Inicio: 24/10/2026 Fecha Cese: 24/10/2026 Obra Social: 120900 - O.S.DEL PERSONAL DE TELEVISION
Baja
Clave: CB 91352988883435905417
Número de registro de trámite 262275718508`);
    it("el escaneo lo re-encuentra por su id fuera de las carpetas: motivo verdadero, marca, y visible para «Retomar el circuito»", async () => {
        const dbx = dropboxDeMentira({}, {}, { [pathOutbox]: pathFuera });
        const r = await actualizarUbicaciones("t", null, { enSeco: true, docs: [enRevision()], dropbox: dbx, carpetas: CARPETAS });
        assert.equal(r.fueraDelCircuito, 1);
        assert.equal(r.noUbicadas, 0);
        assert.equal(r.cambios.length, 1, "el cambio de motivo cuenta aunque siga en revisión");
        const c = r.cambios[0];
        assert.equal(c.a, "requiere_revision");
        assert.equal(c.fueraDelCircuito, true);
        assert.equal(c.path, pathFuera);
        assert.match(c.motivo, /^El documento apareció en \/WEPRODU\/Personal\/Revisar, fuera del circuito de firma/);
        assert.ok(!/no ubicado/i.test(c.motivo), "ya no dice «no ubicado»");
        // Y tiene salida: «Retomar el circuito» la acepta (el filtro viejo de noUbicadoDesde no la veía).
        const despues = { ...enRevision(), motivoRevision: c.motivo, documento: { ...enRevision().documento, path: pathFuera, noUbicadoDesde: null, fueraDelCircuito: true } };
        assert.deepEqual(puedeRetomarCircuito(despues), { ok: true });
        // Una segunda pasada con el archivo en el mismo lugar no reescribe nada.
        const r2 = await actualizarUbicaciones("t", null, { enSeco: true, docs: [despues], dropbox: dropboxDeMentira({}, {}, { [pathFuera]: pathFuera }), carpetas: CARPETAS });
        assert.equal(r2.cambios.length, 0);
    });
    it("«Retomar el circuito» copia el PDF al Outbox, y el ciclo sigue: en firma → firmada → archivada", async () => {
        const fila = { ...enRevision(), documento: { ...enRevision().documento, path: pathFuera, noUbicadoDesde: null, fueraDelCircuito: true } };
        const copias = [];
        const enMemoria = { x1: { ...fila } };
        const guardar = {
            tomar: async (d, c) => {
                const f = enMemoria[d._id];
                if (f.estado !== "requiere_revision" || !f.documento.fueraDelCircuito)
                    return false;
                enMemoria[d._id] = { ...f, estado: c.estado, motivoRevision: null, tipoConstancia: c.tipoConstancia, mismoDia: c.mismoDia, documento: { ...f.documento, fueraDelCircuito: false, carpeta: c.carpeta } };
                return true;
            },
            copiada: async (d, copia) => void (enMemoria[d._id].documento = { ...enMemoria[d._id].documento, path: copia.path, nombre: copia.name }),
            revertir: async () => assert.fail("no debía revertir"),
        };
        const dropbox = { copiar: async (desde, hacia) => (copias.push([desde, hacia]), { path: hacia, name: hacia.split("/").pop() }), descargar: async () => Buffer.from("pdf") };
        const [r] = await retomarCircuito("t", null, { docs: [fila], dropbox, guardar, leer: async () => talon(), carpetas: { outbox: CARPETAS.outbox, altaTemprana: CARPETAS.altaTemprana } });
        assert.equal(r.resultado, "retomada");
        assert.deepEqual(copias, [[pathFuera, pathOutbox]], "se copia (lo de la otra carpeta no se toca) con el mismo nombre");
        const f = enMemoria.x1;
        assert.equal(f.estado, "constancia_descargada");
        assert.equal(f.tipoConstancia, "baja");
        assert.equal(f.mismoDia, true);
        assert.equal(f.documento.path, pathOutbox);
        // Un segundo pedido no vuelve a copiar.
        const [r2] = await retomarCircuito("t", null, { docs: [fila], dropbox, guardar, leer: async () => talon(), carpetas: { outbox: CARPETAS.outbox, altaTemprana: CARPETAS.altaTemprana } });
        assert.equal(r2.resultado, "salteada");
        assert.equal(copias.length, 1);
        // El ciclo normal desde el Outbox: lo mueve Dropbox Sign a Pendbox, vuelve firmado, se archiva.
        const enFirma = await actualizarUbicaciones("t", null, { enSeco: true, docs: [f], dropbox: dropboxDeMentira({ [CARPETAS.pendbox]: [TIERO] }), carpetas: CARPETAS });
        assert.deepEqual(enFirma.cambios.map((c) => c.a), ["enviada_a_firmar"]);
        const firmada = await actualizarUbicaciones("t", null, { enSeco: true, docs: [{ ...f, estado: "enviada_a_firmar" }], dropbox: dropboxDeMentira({ [CARPETAS.firmados]: [TIERO] }), carpetas: CARPETAS });
        assert.deepEqual(firmada.cambios.map((c) => c.a), ["archivada"]);
        assert.equal(firmada.archivadas, 1);
    });
    it("si el PDF que apareció no es la constancia de ese contrato, no se copia: va a volver a bajarse", async () => {
        const fila = { ...enRevision(), documento: { ...enRevision().documento, path: pathFuera, noUbicadoDesde: null, fueraDelCircuito: true } };
        const copias = [];
        const [r] = await retomarCircuito("t", null, { docs: [fila], enSeco: true, dropbox: { copiar: async (_d, h) => (copias.push(h), { path: h, name: "x" }), descargar: async () => Buffer.from("pdf") }, leer: async () => talon("27-22222222-3"), carpetas: { outbox: CARPETAS.outbox, altaTemprana: CARPETAS.altaTemprana } });
        assert.equal(r.resultado, "no_sirve");
        assert.match(r.motivo, /CUIL de la constancia/);
        assert.equal(copias.length, 0);
        // Y la re-descarga lo acepta (fuera del circuito también vale para «Volver a bajar»).
        assert.deepEqual(puedeVolverABajarse(fila), { ok: true });
    });
    it("el caso de verdad borrado (ubicar no lo encuentra) sigue «no ubicado» y re-descargable, no «fuera del circuito»", async () => {
        const fila = { ...enRevision(), estado: "constancia_descargada", motivoRevision: null, documento: { codigo: "ID-000663", nombre: TIERO, path: pathOutbox, vaAFirma: true } };
        const r = await actualizarUbicaciones("t", null, { enSeco: true, docs: [fila], dropbox: dropboxDeMentira({}, { [pathOutbox]: "2026-10-24T20:59:36Z" }), carpetas: CARPETAS });
        assert.equal(r.noUbicadas, 1);
        assert.equal(r.fueraDelCircuito, 0);
        assert.equal(r.cambios[0].fueraDelCircuito, false);
        assert.match(r.cambios[0].motivo, /^Documento no ubicado: se borró de \/HelloSign\/Outbox el 24\/10\/2026 17:59/);
        const enRev = { ...fila, estado: "requiere_revision", documento: { ...fila.documento, noUbicadoDesde: AHORA, fueraDelCircuito: false } };
        assert.equal(puedeRetomarCircuito(enRev).ok, false);
        assert.equal(planDeRedescarga(enRev, { fecha_alta_contrato: "2026-10-24", altaConstancia: { validadaEl: new Date() } }, { ahora: AHORA }).ok, true);
    });
});
