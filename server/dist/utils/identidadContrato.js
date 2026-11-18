import { Types } from "mongoose";
/**
 * Qué clave le corresponde a cada contrato antes de guardar. Puro.
 *
 * `originales`: la clave que tenía cada posición al cargar el documento (`undefined` = documento nuevo).
 * `actuales`: lo que hay ahora en cada posición: su clave y si es un subdocumento nuevo (reemplazo o push).
 *
 * Reglas:
 *  1. Un contrato con clave la conserva, salvo que sea NUEVO y repita una clave que ya está en otra
 *     posición (una copia del contrato dentro del mismo vínculo): ése recibe una nueva.
 *  2. Uno sin clave en la posición `i` HEREDA la que había en `i` al cargar, si el array no se achicó
 *     (`push` sólo agrega al final, así que las posiciones de antes siguen siendo las mismas) y esa clave
 *     no quedó en otra posición. Con el array más corto (se borró un contrato) no se hereda: no se puede
 *     saber qué se corrió adónde.
 *  3. Uno sin clave y nuevo recibe una nueva.
 *  4. Uno sin clave, viejo y sin tocar, queda como está: es trabajo del backfill, que escribe con huella.
 */
export function clavesAPoner(originales, actuales, nuevaClave = () => new Types.ObjectId().toHexString()) {
    const out = actuales.map(() => null);
    // Las de los contratos que no se tocaron mandan: ésas no se cambian nunca.
    const usadas = new Set(actuales.filter((c) => c.clave && !c.nuevo).map((c) => c.clave));
    // Un contrato nuevo que trae clave la conserva si nadie más la tiene (p. ej. `{ ...contrato.toObject(), x }`).
    const conservan = new Set();
    actuales.forEach((c, i) => {
        if (c.clave && c.nuevo && !usadas.has(c.clave)) {
            usadas.add(c.clave);
            conservan.add(i);
        }
    });
    const puedeHeredar = !!originales && actuales.length >= originales.length;
    actuales.forEach((c, i) => {
        if (c.clave && (!c.nuevo || conservan.has(i)))
            return;
        const original = puedeHeredar ? originales[i] : null;
        if (!c.clave && original && !usadas.has(original)) {
            usadas.add(original);
            out[i] = { tipo: "heredada", clave: original };
            return;
        }
        if (c.nuevo || c.clave) {
            const clave = nuevaClave();
            usadas.add(clave);
            out[i] = { tipo: "nueva", clave };
        }
    });
    return out;
}
/** Contratos que entran por `updateOne` + `$push` (no pasan por los hooks del modelo): cada uno con su clave. */
export function conClaveNueva(contratos) {
    return contratos.map((c) => ({ ...c, contratoKey: new Types.ObjectId() }));
}
/**
 * La posición de un contrato a partir de lo que mandó el cliente: su `contratoKey` (o el `_id` de
 * subdocumento, que ningún contrato tiene: el subschema es `_id: false`), o la posición misma. -1 si no
 * está. Durante la transición los endpoints aceptan las dos cosas.
 *
 * Por qué importa: la posición cambia sola. Alguien abre el contrato en la posición 2, se va a constatar
 * la obra social en la SSS (captcha, tarda) y mientras tanto se elimina el de la posición 0. Al volver,
 * el 2 ya es otro contrato y el dato se escribe en el alta equivocada, sin error. Con la clave, no.
 *
 * Devuelve la posición, porque el resto del código escribe con `up.contracts[idx] = ...`.
 */
export function resolverIndiceContrato(up, param) {
    const contratos = up.contracts || [];
    const texto = String(param ?? "");
    let idx;
    if (/^[a-f\d]{24}$/i.test(texto)) {
        const porClave = contratos.findIndex((c) => String(c?.contratoKey || "") === texto);
        idx = porClave >= 0 ? porClave : contratos.findIndex((c) => String(c?._id || "") === texto);
    }
    else {
        const n = Number(texto);
        idx = Number.isInteger(n) && n >= 0 && n < contratos.length ? n : -1;
    }
    // Una lápida (contrato anulado, etapa 2b) no es un contrato que se pueda tocar: editarla la «resucitaría».
    return idx >= 0 && contratos[idx]?.estadoContrato === "ANULADO" ? -1 : idx;
}
