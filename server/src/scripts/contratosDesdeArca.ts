import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Info } from "../models/Info.js";
import { Contrato } from "../models/Contrato.js";
import { RelacionLaboralArca } from "../models/RelacionLaboralArca.js";
import { ArcaModalidadContratacion } from "../models/ArcaModalidadContratacion.js";
import { listaBajasArca } from "../services/arca/listaBajasArca.js";
import { adoptarAltasExternas } from "../services/arca/adopcionAltasExternas.js";
import { decidirAltaExterna } from "../services/arca/decisionAltaExterna.js";
import { lectorDeTiposDeContrato } from "../services/vacaciones/tiposDeContrato.js";
import { CAMPOS_DEL_TIPO_PARA_IMPORTES, jornadasQueFijaElTipo, sueldosConEscala } from "../services/importesDelContrato.js";
import { buscarCategoriaCompatPorLegacyId } from "../utils/categoriaCompat.js";
import { importePorJornada } from "../compartido/jornadas.js";
import { esLapida } from "../utils/anulacionContrato.js";
import { fechaISO } from "../utils/contratoVigencia.js";
import { Project } from "../models/Project.js";
import { rolesPorDefecto } from "../services/solicitudes.js";
import { sumarAlConteo } from "../services/conteoUsuariosTenant.js";
import { estadoContratado } from "../services/contratadoDirecto.js";
import { randomBytes } from "node:crypto";

/**
 * CONTRATOS QUE FALTAN EN WEPRODU PARA RELACIONES VIVAS DE ARCA (23/11/2026, pedido del usuario: «crear los
 * contratos para los vigentes que no tienen, pero sin solicitud»).
 *
 * Toma las filas de Bajas ARCA en la situación 4 («Sin contrato en WeProdu») cuya persona SÍ tiene ficha, y para
 * cada una crea el contrato que falta como lo crearía «Agregar miembro» (`origen: "agregar_miembro"`, sin
 * `solicitudId`):
 *   · BASE: el último contrato de la persona con esa empleadora (mismo vínculo, mismo proyecto). Se copia todo
 *     salvo lo que es de un documento puntual o de la identidad de ese contrato (firma, constancia, clave, estado).
 *   · FECHAS: las de ARCA (inicio y fin de la relación).
 *   · TIPO: el del catálogo (`tipoDelCatalogo` de la base), con `tipo_contrato_id = 0` como todo lo de WeProdu.
 *   · JORNADAS Y SUELDOS: la misma cuenta que hace el server al guardar un contrato (`jornadasQueFijaElTipo`,
 *     `sueldosConEscala`), con el importe por jornada de la escala vigente de la categoría.
 *   · ESTADO: el del alta temprana (trámite impositivo). Enseguida `adoptarAltasExternas` la reconoce en el espejo
 *     de ARCA, la marca presentada (`via: "externa"`, sin abrir ARCA ni volver a presentarla) y la pasa a Generar
 *     Documentos: desde ahí sigue el circuito de siempre (constancia, documentos, firma).
 *
 * NO crea nada si la persona ya tiene un contrato con esa empleadora que se superpone con la relación (es otra
 * fecha de inicio, no un contrato que falta: Jordan, Valentina Pellegrini), ni para quien no tiene ficha.
 *
 * SIN FICHA (`--crear-fichas --proyecto=NOMBRE`, decisión del usuario del 23/11/2026 para los directores por LRT):
 * se crea la ficha con el CUIL y el nombre de ARCA (sin validar, sin email real ni acceso: email
 * `arca-<cuil>@sin-email.invalid` y clave al azar) y, por cada relación, un contrato Tiempo Indeterminado en ese
 * proyecto con la empleadora y el inicio de ARCA, la retribución pactada como bruto mensual, directo en el estado
 * final (Contratados): es una relación que existe hace años, no se generan documentos ni se firma. El alta queda
 * marcada presentada (`via: "externa"`) para que nadie la vuelva a presentar.
 *
 * En seco por defecto; `--aplicar` escribe. `TENANT_SLUG` limita a un tenant.
 */

const APLICAR = process.argv.includes("--aplicar");
const CREAR_FICHAS = process.argv.includes("--crear-fichas");
const PROYECTO = (process.argv.find((a) => a.startsWith("--proyecto=")) || "").slice(11);
const NO_SE_COPIAN = new Set([
  "_id", "contratoKey", "estadoContrato", "anulacion", "solicitudId", "origen", "fecha_carga", "circuitoReparado",
  "estado_id", "nombre_estado_empleado", "contrato_id", "tipo_contrato_id", "nombre_contrato",
  "fecha_alta_contrato", "fecha_baja_contrato", "cantidad_jornadas_laborales", "fechas_trabajadas", "jornadas_ajustadas", "motivo_ajuste_jornadas",
  "sueldo_jornada", "sueldo_mano", "sueldo_mano_texto", "sueldo_neto", "sueldo_bruto", "sueldo_diario_neto", "diferencia_diaria_neto",
  "firmaContratoUrl", "firmaContratoNombre", "firmaReleases", "firmaEmpresaContratoId", "firmaEmpresaReleaseId", "firmaGeneradoAt", "firmaReleasesGeneradoAt", "firmaEnviadaAt",
  "contenidoCustomContrato", "contenidoCustomReleases", "contenidoCustomEditadoPor", "contenidoCustomEditadoEl",
  "altaDocumentoUrl", "altaDocumentoNombre", "altaEnviadaAFirmarEl", "altaArcaPresentada", "altaConstancia", "enviosArca", "verificacionArca",
  "origenBaja", "bajaArca", "motivoBajaArca", "fechaTelegramaBaja", "bajaArcaPresentada",
  "valoracion_id", "valoracion_regla_id", "nombre_valoracion", "valoracionOverride", "calificacion", "reciboSueldo", "reciboDesvinculado",
]);

const dia = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(String(v ?? "")));
const seCruzan = (a1: string, b1: string, a2: string, b2: string) => a1 <= (b2 || "9999-12-31") && a2 <= (b1 || "9999-12-31");

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const estadoAlta: any = await Info.findOne({ type: "estado-empleado", "data.esImpositivo": true, "data.tipoImpositivo": "alta_temprana_afip" }).lean();
  if (!estadoAlta?.data?.id) throw new Error("No hay un estado impositivo de alta temprana (AFIP) configurado.");
  const tipoDe = await lectorDeTiposDeContrato();
  console.log(`Estado inicial: «${estadoAlta.name}» (id ${estadoAlta.data.id}). ${APLICAR ? "APLICANDO." : "En seco (agregá --aplicar para escribir)."}\n`);

  const tenants: any[] = await Tenant.find(process.env.TENANT_SLUG ? { slug: process.env.TENANT_SLUG } : {}).select("_id slug").lean();
  for (const t of tenants) {
    const lista: any = await listaBajasArca(t._id);
    const filas = lista.filas.filter((f: any) => f.situacion === 4);
    if (!filas.length) continue;
    console.log(`== ${t.slug}: ${filas.length} relaciones vivas sin contrato en WeProdu`);
    const creados: Array<{ userProjectId: string; contractIndex: number }> = [];
    const sinFicha: any[] = [];
    for (const f of filas) {
      const quien = `${f.persona} (${f.cuil}) · ${f.empleadora} · ARCA ${f.inicio} → ${f.finArca || "sin fin"}`;
      if (!f.userId) {
        if (CREAR_FICHAS) sinFicha.push(f);
        else console.log(`  — ${quien}: sin ficha en WeProdu, no se crea (ver --crear-fichas).`);
        continue;
      }
      const ups: any[] = await UserProject.find({ userId: f.userId }).lean();
      // La empleadora del contrato va por id; la de la fila, por CUIT: se resuelve con el espejo.
      const rel: any = await RelacionLaboralArca.findOne({ tenantId: t._id, cuil: f.cuil, empleadoraCuit: f.empleadoraCuit, fechaInicio: new Date(`${f.inicio}T00:00:00.000Z`) }).lean();
      const empresaId = String(rel?.empleadoraCompanyId || "");
      // Los contratos de esa empleadora (sin anulados ni Servicios, que no son relación de ARCA).
      const deLaEmpresa = ups.flatMap((up) =>
        (up.contracts || []).map((c: any, i: number) => ({ up, i, c })).filter((x: any) => !esLapida(x.c) && String(x.c.empresaContratoId || "") === empresaId && !/servicio/i.test(String(x.c.nombre_contrato || ""))),
      );
      if (!empresaId || !deLaEmpresa.length) {
        console.log(`  — ${quien}: sin contratos anteriores con esa empleadora para copiar, no se crea.`);
        continue;
      }
      const cruce = deLaEmpresa.find((x: any) => seCruzan(dia(x.c.fecha_alta_contrato), dia(x.c.fecha_baja_contrato), f.inicio, f.finArca));
      if (cruce) {
        console.log(`  — ${quien}: ya tiene «${cruce.c.nombre_contrato}» ${dia(cruce.c.fecha_alta_contrato)} → ${dia(cruce.c.fecha_baja_contrato) || "sin baja"} en ${cruce.up.nombre_proyecto}: es otra fecha de inicio, no un contrato que falta. No se crea.`);
        continue;
      }
      const base = [...deLaEmpresa].sort((a: any, b: any) => dia(a.c.fecha_alta_contrato).localeCompare(dia(b.c.fecha_alta_contrato))).pop()!;
      const tipoId = tipoDe(base.c);
      const tipo: any = tipoId ? await Contrato.findById(tipoId).select(`name isActive data.diasPorSemana data.requiereFirmaRelease data.afipModalidadContrato ${CAMPOS_DEL_TIPO_PARA_IMPORTES}`).lean() : null;
      if (!tipo) {
        console.log(`  — ${quien}: el tipo del contrato base («${base.c.nombre_contrato}») no está en el catálogo, no se crea.`);
        continue;
      }

      const nuevo: any = {};
      for (const [k, v] of Object.entries(base.c)) if (!NO_SE_COPIAN.has(k)) nuevo[k] = v;
      Object.assign(nuevo, {
        fecha_alta_contrato: f.inicio,
        fecha_baja_contrato: f.finArca || null,
        contrato_id: String(tipo._id),
        tipo_contrato_id: 0,
        nombre_contrato: tipo.name,
        estado_id: estadoAlta.data.id,
        nombre_estado_empleado: estadoAlta.name,
        origen: "agregar_miembro",
        creadoDesdeArca: { el: new Date(), empleadoraCuit: f.empleadoraCuit, inicio: f.inicio, fin: f.finArca || null, base: { userProjectId: String(base.up._id), posicion: base.i } },
        fecha_carga: new Date().toISOString(),
      });
      if (!Array.isArray(nuevo.dias_semana) && Number(tipo.data?.diasPorSemana) === 5) Object.assign(nuevo, { dias_semana: [1, 2, 3, 4, 5], dias_por_semana: 5, dias_rotativos: false });
      if (tipo.data?.requiereFirmaRelease && !nuevo.empresaReleaseId) Object.assign(nuevo, { empresaReleaseId: nuevo.empresaContratoId, nombre_empresa_release: nuevo.nombre_empresa_contrato });
      const jornadas = jornadasQueFijaElTipo(nuevo, tipo);
      if (jornadas) nuevo.cantidad_jornadas_laborales = jornadas;
      const cat = nuevo.categoria_sat_id != null ? await buscarCategoriaCompatPorLegacyId(Number(nuevo.categoria_sat_id)) : null;
      const jornadaEscala = cat ? importePorJornada((cat as any).data, tipo.data?.multiplicadorDiario, tipo.data?.cantidadJornadas) : 0;
      nuevo.sueldo_jornada = Number(jornadaEscala.toFixed(2));
      Object.assign(nuevo, await sueldosConEscala(nuevo, tipo));

      // Lo que va a decidir la adopción, para verlo antes de escribir (con el nombre de la modalidad, como ella).
      const codigo = String(tipo.data?.afipModalidadContrato || "").replace(/\D/g, "").padStart(3, "0");
      const modalidad: any = await ArcaModalidadContratacion.findOne({ externalId: { $in: [codigo, Number(codigo)] } }).select("name").lean();
      const decision = decidirAltaExterna(
        { alta: f.inicio, baja: f.finArca || "", modalidadCodigo: codigo, modalidadNombre: String(modalidad?.name || ""), otroContratoMismoDia: false },
        [{ inicio: f.inicio, fin: f.finArca || "", modalidad: String(rel?.modalidadContrato || "").trim() }],
      );
      console.log(`  + ${quien}`);
      console.log(`      en ${base.up.nombre_proyecto}, copia de «${base.c.nombre_contrato}» ${dia(base.c.fecha_alta_contrato)} → ${dia(base.c.fecha_baja_contrato) || "sin baja"} (posición ${base.i})`);
      console.log(`      nuevo: «${nuevo.nombre_contrato}» ${nuevo.fecha_alta_contrato} → ${nuevo.fecha_baja_contrato || "sin baja"} · ${nuevo.nombre_categoria_sat} · ${nuevo.nombre_rol_frame} · ${nuevo.cantidad_jornadas_laborales} jornadas · jornada ${nuevo.sueldo_jornada} · bruto ${nuevo.sueldo_bruto} (ARCA: ${rel?.retribucionPactada ?? "—"}) · neto ${nuevo.sueldo_neto}`);
      console.log(`      adopción del alta: ${decision ? `${decision.accion}${"motivo" in decision ? ` (${(decision as any).motivo})` : ""}` : "sin decisión"}`);
      if (!APLICAR) continue;

      const doc = await UserProject.findById(base.up._id);
      if (!doc) continue;
      doc.contracts.push(nuevo);
      doc.markModified("contracts");
      await doc.save();
      const contractIndex = doc.contracts.length - 1;
      creados.push({ userProjectId: String(doc._id), contractIndex });
      await User.updateOne({ _id: f.userId }, { $set: { "metadata.activo": true } });
      console.log(`      creado en la posición ${contractIndex} (clave ${String((doc.contracts[contractIndex] as any).contratoKey || "")}).`);
    }
    if (sinFicha.length) await crearFichas(t._id, sinFicha);
    if (APLICAR && creados.length) {
      const r = await adoptarAltasExternas({ tenantObjectId: t._id, detectadaPor: "manual", soloContratos: creados });
      for (const x of r) console.log(`  alta de ${x.nombre}: ${x.accion} — ${x.motivo}`);
      const sinAdoptar = creados.filter((c) => !r.some((x) => x.userProjectId === c.userProjectId && x.contractIndex === c.contractIndex && x.accion === "marcada_presentada"));
      if (sinAdoptar.length) console.log(`  OJO: ${sinAdoptar.length} contrato(s) quedaron en «${estadoAlta.name}» sin marcar presentados: revisarlos en Altas Automáticas antes de que se presenten.`);
    }
  }
  await mongoose.disconnect();
}

async function crearFichas(tenantId: any, filas: any[]) {
  const proyecto: any = PROYECTO ? await Project.findOne({ tenantId, name: PROYECTO }).lean() : null;
  if (!proyecto) throw new Error(`--crear-fichas necesita --proyecto=<nombre exacto de un proyecto del tenant> («${PROYECTO}» no existe).`);
  const tipo: any = await Contrato.findOne({ name: "Tiempo Indeterminado", isActive: true }).select(`name data.afipModalidadContrato ${CAMPOS_DEL_TIPO_PARA_IMPORTES}`).lean();
  const final: any = await estadoContratado();
  if (!tipo || !final?.data?.id) throw new Error("Falta el tipo «Tiempo Indeterminado» o el estado final (Contratados).");
  const porCuil = new Map<string, any[]>();
  for (const f of filas) porCuil.set(f.cuil, [...(porCuil.get(f.cuil) || []), f]);
  console.log(`\n  Sin ficha: ${porCuil.size} personas, ${filas.length} relaciones → fichas nuevas y «${tipo.name}» en ${proyecto.name}, estado «${final.name}».`);
  for (const [cuil, rels] of porCuil) {
    const arca: any[] = await RelacionLaboralArca.find({ tenantId, cuil, $or: rels.map((f: any) => ({ empleadoraCuit: f.empleadoraCuit, fechaInicio: new Date(`${f.inicio}T00:00:00.000Z`) })) }).lean();
    const nombreArca = String(arca[0]?.apellidoNombre || rels[0].persona).trim().replace(/\s+/g, " ");
    const [apellido, ...nombres] = nombreArca.split(" ");
    const desde = rels.map((f: any) => f.inicio).sort()[0];
    const yaEsta: any = await User.findOne({ tenantId, "metadata.cuit": { $in: [cuil, `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}`] } }).select("_id").lean();
    if (yaEsta) { console.log(`  — ${nombreArca} (${cuil}): ya tiene ficha (${yaEsta._id}), no se crea otra.`); continue; }
    const contratos = rels.map((f: any) => {
      const r = arca.find((a) => a.empleadoraCuit === f.empleadoraCuit && dia(a.fechaInicio) === f.inicio);
      const bruto = Number(r?.retribucionPactada) || 0;
      return {
        r, f,
        c: {
          fecha_alta_contrato: f.inicio, fecha_baja_contrato: null,
          contrato_id: String(tipo._id), tipo_contrato_id: 0, nombre_contrato: tipo.name,
          estado_id: final.data.id, nombre_estado_empleado: final.name,
          empresaContratoId: String(r?.empleadoraCompanyId || ""), nombre_empresa_contrato: f.empleadora,
          puestoDesempenado: String(r?.puestoDesempenado || ""),
          nombre_categoria_sat: "Sin categoria", nombre_rol_frame: "Sin rol frame", nombre_sede: "Sin sede", nombre_area: "Sin área", nombre_turno: "Sin turno",
          cantidad_jornadas_laborales: 30, sueldo_jornada: Number((bruto / 30).toFixed(2)), sueldo_bruto: bruto,
          dias_semana: [1, 2, 3, 4, 5], dias_por_semana: 5, dias_rotativos: false,
          nombre_proyecto: proyecto.name, proyecto_id: (proyecto.metadata as any)?.id || proyecto.externalId,
          origen: "agregar_miembro",
          creadoDesdeArca: { el: new Date(), empleadoraCuit: f.empleadoraCuit, inicio: f.inicio, fin: null },
          altaArcaPresentada: { via: "externa", fecha: new Date(), resultado: "presentada", motivo: `Relación de ARCA existente desde ${f.inicio.split("-").reverse().join("/")} (${String(r?.modalidadContrato || "").slice(0, 40)}): el contrato se creó desde ARCA el 23/11/2026, no se presenta.` },
          fecha_carga: new Date().toISOString(),
        },
      };
    });
    console.log(`  + ${apellido} / ${nombres.join(" ")} (${cuil}), ficha desde ${desde}:`);
    for (const x of contratos) console.log(`      «${tipo.name}» ${x.f.empleadora} desde ${x.f.inicio} · bruto mensual ${x.c.sueldo_bruto} (ARCA) · ${x.c.puestoDesempenado}`);
    if (!APLICAR) continue;
    const user = new User({
      email: `arca-${cuil}@sin-email.invalid`,
      password: randomBytes(24).toString("hex"),
      firstName: nombres.join(" ") || nombreArca,
      lastName: apellido,
      tenantId,
      hireDate: new Date(`${desde}T00:00:00.000Z`),
      roles: await rolesPorDefecto(tenantId),
      projectIds: [proyecto._id],
      metadata: { cuit: cuil, nombre: nombres.join(" "), apellido, activo: true, fechaAlta: desde, creadoDesdeArca: true },
    });
    await user.save();
    await sumarAlConteo(tenantId, user._id as any);
    const up = new UserProject({ projectId: proyecto._id, userId: user._id, nombre_proyecto: proyecto.name, contracts: contratos.map((x) => x.c) });
    await up.save();
    await User.updateOne({ _id: user._id }, { $addToSet: { "metadata.projects": up._id } });
    await Project.updateOne({ _id: proyecto._id }, { $addToSet: { assignedUsers: user._id } });
    await Project.updateOne({ _id: proyecto._id, "teamConfig.userId": { $ne: user._id } }, { $push: { teamConfig: { userId: user._id, canRegister: true, useProjectSchedule: true } } });
    console.log(`      creada la ficha ${user._id} y el vínculo ${up._id} con ${contratos.length} contrato(s).`);
  }
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
