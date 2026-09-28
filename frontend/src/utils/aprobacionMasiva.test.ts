/**
 * Tests de `contratoDesdeSolicitud`: el contrato que arma «Aprobar N» tiene que ser el que guardaría
 * el formulario de Agregar Miembro sin tocar nada, y lo que el formulario pediría completar no se
 * inventa.
 *
 *   npx tsx --test src/utils/aprobacionMasiva.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contratoDesdeSolicitud, CatalogosAprobacion } from "./aprobacionMasiva.js";

const PLANTILLA_JORNADA = { _id: "cf1", name: "Jornada", contratoId: "c-jornada", data: { id: 7 } };
const cat: CatalogosAprobacion = {
  categoriasSat: [{ _id: "cat-mongo", name: "Microfonista", data: { id: 35378, neto: 792231.41, sueldoBruto: 978063.47 } }] as any,
  // El estado impositivo «Pedido de ARCA», vinculado a la plantilla de Jornada.
  estados: [
    { _id: "e1", name: "Activo", data: { id: 1 } },
    { _id: "e2", name: "Pedido de ARCA", data: { id: 9, esImpositivo: true, tipoImpositivo: "alta_temprana_afip", contratoFrameIds: ["cf1"] } },
  ] as any,
  sedes: [{ _id: "s1", name: "Libertador", data: { id: 3 } }] as any,
  roleFrames: [{ _id: "rf-micro", name: "Microfonista", data: { rol: { id: 55 } } }] as any,
  contratoFrames: [PLANTILLA_JORNADA] as any,
  contratos: [{ _id: "c-jornada", name: "Jornada", data: { esTiempoIndeterminado: false, horasPorJornada: 12 } }] as any,
};
const proyecto = { _id: "p1", externalId: 705, metadata: { sedeId: "3", id: 705 }, teamConfig: [] };

/** Una solicitud de una jornada (28/09, lunes), como las del equipo LN+. */
const solicitud = (extra: Record<string, any> = {}) =>
  ({
    _id: "sol1",
    metadata: {
      isSolicitud: true,
      solicitudStatus: "pendiente",
      projectIds: ["p1"],
      roles_frame: ["rf-micro"],
      categoriaSatId: "cat-mongo",
      contratoId: "c-jornada",
      empresaContratoId: "emp2030",
      schedule: "06:00 - 12:00",
      startDate: "2026-09-28T00:00:00.000Z",
      dueDate: "2026-09-28T00:00:00.000Z",
      diasPorSemana: 1,
      diasSemana: [1],
      diasRotativos: false,
      workdaysCount: 1,
      dailyRate: 500000,
      areaShiftAssignments: [{ areaId: "area1", shiftIds: ["turno1"] }],
      ...extra,
    },
  }) as any;

describe("contratoDesdeSolicitud", () => {
  it("arma el contrato completo de una solicitud de una jornada", () => {
    const s = solicitud();
    const r = contratoDesdeSolicitud({ solicitud: s, persona: s, proyecto, cat });
    assert.ok(r.ok, r.ok ? "" : r.faltan.join(", "));
    const c = r.ok ? r.armado.contract : {};
    assert.equal(c.estado_id, 9, "arranca en el estado impositivo de la plantilla: cae en la bandeja de ARCA");
    assert.equal(c.contrato_frame_id, "cf1");
    assert.equal(c.categoria_sat_id, 35378, "la categoría va con su id numérico, no el _id");
    assert.equal(c.rol_frame_id, 55);
    assert.equal(c.fecha_alta_contrato, "2026-09-28");
    assert.equal(c.fecha_baja_contrato, "2026-09-28");
    assert.equal(c.cantidad_jornadas_laborales, 1);
    assert.equal(c.sueldo_mano, 500000);
    assert.match(c.sueldo_mano_texto, /QUINIENTOS MIL/);
    assert.equal(c.sueldo_neto, 792231.41);
    assert.equal(c.sueldo_diario_neto, Number((792231.41 / 30).toFixed(2)));
    assert.equal(c.hora_inicio, "06:00");
    assert.equal(c.sede_id, 3, "la sede es la del proyecto");
    assert.equal(c.areaId, "area1");
    assert.equal(c.empresaContratoId, "emp2030");
  });

  it("sin categoría no inventa una: queda pendiente con el motivo", () => {
    const s = solicitud({ categoriaSatId: undefined });
    const r = contratoDesdeSolicitud({ solicitud: s, persona: s, proyecto, cat });
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.faltan.includes("categoría"));
  });

  it("sin área y turno tampoco", () => {
    const s = solicitud({ areaShiftAssignments: [] });
    const r = contratoDesdeSolicitud({ solicitud: s, persona: s, proyecto, cat });
    assert.ok(!r.ok && r.faltan.includes("área y turno"));
  });

  it("un horario más largo que el tope del contrato no se aprueba solo", () => {
    const s = solicitud({ schedule: "06:00 - 20:00" });
    const r = contratoDesdeSolicitud({ solicitud: s, persona: s, proyecto, cat });
    assert.ok(!r.ok && r.faltan.some((f) => f.includes("12 h")));
  });

  it("suma el rol pedido a la ficha si la persona no lo tiene", () => {
    const s = solicitud();
    // La persona real (a la que va el contrato) todavía no tiene ese oficio en su ficha.
    const sinRol = { _id: "persona1", metadata: { roles_frame: [] } } as any;
    const r = contratoDesdeSolicitud({ solicitud: s, persona: sinRol, proyecto, cat });
    assert.equal(r.ok && r.armado.rolParaLaFicha?._id, "rf-micro");
    const conRol = { ...s, metadata: { ...s.metadata, roles_frame: [{ _id: "rf-micro" }] } };
    const r2 = contratoDesdeSolicitud({ solicitud: s, persona: conRol, proyecto, cat });
    assert.equal(r2.ok && r2.armado.rolParaLaFicha, null);
  });
});
