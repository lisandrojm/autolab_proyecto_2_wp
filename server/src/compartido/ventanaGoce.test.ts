import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dentroDeVentana,
  errorDeVentana,
  esMesDia,
  fechaPermitida,
  mesDiaCorto,
  normalizarVentana,
  rangoDentroDeVentana,
  rangoPermitido,
  resumenDeVentana,
  textoDeVentana,
  unirVentanas,
  ventanaDeEntidad,
  ventanaEfectiva,
  SIN_VENTANA,
  VENTANA_POR_DEFECTO,
  type VentanaGoce,
} from "./ventanaGoce.js";

// La temporada de siempre: del 1/11 al 30/4 (envuelve el 1/1).
const INI = "11-01";
const FIN = "04-30";
const TEMPORADA: VentanaGoce = { enabled: true, inicio: INI, fin: FIN };

describe("un día dentro de la ventana", () => {
  it("la ventana que cruza el año incluye diciembre y enero, con las dos puntas", () => {
    for (const f of ["2026-11-01", "2026-12-15", "2026-12-31", "2027-01-01", "2027-02-28", "2027-04-30"]) assert.equal(dentroDeVentana(f, INI, FIN), true, f);
    for (const f of ["2026-10-31", "2027-05-01", "2026-07-15"]) assert.equal(dentroDeVentana(f, INI, FIN), false, f);
  });
  it("la ventana que no cruza el año", () => {
    assert.equal(dentroDeVentana("2026-07-15", "06-01", "08-31"), true);
    assert.equal(dentroDeVentana("2026-05-31", "06-01", "08-31"), false);
    assert.equal(dentroDeVentana("2026-09-01", "06-01", "08-31"), false);
  });
  it("una fecha o una ventana mal escritas no entran", () => {
    assert.equal(dentroDeVentana("15/12/2026", INI, FIN), false);
    assert.equal(dentroDeVentana("2026-12-15", "13-01", FIN), false);
    assert.equal(dentroDeVentana("2026-12-15", INI, "02-30"), false);
  });
});

describe("un rango dentro de la ventana", () => {
  it("rango normal adentro", () => {
    assert.equal(rangoDentroDeVentana("2026-12-01", "2026-12-15", INI, FIN), true);
    assert.equal(rangoDentroDeVentana("2026-11-01", "2026-11-01", INI, FIN), true);
  });
  it("rango que cruza el 1/1", () => {
    assert.equal(rangoDentroDeVentana("2026-12-22", "2027-01-10", INI, FIN), true);
  });
  it("la temporada entera, de punta a punta", () => {
    assert.equal(rangoDentroDeVentana("2026-11-01", "2027-04-30", INI, FIN), true);
  });
  it("empieza adentro y termina afuera: del 28/4 al 5/5 no entra", () => {
    assert.equal(rangoDentroDeVentana("2027-04-28", "2027-05-05", INI, FIN), false);
  });
  it("empieza afuera y termina adentro tampoco", () => {
    assert.equal(rangoDentroDeVentana("2026-10-25", "2026-11-05", INI, FIN), false);
  });
  it("un rango que sale por una punta y vuelve a entrar por la otra no entra (mayo–octubre queda afuera)", () => {
    assert.equal(rangoDentroDeVentana("2027-04-20", "2027-11-10", INI, FIN), false);
  });
  it("ventana que no cruza el año: todo el año", () => {
    assert.equal(rangoDentroDeVentana("2026-01-01", "2026-12-31", "01-01", "12-31"), true);
    assert.equal(rangoDentroDeVentana("2026-12-20", "2027-01-10", "01-01", "12-31"), true);
    assert.equal(rangoDentroDeVentana("2024-02-25", "2024-03-02", "01-01", "12-31"), true); // con 29/2
  });
  it("ventana que no cruza el año: un rango que da la vuelta al año no entra", () => {
    assert.equal(rangoDentroDeVentana("2026-07-01", "2026-07-15", "06-01", "08-31"), true);
    assert.equal(rangoDentroDeVentana("2026-08-25", "2026-09-02", "06-01", "08-31"), false);
  });
  it("un rango dado vuelta o mal escrito no es válido", () => {
    assert.equal(rangoDentroDeVentana("2026-12-15", "2026-12-01", INI, FIN), false);
    assert.equal(rangoDentroDeVentana("", "2026-12-01", INI, FIN), false);
  });
});

describe("la ventana deshabilitada", () => {
  it("todo pasa: cualquier día y cualquier rango", () => {
    const apagada = unirVentanas([{ enabled: false, inicio: INI, fin: FIN }]);
    assert.deepEqual(apagada, SIN_VENTANA);
    assert.equal(fechaPermitida("2026-07-15", apagada), true);
    assert.equal(rangoPermitido("2027-04-28", "2027-05-05", apagada), true);
    assert.equal(rangoPermitido("2026-06-01", "2026-06-20", null), true);
    assert.equal(rangoPermitido("2026-06-01", "2026-06-20", undefined), true);
  });
  it("habilitada, frena lo que queda afuera", () => {
    const v = unirVentanas([TEMPORADA]);
    assert.equal(rangoPermitido("2026-12-01", "2026-12-15", v), true);
    assert.equal(rangoPermitido("2027-04-28", "2027-05-05", v), false);
    assert.equal(fechaPermitida("2026-07-15", v), false);
  });
});

describe("la ventana de un proyecto o un área", () => {
  const global: VentanaGoce = TEMPORADA;
  it("usa la global salvo que tenga configuración propia", () => {
    assert.deepEqual(ventanaDeEntidad(undefined, global), global);
    assert.deepEqual(ventanaDeEntidad({ useGlobalConfig: true, ventanaGoceEnabled: false }, global), global);
  });
  it("con configuración propia, lo que no definió sale de la global", () => {
    // Un proyecto que ya tenía configuración propia por el fraccionamiento no cambia de ventana solo.
    assert.deepEqual(ventanaDeEntidad({ useGlobalConfig: false }, global), global);
    assert.deepEqual(ventanaDeEntidad({ useGlobalConfig: false, ventanaGoceInicio: "10-01" }, global), { enabled: true, inicio: "10-01", fin: FIN });
    assert.deepEqual(ventanaDeEntidad({ useGlobalConfig: false, ventanaGoceEnabled: false }, global), { enabled: false, inicio: INI, fin: FIN });
    assert.deepEqual(ventanaDeEntidad({ useGlobalConfig: false, ventanaGoceInicio: "99-99", ventanaGoceFin: null }, global), global);
  });
});

describe("la más flexible entre varios proyectos", () => {
  it("si alguno no tiene ventana, no se aplica", () => {
    assert.deepEqual(unirVentanas([TEMPORADA, { enabled: false, inicio: INI, fin: FIN }]), SIN_VENTANA);
  });
  it("si todos tienen, la unión: el inicio más temprano y el fin más tardío", () => {
    assert.deepEqual(unirVentanas([TEMPORADA, { enabled: true, inicio: "10-01", fin: "03-31" }]), { enabled: true, tramos: [{ inicio: "10-01", fin: "04-30" }] });
    assert.deepEqual(unirVentanas([TEMPORADA, TEMPORADA]), { enabled: true, tramos: [{ inicio: INI, fin: FIN }] });
  });
  it("ventanas pegadas se funden en una", () => {
    assert.deepEqual(unirVentanas([{ enabled: true, inicio: "11-01", fin: "12-31" }, { enabled: true, inicio: "01-01", fin: "04-30" }]), { enabled: true, tramos: [{ inicio: INI, fin: FIN }] });
  });
  it("ventanas separadas quedan como dos tramos: los meses del medio siguen cerrados", () => {
    const v = unirVentanas([TEMPORADA, { enabled: true, inicio: "07-01", fin: "07-31" }]);
    assert.deepEqual(v.tramos, [{ inicio: "07-01", fin: "07-31" }, { inicio: INI, fin: FIN }]);
    assert.equal(rangoPermitido("2026-07-10", "2026-07-20", v), true);
    assert.equal(rangoPermitido("2026-12-10", "2026-12-20", v), true);
    assert.equal(rangoPermitido("2026-09-01", "2026-09-10", v), false);
  });
  it("entre todas cubren el año", () => {
    assert.deepEqual(unirVentanas([TEMPORADA, { enabled: true, inicio: "05-01", fin: "10-31" }]), { enabled: true, tramos: [{ inicio: "01-01", fin: "12-31" }] });
  });
});

describe("la ventana que rige para una persona", () => {
  const global: VentanaGoce = TEMPORADA;
  it("sin proyectos ni área, la global", () => {
    assert.deepEqual(ventanaEfectiva({ global }), { enabled: true, tramos: [{ inicio: INI, fin: FIN }] });
    assert.deepEqual(ventanaEfectiva({ global: VENTANA_POR_DEFECTO }), SIN_VENTANA);
  });
  it("con proyectos, la más flexible (cada uno con la suya o la global)", () => {
    assert.deepEqual(ventanaEfectiva({ global, proyectos: [{ useGlobalConfig: true }, { useGlobalConfig: false, ventanaGoceInicio: "10-01" }] }), { enabled: true, tramos: [{ inicio: "10-01", fin: FIN }] });
    assert.deepEqual(ventanaEfectiva({ global, proyectos: [undefined, { useGlobalConfig: false, ventanaGoceEnabled: false }] }), SIN_VENTANA);
  });
  it("el área con configuración propia manda sobre los proyectos", () => {
    const area = { useGlobalConfig: false, ventanaGoceEnabled: true, ventanaGoceInicio: "12-01", ventanaGoceFin: "02-28" };
    assert.deepEqual(ventanaEfectiva({ global, area, proyectos: [{ useGlobalConfig: false, ventanaGoceEnabled: false }] }), { enabled: true, tramos: [{ inicio: "12-01", fin: "02-28" }] });
    // Un área que usa la global no pisa a los proyectos.
    assert.deepEqual(ventanaEfectiva({ global, area: { useGlobalConfig: true }, proyectos: [{ useGlobalConfig: false, ventanaGoceEnabled: false }] }), SIN_VENTANA);
  });
});

describe("escribir y leer la ventana", () => {
  it("un MM-DD válido: mes 1–12 y un día que ese mes tenga", () => {
    for (const v of ["01-01", "02-29", "04-30", "11-01", "12-31"]) assert.equal(esMesDia(v), true, v);
    for (const v of ["00-10", "13-01", "02-30", "04-31", "11-00", "1-1", "11/01", "", null, 1101]) assert.equal(esMesDia(v), false, String(v));
  });
  it("lo que se quiere guardar", () => {
    assert.equal(errorDeVentana({ enabled: true, inicio: INI, fin: FIN }), null);
    assert.match(errorDeVentana({ enabled: true, inicio: "02-30", fin: FIN }) || "", /inicio/);
    assert.match(errorDeVentana({ enabled: true, inicio: INI, fin: "30-04" }) || "", /fin/);
    assert.match(errorDeVentana({ inicio: INI, fin: FIN }) || "", /habilitada/);
    assert.notEqual(errorDeVentana(null), null);
  });
  it("lo guardado se lee tolerando lo que falte", () => {
    assert.deepEqual(normalizarVentana(undefined), VENTANA_POR_DEFECTO);
    assert.deepEqual(normalizarVentana({ enabled: true }), { enabled: true, inicio: "11-01", fin: "04-30" });
    assert.deepEqual(normalizarVentana({ enabled: true, inicio: "10-01", fin: "nada" }), { enabled: true, inicio: "10-01", fin: "04-30" });
  });
  it("cómo se dice", () => {
    assert.equal(mesDiaCorto("11-01"), "1/11");
    assert.equal(mesDiaCorto("04-30"), "30/4");
    assert.equal(resumenDeVentana(unirVentanas([TEMPORADA])), "1/11 – 30/4");
    assert.equal(resumenDeVentana(SIN_VENTANA), "Sin ventana");
    assert.equal(textoDeVentana(unirVentanas([TEMPORADA])), "entre el 1/11 y el 30/4");
    assert.equal(textoDeVentana(SIN_VENTANA), "");
  });
});
