import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Contrato } from "../models/Contrato.js";
import { Categoria } from "../models/Categoria.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { buscarCategoriaCompatPorLegacyId, resolverCategoriasCompatPorId } from "../utils/categoriaCompat.js";
import { importePorJornada } from "../compartido/jornadas.js";

/**
 * DE DÓNDE SALIÓ EL IMPORTE POR JORNADA DE UNA SOLICITUD. Solo lectura: no escribe nada.
 *
 * Al aprobar una solicitud la web abre con el `dailyRate` que pidió el móvil y no lo recalcula. Si ese
 * número no es el de la escala vigente (categoría + tipo de contrato), este script dice cuál debería
 * ser y qué cuenta reproduce el que quedó guardado.
 *
 * Además lista las categorías con ESCALA PROPIA (`escalaDeCategoria`: la de la categoría le gana a la
 * del grupo) que no coincide con la de su grupo: una copia vieja ahí pisa la paritaria en silencio.
 *
 *   NOMBRE=GODOY npm run solicitud:diagnosticar-importe
 */
const NOMBRE = (process.env.NOMBRE || "").trim();
const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  if (!NOMBRE) throw new Error("Falta NOMBRE (por ejemplo NOMBRE=GODOY)");
  await mongoose.connect(uri, { dbName });
  console.log(`Base ${dbName} · solo lectura\n`);

  const grupos: any[] = await ConvenioGrupo.find().lean();
  const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]));

  const rx = new RegExp(NOMBRE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const solicitudes: any[] = await User.find({ "metadata.isSolicitud": true, "metadata.fullName": rx }).select("createdAt updatedAt metadata").lean();
  if (!solicitudes.length) console.log(`No hay solicitudes con «${NOMBRE}» en el nombre.`);

  for (const s of solicitudes) {
    const m = s.metadata || {};
    console.log(`── ${m.fullName}  (${s._id})`);
    console.log(`   creada ${s.createdAt ? new Date(s.createdAt).toISOString() : "?"} · modificada ${s.updatedAt ? new Date(s.updatedAt).toISOString() : "?"}`);
    const tipo: any = m.contratoId ? await Contrato.findById(m.contratoId).lean() : null;
    const mult = Number(tipo?.data?.multiplicadorDiario) || null;
    const jornadasTipo = Number(tipo?.data?.cantidadJornadas) || null;
    console.log(`   tipo de contrato: ${tipo ? `${tipo.name} · multiplicador ${mult ?? "—"} · jornadas ${jornadasTipo ?? "—"}` : `NO RESUELVE (${m.contratoId ?? "sin contratoId"})`}`);

    const id = m.categoriaSatId;
    let cat: any = null;
    if (id != null && mongoose.isValidObjectId(String(id))) [cat] = await resolverCategoriasCompatPorId([String(id)]);
    if (!cat && Number.isFinite(Number(id))) cat = await buscarCategoriaCompatPorLegacyId(Number(id));
    if (!cat) console.log(`   categoría: NO RESUELVE (${id ?? "sin categoriaSatId"})`);
    else {
      const d = cat.data || {};
      console.log(`   categoría: ${d.codigoArca || ""} ${cat.name} · convenio ${d.convenio || "—"} · grupo ${d.numeroCategoria ?? "—"} · escala de ${d.escalaOrigen ?? "?"}`);
      console.log(`   escala: básico ${pesos(Number(d.sueldoBasico) || 0)} + adicional ${pesos(Number(d.sueldoAdicional) || 0)} + presentismo ${pesos(Number(d.presentismo) || 0)} · bruto ${pesos(Number(d.sueldoBruto) || 0)} · neto ${pesos(Number(d.neto) || 0)}`);
      const debiera = importePorJornada(d, mult, jornadasTipo);
      console.log(`   jornada según la escala vigente y el tipo: ${pesos(debiera)}`);
    }

    const pedido = Number(m.dailyRate) || 0;
    console.log(`   dailyRate guardado en la solicitud: ${pesos(pedido)}`);
    if (pedido > 0) {
      // ¿Qué bruto mensual, con qué divisor y multiplicador, da ese número? Contra todos los grupos.
      const hallazgos: string[] = [];
      for (const g of grupos) {
        const comp = (Number(g.sueldoBasico) || 0) + (Number(g.sueldoAdicional) || 0) + (Number(g.presentismo) || 0);
        for (const [base, nombre] of [[comp || Number(g.sueldoBruto) || 0, "bruto"], [Number(g.neto) || 0, "neto"]] as const) {
          for (const div of [30, 22, jornadasTipo].filter(Boolean) as number[]) {
            for (const mu of [1, 1.5, mult].filter(Boolean) as number[]) {
              if (base > 0 && Math.abs(r2((base / div) * mu) - pedido) <= 0.02) hallazgos.push(`${g.convenio} G${g.numero} ${nombre} ÷ ${div} × ${mu}`);
            }
          }
        }
      }
      console.log(`   ese número sale de: ${hallazgos.length ? [...new Set(hallazgos)].join(" | ") : "ninguna cuenta conocida (¿cargado a mano?)"}`);
    }
    console.log("");
  }

  // Categorías con escala propia distinta de la de su grupo: la propia gana y tapa la paritaria.
  const conPropia: any[] = await Categoria.find({ sueldoBruto: { $gt: 0 }, grupoId: { $ne: null } }).lean();
  const distintas = conPropia.filter((c) => {
    const g = grupoPorId.get(String(c.grupoId));
    return g && Math.abs((Number(c.sueldoBruto) || 0) - (Number(g.sueldoBruto) || 0)) > 0.02;
  });
  console.log(`Categorías con escala propia que NO coincide con su grupo: ${distintas.length}`);
  for (const c of distintas) {
    const g = grupoPorId.get(String(c.grupoId));
    console.log(`  ${c.convenio} ${c.codigoArca || ""} ${c.nombre} · G${g.numero}: propia ${pesos(Number(c.sueldoBruto))} vs grupo ${pesos(Number(g.sueldoBruto))}`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
