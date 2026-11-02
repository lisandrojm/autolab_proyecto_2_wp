import React, { useEffect, useMemo, useState } from "react";
import { tramiteSinConvenioNiCategoria } from "@compartido/tramiteSinEscala";
import { usersAPI } from "../../api/users";
import { companiesAPI, Company } from "../../api/companies";
import { contratosAPI, ContratoItem } from "../../api/contratos";
import { areasAPI, Area } from "../../api/areas";
import { shiftsAPI, Shift } from "../../api/shifts";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import { activityLogTypesAPI, RequestConfig } from "../../api/requestConfig";
import { projectsAPI } from "../../api/projects";
import { InfoItem } from "../../api/info";
import { EstadoBadge } from "../EstadoSelect";
import { textoDeDias } from "../../utils/jerarquiaTurnos";
import { mesesEquivalentes, mesesParaImportes, periodoDeCalculo } from "../../utils/jornadas";
import { importePorJornadaDeCategoria, proporcionNetoDeCategoria } from "../../utils/seleccionConvenioCategoria";
import type { ProyectoDeSolicitud, useCatalogosDeSolicitudes } from "./SolicitudesTable";

/*
  EL RESUMEN DE UN ALTA: quién, contrato, convenio e importes, área y turno, reemplazo.

  Lo comparten el detalle de una SOLICITUD (`SolicitudDetalleModal`) y el de un CONTRATO
  (`ContratoDetalleModal`, 02/11/2026, pedido del usuario: tocar la fila de Contratos tenía que mostrar
  lo mismo que tocar la de Solicitudes). Es un solo componente para que las dos pantallas no terminen
  contestando distinto sobre el mismo contrato: el de Contratos arma con la fila un objeto con la forma
  de `metadata` de la solicitud (ver `metadataDelContrato`) y pasa por las mismas cuentas.

  Los nombres se resuelven contra los catálogos, no se guardan: muestran lo que el ABM dice HOY. Lo que
  no se pueda resolver se muestra como «—» y no se inventa.

  LO QUE NO APLICA NO SE MUESTRA: un servicio no lleva convenio ni categoría (es la misma regla del
  formulario, `tipoImpositivo === "constancia_cuit"`), y sin reemplazo no hay a quién reemplazar.
*/

const conveniosApi = createSimpleCatalogApi("/convenios");

export const fecha = (iso?: string | null) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};
const pesos = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? "" : `$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Una fila de dato. Sin valor muestra «—»: el campo existe, sólo que no vino. */
export const Fila = ({ label, valor }: { label: string; valor?: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-gray-700/60 py-2 last:border-b-0">
    <p className="shrink-0 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    <div className="min-w-0 break-words text-right text-sm font-medium text-gray-800 dark:text-gray-200">{valor === "" || valor == null ? <span className="text-gray-400">—</span> : valor}</div>
  </div>
);

export const Bloque = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{titulo}</p>
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 bg-white dark:bg-gray-800/40">{children}</div>
  </div>
);

interface Props {
  /** Los datos del alta con la forma de `metadata` de una solicitud. */
  m: any;
  catalogos: ReturnType<typeof useCatalogosDeSolicitudes>;
  /** Los proyectos ya resueltos; si faltan se buscan por `m.projectIds`. */
  proyectos?: ProyectoDeSolicitud[];
  /** Qué decir en «Persona» (la solicitud dice si ya existe; el contrato, el CUIT). */
  persona: React.ReactNode;
  /** El estado impositivo, cuando no sale de `m.tipoImpositivo` (el contrato lo toma de su plantilla). */
  tramite?: InfoItem | null;
  /** Filas propias del contrato que no tiene una solicitud (estado, sede…), al pie del bloque «Contrato». */
  filasContrato?: React.ReactNode;
}

export const ResumenDelAlta: React.FC<Props> = ({ m, catalogos, proyectos, persona, tramite: tramiteDado, filasContrato }) => {
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [turnos, setTurnos] = useState<Shift[]>([]);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [motivos, setMotivos] = useState<RequestConfig[]>([]);
  /** A quién reemplaza, buscado aparte: viene como id y el nombre no está en la solicitud. */
  const [reemplazado, setReemplazado] = useState<string>("");
  /** Los proyectos pedidos, cuando la pantalla no los trae resueltos (la app no los tiene a mano). */
  const [proyectosPropios, setProyectosPropios] = useState<ProyectoDeSolicitud[]>([]);

  // Los catálogos con los que se traducen los ids. Cada uno falla solo: si no llega, ese campo dice «—».
  useEffect(() => {
    let vivo = true;
    const guardar = <T,>(set: (v: T) => void) => (v: T) => {
      if (vivo) set(v);
    };
    // `slim`: el detalle sólo muestra la razón social de la empleadora del contrato.
    companiesAPI.list({ slim: true }).then(guardar(setEmpresas)).catch(() => {});
    contratosAPI.list().then(guardar(setContratos)).catch(() => {});
    areasAPI.listAll().then(guardar(setAreas)).catch(() => {});
    shiftsAPI.getAll().then(guardar(setTurnos)).catch(() => {});
    conveniosApi.list().then(guardar(setConvenios)).catch(() => {});
    activityLogTypesAPI.getAll().then(guardar(setMotivos)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // El nombre de quien se reemplaza: la solicitud guarda el id, no el nombre.
  useEffect(() => {
    const idReemplazado = String(m.replacedUserId || "");
    setReemplazado("");
    if (!idReemplazado) return;
    let vivo = true;
    usersAPI
      .get(idReemplazado)
      .then((u) => {
        if (vivo) setReemplazado(u.metadata?.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "");
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [m.replacedUserId]);

  /*
    Los proyectos de la solicitud, por su cuenta: `metadata.projectIds` son ids pelados y la app no
    tiene la lista cargada. Se pide sólo si la pantalla no los pasó y hay ids que resolver.
  */
  const idsProyectos = ((m.projectIds || []) as any[]).map((p) => String(typeof p === "object" ? p?._id : p)).filter(Boolean).join(",");
  const hayProyectos = !!proyectos && proyectos.length > 0;
  useEffect(() => {
    const ids = idsProyectos ? idsProyectos.split(",") : [];
    if (hayProyectos || ids.length === 0) return;
    let vivo = true;
    projectsAPI
      .listAll({ slim: true })
      .then((ps) => {
        if (!vivo) return;
        setProyectosPropios(ps.filter((p) => ids.includes(String(p._id))).map((p) => ({ _id: String(p._id), name: p.name, clienteNombre: typeof p.clientId === "object" ? p.clientId?.name : undefined })));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [idsProyectos, hayProyectos]);

  const nombreDe = <T extends { _id: string }>(lista: T[], idBuscado: any, campo: (x: T) => string) => {
    const buscado = String(typeof idBuscado === "object" && idBuscado ? idBuscado._id : idBuscado || "");
    if (!buscado) return "";
    const x = lista.find((i) => String(i._id) === buscado);
    return x ? campo(x) : "";
  };

  const rolesEmpresa = useMemo(() => {
    const crudos: any[] = m.roles_frame || m.rolesFrameIds || (m.roleFrameId ? [m.roleFrameId] : []);
    return crudos
      .map((raw) => (typeof raw === "object" && raw ? raw.name || nombreDe(catalogos.roleFrames, raw._id, (rf) => rf.name) : nombreDe(catalogos.roleFrames, raw, (rf) => rf.name)))
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.roles_frame, m.rolesFrameIds, m.roleFrameId, catalogos.roleFrames]);

  /*
    La categoría, por `_id` o por su id numérico: las solicitudes guardan el `_id` del catálogo, pero
    las de antes de la migración (y los contratos) traen el número (`data.id`). Las dos formas
    resuelven; «—» queda sólo para lo que de verdad no está.
  */
  const idCategoria = String(m.categoriaSatId || "");
  const categoria = idCategoria ? catalogos.categoriasSat.find((c) => String(c._id) === idCategoria) || catalogos.categoriasSat.find((c) => String(c.data?.id) === idCategoria) : undefined;
  /*
    El convenio, CON SU NÚMERO. El nombre solo («TELEVISIÓN») no identifica el CCT: es el número
    (0634/11) lo que va a ARCA y lo que figura en el contrato. Si no se guardó el convenio, se toma el
    de la categoría, que es el que rige de todos modos.
  */
  const convenioElegido = convenios.find((c) => String(c._id) === String(m.convenioId || "")) || (categoria?.data?.convenio ? convenios.find((c) => String(c.externalId || "").trim() === String(categoria.data.convenio).trim()) : undefined);
  const cctTexto = convenioElegido ? [String(convenioElegido.externalId || "").trim(), convenioElegido.name].filter(Boolean).join(" · ") : String(categoria?.data?.convenio || "");
  const grupoTexto = categoria?.data?.numeroCategoria ? `Grupo ${categoria.data.numeroCategoria}${categoria.data.grupoNombre ? ` — ${categoria.data.grupoNombre}` : ""}` : categoria ? "Sin grupo" : "";
  // Sin convenio ni categoría según el trámite: hoy ninguno (ver `tramiteSinConvenioNiCategoria`).
  const esServicios = tramiteSinConvenioNiCategoria(m.tipoImpositivo);
  const tramite = tramiteDado !== undefined ? tramiteDado : catalogos.resolverTramite(m.tipoImpositivo);
  const diasSemana: number[] = Array.isArray(m.diasSemana) ? m.diasSemana : [];
  const jornadas = Number(m.workdaysCount) || 0;
  const valorJornada = Number(m.dailyRate) || 0;
  const diasPorSemana = Number(m.diasPorSemana) || 0;
  /*
    Los importes derivados se calculan acá, con las mismas cuentas del formulario.

    Se guarda el importe por jornada: por semana, por mes y el total del contrato son los números por
    los que se pregunta, y recalcularlos con la fórmula compartida evita que esta pantalla conteste
    distinto que la que cargó el alta.
  */
  // Tiempo indeterminado: las jornadas son las de un mes completo y no hay total (ver `periodoDeCalculo`).
  const contratoDeLaSolicitud = contratos.find((c) => String(c._id) === String(m.contratoId || ""));
  const indeterminado = !!contratoDeLaSolicitud?.data?.esTiempoIndeterminado;
  const periodo = periodoDeCalculo(m.startDate, m.dueDate, indeterminado);
  // Con jornadas en el tipo («Jornada»: 22 por mes), el mensual es jornada × 22: ver `mesesParaImportes`.
  const mesesEq = mesesParaImportes(
    mesesEquivalentes(periodo.desde, periodo.hasta, diasSemana, Array.isArray(m.fechasTrabajadas) && m.fechasTrabajadas.length ? m.fechasTrabajadas : undefined),
    jornadas,
    Number(contratoDeLaSolicitud?.data?.cantidadJornadas) || null,
  );
  const totalCalculado = jornadas > 0 ? valorJornada * jornadas : null;
  const mensual = totalCalculado !== null && mesesEq > 0 ? totalCalculado / mesesEq : null;
  const total = indeterminado ? null : totalCalculado;
  // La semana del contrato: los días por semana del tipo («Jornada»: 5) si los tiene, aunque sea por días sueltos.
  const diasDeLaSemana = Number(contratoDeLaSolicitud?.data?.diasPorSemana) > 0 ? Number(contratoDeLaSolicitud!.data!.diasPorSemana) : diasPorSemana;
  const semanal = valorJornada > 0 && diasDeLaSemana > 0 ? valorJornada * diasDeLaSemana : null;
  /*
    LO MISMO QUE MUESTRA EL FORMULARIO: la escala de la categoría y el neto. El importe por jornada
    guardado es BRUTO; el neto sale de la proporción neto/bruto de la escala, y la escala se muestra
    ajustada por cuánto se apartó lo pactado de ella (el mismo factor que usa `EscalaDelContrato`).
  */
  const proporcionNeto = esServicios ? null : proporcionNetoDeCategoria(categoria);
  // Pedido de servicios: sólo los netos, como en el formulario (ver `soloNeto` en `ImportesDelContrato`).
  const soloNeto = m.tipoImpositivo === "constancia_cuit" && !!proporcionNeto;
  const netoPorJornada = proporcionNeto && valorJornada > 0 ? valorJornada * proporcionNeto : null;
  const totalNeto = !indeterminado && netoPorJornada !== null && jornadas > 0 ? netoPorJornada * jornadas : null;
  const jornadaDeEscala = categoria && !esServicios ? importePorJornadaDeCategoria(categoria, Number(contratoDeLaSolicitud?.data?.multiplicadorDiario) || null, Number(contratoDeLaSolicitud?.data?.cantidadJornadas) || null) : 0;
  const factorEscala = jornadaDeEscala > 0 && valorJornada > 0 ? valorJornada / jornadaDeEscala : 1;
  const escalaAjustada = (v: unknown) => (Number(v) > 0 ? Number(v) * factorEscala : null);
  const adicionalPct = Number(categoria?.data?.sueldoBasico) > 0 ? (Number(categoria?.data?.sueldoAdicional) / Number(categoria?.data?.sueldoBasico)) * 100 : null;

  /*
    ÁREA Y TURNO, CON HORARIO Y DÍAS. El nombre del turno solo («Tarde») no dice a qué hora ni qué
    días: eso es lo que define el turno en el ABM y lo que se quiere ver, abreviado.
  */
  const areasTurnos: { area: string; turnos: string[]; detalle: { nombre: string; horario: string; dias: string }[] }[] = (m.areaShiftAssignments || []).map((a: any) => {
    const detalle = (a.shiftIds || [])
      .map((s: any) => {
        const t = turnos.find((x) => String(x._id) === String(typeof s === "object" && s ? s._id : s));
        return t ? { nombre: t.name, horario: t.startTime && t.endTime ? `${t.startTime}–${t.endTime}` : "", dias: textoDeDias(t.days) } : null;
      })
      .filter(Boolean) as { nombre: string; horario: string; dias: string }[];
    const areaNombre = (typeof a.areaId === "object" && a.areaId?.name) || nombreDe(areas, a.areaId, (x) => x.name) || "Área";
    return { area: areaNombre, turnos: detalle.map((d) => d.nombre), detalle };
  });

  const proyectosAMostrar = proyectos && proyectos.length > 0 ? proyectos : proyectosPropios;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        <Bloque titulo="Quién">
          <Fila label="Nombre" valor={m.fullName} />
          <Fila label="Persona" valor={persona} />
          <Fila label="Proyecto" valor={proyectosAMostrar.length > 0 ? <div className="space-y-0.5">{proyectosAMostrar.map((p) => <p key={p._id} className="text-xs">{p.clienteNombre && <span className="text-gray-400">{p.clienteNombre} · </span>}{p.name}</p>)}</div> : ""} />
          <Fila label="Rol empresa" valor={rolesEmpresa.length > 0 ? rolesEmpresa.join(", ") : m.nombre_rol_frame || ""} />
        </Bloque>

        <Bloque titulo="Contrato">
          <Fila label="Empresa del contrato" valor={nombreDe(empresas, m.empresaContratoId, (c) => c.razonSocial) || m.nombre_empresa_contrato} />
          <Fila label="Tipo de contrato" valor={nombreDe(contratos, m.contratoId, (c) => c.name) || m.nombre_contrato} />
          <Fila label="Tipo de alta" valor={tramite ? <EstadoBadge name={tramite.name} /> : ""} />
          <Fila label="Desde" valor={fecha(m.startDate)} />
          <Fila label="Hasta" valor={m.dueDate ? fecha(m.dueDate) : "Indeterminado"} />
          <Fila label="Horario" valor={m.schedule} />
          <Fila label="Días" valor={diasSemana.length > 0 ? `${m.diasRotativos ? "Rota entre " : ""}${textoDeDias(diasSemana)}${diasPorSemana ? ` · ${diasPorSemana} por semana` : ""}` : diasPorSemana ? `${diasPorSemana} por semana` : ""} />
          {/*
            LAS JORNADAS AJUSTADAS A MANO SE MUESTRAN COMO TALES.

            Que sean 18 y no las 22 del calendario es exactamente lo que hay que revisar antes de
            aprobar, junto con el motivo que se dio. Sin esto, la diferencia pasa sin que nadie la vea.
          */}
          <Fila
            label="Jornadas"
            valor={
              jornadas > 0 ? (
                <span>
                  {jornadas}
                  {m.workdaysOverridden && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Ajustadas (calendario: {m.workdaysCalculated ?? "—"})</span>
                  )}
                </span>
              ) : (
                ""
              )
            }
          />
          {m.workdaysOverridden && <Fila label="Motivo del ajuste" valor={[m.workdaysOverrideReason, m.workdaysOverrideNote].filter(Boolean).join(" · ")} />}
          {filasContrato}
        </Bloque>
      </div>

      <div className="space-y-4">
        <Bloque titulo={esServicios ? "Importes" : "Convenio e importes"}>
          {esServicios ? (
            <p className="border-b border-gray-100 py-2 text-[11px] text-gray-500 dark:border-gray-700/60 dark:text-gray-400">Es un servicio: no hay convenio ni categoría, así que el importe se cargó a mano.</p>
          ) : (
            <>
              <Fila label="Convenio (CCT)" valor={cctTexto} />
              <Fila
                label="Categoría"
                valor={
                  categoria ? (
                    <span>
                      {categoria.name}
                      {categoria.data?.codigoArca && <span className="ml-1.5 font-mono text-[11px] text-gray-400">{categoria.data.codigoArca}</span>}
                    </span>
                  ) : (
                    m.nombre_categoria_sat || ""
                  )
                }
              />
              <Fila label="Grupo" valor={grupoTexto} />
              {categoria && (
                <>
                  {!soloNeto && (
                    <>
                      <Fila label="Sueldo básico" valor={pesos(escalaAjustada(categoria.data?.sueldoBasico))} />
                      <Fila label="Adicional" valor={pesos(escalaAjustada(categoria.data?.sueldoAdicional))} />
                      <Fila label="% Adicional" valor={adicionalPct !== null ? `${adicionalPct.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %` : ""} />
                      <Fila label="Presentismo" valor={pesos(escalaAjustada(categoria.data?.presentismo))} />
                      <Fila label="Sueldo bruto" valor={pesos(escalaAjustada(categoria.data?.sueldoBruto))} />
                    </>
                  )}
                  <Fila label="Sueldo neto" valor={pesos(escalaAjustada(categoria.data?.neto))} />
                </>
              )}
            </>
          )}
          {/* Los mismos rótulos y cuentas que el formulario (`ImportesDelContrato`): cada importe en bruto y en neto; el total, sólo neto. */}
          {!soloNeto && <Fila label={proporcionNeto ? "Importe por jornada bruto" : "Importe por jornada"} valor={pesos(valorJornada || null)} />}
          {proporcionNeto && <Fila label="Importe por jornada neto" valor={pesos(netoPorJornada)} />}
          {!soloNeto && <Fila label={proporcionNeto ? "Importe por semana bruto" : "Importe por semana"} valor={pesos(semanal)} />}
          {proporcionNeto && <Fila label="Importe por semana neto" valor={pesos(semanal != null ? semanal * proporcionNeto : null)} />}
          {!soloNeto && <Fila label={proporcionNeto ? "Importe mensual bruto" : "Importe mensual"} valor={pesos(mensual)} />}
          {proporcionNeto && <Fila label="Importe mensual neto" valor={pesos(mensual != null ? mensual * proporcionNeto : null)} />}
          <Fila label={proporcionNeto ? "Importe total del contrato neto" : "Importe total"} valor={indeterminado ? <span className="text-gray-400">No tiene: tiempo indeterminado</span> : pesos(proporcionNeto ? totalNeto : total)} />
          {soloNeto && <p className="text-[11px] text-gray-500 dark:text-gray-400">Pedido de servicios: los importes son valores de referencia de la categoría asignada, del sindicato y convenio elegidos.</p>}
          {/* De dónde sale el total: el mismo resumen que el formulario (ver `resumenTotal` en `ImportesDelContrato`). */}
          {!indeterminado && jornadas > 0 && valorJornada > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-gray-200 bg-gray-50/60 px-2.5 py-2 text-[11px] leading-snug text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
              {(contratoDeLaSolicitud?.name || tramite) && (
                <li>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Tipo de contrato:</span> {[contratoDeLaSolicitud?.name, tramite?.name].filter(Boolean).join(" · ")}
                </li>
              )}
              <li>
                <span className="font-semibold text-gray-600 dark:text-gray-300">Período:</span>{" "}
                {Array.isArray(m.fechasTrabajadas) && m.fechasTrabajadas.length ? [...m.fechasTrabajadas].sort().map((f: string) => fecha(f)).join(", ") : `Del ${fecha(m.startDate)} al ${fecha(m.dueDate)}`}
              </li>
              {areasTurnos.length > 0 && (
                <li>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Área / turno:</span> {areasTurnos.map((a) => `${a.area} · ${a.detalle.map((t) => `${t.nombre}${t.horario ? ` (${t.horario})` : ""}`).join(", ")}`).join("; ")}
                </li>
              )}
              {(diasSemana.length > 0 || diasPorSemana > 0) && (
                <li>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Días:</span> {[m.diasRotativos ? "Rotativos" : textoDeDias(diasSemana), diasPorSemana ? `${diasPorSemana} por semana` : ""].filter(Boolean).join(" · ")}
                </li>
              )}
              <li>
                <span className="font-semibold text-gray-600 dark:text-gray-300">Cantidad de jornadas:</span> {jornadas}
              </li>
              <li>
                <span className="font-semibold text-gray-600 dark:text-gray-300">Cuenta:</span> {pesos(netoPorJornada ?? valorJornada)}
                {netoPorJornada !== null ? " neto" : ""} por jornada × {jornadas} {jornadas === 1 ? "jornada" : "jornadas"} = {pesos(netoPorJornada !== null ? totalNeto : total)}
              </li>
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Área y turno">
          {areasTurnos.length > 0 ? (
            areasTurnos.map((a, i) => (
              <Fila
                key={`${a.area}-${i}`}
                label={a.area}
                valor={
                  a.detalle.length > 0 ? (
                    <div className="space-y-0.5">
                      {a.detalle.map((t, j) => (
                        <p key={`${t.nombre}-${j}`}>
                          {t.nombre}
                          {(t.horario || t.dias) && <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">{[t.horario, t.dias].filter(Boolean).join(" · ")}</span>}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">Sin turno</span>
                  )
                }
              />
            ))
          ) : (
            <Fila label="Área" valor="" />
          )}
        </Bloque>

        <Bloque titulo="Reemplazo">
          <Fila label="Reemplaza a alguien" valor={m.isReplacement ? "Sí" : "No"} />
          {m.isReplacement && <Fila label="Persona reemplazada" valor={reemplazado || m.nombre_reemplazado || (m.empleado_id_reemplezado ? `Legajo ${m.empleado_id_reemplezado}` : "")} />}
          {m.isReplacement && <Fila label="Motivo" valor={nombreDe(motivos, m.motivoReemplazoId, (x) => x.name)} />}
        </Bloque>
      </div>
    </div>
  );
};
