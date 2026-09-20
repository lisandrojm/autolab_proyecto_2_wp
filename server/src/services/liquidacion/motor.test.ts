/**
 * Tests de las tres etapas puras del motor de liquidación.
 *
 *   npm run test:liquidacion-motor
 *
 * Normalizar, codificar y agregar se prueban por separado y sin Mongo, que es la razón de que estén
 * separadas. Lo que se verifica es lo que, si sale mal, termina en el recibo de alguien: que un
 * reemplazo le pague al que vino, que nada se invente por descarte, y que un número agregado se
 * pueda explicar.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarParte, DatosDePersona, ParteParaNormalizar } from "./normalizar.js";
import { codificarEvento, ReglasGlobales } from "./codificar.js";
import { agregarLineas, hojaDe } from "./agregar.js";
import type { IMemosoftEffect } from "../../models/RequestConfig.js";

const ANA: DatosDePersona = { apellidoYNombre: "Aguirre, Ana", legajo: "00001", empresaId: "emp2030", ccCodigo: "426", regimen: "mensual" };
const BETO: DatosDePersona = { apellidoYNombre: "Bravo, Beto", legajo: "00002", empresaId: "emp2030", ccCodigo: "426", regimen: "jornalero" };

const padron = (userId: string): DatosDePersona | undefined => (userId === "ana" ? ANA : userId === "beto" ? BETO : undefined);

const parte = (renglones: any[], fecha = "2026-08-12"): ParteParaNormalizar => ({
  _id: "parte1",
  date: fecha,
  projectId: "proy1",
  proyectoNombre: "426_LN+",
  areaId: "area1",
  shiftId: "turno1",
  attendance: renglones,
});

const efecto = (extra: Partial<IMemosoftEffect> = {}): IMemosoftEffect =>
  ({
    conceptoCodigo: "0012",
    param: "par1",
    unidad: "cantidad",
    fuente: "jornadas",
    aplicaA: "titular",
    soloRegimen: null,
    empresaId: null,
    vigenteDesde: "2025-01-01",
    vigenteHasta: null,
    ...extra,
  }) as IMemosoftEffect;

const SIN_REGLAS: ReglasGlobales = { horasExtra: null, jornalBase: null };

describe("liquidación · etapa 1: normalizar", () => {
  it("un renglón simple es un evento", () => {
    const eventos = normalizarParte(parte([{ _id: "r1", employeeId: "ana", status: "present" }]), padron);

    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].legajo, "00001");
    assert.equal(eventos[0].aplicaA, "titular");
  });

  it("un reemplazo genera DOS eventos, uno por persona", () => {
    const eventos = normalizarParte(
      parte([{ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Enfermedad", replacementId: "beto" }]),
      padron,
    );

    assert.equal(eventos.length, 2);
    assert.deepEqual(eventos.map((e) => e.userId), ["ana", "beto"]);
  });

  it("al reemplazante no se le copia el 'ausente' del titular", () => {
    // Es el que VINO a trabajar: figurar como ausente en su propia liquidación sería al revés.
    const eventos = normalizarParte(
      parte([{ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Franco", replacementId: "beto" }]),
      padron,
    );

    assert.equal(eventos[1].estado, "present");
    assert.equal(eventos[1].reemplazaA, "Aguirre, Ana");
  });

  it("cada uno se lleva SUS horas extra", () => {
    const eventos = normalizarParte(
      parte([{ _id: "r1", employeeId: "ana", status: "absent", replacementId: "beto", overtimeHours50: 2, replacementOvertimeHours100: 3, replacementOvertimeHours: 3 }]),
      padron,
    );

    assert.equal(eventos[0].he50, 2);
    assert.equal(eventos[1].he100, 3);
    assert.equal(eventos[1].he50, 0);
  });

  it("las horas del total que nadie discriminó quedan aparte, no repartidas", () => {
    /*
      Es el caso real: 472 de las 481 horas extra de la historia están sólo en `overtimeHours`.
      Mandarlas al 50% sería inventar un dato que cambia lo que cobra la gente.
    */
    const eventos = normalizarParte(parte([{ _id: "r1", employeeId: "ana", status: "present", overtimeHours: 5 }]), padron);

    assert.equal(eventos[0].he50, 0);
    assert.equal(eventos[0].he100, 0);
    assert.equal(eventos[0].heSinDiscriminar, 5);
  });

  it("lo discriminado no se cuenta dos veces", () => {
    // Los tres campos conviven: hay renglones con 6 al 100% y el mismo 6 en el total.
    const eventos = normalizarParte(parte([{ _id: "r1", employeeId: "ana", status: "present", overtimeHours: 6, overtimeHours100: 6 }]), padron);

    assert.equal(eventos[0].he100, 6);
    assert.equal(eventos[0].heSinDiscriminar, 0);
  });

  it("alguien sin contrato vigente igual genera evento, con los datos en null", () => {
    // Lo que no se puede liquidar tiene que verse en el anexo, no desaparecer del cálculo.
    const eventos = normalizarParte(parte([{ _id: "r1", employeeId: "fantasma", status: "present" }]), padron);

    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].legajo, null);
  });
});

describe("liquidación · etapa 2: codificar", () => {
  const eventoDe = (renglon: any) => normalizarParte(parte([renglon]), padron)[0];

  it("una ausencia con efecto configurado emite su concepto", () => {
    const evento = eventoDe({ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Enfermedad", typeId: "m1" });

    const { lineas } = codificarEvento(evento, [efecto()], SIN_REGLAS);

    assert.equal(lineas.length, 1);
    assert.equal(lineas[0].conceptoCodigo, "0012");
    assert.equal(lineas[0].par1, 1);
    assert.equal(lineas[0].par2, 0, "el parámetro que no se usa va en cero, nunca vacío");
  });

  it("una ausencia SIN efecto no se convierte en nada por descarte", () => {
    // La regla dura del pedido: no inferir. Una ausencia sin motivo no es una inasistencia injustificada.
    const evento = eventoDe({ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Algo raro" });

    const { lineas, exclusiones } = codificarEvento(evento, [], SIN_REGLAS);

    assert.equal(lineas.length, 0);
    assert.equal(exclusiones[0].motivo, "sin_efecto_configurado");
  });

  it("un motivo marcado como \"no liquida nada\" no levanta aviso", () => {
    /*
      Es distinto de no estar configurado. "Cambios de Turno" es alguien que trabajó, sólo que en
      otro horario: avisar de eso todos los meses tapa los avisos que sí importan.
    */
    const evento = eventoDe({ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Cambios de Turno" });

    const sinMarca = codificarEvento(evento, [], SIN_REGLAS);
    const conMarca = codificarEvento(evento, [], SIN_REGLAS, true);

    assert.ok(sinMarca.exclusiones.some((e) => e.motivo === "sin_efecto_configurado"));
    assert.ok(!conMarca.exclusiones.some((e) => e.motivo === "sin_efecto_configurado"));
  });

  it("un motivo con mapeo para el reemplazante no avisa por el titular", () => {
    // "Franco": al que cubre se le paga el jornal y al titular no le corresponde nada. Está decidido.
    const eventos = normalizarParte(
      parte([{ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Franco", replacementId: "beto" }]),
      padron,
    );
    const soloReemplazante = [efecto({ conceptoCodigo: "0000", param: "par2", aplicaA: "reemplazante", soloRegimen: "jornalero" })];

    const { exclusiones } = codificarEvento(eventos[0], soloReemplazante, SIN_REGLAS);

    assert.ok(!exclusiones.some((e) => e.motivo === "sin_efecto_configurado"));
  });
  it("lo marcado como manual no se calcula solo", () => {
    const evento = eventoDe({ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Sin Goce de Sueldo" });

    const { lineas, exclusiones } = codificarEvento(evento, [efecto({ conceptoCodigo: "0090", param: "par2", unidad: "importe", fuente: "manual" })], SIN_REGLAS);

    assert.equal(lineas.length, 0);
    assert.equal(exclusiones.find((e) => e.motivo === "efecto_manual")?.motivo, "efecto_manual");
  });

  it("el efecto del titular no se le aplica al reemplazante", () => {
    const eventos = normalizarParte(
      parte([{ _id: "r1", employeeId: "ana", status: "absent", absenceReason: "Enfermedad", replacementId: "beto" }]),
      padron,
    );
    const efectos = [efecto({ aplicaA: "titular" }), efecto({ conceptoCodigo: "0000", param: "par2", aplicaA: "reemplazante", soloRegimen: "jornalero" })];

    const delTitular = codificarEvento(eventos[0], efectos, SIN_REGLAS);
    const delSuplente = codificarEvento(eventos[1], efectos, SIN_REGLAS);

    assert.deepEqual(delTitular.lineas.map((l) => l.conceptoCodigo), ["0012"]);
    assert.deepEqual(delSuplente.lineas.map((l) => l.conceptoCodigo), ["0000"], "Beto es jornalero: cobra el jornal por cubrir");
  });

  it("las horas extra salen de la regla global, sin importar el motivo", () => {
    const evento = eventoDe({ _id: "r1", employeeId: "ana", status: "present", overtimeHours50: 3, overtimeHours: 3 });

    const { lineas } = codificarEvento(evento, [], { horasExtra: { codigo50: "0015", codigo100: "0016", param: "par1", unidad: "cantidad" }, jornalBase: null });

    assert.equal(lineas.length, 1);
    assert.equal(lineas[0].conceptoCodigo, "0015");
    assert.equal(lineas[0].par1, 3);
  });

  it("las horas sin discriminar no se liquidan: se avisan", () => {
    const evento = eventoDe({ _id: "r1", employeeId: "ana", status: "present", overtimeHours: 4 });

    const { lineas, exclusiones } = codificarEvento(evento, [], { horasExtra: { codigo50: "0015", codigo100: "0016", param: "par1", unidad: "cantidad" }, jornalBase: null });

    assert.equal(lineas.length, 0, "no se pueden mandar al 50% porque sí");
    assert.match(exclusiones.find((e) => e.motivo === "horas_extra_sin_discriminar")!.detalle, /4 horas/);
  });

  it("el jornalero que trabajó cobra el día, si hay regla base", () => {
    const evento = normalizarParte(parte([{ _id: "r1", employeeId: "beto", status: "present" }]), padron)[0];

    const { lineas } = codificarEvento(evento, [], { horasExtra: null, jornalBase: { codigo: "0000", param: "par2", soloRegimen: "jornalero" } });

    assert.equal(lineas[0].conceptoCodigo, "0000");
    assert.equal(lineas[0].par2, 1);
  });

  it("al mensual que trabajó no se le agrega jornal: ya cobra el mes", () => {
    const evento = normalizarParte(parte([{ _id: "r1", employeeId: "ana", status: "present" }]), padron)[0];

    const { lineas } = codificarEvento(evento, [], { horasExtra: null, jornalBase: { codigo: "0000", param: "par2", soloRegimen: "jornalero" } });

    assert.equal(lineas.length, 0);
  });

  it("el jornal no se paga dos veces cuando el motivo ya lo generó", () => {
    /*
      "Otros Presentes" tiene su propio 0000 para el reemplazante. Sin este cuidado, la regla base
      le sumaba otro y la persona cobraba el día doble.
    */
    const evento = normalizarParte(parte([{ _id: "r1", employeeId: "beto", status: "present", absenceReason: "Otros Presentes" }]), padron)[0];

    const { lineas } = codificarEvento(
      evento,
      [efecto({ conceptoCodigo: "0000", param: "par2", aplicaA: "titular" })],
      { horasExtra: null, jornalBase: { codigo: "0000", param: "par2", soloRegimen: "jornalero" } },
    );

    assert.equal(lineas.length, 1);
    assert.equal(lineas[0].par2, 1);
  });

  it("sin legajo se anota igual, y además se codifica lo que le correspondía", () => {
    const evento = normalizarParte(parte([{ _id: "r1", employeeId: "fantasma", status: "absent", absenceReason: "Enfermedad" }]), padron)[0];

    const { lineas, exclusiones } = codificarEvento(evento, [efecto()], SIN_REGLAS);

    assert.equal(lineas.length, 1, "el número se calcula igual: el anexo tiene que decir las dos cosas");
    assert.ok(exclusiones.some((e) => e.motivo === "sin_legajo"));
  });
});

describe("liquidación · etapa 3: agregar", () => {
  const linea = (extra: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...extra });
  function base() {
    return {
      eventoId: "e1",
      userId: "ana",
      apellidoYNombre: "Aguirre, Ana",
      legajo: "00001",
      empresaId: "emp2030",
      ccCodigo: "426",
      regimen: "mensual",
      fecha: "2026-08-01",
      conceptoCodigo: "0000",
      par1: 0,
      par2: 1,
      origen: "día trabajado",
    };
  }

  it("veinte días de jornal son UNA fila con 20", () => {
    const lineas = Array.from({ length: 20 }, (_, i) => linea({ eventoId: `e${i}`, fecha: `2026-08-${String(i + 1).padStart(2, "0")}` }));

    const agregadas = agregarLineas(lineas);

    assert.equal(agregadas.length, 1);
    assert.equal(agregadas[0].par2, 20);
    assert.equal(agregadas[0].dias, 20);
  });

  it("cada fila dice de qué eventos salió", () => {
    // Sin esto no se puede contestar "¿por qué dice 17 y no 18?" sin volver a correr todo.
    const agregadas = agregarLineas([linea({ eventoId: "e1" }), linea({ eventoId: "e2", fecha: "2026-08-02" })]);

    assert.deepEqual(agregadas[0].eventIds, ["e1", "e2"]);
  });

  it("el mismo legajo en dos centros de costo NO se suma", () => {
    // Van a hojas distintas: sumarlos escondería en cuál se trabajó.
    const agregadas = agregarLineas([linea(), linea({ ccCodigo: "703", fecha: "2026-08-02" })]);

    assert.equal(agregadas.length, 2);
  });

  it("dos conceptos distintos son dos filas", () => {
    const agregadas = agregarLineas([linea(), linea({ conceptoCodigo: "0015", par1: 3, par2: 0 })]);

    assert.equal(agregadas.length, 2);
    assert.equal(agregadas.find((a) => a.conceptoCodigo === "0015")!.par1, 3);
  });

  it("las horas con decimales no salen con cola de punto flotante", () => {
    const agregadas = agregarLineas([
      linea({ conceptoCodigo: "0015", par1: 2.5, par2: 0 }),
      linea({ conceptoCodigo: "0015", par1: 4.99999999, par2: 0, fecha: "2026-08-02" }),
    ]);

    assert.equal(agregadas[0].par1, 7.5);
  });

  it("el nombre de la hoja separa a los jornaleros", () => {
    const [mensual] = agregarLineas([linea()]);
    const [jornalero] = agregarLineas([linea({ regimen: "jornalero" })]);

    assert.equal(hojaDe(mensual, "2030 S.R.L.", "La Nación"), "2030 CC426 La Nación");
    assert.equal(hojaDe(jornalero, "2030 S.R.L.", "La Nación"), "2030 CC426 La Nación Jornaleros");
  });
});
