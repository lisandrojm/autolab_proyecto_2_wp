/**
 * Que el nombre que ESCRIBE la nomenclatura sea el que LEEN los dos circuitos de vuelta.
 *
 * Estos tests no prueban expresiones regulares: prueban el contrato entre las dos mitades del
 * sistema. Los nombres se arman con `renderNomenclatura` y el patrón por defecto real —no con
 * strings escritos a mano— así que si alguien cambia el patrón y rompe la lectura, se cae acá y no
 * seis meses después con un contrato "perdido".
 *
 * Ese era el agujero: hasta ahora los tests copiaban las expresiones de los servicios adentro del
 * archivo de test. Cambiar la del servicio dejaba el test verde probando la copia vieja.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerAnclas, mismoDocumento, mismaPersona, esCampoAncla } from "./anclasNombre.js";
import { renderNomenclatura, validarPatron, PATRON_POR_DEFECTO, VARIABLES_POR_TIPO, TIPOS_NOMENCLATURA } from "./nomenclatura.js";
import { buscarEnOutbox, yaEstaEnPendbox } from "../services/dropboxSignMailService.js";
/** Los mismos datos que usa la previsualización del ABM, con un período cerrado de verdad. */
const DATOS = {
    apellido: "gonzalez-rotstein",
    nombres: "juan-manuel",
    proyecto: "426_LN+",
    proyectoId: "705",
    tipo: "Contrato",
    contrato: "Jornada-2030-SRL",
    fechaAlta: "20260810",
    fechaBaja: "20261231",
    cuit: "20331501027",
    email: "juanmanuel.gonzalezrotstein-ARROBA-gmail.com",
    numero: "1042",
    anio: "2026",
    fecha: "20260821",
    empresaCuit: "30710295839",
};
const nombreDe = (over = {}) => renderNomenclatura(PATRON_POR_DEFECTO.Contrato, { ...DATOS, ...over });
const archivo = (name) => ({ tag: "file", name, path: `/HelloSign/Outbox/${name}` });
describe("lo que se puede leer del nombre", () => {
    it("saca el CUIT, no el de la empleadora", () => {
        // Los dos son de once dígitos y los dos están en el nombre. Lo que decide es el ORDEN, y eso lo
        // garantiza `validarPatron`, que no deja poner {{empresaCuit}} antes que {{cuit}}.
        const a = leerAnclas(nombreDe());
        assert.equal(a.cuit, "20331501027");
        assert.notEqual(a.cuit, "30710295839");
    });
    it("saca las dos fechas del período", () => {
        assert.deepEqual(leerAnclas(nombreDe()).fechas, ["20260810", "20261231"]);
    });
    it("un contrato sin baja deja una sola fecha", () => {
        assert.deepEqual(leerAnclas(nombreDe({ fechaBaja: "-" })).fechas, ["20260810"]);
    });
    it("no confunde un DNI de ocho dígitos con una fecha", () => {
        // 20010115 es un DNI plausible y una fecha válida (2001-01-15). Si se colara, desempataría
        // contra el contrato equivocado.
        const a = leerAnclas("perez_Contrato_D-20260810_H-20261231_DNI-20010115");
        assert.deepEqual(a.fechas, ["20260810", "20261231"]);
        assert.equal(a.documento, "20010115");
        assert.equal(a.tipoDoc, "DNI");
    });
    it("sigue leyendo los archivos viejos, con el CUIL etiquetado", () => {
        // Ya no se escribe así, pero los que quedaron en las carpetas de antes del cambio tienen que
        // poder volver igual.
        assert.equal(leerAnclas("perez_CUIL-20331501027_Contrato").cuit, "20331501027");
    });
    it("un CUIT con guiones se normaliza a once dígitos", () => {
        assert.equal(leerAnclas("perez_20-33150102-7_Contrato").cuit, "20331501027");
    });
    it("un número de once dígitos pegado a otros no es un CUIT", () => {
        assert.equal(leerAnclas("perez_1234203315010271234").cuit, "");
    });
    /**
     * EL BUG QUE ESTE TEST CONGELA, y que apareció escribiendo el test de al lado.
     *
     * Lo que separa el CUIT de la persona del de la empleadora era el ORDEN, garantizado por
     * `validarPatron`. Pero ese orden se cae justo en el caso que más importa: cuando la persona no
     * tiene CUIL, `{{cuit}}` renderiza vacío, su campo desaparece del nombre, y el primero de once
     * dígitos pasa a ser el de la EMPRESA. El archivo se leía como si fuera de la empleadora y no
     * matcheaba con nadie — para las 39 personas del padrón sin CUIL, que son justamente las que menos
     * margen tienen.
     */
    it("sin CUIL, NO se lee el CUIT de la empleadora como el de la persona", () => {
        const sinCuil = nombreDe({ cuit: "" });
        assert.ok(sinCuil.includes("30710295839"), `el nombre tiene que seguir trayendo el de la empresa: ${sinCuil}`);
        assert.equal(leerAnclas(sinCuil).cuit, "");
    });
    it("con CUIL, el de la empleadora sigue sin confundirse", () => {
        assert.equal(leerAnclas(nombreDe()).cuit, "20331501027");
    });
});
describe("el rótulo de la empleadora no es decorativo", () => {
    it("un patrón que deje {{empresaCuit}} sin rótulo no se puede guardar", () => {
        const errores = validarPatron("Contrato", "{{proyecto}}_{{cuit}}_{{email}}_D-{{fechaAlta}}_H-{{fechaBaja}}_{{empresaCuit}}");
        assert.ok(errores.some((e) => e.motivo.includes("rótulo")), `debería rechazarse: ${JSON.stringify(errores)}`);
    });
    it("con rótulo, se guarda", () => {
        assert.deepEqual(validarPatron("Contrato", "{{proyecto}}_{{cuit}}_{{email}}_D-{{fechaAlta}}_H-{{fechaBaja}}_Empresa-{{empresaCuit}}"), []);
    });
    it("los siete patrones de fábrica lo cumplen", () => {
        for (const tipo of TIPOS_NOMENCLATURA)
            assert.deepEqual(validarPatron(tipo, PATRON_POR_DEFECTO[tipo]), [], `el default de ${tipo} no valida`);
    });
});
describe("los siete tipos se pueden leer con su patrón de fábrica", () => {
    for (const tipo of TIPOS_NOMENCLATURA) {
        it(`${tipo}: el patrón por defecto rinde un nombre del que se saca el CUIT`, () => {
            const nombre = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...DATOS, tipo });
            assert.equal(leerAnclas(nombre).cuit, "20331501027", nombre);
        });
        it(`${tipo}: cada variable obligatoria queda escrita en el nombre`, () => {
            // El vínculo que este test congela: "obligatoria" en el ABM tiene que significar "está en el
            // archivo", no solo "está en el patrón".
            const nombre = renderNomenclatura(PATRON_POR_DEFECTO[tipo], { ...DATOS, tipo });
            for (const v of VARIABLES_POR_TIPO[tipo].filter((v) => v.requerida)) {
                const clave = v.variable.replace(/[{}]/g, "");
                const valor = String(DATOS[clave] ?? "");
                assert.ok(valor && nombre.includes(valor), `${tipo}: falta el valor de ${v.variable} en "${nombre}"`);
            }
        });
    }
});
describe("el email, que es el identificador que nunca falta", () => {
    it("se reconstruye con su «@» desde la marca -ARROBA-", () => {
        assert.equal(leerAnclas(nombreDe()).email, "juanmanuel.gonzalezrotstein@gmail.com");
    });
    it("no se lleva puesto el campo anterior", () => {
        // El "_" es el separador de campos y no entra en la dirección, aunque sea legal en un email:
        // `campoNomenclatura` ya lo convirtió a "-" en el valor.
        assert.equal(leerAnclas("426-LN+_perez_Contrato_20331501027_juan-ARROBA-gmail.com_Empresa-30710295839").email, "juan@gmail.com");
    });
    it("sobrevive a que Dropbox Sign le cambie los separadores de la marca", () => {
        // Las letras de ARROBA no las toca —por eso la marca es una palabra y no un símbolo— pero los
        // guiones de los costados sí pueden salir como "_".
        assert.equal(leerAnclas("perez_juan_ARROBA_gmail.com_20331501027").email, "juan@gmail.com");
    });
    it("lee un «@» literal, de un archivo renombrado a mano", () => {
        assert.equal(leerAnclas("perez_juan@gmail.com_20331501027").email, "juan@gmail.com");
    });
    it("un nombre sin email no inventa uno", () => {
        assert.equal(leerAnclas("426-LN+_perez_Contrato_20331501027").email, "");
    });
    it("identifica a alguien SIN CUIT, que es para lo que está", () => {
        // Las 39 personas del padrón sin CUIL válido: su archivo no tiene once dígitos que leer, y antes
        // de esto se quedaba sin ningún identificador.
        const sinCuit = nombreDe({ cuit: "" });
        assert.equal(leerAnclas(sinCuit).cuit, "");
        assert.ok(mismaPersona(leerAnclas(sinCuit), leerAnclas(sinCuit)));
    });
    it("con CUIT en los dos lados, manda el CUIT aunque el email haya cambiado", () => {
        // Una persona puede cambiar de email después de generado el documento. El archivo, que quedó con
        // el viejo, sigue siendo suyo: exigir que coincidan los DOS lo perdería.
        const viejo = nombreDe();
        const nuevo = nombreDe({ email: "otra.direccion-ARROBA-gmail.com" });
        assert.ok(mismaPersona(leerAnclas(viejo), leerAnclas(nuevo)));
    });
    it("sin CUIT, dos emails distintos son dos personas", () => {
        const a = nombreDe({ cuit: "" });
        const b = nombreDe({ cuit: "", email: "otra.direccion-ARROBA-gmail.com" });
        assert.ok(!mismaPersona(leerAnclas(a), leerAnclas(b)));
    });
    it("sin CUIT ni email no se identifica a nadie", () => {
        const anonimo = leerAnclas("426-LN+_perez_Contrato_D-20260810_H-20261231");
        assert.ok(!mismaPersona(anonimo, anonimo));
    });
});
describe("dos nombres hablan del mismo documento", () => {
    const nombre = nombreDe();
    it("el mismo nombre, con los símbolos que transforma Dropbox Sign, sigue siendo el mismo", () => {
        // El asunto del aviso trae el nombre con la "@" ya convertida y a veces otros símbolos tocados.
        // Los dígitos no se tocan, y por eso el matching va por ellos.
        const comoLoManda = nombre.replace(/-ARROBA-/g, "_");
        assert.ok(mismoDocumento(leerAnclas(nombre), leerAnclas(comoLoManda)));
    });
    it("la misma persona en OTRO período NO es el mismo documento", () => {
        const renovacion = nombreDe({ fechaAlta: "20270101", fechaBaja: "20271231" });
        assert.ok(!mismoDocumento(leerAnclas(nombre), leerAnclas(renovacion)));
    });
    it("otra persona en el mismo período tampoco", () => {
        assert.ok(!mismoDocumento(leerAnclas(nombre), leerAnclas(nombreDe({ cuit: "27123456783" }))));
    });
    it("sin CUIT no se afirma nada, por más que las fechas coincidan", () => {
        const sinCuit = "perez_Contrato_D-20260810_H-20261231";
        assert.ok(!mismoDocumento(leerAnclas(sinCuit), leerAnclas(sinCuit)));
    });
});
describe("Dropbox Sign encuentra el PDF en Outbox", () => {
    /**
     * EL BUG QUE ESTE TEST CONGELA.
     *
     * Se comparaba solo por CUIT (`e.name.includes(ident.cuit)`). Una persona con dos contratos daba
     * dos candidatos, y el circuito se rendía: el contrato quedaba para siempre en "Para Firmar"
     * aunque el aviso de envío hubiera llegado. Las fechas del período son obligatorias justamente
     * para desempatar esto, y no se estaban mirando.
     */
    it("elige el contrato del período correcto cuando la persona tiene dos", () => {
        const vigente = nombreDe();
        const renovacion = nombreDe({ fechaAlta: "20270101", fechaBaja: "20271231" });
        const outbox = [archivo(vigente), archivo(renovacion)];
        assert.equal(buscarEnOutbox(outbox, renovacion, leerAnclas(renovacion))?.name, renovacion);
        assert.equal(buscarEnOutbox(outbox, vigente, leerAnclas(vigente))?.name, vigente);
    });
    it("no se confunde con el documento de otra persona del mismo período", () => {
        const mio = nombreDe();
        const outbox = [archivo(mio), archivo(nombreDe({ cuit: "27123456783", apellido: "lopez" }))];
        assert.equal(buscarEnOutbox(outbox, mio, leerAnclas(mio))?.name, mio);
    });
    it("mismo CUIT y mismo período: desempata el nombre completo", () => {
        // Un contrato y su release comparten CUIT y período — el {{tipo}} no es obligatorio, así que las
        // anclas no los distinguen. Ahí decide el nombre entero, que sí lo trae.
        const contrato = nombreDe();
        const release = nombreDe({ tipo: "Release" });
        const outbox = [archivo(contrato), archivo(release)];
        assert.equal(buscarEnOutbox(outbox, release, leerAnclas(release))?.name, release);
    });
    it("si ni con el nombre se puede decidir, no mueve nada", () => {
        // Dos archivos idénticos salvo la extensión: no hay forma de saber cuál corresponde. Antes de
        // adivinar, se prefiere dejar el aviso sin procesar — la próxima corrida lo vuelve a encontrar.
        const nombre = nombreDe();
        const outbox = [archivo(nombre), { tag: "file", name: `${nombre}.pdf`, path: `/otra/${nombre}.pdf` }];
        assert.equal(buscarEnOutbox(outbox, nombre, leerAnclas(nombre)), null);
    });
    it("ignora los JSON de control del propio circuito", () => {
        const nombre = nombreDe();
        const outbox = [archivo(`${nombre}.json`), archivo(nombre)];
        assert.equal(buscarEnOutbox(outbox, nombre, leerAnclas(nombre))?.name, nombre);
    });
});
describe("no se da por enviado un documento mirando otro", () => {
    /**
     * EL OTRO BUG, y el peor de los dos: `yaEstaEnPendbox` devolvía true si CUALQUIER archivo de
     * Pendbox contenía el CUIT de la persona. Con eso, el segundo documento de alguien nunca se movía
     * —el aviso se daba por repetido porque el contrato anterior ya estaba ahí— y quedaba logueado
     * como "ya estaba": el envío se perdía y el log decía que todo había salido bien.
     */
    it("un contrato anterior en Pendbox no marca como duplicada a la renovación", () => {
        const anterior = nombreDe();
        const renovacion = nombreDe({ fechaAlta: "20270101", fechaBaja: "20271231" });
        assert.equal(yaEstaEnPendbox([archivo(anterior)], renovacion, leerAnclas(renovacion)), false);
    });
    it("el mismo documento sí se reconoce, aunque el nombre venga transformado", () => {
        const nombre = nombreDe();
        const enPendbox = archivo(nombre.replace(/-ARROBA-/g, "_"));
        assert.equal(yaEstaEnPendbox([enPendbox], nombre, leerAnclas(nombre)), true);
    });
});
describe("una persona sin CUIL igual encuentra su documento", () => {
    /**
     * Son 39 en el padrón, 31 con contratos. Su nombre de archivo no trae once dígitos que leer, así
     * que hasta ahora `buscarEnOutbox` no tenía por dónde empezar y caía a comparar el nombre entero —
     * justo lo que no se puede hacer, porque el asunto viene con los símbolos transformados.
     */
    const sinCuil = (over = {}) => nombreDe({ cuit: "", ...over });
    it("se la encuentra en Outbox por su email", () => {
        const mio = sinCuil();
        const outbox = [archivo(sinCuil({ email: "otro.alguien-ARROBA-gmail.com", apellido: "lopez" })), archivo(mio)];
        assert.equal(buscarEnOutbox(outbox, mio, leerAnclas(mio))?.name, mio);
    });
    it("y sus dos contratos siguen distinguiéndose por el período", () => {
        const vigente = sinCuil();
        const renovacion = sinCuil({ fechaAlta: "20270101", fechaBaja: "20271231" });
        const outbox = [archivo(vigente), archivo(renovacion)];
        assert.equal(buscarEnOutbox(outbox, renovacion, leerAnclas(renovacion))?.name, renovacion);
    });
    it("el contrato anterior no la marca como duplicada", () => {
        const anterior = sinCuil();
        const renovacion = sinCuil({ fechaAlta: "20270101", fechaBaja: "20271231" });
        assert.equal(yaEstaEnPendbox([archivo(anterior)], renovacion, leerAnclas(renovacion)), false);
    });
});
describe("lo que el recorte por largo no puede tocar", () => {
    it("los campos que se leen de vuelta son anclas", () => {
        for (const campo of ["20331501027", "20260810", "CUIL-20331501027", "DNI-33150102", "20-33150102-7"]) {
            assert.ok(esCampoAncla(campo), `${campo} tendría que ser intocable`);
        }
    });
    it("lo descriptivo no lo es", () => {
        for (const campo of ["gonzalez-rotstein", "Jornada-2030-SRL", "juanmanuel-ARROBA-gmail.com"]) {
            assert.ok(!esCampoAncla(campo), `${campo} tendría que poder recortarse`);
        }
    });
});
