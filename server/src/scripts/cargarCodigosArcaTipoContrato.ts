import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { Contrato } from "../models/Contrato.js";

/**
 * Carga los tres códigos de ARCA en cada tipo de contrato.
 *
 * Son los tres que el modal dice que salen del tipo de contrato —modalidad (17-19), tipo de servicio
 * (107-109) y modalidad de liquidación (73)— y estaban vacíos en los 15, que es por qué ningún alta
 * se podía generar.
 *
 *   npm run tipos-contrato:arca:dry
 *   npm run tipos-contrato:arca
 *
 * LO QUE ESTÁ EN `null` NO SE ESCRIBE. Son las celdas «a definir» del relevamiento: decisiones que
 * este script no puede tomar. Completarlas por parecido de nombre escribiría en el TXT un encuadre
 * que nadie eligió, y a ARCA le daría igual — el archivo saldría válido y mal.
 */

const DRY_RUN = process.env.DRY_RUN === "true";

type Asignacion = {
  nombre: string;
  /** `null` = a definir; no se toca lo que haya. */
  modalidad: string | null;
  tipoServicio: string | null;
  liquidacion: string | null;
  generaAlta: boolean | null;
  nota?: string;
};

/*
  TIPO DE SERVICIO 000 EN TODOS, COMO SUPUESTO EXPLÍCITO.

  «000 SERVICIOS COMUNES CONTINUOS» es la entrada normal de una productora, y el modal ya viene con
  el grupo 1 (CONTINUOS). Pero la distinción continuo/discontinuo para trabajo eventual de producción
  es una decisión de cómo se viene declarando, no algo derivable del catálogo: si se declaran como
  discontinuos, va 500 y hay que cambiarlo acá. Queda anotado para que se pueda desmentir.
*/
const TIPO_SERVICIO_SUPUESTO = "000";

const ASIGNACIONES: Asignacion[] = [
  // ── Eventuales de crew y músico: trabajo eventual, sin discusión.
  { nombre: "Eventual Crew My secret", modalidad: "012", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true },
  { nombre: "Eventual Crew Reelshort - STMP - MSLIHB", modalidad: "012", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true },
  { nombre: "Eventual Crew Surrender", modalidad: "012", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true },
  { nombre: "Eventual Musico Reelshort", modalidad: "012", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true },

  /*
    ── Talento: LA MODALIDAD QUEDA SIN DEFINIR, y no por falta de datos.

    Existen 061 y 062 «Actor - Intérprete en Empleador Contratante Ley 27.203» —el estatuto del
    actor, que creó un régimen propio— y hoy no los usa ningún contrato: los 152 actores están
    saliendo por la modalidad genérica. Si 27.203 corresponde, lo genérico está mal declarado; si no
    corresponde, hay que poder decir por qué. La diferencia entre 061 y 062 es CON o SIN obra social,
    y eso sí se resuelve mirando cada caso.

    No se resuelve por descarte: es una decisión, no un dato faltante.
  */
  { nombre: "Eventual Talento My secret - Reelshort", modalidad: null, tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true, nota: "modalidad: 012 genérico o 061/062 (ley 27.203, con/sin obra social)" },
  { nombre: "Eventual Talento My secret Nudity rider - Reelshort", modalidad: null, tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true, nota: "modalidad: 012 genérico o 061/062 (ley 27.203, con/sin obra social)" },
  { nombre: "Eventual Talento Surrender  - Reelshort", modalidad: null, tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true, nota: "modalidad: 012 genérico o 061/062 (ley 27.203, con/sin obra social)" },
  { nombre: "Eventual Talento Surrender Nudity rider - Reelshort", modalidad: null, tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: true, nota: "modalidad: 012 genérico o 061/062 (ley 27.203, con/sin obra social)" },

  // ── Plazo fijo y permanente: modalidad y liquidación mensual sin ambigüedad.
  { nombre: "Plazo fijo 5x7", modalidad: "022", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: "1", generaAlta: true },
  { nombre: "Plazo fijo 6x6", modalidad: "022", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: "1", generaAlta: true },
  { nombre: "Plazo fijo 5x7 part-time", modalidad: "021", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: "1", generaAlta: true },
  { nombre: "Tiempo Indeterminado", modalidad: "008", tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: "1", generaAlta: true },

  // ── Pasantía: 027 (ley 26.427, CON obra social) o 010 (práctica profesionalizante, SIN). Son
  //    regímenes distintos con obligaciones distintas; el nombre del tipo no alcanza para elegir.
  { nombre: "Practica Profesional Supervisada", modalidad: null, tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: null, nota: "modalidad: 027 (ley 26.427, con obra social) o 010 (práctica profesionalizante, sin). Y si genera alta." },

  /*
    ── Jornada: EL MÁS USADO Y EL MÁS INCIERTO. 3.310 contratos.

    La modalidad depende de si esas jornadas son trabajo eventual (012) o algo más. Y la liquidación
    probablemente sea 8 JORNAL, pero ahí hay un hilo abierto: si la retribución pactada (58-72) se
    expresa distinto cuando se liquida por jornada que cuando es mensual, cargar 8 sin verificarlo
    declararía mal la remuneración. Es el mismo problema que tiene 0102/90 con «Valores por jornada».
  */
  { nombre: "Jornada", modalidad: null, tipoServicio: TIPO_SERVICIO_SUPUESTO, liquidacion: null, generaAlta: null, nota: "modalidad y liquidación sin definir. Si va 8 JORNAL, verificar antes cómo se expresa la retribución pactada." },

  // ── Servicios: no es relación laboral. Lo que lo distingue de «incompleto» es este `false`.
  { nombre: "Servicios", modalidad: null, tipoServicio: null, liquidacion: null, generaAlta: false, nota: "locación de servicios: no declara alta temprana" },
];

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const tipos: any[] = await Contrato.find({}).lean();
  const porNombre = new Map(tipos.map((t) => [String(t.name), t]));
  const problemas: string[] = [];
  const pendientes: string[] = [];
  const log: any[] = [];

  console.log("NOMBRE".padEnd(54) + "MOD  SERV  LIQ  ALTA");
  for (const a of ASIGNACIONES) {
    const t = porNombre.get(a.nombre);
    if (!t) {
      problemas.push(`NO EXISTE el tipo «${a.nombre}»`);
      continue;
    }
    const set: any = {};
    if (a.modalidad !== null) set["data.afipModalidadContrato"] = a.modalidad;
    if (a.tipoServicio !== null) set["data.afipTipoServicio"] = a.tipoServicio;
    if (a.liquidacion !== null) set["data.afipModalidadLiquidacion"] = a.liquidacion;
    if (a.generaAlta !== null) set["data.generaAlta"] = a.generaAlta;

    console.log(
      String(a.nombre).slice(0, 52).padEnd(54) +
        String(a.modalidad ?? "·").padEnd(5) +
        String(a.tipoServicio ?? "·").padEnd(6) +
        String(a.liquidacion ?? "·").padEnd(5) +
        String(a.generaAlta === null ? "·" : a.generaAlta ? "sí" : "NO"),
    );
    if (a.nota) {
      console.log(`      ↳ a definir — ${a.nota}`);
      pendientes.push(`${a.nombre}: ${a.nota}`);
    }

    log.push({ _id: String(t._id), name: t.name, antes: { ...(t.data || {}) }, set });
    if (!DRY_RUN && Object.keys(set).length > 0) await Contrato.updateOne({ _id: t._id }, { $set: set });
  }

  const noAsignados = tipos.filter((t) => !ASIGNACIONES.some((a) => a.nombre === t.name));
  if (noAsignados.length > 0) {
    console.log(`\nTipos sin fila en el relevamiento (no se tocan): ${noAsignados.map((t) => t.name).join(", ")}`);
  }

  if (problemas.length > 0) {
    console.log("\n✖ Problemas:");
    for (const p of problemas) console.log(`   · ${p}`);
  }

  console.log(`\n── A definir (${pendientes.length}) ──`);
  for (const p of pendientes) console.log(`   · ${p}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN terminado. No se escribió nada.\n");
    await mongoose.disconnect();
    return;
  }

  const archivo = `logs/tipos-contrato-arca-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(archivo, JSON.stringify(log, null, 2));
  console.log(`\n${log.length} tipo(s) procesado(s).`);
  console.log(`Log con el estado anterior: ${archivo}\n`);
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
