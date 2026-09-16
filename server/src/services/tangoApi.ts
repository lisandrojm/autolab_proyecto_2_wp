import axios, { AxiosInstance } from "axios";
import type { SobreTango } from "./centrosCostoTango.js";

/*
  EL CLIENTE DE LA API DE TANGO.

  Un solo lugar que sabe cómo se le habla a Tango: la dirección, cómo se autentica y cómo se le dice a
  qué EMPRESA le estamos preguntando. Cada empresa tiene su propio Tango, y el mismo proceso devuelve
  cosas distintas según a cuál se le pida.

  Lo que se usa de acá es `GET Registro/Api/GetById/{proceso}/{id}`, que devuelve un registro de un
  proceso. Para centros de costo: proceso 1656, registro 1 (ver `centrosCostoSync`).

  ─────────────────────────────────────────────────────────────────────────────────────────────
  CONFIGURACIÓN (variables de entorno):

    TANGO_API_URL       la base, ej. https://tango.ejemplo.com/api
    TANGO_API_USER      usuario y contraseña, si la API pide Basic para abrir sesión
    TANGO_API_PASSWORD
    TANGO_API_TOKEN     o un token fijo, si no hay login
    TANGO_EMPRESA_EN    cómo viaja el id de la empresa: "query" (default), "header" o "path"
    TANGO_EMPRESA_CLAVE el nombre del parámetro o del header. Default "empresa".

  `TANGO_EMPRESA_EN` existe porque es lo único de este protocolo que no está definido de nuestro lado:
  según cómo esté publicada la API, el id de la empresa va como parámetro, como encabezado o como un
  segmento más de la ruta. Se configura en vez de adivinarse, y se cambia sin tocar código.
  ─────────────────────────────────────────────────────────────────────────────────────────────
*/

const sinBarra = (s: string) => s.replace(/\/+$/, "");

export class TangoApi {
  private api: AxiosInstance;
  private token: string | null = process.env.TANGO_API_TOKEN || null;

  constructor() {
    this.api = axios.create({
      baseURL: sinBarra(process.env.TANGO_API_URL || ""),
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });
    this.api.interceptors.request.use((config) => {
      if (this.token) config.headers.Authorization = `Bearer ${this.token}`;
      return config;
    });
  }

  /** ¿Está configurada? Sin esto, cada llamada fallaría con un 404 contra la nada. */
  static configurada(): boolean {
    return !!process.env.TANGO_API_URL;
  }

  /**
   * Abre sesión si hace falta. Con `TANGO_API_TOKEN` no hace nada: ya hay token.
   *
   * El token se guarda en memoria y se reusa; si caduca, la llamada que falle con 401 lo limpia y la
   * siguiente vuelve a entrar (ver `getRegistro`).
   */
  private async asegurarSesion(): Promise<void> {
    if (this.token) return;
    const username = process.env.TANGO_API_USER || "";
    const password = process.env.TANGO_API_PASSWORD || "";
    if (!username) return; // API sin autenticación: se llama derecho
    const { data } = await this.api.post("/sesion", {}, { auth: { username, password } });
    const token = data?.token || data?.value?.token;
    if (!token) throw new Error("Tango no devolvió un token al abrir sesión.");
    this.token = token;
  }

  /** Dónde meter el id de la empresa en este request. Ver el comentario de arriba. */
  private aplicarEmpresa(ruta: string, empresaTangoId: string): { ruta: string; config: Record<string, any> } {
    const clave = process.env.TANGO_EMPRESA_CLAVE || "empresa";
    switch ((process.env.TANGO_EMPRESA_EN || "query").toLowerCase()) {
      case "header":
        return { ruta, config: { headers: { [clave]: empresaTangoId } } };
      case "path":
        return { ruta: `/${empresaTangoId}${ruta}`, config: {} };
      default:
        return { ruta, config: { params: { [clave]: empresaTangoId } } };
    }
  }

  /**
   * `GET Registro/Api/GetById/{proceso}/{id}` para una empresa.
   *
   * Devuelve el sobre tal cual (`{ value, message, succeeded }`): interpretarlo es de quien sabe qué
   * pidió —para centros de costo, `leerRegistroAuxiliares`—. Acá sólo se resuelve el transporte.
   */
  async getRegistro(proceso: number, id: number, empresaTangoId: string): Promise<SobreTango<any>> {
    if (!TangoApi.configurada()) throw new Error("Falta configurar TANGO_API_URL: sin eso no se puede consultar Tango.");
    await this.asegurarSesion();
    const { ruta, config } = this.aplicarEmpresa(`/Registro/Api/GetById/${proceso}/${id}`, empresaTangoId);
    try {
      const { data } = await this.api.get(ruta, config);
      return data as SobreTango<any>;
    } catch (e: any) {
      // Un token vencido se ve como 401: se limpia y se reintenta UNA vez, no en bucle.
      if (e?.response?.status === 401 && !process.env.TANGO_API_TOKEN) {
        this.token = null;
        await this.asegurarSesion();
        const { data } = await this.api.get(ruta, config);
        return data as SobreTango<any>;
      }
      throw e;
    }
  }
}

export const tangoApi = new TangoApi();
