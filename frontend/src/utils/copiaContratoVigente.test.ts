/**
 *   npx tsx --test src/utils/copiaContratoVigente.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { copiaParaOtroProyecto } from "./copiaContratoVigente.js";

const VIGENTE = {
  _id: "x",
  proyecto_id: 99,
  nombre_proyecto: "99_PRODUCTORA",
  fecha_alta_contrato: "2023-06-01",
  fecha_baja_contrato: "",
  nombre_contrato: "Tiempo Indeterminado",
  contrato_id: "abc",
  tipo_contrato_id: 3,
  rol_frame_id: 12,
  nombre_rol_frame: "Director de Programas",
  categoria_sat_id: 7,
  estado_id: 5,
  sede_id: 1,
  sueldo_jornada: 1000,
  sueldo_mano: 30000,
  empresaContratoId: "emp1",
  puestoDesempenado: "0123",
  areaId: "area1",
  shiftId: "shift1",
  areaShiftAssignments: [{ areaId: "area1", shiftIds: ["shift1"] }],
  nombre_area: "Técnica",
  nombre_turno: "Tarde",
  fecha_carga: "2023-06-01T10:00:00.000Z",
  solicitudId: "sol1",
  origen: "agregar_miembro",
  firmaContratoUrl: "https://...",
  contenidoCustomContrato: "texto",
  altaDocumentoUrl: "https://...",
  valoracion_id: "val1",
  valoracion_regla_id: "regla1",
  altaArcaPresentada: { via: "carga_masiva", fecha: "2023-06-01" },
  obraSocialId: "os1",
  obraSocialConstatadaEn: "arca",
};

describe("la copia de un contrato vigente para otro proyecto", () => {
  const copia = copiaParaOtroProyecto(VIGENTE);
  it("conserva lo que es de la relación laboral: fechas, tipo, rol, categoría, sueldos, empleadora, alta en ARCA, obra social", () => {
    for (const k of ["fecha_alta_contrato", "fecha_baja_contrato", "nombre_contrato", "contrato_id", "tipo_contrato_id", "rol_frame_id", "categoria_sat_id", "estado_id", "sede_id", "sueldo_jornada", "sueldo_mano", "empresaContratoId", "puestoDesempenado", "altaArcaPresentada", "obraSocialId", "obraSocialConstatadaEn"]) {
      assert.deepEqual(copia[k], (VIGENTE as any)[k], k);
    }
  });
  it("no copia lo del otro proyecto ni los documentos ni la valoración", () => {
    for (const k of ["_id", "proyecto_id", "nombre_proyecto", "nombre_area", "nombre_turno", "fecha_carga", "solicitudId", "origen", "firmaContratoUrl", "contenidoCustomContrato", "altaDocumentoUrl", "valoracion_id", "valoracion_regla_id"]) {
      assert.ok(!(k in copia), `${k} no debería copiarse`);
    }
  });
  it("llega sin área ni turno: se asignan en este proyecto", () => {
    assert.equal(copia.areaId, "");
    assert.equal(copia.shiftId, "");
    assert.deepEqual(copia.areaShiftAssignments, []);
  });
  it("recuerda de qué proyecto vino", () => {
    assert.deepEqual(copia.origenContrato, { nombre_proyecto: "99_PRODUCTORA", proyecto_id: 99, fecha_alta_contrato: "2023-06-01" });
  });
  it("no toca el original", () => {
    assert.equal(VIGENTE.areaId, "area1");
  });
});
