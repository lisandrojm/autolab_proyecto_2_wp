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
import { validarPatron, renderNomenclatura, PATRON_POR_DEFECTO, VARIABLES_POR_TIPO, TIPOS_NOMBRE_SE_LEE_DE_VUELTA, campoNomenclatura, TIPOS_NOMENCLATURA, VARIABLES_COMPUESTAS, recortarNombre, MAX_NOMBRE, TOPES_CAMPO } from "./nomenclatura.js";
import { emailNomenclatura, MARCA_ARROBA, buildIdentidadTag } from "./employeeDocData.js";
/**
 * Cómo encuentra el CUIL el servicio de vuelta, hoy.
 *
 * `extraerIdentidadDeArchivo` prueba primero `_CUIL-\d{11}` y, si no está, cae a este respaldo: el
 * primer token de once dígitos aislado. Desde que el CUIL se escribe pelado, el que corre siempre es
 * el respaldo — por eso los tests assertan contra este y no contra el etiquetado.
 */
const PARSERS_CUIL = /(?<!\d)(\d{2}-?\d{8}-?\d)(?!\d)/;
/** Los mismos datos que usa la previsualización del ABM. */
const DATOS = {
    apellido: "gonzalez-rotstein",
    nombres: "juan-manuel",
    proyecto: "426_LN+",
    proyectoId: "705",
    tipo: "Contrato",
    contrato: "Jornada-2030-SRL",
    docName: "Acuerdo-de-titularidad",
    fechaAlta: "20260810",
    fechaBaja: "-",
    cuit: "20331501027",
    email: "juanmanuel.gonzalezrotstein-ARROBA-gmail.com",
    extra: "Constancia-de-Cuit",
    numero: "1042",
    timestamp: "20260821-143012",
    anio: "2026",
    fecha: "20260821",
    empresa: "FZERO S.R.L",
    empresaCuit: "30710295839",
};
describe("lo que el archivo necesita para volver de la firma", () => {
    /**
     * `dropboxSignMailService.extraerIdentidadDeArchivo()` busca `_CUIL-\d{11}` en el nombre. Sin ese
     * bloque, el documento firmado vuelve y no se puede asociar a ninguna persona — y no falla ruidoso:
     * el archivo existe, se firmó, y recién se descubre cuando alguien lo busca.
     */
    it("un patrón sin {{cuit}} NO se puede guardar", () => {
        const errores = validarPatron("Contrato", "{{apellido}}_{{nombres}}_{{tipo}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}");
        assert.equal(errores.length, 1);
        assert.match(errores[0].motivo, /cuit/i);
        assert.match(errores[0].motivo, /no se puede asociar a ninguna persona/i, "el motivo tiene que decir la consecuencia, no solo «falta una variable»");
    });
    /**
     * `estadoDropboxCronService.extraerFechasDeNombre()` machea el contrato por los tokens de 8
     * dígitos. Sin fechas, un archivo que vuelve puede caer en el contrato equivocado de la misma
     * persona — que es peor que no caer en ninguno.
     */
    it("un patrón sin fechas NO se puede guardar", () => {
        const errores = validarPatron("Contrato", "{{apellido}}_{{nombres}}_{{cuit}}");
        assert.equal(errores.length, 1);
        assert.match(errores[0].motivo, /fechaAlta/);
        assert.match(errores[0].motivo, /fechaBaja/);
    });
    it("con los bloques críticos, se guarda aunque cambie todo lo demás", () => {
        // El punto del ABM: el orden y el resto de los campos son libres.
        assert.deepEqual(validarPatron("Contrato", "{{tipo}}_{{proyecto}}_{{cuit}}_{{fechaAlta}}_{{fechaBaja}}_{{apellido}}"), []);
    });
    /**
     * TODOS los tipos vuelven a entrar por su nombre — firmados desde Dropbox Sign, o levantados de la
     * carpeta de Dropbox— así que todos exigen la identidad de la persona. Acotar esto a "los que se
     * firman" fue el error original: dejaba afuera a Pedidos y Vacaciones (que también se firman) y a
     * la Constancia de CUIT (que no se firma pero igual hay que poder levantarla de Dropbox).
     */
    it("TODOS los tipos exigen el CUIT de la persona", () => {
        assert.equal(TIPOS_NOMBRE_SE_LEE_DE_VUELTA.length, TIPOS_NOMENCLATURA.length, "no puede haber un tipo cuyo nombre no se lea de vuelta");
        for (const tipo of TIPOS_NOMENCLATURA) {
            const requeridas = VARIABLES_POR_TIPO[tipo].filter((v) => v.requerida).map((v) => v.variable);
            assert.ok(requeridas.includes("{{cuit}}"), `${tipo} no exige {{cuit}}`);
        }
    });
    /**
     * Lo que cambia entre tipos no es SI hay ancla, es CUÁL: un documento de contrato se ancla con las
     * fechas del período; un pedido o una vacación, con su número — es lo que distingue "el pedido 1042
     * de esta persona" de "un pedido de esta persona".
     */
    it("cada tipo exige el ancla que le corresponde", () => {
        for (const tipo of ["Contrato", "Release", "AltaAFIP", "ConstanciaCUIT", "Documentacion"]) {
            const requeridas = VARIABLES_POR_TIPO[tipo].filter((v) => v.requerida).map((v) => v.variable);
            assert.ok(requeridas.includes("{{fechaAlta}}"), `${tipo} no exige {{fechaAlta}}`);
            assert.ok(requeridas.includes("{{fechaBaja}}"), `${tipo} no exige {{fechaBaja}}`);
        }
        for (const tipo of ["Pedido", "Vacacion"]) {
            const requeridas = VARIABLES_POR_TIPO[tipo].filter((v) => v.requerida).map((v) => v.variable);
            assert.ok(requeridas.includes("{{numero}}"), `${tipo} no exige {{numero}}`);
        }
    });
    it("cada patrón por defecto pasa su propia validación", () => {
        // Un default inválido dejaría al ABM rechazando lo que la plataforma ya está usando.
        for (const tipo of TIPOS_NOMENCLATURA)
            assert.deepEqual(validarPatron(tipo, PATRON_POR_DEFECTO[tipo]), [], `el default de ${tipo} no valida`);
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
        assert.equal(nombre, "426-LN+_gonzalez-rotstein_Contrato_Jornada-2030-SRL_D-20260810_H--_20331501027_juanmanuel.gonzalezrotstein-ARROBA-gmail.com_Empresa-30710295839");
        assert.ok(nombre.startsWith("426-LN+_"), "el proyecto va primero, y por su NOMBRE (no por el id externo)");
        assert.ok(nombre.endsWith("_Empresa-30710295839"), "el CUIT de la empleadora va último");
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
            // Sin el «_» delante: la etiqueta `EMPRESA-` vive en el patrón desde que el CUIT sale pelado.
            assert.ok(p.endsWith("{{empresaCuit}}"), `${tipo} no termina con el CUIT de la empleadora: ${p}`);
            // `{{nombres}}` salió del default: con el apellido y el CUIL alcanza para saber de quién es, y
            // eran los caracteres que faltaban para entrar en 255. Se sigue ofreciendo por si hace falta.
            assert.match(p, /\{\{apellido\}\}_\{\{tipo\}\}/, `${tipo} no respeta el orden persona → documento`);
        }
    });
    /**
     * El CUIT de la empleadora convive con el CUIL de la persona sin confundirlos, y sus once dígitos
     * no se leen como una fecha (el cron busca tokens de OCHO).
     */
    it("el CUIT de la empleadora no interfiere con el parseo de vuelta", () => {
        const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS);
        // El CUIL va pelado, así que el que corre es el respaldo por posición: el PRIMER 11 dígitos.
        assert.equal(PARSERS_CUIL.exec(nombre)?.[1], "20331501027", "el primer 11 dígitos tiene que ser el de la PERSONA, no el de la empleadora");
        const fechas = nombre.match(/(?<!\d)(?<!(?:DNI|CI|LE|LC|PAS|DOC)-)(\d{8})(?!\d)/g) ?? [];
        assert.deepEqual(fechas, ["20260810"], "el CUIT no puede colarse como fecha");
    });
    it("el bloque desde/hasta sobrevive con la baja vacía", () => {
        // Un "-" NO es basura: distingue "contrato sin fin" de "dato sin cargar". Si la limpieza se lo
        // comiera, el nombre diría `H` a secas y las dos situaciones serían indistinguibles.
        //
        // El `H--` doble sale de que la etiqueta va pegada (`H-{{fechaBaja}}`) para ahorrar
        // un separador: queda feo pero es la única forma de decir "sin baja" sin gastar caracteres.
        assert.match(renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS), /_H--_/);
        assert.match(renderNomenclatura(PATRON_POR_DEFECTO.Contrato, { ...DATOS, fechaBaja: "20270810" }), /_H-20270810_/);
    });
    it("una variable vacía no deja un separador colgando", () => {
        // Sin plantilla ni etiqueta extra, el nombre no puede tener "__" ni terminar en "_".
        const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, { ...DATOS, docName: "", extra: "" });
        assert.ok(!nombre.includes("__"), nombre);
        assert.ok(!nombre.endsWith("_"), nombre);
    });
    it("el nombre resultante sigue siendo parseable por los servicios de vuelta", () => {
        // Las dos expresiones reales, copiadas de sus servicios. Si alguien toca el render y rompe el
        // formato, esto se cae acá y no seis meses después con un contrato "perdido".
        const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS);
        assert.match(nombre, PARSERS_CUIL, "extraerIdentidadDeArchivo no encontraría el CUIL");
        // El documento ya NO va cuando hay CUIL: era el mismo número dos veces (ver `buildIdentidadTag`).
        // Lo que sí tiene que seguir pasando es que `buscarEnOutbox` encuentre a la persona por el CUIL.
        const fechas = nombre.match(/(?<!\d)(?<!(?:DNI|CI|LE|LC|PAS|DOC)-)(\d{8})(?!\d)/g) ?? [];
        assert.ok(fechas.includes("20260810"), `extraerFechasDeNombre no encontraría el alta (encontró ${JSON.stringify(fechas)})`);
    });
    it("los de pedidos y vacaciones también conservan su identidad", () => {
        const pedido = renderNomenclatura(PATRON_POR_DEFECTO.Pedido, { ...DATOS, tipo: "Pedido" });
        assert.equal(pedido, "426-LN+_gonzalez-rotstein_Pedido_1042_20260821_20331501027_juanmanuel.gonzalezrotstein-ARROBA-gmail.com_Empresa-30710295839");
        assert.match(pedido, PARSERS_CUIL);
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
    it("{{cuit}} conserva su «_» interno si alguna vez vuelve a tener dos bloques", () => {
        const nombre = renderNomenclatura("{{apellido}}_{{cuit}}", { apellido: "perez", cuit: "CUIL-20331501027_DNI-33150102" });
        assert.equal(nombre, "perez_CUIL-20331501027_DNI-33150102");
        assert.match(nombre, /_(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/, "sin el «_» el documento no se puede extraer al volver de la firma");
    });
    it("el resto de las variables SÍ se normaliza", () => {
        // Un apellido con espacio no puede partir el nombre en dos campos.
        assert.equal(renderNomenclatura("{{apellido}}", { apellido: "LE ROY" }), "LE-ROY");
    });
    it("`cuit` está declarada como compuesta", () => {
        assert.ok(VARIABLES_COMPUESTAS.has("cuit"));
    });
});
describe("el nombre viejo de la variable sigue funcionando", () => {
    /**
     * `{{identidad}}` se renombró a `{{cuit}}`. Un patrón guardado con el nombre viejo tiene que seguir
     * rindiendo el CUIL: si no, generaría archivos con un `{{identidad}}` literal adentro — sin el
     * número que permite reencontrarlos, y sin ningún error a la vista hasta que uno vuelve de la firma.
     */
    it("un patrón con {{identidad}} rinde el mismo CUIL que uno con {{cuit}}", () => {
        const conNombreViejo = renderNomenclatura("{{apellido}}_{{identidad}}", DATOS);
        const conNombreNuevo = renderNomenclatura("{{apellido}}_{{cuit}}", DATOS);
        assert.equal(conNombreViejo, conNombreNuevo);
        assert.match(conNombreViejo, PARSERS.cuil, `el nombre viejo tiene que seguir escribiendo el CUIL: ${conNombreViejo}`);
    });
    it("y sigue siendo un patrón válido para guardar", () => {
        assert.deepEqual(validarPatron("Contrato", "{{proyecto}}_{{identidad}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}"), []);
    });
    it("pero el ABM ofrece el nombre nuevo", () => {
        // El alias se ACEPTA, no se sugiere: dos nombres para lo mismo en la lista sería peor que uno.
        for (const tipo of TIPOS_NOMENCLATURA) {
            const ofrecidas = VARIABLES_POR_TIPO[tipo].map((v) => v.variable);
            assert.ok(ofrecidas.includes("{{cuit}}"), `${tipo} no ofrece {{cuit}}`);
            assert.ok(!ofrecidas.includes("{{identidad}}"), `${tipo} sigue ofreciendo el nombre viejo`);
        }
    });
});
describe("la empleadora y el tipo de contrato en el nombre", () => {
    /**
     * Los dos faltaban en los archivos reales y por motivos distintos:
     *
     *  - la EMPLEADORA salía vacía porque se la buscaba por `contract.empresaContratoId`, que es el
     *    campo correcto para los documentos de ARCA pero no para un Release (que usa las empresas del
     *    proyecto) ni para un Contrato descargado eligiendo empresa. Ahora quien la tiene resuelta la
     *    pasa, y solo se deduce cuando no viene;
     *  - el NOMBRE DEL TIPO DE CONTRATO no existía como variable. `{{docName}}` es la plantilla, que es
     *    otra cosa: dos contratos del mismo tipo pueden salir de plantillas distintas.
     */
    it("el patrón por defecto de los documentos de contrato incluye el tipo de contrato", () => {
        for (const tipo of ["Contrato", "Release", "AltaAFIP", "ConstanciaCUIT", "Documentacion"]) {
            assert.match(PATRON_POR_DEFECTO[tipo], /\{\{contrato\}\}/, `${tipo} no incluye {{contrato}}`);
            assert.ok(VARIABLES_POR_TIPO[tipo].some((v) => v.variable === "{{contrato}}"), `${tipo} no ofrece {{contrato}}`);
        }
    });
    it("`{{contrato}}` y `{{docName}}` son campos distintos y conviven", () => {
        // `{{docName}}` ya no está en el default —era el campo más largo y casi repetía a
        // `{{contrato}}`— pero se sigue ofreciendo, y los dos tienen que poder convivir.
        const nombre = renderNomenclatura("{{contrato}}_{{docName}}", DATOS);
        assert.equal(nombre, "Jornada-2030-SRL_Acuerdo-de-titularidad");
    });
    it("la empleadora cierra el nombre en todos los tipos", () => {
        for (const tipo of TIPOS_NOMENCLATURA) {
            const nombre = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...DATOS, tipo });
            assert.ok(nombre.endsWith("_Empresa-30710295839"), `${tipo} termina en: ${nombre.slice(-60)}`);
        }
    });
});
describe("el proyecto se nombra como lo ve la gente", () => {
    /**
     * `{{proyecto}}` es el NOMBRE ("426_LN+"), no el id externo ("705").
     *
     * El nombre del archivo usaba el id mientras que la grilla, el PDF y todo lo que una persona mira
     * usan el nombre: el archivo decía "705" y nadie lo reconocía. El dato era correcto y aun así
     * inútil, que para un nombre de archivo es lo mismo que estar mal.
     */
    it("el patrón por defecto usa el nombre y no el id", () => {
        const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Release, { ...DATOS, tipo: "Release" });
        // El "_" del nombre del proyecto queda como "-": el "_" es el separador de CAMPOS del archivo,
        // y dejarlo partiría "426_LN+" en dos campos. Ver `campoNomenclatura`.
        assert.ok(nombre.startsWith("426-LN+_"), `arranca con: ${nombre.slice(0, 30)}`);
        assert.ok(!nombre.includes("_705_"), "el id externo no va en el nombre por defecto");
    });
    it("el id externo sigue disponible para quien lo quiera", () => {
        for (const tipo of TIPOS_NOMENCLATURA) {
            assert.ok(VARIABLES_POR_TIPO[tipo].some((v) => v.variable === "{{proyectoId}}"), `${tipo} no ofrece {{proyectoId}}`);
        }
        assert.equal(renderNomenclatura("{{proyecto}}_{{proyectoId}}", DATOS), "426-LN+_705");
    });
});
/**
 * Las cuatro expresiones reales de los servicios de vuelta, copiadas de sus archivos.
 *
 * Están duplicadas acá y eso es una deuda conocida: si alguien cambia la regex del servicio, este
 * test sigue verde. Lo que sí protege es el otro lado, que es el que se toca seguido — el patrón.
 */
const PARSERS = {
    /**
     * `extraerIdentidadDeArchivo` busca primero `_CUIL-\d{11}` y, si no lo encuentra, cae al RESPALDO:
     * el primer token de once dígitos aislado. Desde que el CUIL va pelado el que corre es el respaldo,
     * así que los tests assertan contra ESTE y no contra el etiquetado.
     */
    cuil: /(?<!\d)(\d{2}-?\d{8}-?\d)(?!\d)/,
    documento: /_(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/,
    /** estadoDropboxCronService.extraerCuitDeNombre — PRIMER token de 11 dígitos, sin etiqueta */
    cuitSuelto: /(?<!\d)(\d{2}-?\d{8}-?\d)(?!\d)/,
    /** estadoDropboxCronService.extraerFechasDeNombre */
    fechas: /(?<!\d)(?<!(?:DNI|CI|LE|LC|PAS|DOC)-)(\d{8})(?!\d)/g,
};
describe("el nombre sigue siendo legible por los servicios de vuelta", () => {
    it("los SIETE tipos conservan el bloque de identidad", () => {
        // Antes esto se comprobaba solo sobre Contrato. Pedidos y Vacaciones también se firman y
        // vuelven, y son justamente los que llevan {{fecha}}/{{timestamp}} con dígitos sueltos.
        for (const tipo of TIPOS_NOMENCLATURA) {
            const nombre = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...DATOS, tipo });
            assert.match(nombre, PARSERS.cuil, `${tipo}: no se encontraría el CUIL`);
        }
    });
    it("el primer número de 11 dígitos es el de la PERSONA, no el de la empleadora", () => {
        // `extraerCuitDeNombre` del cron no exige etiqueta: se lleva el primero que encuentra. Si el
        // CUIT de la empleadora quedara delante, los documentos que vuelven se intentarían asociar por
        // la empresa y no encontrarían a nadie.
        for (const tipo of TIPOS_NOMENCLATURA) {
            const nombre = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...DATOS, tipo });
            const m = PARSERS.cuitSuelto.exec(nombre);
            assert.equal(m?.[1].replace(/\D/g, ""), "20331501027", `${tipo}: el primer 11 dígitos no es el CUIL de la persona`);
        }
    });
    it("el CUIT de la empleadora no se cuela como fecha en ningún tipo", () => {
        for (const tipo of TIPOS_NOMENCLATURA) {
            const nombre = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...DATOS, tipo });
            const fechas = nombre.match(PARSERS.fechas) ?? [];
            assert.ok(!fechas.some((f) => "30710295839".includes(f)), `${tipo}: un pedazo del CUIT pasó por fecha (${JSON.stringify(fechas)})`);
        }
    });
    it("el patrón no puede poner el CUIT de la empleadora antes que la identidad", () => {
        const dadoVuelta = "{{proyecto}}_{{empresaCuit}}_{{cuit}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}";
        const errores = validarPatron("Contrato", dadoVuelta);
        assert.ok(errores.some((e) => e.motivo.includes("{{empresaCuit}}")), `debería rechazarse: ${JSON.stringify(errores)}`);
        // Y en el orden correcto tiene que pasar.
        assert.deepEqual(validarPatron("Contrato", "{{proyecto}}_{{cuit}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}_{{empresaCuit}}"), []);
    });
});
describe("el email se puede reconstruir", () => {
    /**
     * Las seis direcciones del padrón real que con "-" quedaban irreconstruibles: el guion es legal a
     * los dos lados del "@", así que `ivonne.nino@into-films.com` y `ivonne.nino-into@films.com`
     * colapsaban al mismo texto. Con la marca en mayúscula la vuelta es exacta.
     */
    const AMBIGUOS = ["german-zuccarello@hotmail.com", "gri-27@hotmail.com", "ivonne.nino@into-films.com", "laico-25@hotmail.com", "lazaro-joaquin@hotmail.com", "sebastian-diez@hotmail.com"];
    it("la marca -ARROBA- devuelve la dirección original", () => {
        for (const original of [...AMBIGUOS, "juanmanuel.gonzalezrotstein@gmail.com"]) {
            const enNombre = emailNomenclatura(original);
            assert.ok(!enNombre.includes("@"), `${original}: el @ tiene que salir del nombre`);
            assert.equal(enNombre.replace(MARCA_ARROBA, "@"), original, `${original}: no se reconstruye`);
        }
    });
    it("la marca sobrevive al render y queda una sola vez", () => {
        const nombre = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, DATOS);
        assert.equal(nombre.split(MARCA_ARROBA).length - 1, 1, `la marca tiene que aparecer exactamente una vez: ${nombre}`);
    });
});
describe("el nombre entra en el tope de Dropbox", () => {
    /** El caso real más largo de producción: proyecto, plantilla y tipo de contrato todos al máximo. */
    const LARGO = {
        ...DATOS,
        proyecto: "701-CCM-PRODUCCION-TECNICA-Y-POST-CANAL-YT",
        apellido: "Escudero-Salinas",
        nombres: "Facundo-Nahuel-Hugo",
        contrato: "Eventual-Talento-My-secret-Nudity-rider-Reelshort",
        docName: "Eventual-Talento-Surrender-Nudity-rider-Reelshort",
        email: "facundoescuderosalinas-ARROBA-gmail.com",
    };
    it("un nombre que ya entra no se toca", () => {
        const corto = "426-LN+_gonzalez-rotstein_20331501027";
        assert.equal(recortarNombre(corto), corto);
    });
    it("el peor caso real queda por debajo de 255", () => {
        const nombre = recortarNombre(renderNomenclatura(PATRON_POR_DEFECTO.Contrato, LARGO));
        assert.ok(nombre.length <= MAX_NOMBRE - 4, `quedó en ${nombre.length}: ${nombre}`);
    });
    it("recortar no toca el CUIL, el documento ni las fechas", () => {
        const nombre = recortarNombre(renderNomenclatura(PATRON_POR_DEFECTO.Contrato, LARGO));
        assert.match(nombre, PARSERS.cuil, `se perdió el CUIL: ${nombre}`);
        const fechas = nombre.match(PARSERS.fechas) ?? [];
        assert.ok(fechas.includes("20260810"), `se perdió la fecha de alta (quedaron ${JSON.stringify(fechas)})`);
        assert.equal(PARSERS.cuitSuelto.exec(nombre)?.[1].replace(/\D/g, ""), "20331501027");
    });
    it("no desaparece ningún campo: se acortan los valores, no se borran bloques", () => {
        const entero = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, LARGO);
        const recortado = recortarNombre(entero);
        assert.equal(recortado.split("_").length, entero.split("_").length, `se perdieron bloques: ${recortado}`);
        // Las etiquetas son lo que hace legible el nombre: tienen que sobrevivir al recorte.
        for (const etiqueta of ["Empresa-"]) {
            assert.ok(recortado.includes(etiqueta), `se perdió la etiqueta ${etiqueta}: ${recortado}`);
        }
    });
    it("respeta lo que el llamador va a agregar después", () => {
        const nombre = recortarNombre(renderNomenclatura(PATRON_POR_DEFECTO.Contrato, LARGO), 30);
        assert.ok(nombre.length <= MAX_NOMBRE - 30, `quedó en ${nombre.length} con 30 reservados`);
    });
});
describe("el tope se mide en BYTES, no en caracteres", () => {
    /**
     * El caso exacto que reventó en producción.
     *
     * Salía con 255 caracteres —dentro del tope si se cuenta en caracteres— pero 256 bytes por la
     * tilde de "Andrés", y `writeFileSync` falló con ENAMETOOLONG antes de generar el release. El
     * filesystem cuenta bytes; medirlo en caracteres deja pasar un nombre por cada tilde que tenga.
     */
    const ACENTOS = {
        ...DATOS,
        proyecto: "426-LN+",
        apellido: "Henriquez-aliste",
        nombres: "Carlos-Andrés",
        contrato: "Tiempo-Indeterminado-FZERO-SRL",
        docName: "Acuerdo-de-titularidad-de-la-obra",
        email: "andreshenriquez-ARROBA-live.com.ar",
        empresa: "2030 S.R.L.",
        empresaCuit: "CUIT-30717068374",
    };
    const bytes = (s) => new TextEncoder().encode(s).length;
    it("un nombre con tildes entra en 255 BYTES, no solo en 255 caracteres", () => {
        const nombre = recortarNombre(renderNomenclatura(PATRON_POR_DEFECTO.Release, { ...ACENTOS, tipo: "Release" })) + ".pdf";
        assert.ok(bytes(nombre) <= MAX_NOMBRE, `${bytes(nombre)} bytes (${nombre.length} caracteres): ${nombre}`);
    });
    it("recortar no parte un carácter al medio", () => {
        // Cortar por unidades UTF-16 puede dejar medio par subrogado, que es un carácter inválido en el
        // nombre del archivo. Se recorta por puntos de código.
        const conEmoji = { ...ACENTOS, docName: "Acuerdo-de-titularidad-de-la-obra-🎬🎬🎬🎬🎬🎬🎬🎬" };
        const nombre = recortarNombre(renderNomenclatura(PATRON_POR_DEFECTO.Release, { ...conEmoji, tipo: "Release" }));
        assert.ok(!/[\uD800-\uDFFF]/.test(nombre.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")), `quedó medio carácter: ${nombre}`);
        assert.ok(bytes(nombre) + 4 <= MAX_NOMBRE, `${bytes(nombre) + 4} bytes`);
    });
    it("sigue conservando el CUIL y el documento", () => {
        const nombre = recortarNombre(renderNomenclatura(PATRON_POR_DEFECTO.Release, { ...ACENTOS, tipo: "Release" }));
        assert.match(nombre, PARSERS.cuil);
    });
});
describe("la identidad: CUIL solo, y el documento como respaldo", () => {
    const usuario = (cuit, documento, tipoDocumentoId = 1) => ({ metadata: { cuit, documento, tipoDocumentoId } });
    it("con CUIL, van los once dígitos pelados y nada más", () => {
        // Iban los dos y era el mismo número dos veces: el CUIL contiene al DNI. Trece caracteres del
        // nombre gastados en repetir, con el tope de 255 encima.
        assert.equal(buildIdentidadTag(usuario("20-33150102-7", "33150102")), "20331501027");
    });
    it("SIN CUIL, queda el documento: es el único identificador que le queda a esa persona", () => {
        // Son 39 en el padrón real (pasaportes y DNI sin CUIL cargado), 31 con contratos. Sin esto sus
        // documentos vuelven de la firma y no se pueden asociar a nadie.
        assert.equal(buildIdentidadTag(usuario("", "43092696")), "DNI-43092696");
        assert.equal(buildIdentidadTag({ metadata: { cuit: "", documento: "AAE1450C7", tipoDocumentoId: 5 } }), "PAS-AAE1450C7");
    });
    it("un CUIT de ceros no cuenta como CUIL", () => {
        // Es el placeholder que quedó cargado en la gente sin CUIL argentino: si se escribiera, el
        // matching por CUIT daría ambiguo entre todos ellos.
        assert.equal(buildIdentidadTag(usuario("00-00000000-0", "43092696")), "DNI-43092696");
    });
    it("sin CUIL ni documento no se inventa nada", () => {
        assert.equal(buildIdentidadTag({ metadata: {} }), "");
    });
    it("lo que sale sigue siendo parseable por el servicio de vuelta", () => {
        const conCuil = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, { ...DATOS, cuit: buildIdentidadTag(usuario("20-33150102-7", "33150102")) });
        assert.match(conCuil, PARSERS.cuil);
        const sinCuil = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, { ...DATOS, cuit: buildIdentidadTag(usuario("", "43092696")) });
        assert.match(sinCuil, PARSERS.documento, `sin CUIL hay que poder encontrarlo por el documento: ${sinCuil}`);
    });
});
describe("la razón social de la empleadora quedó retirada", () => {
    /**
     * Eran doce caracteres para decir lo mismo que `{{empresaCuit}}`, con el nombre peleando contra el
     * tope de 255. Ya no se ofrece y no se puede guardar un patrón que la use.
     */
    it("ningún patrón por defecto la usa", () => {
        for (const tipo of TIPOS_NOMENCLATURA)
            assert.ok(!PATRON_POR_DEFECTO[tipo].includes("{{empresa}}"), `${tipo} todavía la usa: ${PATRON_POR_DEFECTO[tipo]}`);
    });
    it("el ABM ya no la ofrece en ningún tipo", () => {
        for (const tipo of TIPOS_NOMENCLATURA) {
            const ofrecidas = VARIABLES_POR_TIPO[tipo].map((v) => v.variable);
            assert.ok(!ofrecidas.includes("{{empresa}}"), `${tipo} sigue ofreciéndola`);
            assert.ok(ofrecidas.includes("{{empresaCuit}}"), `${tipo} tiene que seguir ofreciendo el CUIT`);
        }
    });
    it("un patrón que la use no se puede guardar, y el motivo dice qué hacer", () => {
        const errores = validarPatron("Release", "{{proyecto}}_{{cuit}}_Alta_{{fechaAlta}}_Baja_{{fechaBaja}}_{{empresa}}_{{empresaCuit}}");
        assert.equal(errores.length, 1);
        assert.match(errores[0].motivo, /\{\{empresa\}\}/);
        assert.match(errores[0].motivo, /empresaCuit/, "el motivo tiene que decir con qué se reemplaza");
        // Y NO con el motivo de «variable inventada», que diría que el campo quedaría vacío: no es cierto,
        // el valor se sigue proveyendo para que los patrones ya guardados rindan bien.
        assert.doesNotMatch(errores[0].motivo, /quedaría vacío/);
    });
    it("pero un patrón guardado con ella sigue rindiendo el nombre de la empresa", () => {
        // Hasta que alguien lo edite: escribir `{{empresa}}` literal adentro del archivo sería peor.
        assert.equal(renderNomenclatura("{{apellido}}_{{empresa}}", DATOS), "gonzalez-rotstein_FZERO-S.R.L");
    });
});
describe("los defaults entran en 255 con los datos reales más largos", () => {
    /**
     * Los valores más largos que hoy existen en producción, medidos con `npm run nomenclatura:medir`.
     * Si mañana alguien crea un proyecto o un tipo de contrato más largo, el script lo detecta contra
     * la base; este test protege el otro lado — que nadie agrande el patrón hasta pasarse.
     */
    const PEOR_REAL = {
        proyecto: "701-CCM-PRODUCCION-TECNICA-Y-POST-CANAL-YT",
        apellido: "BARRAGAN-ORDONEZ",
        nombres: "Facundo-Nahuel-Hugo",
        contrato: "Eventual-Talento-My-secret-Nudity-rider-Reelshort",
        docName: "Eventual-Talento-Surrender-Nudity-rider-Reelshort",
        fechaAlta: "20260810",
        fechaBaja: "20270810",
        cuit: "20331501027",
        email: "marcosrodriguezcorbalan120580-ARROBA-gmail.com",
        extra: "Alta-Temprana-de-ARCA",
        numero: "1042",
        fecha: "20260821",
        anio: "2026",
        timestamp: "20260821-143012",
        proyectoId: "705",
        empresaCuit: "30710295839",
    };
    const bytes = (s) => new TextEncoder().encode(s).length;
    it("ningún tipo se pasa, y sin necesidad de recortar", () => {
        for (const tipo of TIPOS_NOMENCLATURA) {
            const crudo = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...PEOR_REAL, tipo }) + ".pdf";
            assert.ok(bytes(crudo) <= MAX_NOMBRE, `${tipo}: ${bytes(crudo)} bytes — ${crudo}`);
            // Que entre SIN recortar: si hay que recortar, se pierden caracteres del final de los campos.
            assert.equal(recortarNombre(crudo.replace(/\.pdf$/, "")) + ".pdf", crudo, `${tipo} necesita recorte`);
        }
    });
    it("queda margen para que crezca alguno de los campos", () => {
        /*
         * Diez bytes de aire, y el peor caso de acá es SINTÉTICO: combina el proyecto más largo con el
         * tipo de contrato más largo y el email más largo, que hoy no coinciden en ninguna persona. El
         * peor caso real que mide `npm run nomenclatura:medir` sobre los 6.780 contratos es 202.
         *
         * O sea que el margen verdadero es de ~50 bytes; estos diez son el piso que no se puede cruzar
         * ni siquiera en la combinación imposible.
         */
        for (const tipo of TIPOS_NOMENCLATURA) {
            const crudo = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...PEOR_REAL, tipo }) + ".pdf";
            assert.ok(bytes(crudo) <= MAX_NOMBRE - 10, `${tipo} quedó a ${MAX_NOMBRE - bytes(crudo)} bytes del tope`);
        }
    });
});
describe("topes por campo: un valor siempre se escribe igual", () => {
    /**
     * El punto de un tope FIJO frente al recorte reactivo de `recortarNombre`: ese recorta el campo más
     * largo cuando el total se pasa, así que el MISMO proyecto podía salir entero en un archivo y
     * cortado en otro según qué tan largo fuera el resto. Con tope, un valor se escribe siempre igual.
     */
    const LARGO = "701-CCM-PRODUCCION-TECNICA-Y-POST-CANAL-YT"; // 42, el más largo de producción
    it("el proyecto se corta en 32 y siempre igual", () => {
        const conNombreCorto = renderNomenclatura("{{proyecto}}_{{apellido}}", { proyecto: LARGO, apellido: "ok" });
        const conNombreLargo = renderNomenclatura("{{proyecto}}_{{apellido}}", { proyecto: LARGO, apellido: "BARRAGAN-ORDONEZ-DE-LA-TORRE" });
        assert.equal(conNombreCorto.split("_")[0], conNombreLargo.split("_")[0], "el mismo proyecto tiene que salir igual en los dos");
        assert.equal(conNombreCorto.split("_")[0], "701-CCM-PRODUCCION-TECNICA-Y-POS");
    });
    it("no deja un guion colgando al cortar", () => {
        // `Eventual-Talento-Surrender-Nudity-rider` cortado en 32 caería justo en un "-".
        assert.doesNotMatch(renderNomenclatura("{{contrato}}", { contrato: "Eventual-Talento-Surrender-Nudi-rider" }), /-$/);
    });
    it("lo que está por debajo del tope no se toca", () => {
        assert.equal(renderNomenclatura("{{proyecto}}", { proyecto: "426_LN+" }), "426-LN+");
    });
    /**
     * El email NO tiene tope aunque sea el campo más largo, y es una decisión: cortado PARECE una
     * dirección y no lo es, así que quien lo lea le escribe a una casilla inexistente. Era todo el
     * punto de codificar el "@" como `-ARROBA-`, que se pueda reconstruir.
     */
    it("el email NO se corta, por más largo que sea", () => {
        const largo = "marcosrodriguezcorbalan120580-ARROBA-gmail.com";
        assert.equal(renderNomenclatura("{{email}}", { email: largo }), largo);
        assert.equal(TOPES_CAMPO.email, undefined);
    });
    it("los campos que leen los servicios de vuelta tampoco tienen tope", () => {
        // Cortarle un dígito al CUIL o a una fecha no acorta el nombre: lo vuelve irreconocible.
        for (const campo of ["cuit", "fechaAlta", "fechaBaja", "numero", "empresaCuit"]) {
            assert.equal(TOPES_CAMPO[campo], undefined, `${campo} no puede tener tope`);
        }
    });
    it("con los topes puestos, el peor caso teórico del default entra holgado", () => {
        // Todos los campos variables en su tope a la vez: la combinación no existe, pero es la cota.
        const enElTope = renderNomenclatura(PATRON_POR_DEFECTO.Contrato, {
            proyecto: "X".repeat(60),
            apellido: "Y".repeat(40),
            tipo: "ConstanciaCUIT",
            contrato: "Z".repeat(60),
            fechaAlta: "20260810",
            fechaBaja: "20270810",
            cuit: "20331501027",
            email: "marcosrodriguezcorbalan120580-ARROBA-gmail.com",
            empresaCuit: "30710295839",
        });
        const bytes = new TextEncoder().encode(enElTope + ".pdf").length;
        assert.ok(bytes <= MAX_NOMBRE, `${bytes} bytes: ${enElTope}`);
    });
});
