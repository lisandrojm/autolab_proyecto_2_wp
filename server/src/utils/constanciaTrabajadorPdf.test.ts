import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluarConstancia, leerConstanciaTrabajador, problemasDeConstancia } from "./constanciaTrabajadorPdf.js";

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
  it("la constancia de BAJA no pasa si el contrato no tiene baja", () => {
    const p = problemasDeConstancia(leerConstanciaTrabajador(constancia("Baja")), CONTRATO);
    assert.equal(p.length, 1);
    assert.match(p[0], /«baja» y el contrato no tiene fecha de baja/);
  });
  it("(07/11/2026) la constancia de BAJA de una relación ya terminada pasa si su cese es la baja del contrato", () => {
    const ev = evaluarConstancia(leerConstanciaTrabajador(constancia("Baja")), { ...CONTRATO, fechaBaja: "2026-10-31" });
    assert.deepEqual(ev, { problemas: [], deBaja: true, mismoDia: false });
    // Con otro cese, no: no es la relación de este contrato.
    assert.match(problemasDeConstancia(leerConstanciaTrabajador(constancia("Baja")), { ...CONTRATO, fechaBaja: "2026-10-15" })[0], /cese 2026-10-31, y el contrato termina el 2026-10-15/);
  });
  it("(07/11/2026) la JORNADA: alta y baja el mismo día, la constancia de baja es la válida y se marca como mismo día", () => {
    const jornada = constancia("Baja").replace("Fecha Inicio: 01/10/2026 Fecha Cese: 31/10/2026", "Fecha Inicio: 24/10/2026 Fecha Cese: 24/10/2026");
    const ev = evaluarConstancia(leerConstanciaTrabajador(jornada), { ...CONTRATO, fechaInicio: "2026-10-24", fechaBaja: "2026-10-24T00:00:00.000Z" });
    assert.deepEqual(ev, { problemas: [], deBaja: true, mismoDia: true });
    // Y nunca dice «no de Alta»: ése era el rebote de todos los días.
    assert.ok(!ev.problemas.some((p) => /no de Alta/.test(p)));
  });
  it("la constancia de alta sigue igual: no es «de baja» aunque el contrato tenga baja", () => {
    assert.deepEqual(evaluarConstancia(leerConstanciaTrabajador(constancia()), { ...CONTRATO, fechaBaja: "2026-10-31" }), { problemas: [], deBaja: false, mismoDia: false });
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
