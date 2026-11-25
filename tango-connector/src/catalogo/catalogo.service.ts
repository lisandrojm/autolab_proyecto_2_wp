import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';

/** Tipo de proceso, según los endpoints que expone (ver docs/tango/catalogo/README.md). */
export type TipoProceso = 'CRUD' | 'LIVE' | 'EXEC' | 'PDF';

export interface ParametroEndpoint {
  nombre: string;
  /** `Query` o `Body`. */
  origen: string;
  tipo: string;
  defecto: unknown;
  /** JSON Schema del body (Create, Update, Process, Custom). */
  schema?: Record<string, unknown>;
}

export interface EndpointProceso {
  /** Nombre como lo usa la URL: `GetById`, `GetApiLiveQueryData`, … */
  nombre: string;
  metodo: string;
  titulo: string;
  parametros: ParametroEndpoint[];
}

export interface Proceso {
  id: number;
  descripcion: string;
  modulo: string;
  path: string;
  tipo: TipoProceso;
  endpoints: EndpointProceso[];
  /** Tablas que declara getapi y sus columnas. En los CRUD, la primera es la vista de Get. */
  tablas: Record<string, string[]>;
}

export interface Campo {
  proceso: number;
  descripcion: string;
  modulo: string;
  tipo: string;
  tabla: string;
  principal: boolean;
  campo: string;
}

/** Forma de un `<id>-api.json` (respuesta de `processresolver/getapi`). */
interface GetApiArchivo {
  paths?: {
    title: string;
    name: string;
    httpMethod: string;
    parameters: { name: string; sourceId: string; typeName: string; schema: string | null; defaultValue: unknown }[];
  }[];
  tables?: Record<string, string[]>;
}

/**
 * El catálogo relevado de Tango, cargado en memoria al arrancar. Es la fuente de los
 * metadatos y de las validaciones: `getapi` solo funciona con la sesión web, así que no se
 * puede consultar en tiempo de ejecución (ADR 0002).
 */
@Injectable()
export class CatalogoService implements OnModuleInit {
  private readonly logger = new Logger(CatalogoService.name);
  private readonly procesos = new Map<number, Proceso>();
  private campos: Campo[] = [];
  private fecha = '';

  constructor(@Inject(CONFIGURACION) private readonly config: Configuracion) {}

  onModuleInit(): void {
    this.cargar(path.resolve(this.config.catalogoDir));
  }

  cargar(dir: string): void {
    this.procesos.clear();
    this.fecha = path.basename(dir);
    const archivos = this.indexarArchivosApi(path.join(dir, 'procesos'));

    for (const fila of this.leerCsv(path.join(dir, 'api.csv'))) {
      if (fila.estado !== 'api') continue;
      const archivo = archivos.get(fila.accessNumber);
      if (!archivo) {
        this.logger.warn(`Proceso ${fila.accessNumber} sin -api.json: no se carga`);
        continue;
      }
      const api = JSON.parse(fs.readFileSync(archivo, 'utf8')) as GetApiArchivo;
      const id = Number(fila.accessNumber);
      this.procesos.set(id, {
        id,
        descripcion: fila.descripcion,
        modulo: fila.modulo,
        path: fila.path,
        tipo: fila.tipo as TipoProceso,
        endpoints: (api.paths ?? []).map((p) => ({
          nombre: p.name.replace(/^Api\//, ''),
          metodo: p.httpMethod,
          titulo: p.title,
          parametros: p.parameters.map((q) => ({
            nombre: q.name,
            origen: q.sourceId,
            tipo: q.typeName,
            defecto: q.defaultValue,
            ...(q.schema ? { schema: JSON.parse(q.schema) as Record<string, unknown> } : {}),
          })),
        })),
        // En los PDF, `tables` trae nombres de endpoint en vez de tablas.
        tablas: Object.fromEntries(Object.entries(api.tables ?? {}).filter(([k]) => !k.startsWith('Api/'))),
      });
    }

    this.campos = this.leerCsv(path.join(dir, 'campos.csv')).map((f) => ({
      proceso: Number(f.accessNumber),
      descripcion: f.descripcion,
      modulo: f.modulo,
      tipo: f.tipo,
      tabla: f.tabla,
      principal: f.principal === 'si',
      campo: f.campo,
    }));

    this.logger.log(`Catálogo ${this.fecha}: ${this.procesos.size} procesos, ${this.campos.length} campos`);
  }

  get fechaRelevamiento(): string {
    return this.fecha;
  }

  listar(): Proceso[] {
    return [...this.procesos.values()];
  }

  obtener(id: number): Proceso | undefined {
    return this.procesos.get(id);
  }

  endpoint(id: number, nombre: string): EndpointProceso | undefined {
    const n = nombre.toLowerCase();
    return this.procesos.get(id)?.endpoints.find((e) => e.nombre.toLowerCase() === n);
  }

  buscarCampos(texto: string): Campo[] {
    const t = texto.toLowerCase();
    return this.campos.filter((c) => c.campo.toLowerCase().includes(t));
  }

  /** `procesos/<Modulo>/<id>/<id>-api.json`, indexado por id. */
  private indexarArchivosApi(dir: string): Map<string, string> {
    const indice = new Map<string, string>();
    for (const modulo of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!modulo.isDirectory()) continue;
      for (const proceso of fs.readdirSync(path.join(dir, modulo.name), { withFileTypes: true })) {
        const archivo = path.join(dir, modulo.name, proceso.name, `${proceso.name}-api.json`);
        if (proceso.isDirectory() && fs.existsSync(archivo)) indice.set(proceso.name, archivo);
      }
    }
    return indice;
  }

  private leerCsv(archivo: string): Record<string, string>[] {
    return parse(fs.readFileSync(archivo, 'utf8'), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  }
}
