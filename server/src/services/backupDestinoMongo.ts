import mongoose from "mongoose";

/**
 * SEGUNDO DESTINO DE LOS BACKUPS: OTRA BASE DEL MISMO CLUSTER, UNA POR COPIA.
 *
 * La copia se sube a Dropbox (destino principal) y además se clona acá, en una base aparte.
 *
 * MISMO CLUSTER, Y ESO TIENE UN LÍMITE QUE HAY QUE TENER PRESENTE: si el cluster se cae, se pierde o
 * alguien entra con las credenciales, la copia se va con el original. No es un backup contra desastre;
 * es un «deshacer» para el caso mucho más común —alguien borró una colección, un script escribió mal—
 * donde tener la base de hace unas horas al lado, consultable, resuelve el problema en minutos. El
 * respaldo fuera del cluster es Dropbox, y por eso sigue siendo el destino principal.
 *
 * Lo que sí se garantiza es que la copia va a una BASE DISTINTA de la que se respalda. Con el mismo
 * nombre, el próximo dump se respaldaría a sí mismo: `generarArchivos()` recorre las colecciones de la
 * base de la aplicación, y una copia adentro entraría en la siguiente, y esa en la próxima, en potencia.
 * El sello de fecha en el nombre lo hace imposible por construcción.
 *
 * LA BASE LLEVA LA FECHA EN EL NOMBRE:
 *
 *   weprodu_production_integration_2026-09-10_1010
 *
 * Es lo que hace que la copia se pueda reconocer desde el Data Explorer de Atlas sin abrir nada. Con un
 * nombre fijo, dos backups distintos se veían igual y no había forma de saber cuál se estaba mirando.
 *
 * Y NO SE GUARDAN ARCHIVOS: SE ESCRIBEN LAS COLECCIONES.
 *
 * La primera versión guardaba los `.json` en GridFS. Andaba, pero para usarlos había que bajarlos y
 * pasarles `mongoimport` — o sea, un backup dentro de Mongo que no se podía consultar desde Mongo. Ahora
 * los documentos se escriben como documentos: la copia es una base normal, se abre en Atlas, se navega,
 * se consulta y se compara con producción sin importar nada. Ya ESTÁ en Atlas.
 *
 * RETENCIÓN: se conserva SOLO LA ÚLTIMA. Las bases anteriores se borran DESPUÉS de que la nueva quedó
 * completa, nunca antes. El histórico largo vive en Dropbox, que guarda las que diga la pantalla.
 */

/** Lo que se escribe en `_backup` de la base copiada: de dónde salió y cuándo. */
export const COLECCION_MANIFIESTO = "_backup";

/** Cuántos documentos se insertan por lote. */
const LOTE = 1000;

export interface ResultadoDestinoMongo {
  /** `false` cuando no hay `MONGO_URI_BACKUP`: no es un error, es que no está configurado. */
  configurado: boolean;
  /** La base donde quedó, con su fecha. Es lo que se muestra en la pantalla. */
  base?: string;
  colecciones: number;
  documentos: number;
  /** Bases viejas borradas. */
  borrados: number;
}

/**
 * La URI donde se clona.
 *
 * Por defecto, el MISMO cluster de la aplicación: la copia es otra base al lado, sin pagar un segundo
 * cluster. `MONGO_URI_BACKUP` existe para apuntar a otro cluster el día que se quiera —ahí sí sería un
 * backup contra desastre—, pero no hace falta configurarla.
 */
export function uriDeBackup(): string | null {
  const propia = String(process.env.MONGO_URI_BACKUP || "").trim();
  if (propia) return propia;
  const app = String(process.env.MONGO_URI || "").trim();
  return app || null;
}

/** ¿La copia va a otro cluster, o al mismo? Solo para poder decirlo en la pantalla. */
export const esClusterAparte = (): boolean => {
  const propia = String(process.env.MONGO_URI_BACKUP || "").trim();
  return !!propia && propia !== String(process.env.MONGO_URI || "").trim();
};

/**
 * El prefijo de las bases de copia.
 *
 * `MONGO_DB_NAME_BACKUP` es un PREFIJO, no el nombre final: a cada copia se le pega su fecha. Si no se
 * declara, se usa el nombre de la base de origen, que es lo que uno espera ver en Atlas.
 */
export function prefijoDeBase(baseOrigen: string): string {
  return String(process.env.MONGO_DB_NAME_BACKUP || "").trim() || baseOrigen;
}

/** `weprodu_production_integration_2026-09-10_1010` — el mismo sello que la carpeta de Dropbox. */
export function nombreDeBaseCopia(baseOrigen: string, carpeta: string): string {
  const prefijo = prefijoDeBase(baseOrigen);
  // `carpeta` ya viene como `<base>_<sello>`; si el prefijo es el mismo, no se repite.
  const sello = carpeta.startsWith(`${baseOrigen}_`) ? carpeta.slice(baseOrigen.length + 1) : carpeta;
  return `${prefijo}_${sello}`;
}

/**
 * Clona la base en una base nueva del cluster de backup y borra las copias anteriores.
 *
 * Lee de la conexión de la aplicación (la que ya está abierta) y escribe en una conexión efímera al
 * destino: esto corre dos veces por día y no justifica sostener un segundo pool abierto todo el tiempo.
 */
export async function clonarEnMongo(baseOrigen: string, carpeta: string, colecciones: string[], baseAnterior?: string | null): Promise<ResultadoDestinoMongo> {
  const uri = uriDeBackup();
  if (!uri) return { configurado: false, colecciones: 0, documentos: 0, borrados: 0 };

  const origen = mongoose.connection.db;
  if (!origen) throw new Error("No hay conexión a MongoDB: no se puede clonar.");

  const base = nombreDeBaseCopia(baseOrigen, carpeta);
  const conexion = await mongoose.createConnection(uri, { dbName: base }).asPromise();

  try {
    const destino = conexion.db!;
    let documentos = 0;

    for (const nombre of colecciones) {
      const cursor = origen.collection(nombre).find({}, { batchSize: LOTE });
      let lote: any[] = [];
      const vaciar = async () => {
        if (lote.length === 0) return;
        // `ordered: false` para que un documento problemático no corte el resto de la colección.
        await destino.collection(nombre).insertMany(lote, { ordered: false });
        documentos += lote.length;
        lote = [];
      };
      for await (const doc of cursor) {
        lote.push(doc);
        if (lote.length >= LOTE) await vaciar();
      }
      await vaciar();
    }

    // El manifiesto va ÚLTIMO: su presencia es la señal de que la copia quedó completa.
    await destino.collection(COLECCION_MANIFIESTO).insertOne({ base: baseOrigen, carpeta, fecha: new Date(), colecciones: colecciones.length, documentos });

    /*
      Recién ahora se borra la copia anterior: si algo de lo de arriba falló, esta línea no se alcanza y
      la copia vieja sigue intacta. Un backup nuevo a medias no puede costar el backup que ya estaba.

      SE BORRA POR NOMBRE GUARDADO, NO ENUMERANDO. `listDatabases` necesita permisos de admin sobre el
      cluster, y en los tiers compartidos de Atlas (M0/M2/M5) el usuario de la aplicación no los tiene:
      la limpieza fallaría justo en el escenario para el que esto se hizo, y las copias se acumularían
      hasta llenar la cuota. Por eso el nombre de la copia anterior se guarda en el tenant y se borra esa.

      Igual se intenta un barrido por prefijo, por si quedaron copias de antes de este cambio; si el
      cluster no lo permite, no pasa nada y sigue.
    */
    const aBorrar = new Set<string>();
    if (baseAnterior && baseAnterior !== base) aBorrar.add(baseAnterior);

    const prefijo = prefijoDeBase(baseOrigen);
    try {
      const { databases } = await conexion.getClient().db().admin().listDatabases();
      for (const d of databases) {
        const n = String(d.name);
        if (n.startsWith(`${prefijo}_`) && n !== base && n !== baseOrigen) aBorrar.add(n);
      }
    } catch {
      // Sin permiso para enumerar: alcanza con la anterior, que es la que importa.
    }

    let borrados = 0;
    for (const vieja of aBorrar) {
      try {
        await conexion.getClient().db(vieja).dropDatabase();
        borrados++;
      } catch (e: any) {
        console.error(`[BACKUP] No se pudo borrar la copia vieja ${vieja}:`, e?.message || e);
      }
    }

    return { configurado: true, base, colecciones: colecciones.length, documentos, borrados };
  } finally {
    await conexion.close();
  }
}
