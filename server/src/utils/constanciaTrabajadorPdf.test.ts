import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerConstanciaTrabajador, problemasDeConstancia } from "./constanciaTrabajadorPdf.js";

/**
 * El texto de una constancia real de ARCA (talón del empleador), con la persona cambiada: el mismo
 * orden y los mismos rótulos que extrae el lector de PDF.
 */
const constancia = (tipo = "Alta") => `Simplificación Registral
CONSTANCIA DEL TRABAJADOR
${tipo}
Original para el empleador, duplicado para el empleado.
 Empleador: CUIT: 30-71706837-4
Nombre y apellido o Denominación: 2030 S. R. L.
Datos del Empleado
Apellido y nombre: PEREZ JUAN CARLOS
CUIL: 20-11111111-2
Fecha Inicio: 01/10/2026 Fecha Cese: 31/10/2026 Obra Social: 120900 - O.S.DEL PERSONAL DE TELEVISION
Modalidad de contrato: 022 - A tiempo completo determinado (contrato a
plazo fijo) Situación de Revista: 01 - Activo
Categoria: 035358 - ASISTENTE DE CAMARA ESPECIALIZADO / GRIP -
GRUPO 7 Puesto: 4132 - Empleados de servicios de apoyo a la producción
Retrib. pactada: $1239805,93 Mod. Liq.: 1 - MES
Actividad económica: 591110 - PRODUCCIÓN DE FILMES Y VIDEOCINTAS
${tipo}
Clave: CA 26391939579227495223
Firma empleador y fecha de notificacion Fecha - hora de envío: 04/10/2026 - 21:15:15 hs.
Número de registro de trámite 262266597099
Fecha de impresión: 04/10/2026
Talón para el empleado (Duplicado)
página 2 de 2`;

const CONTRATO = { cuil: "20-11111111-2", empleadorCuit: "30717068374", fechaInicio: "2026-10-01" };

describe("leerConstanciaTrabajador", () => {
  it("lee tipo, empleador, CUIL, fechas, clave y número de trámite", () => {
    assert.deepEqual(leerConstanciaTrabajador(constancia()), {
      tipo: "alta",
      empleadorCuit: "30717068374",
      cuil: "20111111112",
      apellidoNombre: "PEREZ JUAN CARLOS",
      fechaInicio: "2026-10-01",
      fechaCese: "2026-10-31",
      clave: "CA26391939579227495223",
      nroTramite: "262266597099",
    });
  });
  it("no confunde el CUIT del empleador con el CUIL del empleado", () => {
    const c = leerConstanciaTrabajador(constancia());
    assert.notEqual(c.cuil, c.empleadorCuit);
  });
  it("un PDF que no es la constancia queda sin tipo ni datos: no se adivina", () => {
    const c = leerConstanciaTrabajador("CONSTANCIA DE INSCRIPCION\nCUIT: 20-11111111-2\nForma Jurídica: ...");
    assert.equal(c.tipo, "");
    assert.equal(c.empleadorCuit, "");
    assert.equal(c.fechaInicio, "");
  });
});

describe("problemasDeConstancia", () => {
  it("la constancia de alta del contrato pasa sin problemas", () => {
    assert.deepEqual(problemasDeConstancia(leerConstanciaTrabajador(constancia()), CONTRATO), []);
  });
  it("la constancia de BAJA no pasa, aunque todo lo demás coincida", () => {
    const p = problemasDeConstancia(leerConstanciaTrabajador(constancia("Baja")), CONTRATO);
    assert.equal(p.length, 1);
    assert.match(p[0], /«baja», no de Alta/);
  });
  it("otro CUIL, otra empleadora u otra fecha de inicio: cada uno se dice", () => {
    const c = leerConstanciaTrabajador(constancia());
    assert.match(problemasDeConstancia(c, { ...CONTRATO, cuil: "27222222223" })[0], /CUIL de la constancia/);
    assert.match(problemasDeConstancia(c, { ...CONTRATO, empleadorCuit: "30710295839" })[0], /CUIT del empleador/);
    assert.match(problemasDeConstancia(c, { ...CONTRATO, fechaInicio: "2026-10-04" })[0], /fecha de inicio/);
  });
  it("lo que no se pudo leer cuenta como que no coincide", () => {
    const p = problemasDeConstancia(leerConstanciaTrabajador("cualquier otro PDF"), CONTRATO);
    assert.equal(p.length, 4);
  });
  it("la fecha del contrato puede venir como fecha ISO completa", () => {
    assert.deepEqual(problemasDeConstancia(leerConstanciaTrabajador(constancia()), { ...CONTRATO, fechaInicio: "2026-10-01T00:00:00.000Z" }), []);
  });
});
