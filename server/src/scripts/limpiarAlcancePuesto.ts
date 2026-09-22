import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";

/**
 * BORRA LOS RESTOS DE «ALCANCE DEL PUESTO» Y VERIFICA QUE NO QUEDE BRONCE HUÉRFANO.
 *
 * El alcance —el texto de «Hace: … No hace: …» con su `riesgo` Verde/Amarillo— se agregó a la
 * asociación función ↔ categoría y a la copia del contrato, y se decidió no usarlo. El código ya no
 * los escribe ni los lee; esto limpia lo que haya quedado escrito en la base.
 *
 * Toca SÓLO esos campos. No borra documentos, no agrega ni quita categorías y no modifica ninguna
 * valoración que esté bien puesta: la valoración Oro/Plata de cada categoría se queda como está.
 *
 * QUÉ HACE, en dos partes:
 *
 *   1. `$unset` de `alcance` y `riesgo` en cada `data.categoriasSat[]` de `roles_frame`, y de
 *      `alcanceSnapshot` en cada `contracts[]` de `users_&_projects`. Barre además el resto de las
 *      colecciones donde el campo podría haber caído suelto.
 *
 *   2. BRONCE HUÉRFANO. Bronce se eliminó del catálogo, así que un `valoracionId` que todavía la
 *      apunte no resuelve contra nada: el selector de contratación lo trata como «sin valorar» sin
 *      decir por qué. Donde aparezca se pone en `null` —que es el estado válido para «sin valorar»—
 *      y se informa dónde estaba. Nunca se borra el documento que la contenía.
 *
 * ES IDEMPOTENTE: la segunda corrida encuentra cero y no escribe. Los filtros piden `$exists` antes
 * de tocar nada, así que sólo entran los documentos que de verdad tienen el campo.
 *
 * Variables de entorno:
 *   APLICAR=true   -> escribe. SIN esto sólo informa qué encontró y qué haría.
 *
 * Igual que `valorar:funciones`, hay que PEDIR escribir: en seco es un diagnóstico que se puede
 * correr contra producción sin consecuencias.
 *
 * Uso: npm run limpiar:alcance:dry
 *      npm run limpiar:alcance
 */

/** La valoración Bronce que se eliminó del catálogo. Lo que todavía la apunte no resuelve. */
const BRONCE_ID = "6ab2b94c6e91a566407c0f7d";

/** Los dos campos del alcance, tal como quedaron guardados dentro de cada categoría de una función. */
const CAMPOS_CATEGORIA = ["alcance", "riesgo"] as const;

const db = () => {
  const conn = mongoose.connection.db;
  if (!conn) throw new Error("Sin conexión a la base.");
  return conn;
};

/** `valoracionId` pudo guardarse como ObjectId o como string: se busca de las dos formas. */
const bronceEnCualquierFormato = () => {
  const comoTexto: unknown[] = [BRONCE_ID];
  if (mongoose.Types.ObjectId.isValid(BRONCE_ID)) comoTexto.push(new mongoose.Types.ObjectId(BRONCE_ID));
  return { $in: comoTexto };
};

async function limpiarAlcancePuesto() {
  const aplicar = String(process.env.APLICAR).toLowerCase() === "true";

  await connectDB();
  try {
    console.log(aplicar ? "✍️  APLICAR=true: se va a escribir." : "🧪 En seco: no se escribe nada (APLICAR=true para escribir).");
    console.log("");

    let escritos = 0;
    let hallazgosBronce = 0;

    // ───────────────────────── 1. Restos del alcance del puesto ─────────────────────────
    console.log("── Alcance del puesto ──");

    // 1.a Funciones (Roles Empresa): los campos viven dentro de cada categoría asociada.
    const filtroFunciones = { $or: CAMPOS_CATEGORIA.map((c) => ({ [`data.categoriasSat.${c}`]: { $exists: true } })) };
    const funciones = await db().collection("roles_frame").countDocuments(filtroFunciones);
    if (funciones === 0) {
      console.log("  roles_frame            : 0 funciones con alcance/riesgo");
    } else if (!aplicar) {
      console.log(`  roles_frame            : ${funciones} funciones con alcance/riesgo (se limpiarían)`);
    } else {
      const r = await db()
        .collection("roles_frame")
        .updateMany(filtroFunciones, { $unset: Object.fromEntries(CAMPOS_CATEGORIA.map((c) => [`data.categoriasSat.$[].${c}`, ""])) });
      escritos += r.modifiedCount;
      console.log(`  roles_frame            : ${r.modifiedCount} funciones limpiadas`);
    }

    // 1.b Contratos: la copia que se guardaba al dar de alta, dentro de `contracts[]`.
    const filtroContratos = { "contracts.alcanceSnapshot": { $exists: true } };
    const contratos = await db().collection("users_&_projects").countDocuments(filtroContratos);
    if (contratos === 0) {
      console.log("  users_&_projects       : 0 documentos con alcanceSnapshot");
    } else if (!aplicar) {
      console.log(`  users_&_projects       : ${contratos} documentos con alcanceSnapshot (se limpiarían)`);
    } else {
      const r = await db().collection("users_&_projects").updateMany(filtroContratos, { $unset: { "contracts.$[].alcanceSnapshot": "" } });
      escritos += r.modifiedCount;
      console.log(`  users_&_projects       : ${r.modifiedCount} documentos limpiados`);
    }

    // 1.c Por las dudas, suelto en la raíz de solicitudes, usuarios y contratos sueltos.
    for (const col of ["requests", "users", "contratos"]) {
      const filtro = { alcanceSnapshot: { $exists: true } };
      const n = await db().collection(col).countDocuments(filtro);
      if (n === 0) {
        console.log(`  ${col.padEnd(23)}: 0 documentos con alcanceSnapshot`);
        continue;
      }
      if (!aplicar) {
        console.log(`  ${col.padEnd(23)}: ${n} documentos con alcanceSnapshot (se limpiarían)`);
        continue;
      }
      const r = await db().collection(col).updateMany(filtro, { $unset: { alcanceSnapshot: "" } });
      escritos += r.modifiedCount;
      console.log(`  ${col.padEnd(23)}: ${r.modifiedCount} documentos limpiados`);
    }

    // ───────────────────────── 2. Bronce huérfano ─────────────────────────
    console.log("");
    console.log("── Valoración Bronce huérfana ──");

    const bronce = bronceEnCualquierFormato();

    // 2.a ¿Sigue en el catálogo? Si estuviera, no habría nada huérfano que arreglar.
    const enCatalogo = await db().collection("valoraciones").countDocuments({ _id: bronce as never });
    console.log(enCatalogo > 0 ? `  ⚠️  Bronce TODAVÍA existe en el catálogo (${BRONCE_ID}): no hay huérfanos que corregir.` : `  Bronce no está en el catálogo (${BRONCE_ID}): lo que la apunte queda huérfano.`);

    if (enCatalogo === 0) {
      // 2.b Funciones: adentro del array, sólo el elemento que la apunta.
      const nFunciones = await db().collection("roles_frame").countDocuments({ "data.categoriasSat.valoracionId": bronce });
      hallazgosBronce += nFunciones;
      if (nFunciones === 0) console.log("  roles_frame            : 0 categorías apuntan a Bronce");
      else if (!aplicar) console.log(`  roles_frame            : ${nFunciones} funciones con categorías en Bronce (pasarían a null)`);
      else {
        const r = await db()
          .collection("roles_frame")
          .updateMany({ "data.categoriasSat.valoracionId": bronce }, { $set: { "data.categoriasSat.$[el].valoracionId": null } }, { arrayFilters: [{ "el.valoracionId": bronce }] });
        escritos += r.modifiedCount;
        console.log(`  roles_frame            : ${r.modifiedCount} funciones corregidas (valoracionId → null)`);
      }

      // 2.c Proyectos: la valoración del proyecto.
      const nProyectos = await db().collection("projects").countDocuments({ valoracionId: bronce });
      hallazgosBronce += nProyectos;
      if (nProyectos === 0) console.log("  projects               : 0 proyectos en Bronce");
      else if (!aplicar) console.log(`  projects               : ${nProyectos} proyectos en Bronce (pasarían a null)`);
      else {
        const r = await db().collection("projects").updateMany({ valoracionId: bronce }, { $set: { valoracionId: null } });
        escritos += r.modifiedCount;
        console.log(`  projects               : ${r.modifiedCount} proyectos corregidos (valoracionId → null)`);
      }

      // 2.d Contratos: `valoracion_id` de cada contrato. El nombre guardado se va con él, porque
      //     decía «Bronce» y ya no hay tal cosa.
      const nContratos = await db().collection("users_&_projects").countDocuments({ "contracts.valoracion_id": bronce });
      hallazgosBronce += nContratos;
      if (nContratos === 0) console.log("  users_&_projects       : 0 contratos en Bronce");
      else if (!aplicar) console.log(`  users_&_projects       : ${nContratos} documentos con contratos en Bronce (pasarían a null)`);
      else {
        const r = await db()
          .collection("users_&_projects")
          .updateMany({ "contracts.valoracion_id": bronce }, { $set: { "contracts.$[el].valoracion_id": null, "contracts.$[el].nombre_valoracion": "" } }, { arrayFilters: [{ "el.valoracion_id": bronce }] });
        escritos += r.modifiedCount;
        console.log(`  users_&_projects       : ${r.modifiedCount} documentos corregidos (valoracion_id → null)`);
      }

      // 2.e Solicitudes: por si alguna guardó la valoración pedida.
      for (const [col, campo] of [
        ["requests", "valoracionId"],
        ["users", "metadata.valoracionId"],
      ] as const) {
        const n = await db()
          .collection(col)
          .countDocuments({ [campo]: bronce });
        hallazgosBronce += n;
        if (n === 0) {
          console.log(`  ${col.padEnd(23)}: 0 documentos con ${campo} en Bronce`);
          continue;
        }
        if (!aplicar) {
          console.log(`  ${col.padEnd(23)}: ${n} documentos con ${campo} en Bronce (pasarían a null)`);
          continue;
        }
        const r = await db()
          .collection(col)
          .updateMany({ [campo]: bronce }, { $set: { [campo]: null } });
        escritos += r.modifiedCount;
        console.log(`  ${col.padEnd(23)}: ${r.modifiedCount} documentos corregidos (${campo} → null)`);
      }
    }

    // ───────────────────────── Resumen ─────────────────────────
    console.log("");
    console.log("── Resumen ──");
    if (aplicar) {
      console.log(`  Documentos modificados: ${escritos}`);
      console.log(escritos === 0 ? "  No había nada que limpiar: la base ya estaba en orden." : "  Listo. Una segunda corrida tiene que dar 0.");
    } else {
      console.log("  En seco: no se escribió nada. Correr con APLICAR=true para aplicar.");
    }
    if (hallazgosBronce > 0) console.log(`  ⚠️  Referencias a Bronce encontradas: ${hallazgosBronce}. Ningún documento se borró.`);
  } finally {
    await disconnectDB();
  }
}

limpiarAlcancePuesto().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
