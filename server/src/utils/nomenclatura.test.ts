/**
 * Tests de la nomenclatura de archivos.
 *
 *   npm run test:nomenclatura
 *
 * El primer describe es el que justifica que esto sea configurable con red y no un campo de texto
 * libre: el nombre del archivo se PARSEA DE VUELTA cuando el documento firmado regresa de Dropbox
 * Sign. Un patrón sin los bloques que ese parseo necesita rompe el circuito en silencio.
 *
 * Los otros dos cubren lo que hace que esto se pueda soltar sin migrar nada: que el default rinda
 * EXACTAMENTE el nombre de antes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validarPatron, renderNomenclatura, PATRON_POR_DEFECTO, VARIABLES_POR_TIPO, TIPOS_QUE_VUELVEN_DE_LA_FIRMA, campoNomenclatura, TIPOS_NOMENCLATURA, VARIABLES_COMPUESTAS } from "./nomenclatura.js";

/** Los mismos datos que usa la previsualización del ABM. */
const DATOS = {
  apellido: "gonzalez-rotstein",
  nombres: "juan-manuel",
  proyecto: "748",
  tipo: "Contrato",
  docName: "",
  fechaAlta: "20260810",
  fechaBaja: "-",
  identidad: "CUIL-20331501027_DNI-33150102",
  email: "juanmanuel.gonzalezrotstein-gmail.com",
  extra: "Constancia-de-Cuit",
  numero: "1042",
  timestamp: "20260821-143012",
  anio: "2026",
  fecha: "20260821",
  empresa: "FZERO S.R.L",
  empresaCuit: "CUIT-30710295839",
};

describe("lo que el archivo necesita para volver de la firma", () => {
  /**
   * `dropboxSignMailService.extraerIdentidadDeArchivo()` busca `_CUIL-\d{11}` en el nombre. Sin ese
   * bloque, el documento firmado vuelve y no se puede asociar a ninguna persona — y no falla ruidoso:
   * el archivo existe, se firmó, y recién se descubre cuando alguien lo busca.
   */
  it("un patrón sin {{identidad}} NO se puede guardar", () => {
    const errores = validarPatron("Contrato", "{{apellido}}_{{nombres}}_{{tipo}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}");
    assert.equal(errores.length, 1);
    assert.match(errores[0].motivo, /identidad/);
    assert.match(errores[0].motivo, /no se puede asociar a ninguna persona/i, "el motivo tiene que decir la consecuencia, no solo «falta una variable»");
  });

  /**
   * `estadoDropboxCronService.extraerFechasDeNombre()` machea el contrato por los tokens de 8
   * dígitos. Sin fechas, un archivo que vuelve puede caer en el contrato equivocado de la misma
   * persona — que es peor que no caer en ninguno.
   */
  it("un patrón sin fechas NO se puede guardar", () => {
    const errores = validarPatron("Contrato", "{{apellido}}_{{nombres}}_{{identidad}}");
    assert.equal(errores.length, 1);
    assert.match(errores[0].motivo, /fechaAlta/);
    assert.match(errores[0].motivo, /fechaBaja/);
  });

  it("con los bloques críticos, se guarda aunque cambie todo lo demás", () => {
    // El punto del ABM: el orden y el resto de los campos son libres.
    assert.deepEqual(validarPatron("Contrato", "{{tipo}}_{{proyecto}}_{{identidad}}_{{fechaAlta}}_{{fechaBaja}}_{{apellido}}"), []);
  });

  it("todos los tipos que vuelven de la firma exigen identidad y fechas", () => {
    // Si mañana se agrega un tipo a esa lista y se olvida marcarle las variables, este test lo caza.
    for (const tipo of TIPOS_QUE_VUELVEN_DE_LA_FIRMA) {
      const requeridas = VARIABLES_POR_TIPO[tipo].filter((v) => v.requerida).map((v) => v.variable);
      assert.ok(requeridas.includes("{{identidad}}"), `${tipo} no exige {{identidad}}`);
      assert.ok(requeridas.includes("{{fechaAlta}}"), `${tipo} no exige {{fechaAlta}}`);
      assert.ok(requeridas.includes("{{fechaBaja}}"), `${tipo} no exige {{fechaBaja}}`);
    }
  });

  it("cada patrón por defecto pasa su propia validación", () => {
    // Un default inválido dejaría al ABM rechazando lo que la plataforma ya está usando.
    for (const tipo of TIPOS_NOMENCLATURA) assert.deepEqual(validarPatron(tipo, PATRON_POR_DEFECTO[tipo]), [], `el default de ${tipo} no valida`);
  });

  it("una variable inventada se rechaza: en el archivo real quedaría vacía", () => {
    const errores = validarPatron("Contrato", PATRON_POR_DEFECTO.Contrato + "_{{sucursal}}");
    assert.equal(errores.length, 1);
    assert.match(errores[0].motivo, /\{\{sucursal\}\}/);
  });

  it("una variable de otro tipo también se rechaza", () => {
    // `{{numero}}` existe para Pedido y no para Contrato: ofrecerla acá daría un nombre incompleto.
    assert.equal(validarPatron("Contrato", PATRON_POR_DEFECTO.Contrato + "_{{numero}}").length, 1);
  });
});

describe("el default rinde el nombre de siempre", () => {
  /**
   * El orden es una decisión, no una casualidad: DÓNDE · QUIÉN · QUÉ · CUÁNDO · IDENTIFICADORES ·
   * PARA QUIÉN. El proyecto primero agrupa las carpetas por proyecto al ordenar por nombre; la
   * empleadora al final porque es el campo más largo y el que menos se busca.
   */
  it("arranca con el proyecto y termina con la empleadora", () => {
    const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS);
    assert.equal(
      nombre,
      "748_gonzalez-rotstein_juan-manuel_Contrato_Alta_20260810_Baja_-_CUIL-20331501027_DNI-33150102_juanmanuel.gonzalezrotstein-gmail.com_Constancia-de-Cuit_FZERO-S.R.L_CUIT-30710295839",
    );
    assert.ok(nombre.startsWith("748_"), "el proyecto va primero");
    assert.ok(nombre.endsWith("_CUIT-30710295839"), "el CUIT de la empleadora va último");
  });

  /**
   * Los siete tipos comparten el mismo esqueleto. Quien mira una carpeta con contratos, pedidos y
   * vacaciones mezclados lee siempre los mismos campos en el mismo lugar; cada tipo cambia solo en lo
   * que de verdad tiene distinto (un período contra un número).
   */
  it("todos empiezan por proyecto y terminan en la empleadora", () => {
    for (const tipo of TIPOS_NOMENCLATURA) {
      const p = PATRON_POR_DEFECTO[tipo];
      assert.ok(p.startsWith("{{proyecto}}_"), `${tipo} no arranca con el proyecto: ${p}`);
      assert.ok(p.endsWith("_{{empresa}}_{{empresaCuit}}"), `${tipo} no termina con la empleadora: ${p}`);
      assert.match(p, /\{\{apellido\}\}_\{\{nombres\}\}_\{\{tipo\}\}/, `${tipo} no respeta el orden persona → documento`);
    }
  });

  /**
   * El CUIT de la empleadora convive con el CUIL de la persona sin confundirlos, y sus once dígitos
   * no se leen como una fecha (el cron busca tokens de OCHO).
   */
  it("el CUIT de la empleadora no interfiere con el parseo de vuelta", () => {
    const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS);
    assert.equal(/(?:^|_)CUIL-(\d{11})/.exec(nombre)?.[1], "20331501027", "el CUIL que se extrae tiene que ser el de la PERSONA");
    const fechas: string[] = nombre.match(/(?<!\d)(?<!(?:DNI|CI|LE|LC|PAS|DOC)-)(\d{8})(?!\d)/g) ?? [];
    assert.deepEqual(fechas, ["20260810"], "el CUIT no puede colarse como fecha");
  });

  it("el bloque Alta/Baja sobrevive con la baja vacía", () => {
    // Un "-" NO es basura: distingue "contrato sin fin" de "dato sin cargar". Si la limpieza se lo
    // comiera, el nombre diría `Baja` a secas y las dos situaciones serían indistinguibles.
    assert.match(renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS), /_Baja_-_/);
  });

  it("una variable vacía no deja un separador colgando", () => {
    // `docName` viene vacío en el ejemplo: el nombre no puede tener "__" ni terminar en "_".
    const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS);
    assert.ok(!nombre.includes("__"), nombre);
    assert.ok(!nombre.endsWith("_"), nombre);
  });

  it("el nombre resultante sigue siendo parseable por los servicios de vuelta", () => {
    // Las dos expresiones reales, copiadas de sus servicios. Si alguien toca el render y rompe el
    // formato, esto se cae acá y no seis meses después con un contrato "perdido".
    const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS);
    assert.match(nombre, /(?:^|_)CUIL-(\d{11})/, "extraerIdentidadDeArchivo no encontraría el CUIL");
    assert.match(nombre, /_(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/, "extraerIdentidadDeArchivo no encontraría el documento");
    const fechas: string[] = nombre.match(/(?<!\d)(?<!(?:DNI|CI|LE|LC|PAS|DOC)-)(\d{8})(?!\d)/g) ?? [];
    assert.ok(fechas.includes("20260810"), `extraerFechasDeNombre no encontraría el alta (encontró ${JSON.stringify(fechas)})`);
  });

  it("los de pedidos y vacaciones también conservan su identidad", () => {
    const pedido = renderNomenclatura(PATRON_POR_DEFECTO.Pedido, { ...DATOS, tipo: "Pedido" });
    assert.equal(pedido, "748_gonzalez-rotstein_juan-manuel_Pedido_1042_20260821_CUIL-20331501027_DNI-33150102_juanmanuel.gonzalezrotstein-gmail.com_FZERO-S.R.L_CUIT-30710295839");
    assert.match(pedido, /(?:^|_)CUIL-(\d{11})/);
  });
});

describe("normalización de cada campo", () => {
  it("el «_» es el separador de campos: adentro de un valor va como «-»", () => {
    // Cuando convivían los dos, el nombre en disco no coincidía con el guardado en la base y el
    // matching de vuelta fallaba sin motivo aparente.
    assert.equal(campoNomenclatura("LE ROY"), "LE-ROY");
    assert.equal(campoNomenclatura("con_guion_bajo"), "con-guion-bajo");
  });

  it("saca lo que un sistema de archivos no acepta", () => {
    assert.equal(campoNomenclatura('a/b:c*d?e"f<g>h|i'), "a-b-c-d-e-f-g-h-i");
  });

  it("un «-» solo se conserva: es el marcador de «este dato no existe»", () => {
    assert.equal(campoNomenclatura("-"), "-");
  });

  it("colapsa guiones repetidos y no deja bordes sueltos", () => {
    assert.equal(campoNomenclatura("  --hola---mundo--  "), "hola-mundo");
  });
});

describe("bloques que no se pueden normalizar", () => {
  /**
   * El bug que este test congela: `identidad` es `CUIL-…_DNI-…`, y ese "_" del medio es ESTRUCTURAL
   * —`extraerIdentidadDeArchivo` lo exige delante de la etiqueta del documento—. La normalización de
   * campos convierte "_" en "-", así que aplicarla acá producía `CUIL-20331501027-DNI-33150102`: un
   * nombre que se ve perfecto y del que ya no se puede sacar el documento de la persona.
   */
  it("{{identidad}} conserva su «_» interno", () => {
    const nombre = renderNomenclatura("{{apellido}}_{{identidad}}", { apellido: "perez", identidad: "CUIL-20331501027_DNI-33150102" });
    assert.equal(nombre, "perez_CUIL-20331501027_DNI-33150102");
    assert.match(nombre, /_(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/, "sin el «_» el documento no se puede extraer al volver de la firma");
  });

  it("el resto de las variables SÍ se normaliza", () => {
    // Un apellido con espacio no puede partir el nombre en dos campos.
    assert.equal(renderNomenclatura("{{apellido}}", { apellido: "LE ROY" }), "LE-ROY");
  });

  it("`identidad` está declarada como compuesta", () => {
    assert.ok(VARIABLES_COMPUESTAS.has("identidad"));
  });
});
