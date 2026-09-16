import axios, { AxiosInstance } from "axios";
import type { SobreTango } from "./centrosCostoTango.js";

/*
  EL CLIENTE DE LA API DE TANGO.

  EL PROTOCOLO ES EL DE `tango/server/src/modules/integration/api-client.service.ts`, que es el que
  ya funciona contra estos Tango. No se inventó nada acá:

    GET {base}/GetById?process={proceso}&id={id}
    ApiAuthorization: <token>      ← autentica; no hay login ni sesión
    Company: <id de la empresa>    ← A QUÉ EMPRESA se le pregunta

  Y la respuesta viene siempre en el mismo sobre: `{ value, message, exceptionInfo, succeeded }`.

  DÓNDE CORRE ESTO IMPORTA. Cada Tango vive en la máquina del cliente (`localhost:17000`) y se llega
  por un túnel FRP que termina EN EL VPS: desde el VPS es `http://localhost:<puertoDelTunel>/Api`, y
  desde afuera no se llega —esos puertos no están publicados a propósito—. Por eso `TANGO_API_URL` es
  una variable de entorno y no una constante: en el VPS apunta al túnel, y en una máquina de
  desarrollo no hay a dónde apuntar (la sincronización queda apagada y el catálogo se carga por el
  import de JSON, que para eso quedó).

  ─────────────────────────────────────────────────────────────────────────────
    TANGO_API_URL     la base con /Api, ej. http://localhost:8001/Api
    TANGO_API_TOKEN   el token que va en `ApiAuthorization`
  ─────────────────────────────────────────────────────────────────────────────

  El token puede además venir POR EMPRESA (`Company.tangoToken`), porque así lo modela el proyecto de
  Tango: cada empresa tiene el suyo. El de la variable de entorno es el que se usa si la empresa no
  trae uno propio.
*/

const sinBarra = (s: string) => s.replace(/\/+$/, "");

export class TangoApi {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: sinBarra(process.env.TANGO_API_URL || ""),
      timeout: Number(process.env.TANGO_API_TIMEOUT || 30000),
    });
  }

  /** ¿Está configurada? Sin la URL del túnel, cada llamada terminaría en un error de red. */
  static configurada(): boolean {
    return !!process.env.TANGO_API_URL;
  }

  /**
   * `GET /GetById?process=&id=` para una empresa.
   *
   * Devuelve el sobre tal cual: interpretarlo es de quien sabe qué pidió (para centros de costo,
   * `leerRegistroAuxiliares`). Acá sólo se resuelve el transporte.
   */
  async getRegistro(proceso: number, id: number, empresaTangoId: string, token?: string, baseUrl?: string): Promise<SobreTango<any>> {
    const base = sinBarra(baseUrl || process.env.TANGO_API_URL || "");
    if (!base) throw new Error("Falta configurar TANGO_API_URL: sin eso no se puede consultar Tango.");
    const apiToken = token || process.env.TANGO_API_TOKEN || "";
    if (!apiToken) throw new Error("Falta el token de Tango (TANGO_API_TOKEN, o el propio de la empresa).");

    const { data } = await this.api.get("/GetById", {
      baseURL: base,
      params: { process: proceso, id },
      headers: { ApiAuthorization: apiToken, Company: empresaTangoId },
    });
    return data as SobreTango<any>;
  }

  /** La base que se va a usar para una empresa, para poder mostrarla en el diagnóstico. */
  static baseDe(empresa?: { tangoApiUrl?: string }): string {
    return sinBarra(empresa?.tangoApiUrl || process.env.TANGO_API_URL || "");
  }
}

export const tangoApi = new TangoApi();
