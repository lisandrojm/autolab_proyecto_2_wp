import forge from "node-forge";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { Tenant } from "../models/Tenant.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { normalizarCuit } from "../utils/constanciaPdf.js";

/**
 * Integración con los Web Services de AFIP/ARCA: autenticación WSAA (firma CMS del Login Ticket
 * Request con el certificado del tenant) + Consulta Padrón A13 (estado del CUIT/CUIL).
 *
 * Implementado a mano (sin SDK de terceros): las librerías de Node disponibles para esto reportan
 * uso a analytics de un tercero (o exigen un token de un proxy externo) — inaceptable para datos
 * fiscales. Solo dependencias genéricas y auditables: `node-forge` (firma CMS) y `fast-xml-parser`
 * (parseo de las respuestas SOAP).
 *
 * OJO: los nombres exactos de los campos de la respuesta de Consulta Padrón A13 están tomados de la
 * documentación pública de AFIP, pero no se pudieron validar contra una respuesta real todavía (hace
 * falta un certificado con el servicio de Padrón autorizado) — `consultarPadron` devuelve siempre el
 * `raw` parseado completo además de los campos extraídos, así que si algún nombre de campo no
 * coincide en la práctica, el dato no se pierde y se puede ajustar el mapeo sin volver a consultar.
 */

const WSAA_URL: Record<Ambiente, string> = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

const PADRON_A13_URL: Record<Ambiente, string> = {
  homologacion: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13",
  produccion: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13",
};

const PADRON_A13_SERVICE = "ws_sr_padron_a13";
const SOAP_TIMEOUT_MS = 20_000;

export type Ambiente = "homologacion" | "produccion";

export interface TenantAfipConfig {
  cuitRepresentada: string;
  certificadoPem: string;
  clavePrivadaPem: string;
  ambiente: Ambiente;
}

/** Lee y descifra la config de AFIP del tenant. Devuelve null si no está conectado. */
export function getTenantAfipConfig(tenant: any): TenantAfipConfig | null {
  const a = tenant?.integrations?.afip;
  if (!a?.cuitRepresentada || !a?.certificadoPem || !a?.clavePrivadaEnc) return null;
  const clavePrivadaPem = decryptSecret(a.clavePrivadaEnc);
  if (!clavePrivadaPem) return null;
  return {
    cuitRepresentada: String(a.cuitRepresentada),
    certificadoPem: String(a.certificadoPem),
    clavePrivadaPem,
    ambiente: a.ambiente === "produccion" ? "produccion" : "homologacion",
  };
}

export function isTenantAfipConnected(tenant: any): boolean {
  return !!getTenantAfipConfig(tenant);
}

export interface CertificadoInfo {
  alias: string | null;
  vencimiento: string | null; // ISO 8601
}

/** Lee del certificado (sin necesidad de la clave privada) el alias/CN y la fecha de vencimiento —
 *  para mostrar en el status, no para autenticar. Nunca tira: si el PEM guardado está corrupto,
 *  devuelve todo null en vez de romper el endpoint de status. */
export function getCertificadoInfo(certificadoPemRaw: string): CertificadoInfo {
  try {
    const cert = forge.pki.certificateFromPem(normalizarPem(certificadoPemRaw, "CERTIFICATE"));
    const cn = cert.subject.getField("CN");
    return {
      alias: cn?.value ? String(cn.value) : null,
      vencimiento: cert.validity.notAfter.toISOString(),
    };
  } catch {
    return { alias: null, vencimiento: null };
  }
}

// Cache de tickets WSAA (token+sign) por tenant+servicio — válidos ~12hs, se piden cortos (10 min)
// para no tener que manejar la expiración larga con precisión, y se cachean para no pedir uno por CUIT.
interface TicketAcceso {
  token: string;
  sign: string;
  expiraEn: number; // epoch ms
}
const ticketCache = new Map<string, TicketAcceso>();

/** minúsculas del último tramo de una key con o sin prefijo de namespace ("soapenv:Envelope" → "envelope"). */
function bareKey(key: string): string {
  const parts = key.split(":");
  return (parts.length > 1 ? parts[1] : parts[0]).toLowerCase();
}

/** Busca dentro de un objeto ya parseado la primera key cuyo nombre local (sin prefijo ns) matchee,
 *  sin importar qué prefijo de namespace haya usado la respuesta real de AFIP. */
function buscar(obj: any, localName: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  const target = localName.toLowerCase();
  for (const key of Object.keys(obj)) {
    if (bareKey(key) === target) return obj[key];
  }
  return undefined;
}

/** "2026-08-04T10:00:00.000Z" tal cual — WSAA acepta ISO 8601 con offset Z sin problema. */
function buildLoginTicketRequestXml(service: string): string {
  const now = new Date();
  const generationTime = new Date(now.getTime() - 60_000).toISOString();
  const expirationTime = new Date(now.getTime() + 10 * 60_000).toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>
    <generationTime>${generationTime}</generationTime>
    <expirationTime>${expirationTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

/**
 * Reconstruye un PEM "canónico" a partir de lo que sea que haya llegado (con o sin BEGIN/END, con
 * saltos de línea CRLF/LF, espacios de más, un BOM al principio, etc.). Copiar un certificado/clave a
 * mano desde un textarea del navegador es una fuente muy común de corrupción invisible — en vez de
 * confiar en que el pegado haya sido perfecto, se extrae SOLO el contenido base64 válido y se re-arma
 * el PEM desde cero antes de parsearlo.
 */
function normalizarPem(input: string, tipoEsperado: "CERTIFICATE" | "PRIVATE KEY"): string {
  const texto = String(input || "").replace(/^\uFEFF/, "").trim();
  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(texto);
  const tipo = m ? m[1].trim() : tipoEsperado;
  const cuerpo = (m ? m[2] : texto).replace(/[^A-Za-z0-9+/=]/g, "");

  if (!cuerpo) {
    const nombre = tipoEsperado === "CERTIFICATE" ? "certificado" : "clave privada";
    throw new Error(`El ${nombre} está vacío o no tiene contenido base64 reconocible.`);
  }
  const lineas = cuerpo.match(/.{1,64}/g) || [cuerpo];
  return `-----BEGIN ${tipo}-----\n${lineas.join("\n")}\n-----END ${tipo}-----`;
}

/** Firma el XML como CMS/PKCS#7 (SignedData, no detached) en DER, codificado en base64 — el formato
 *  que espera `loginCms` de WSAA. */
function signCms(xml: string, certificadoPemRaw: string, clavePrivadaPemRaw: string): string {
  const certificadoPem = normalizarPem(certificadoPemRaw, "CERTIFICATE");
  const clavePrivadaPem = normalizarPem(clavePrivadaPemRaw, "PRIVATE KEY");

  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certificadoPem);
  } catch (e: any) {
    throw new Error(`No se pudo leer el certificado (${certificadoPem.length} caracteres tras limpiarlo): ${e?.message || e}`);
  }

  let privateKey: forge.pki.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(clavePrivadaPem);
  } catch (e: any) {
    throw new Error(`No se pudo leer la clave privada (${clavePrivadaPem.length} caracteres tras limpiarla): ${e?.message || e}`);
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as any },
    ],
  });
  p7.sign({ detached: false } as any);
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

async function soapPost(url: string, soapAction: string, envelope: string): Promise<any> {
  const { data } = await axios.post(url, envelope, {
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: soapAction },
    timeout: SOAP_TIMEOUT_MS,
  });
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: false });
  return parser.parse(String(data));
}

/** Pide (o reutiliza del cache) un ticket de acceso WSAA para el tenant+servicio dados. */
async function obtenerTicket(tenantId: string, cfg: TenantAfipConfig, service: string): Promise<TicketAcceso> {
  const cacheKey = `${tenantId}:${cfg.ambiente}:${service}`;
  const cached = ticketCache.get(cacheKey);
  if (cached && cached.expiraEn > Date.now() + 60_000) return cached;

  const ltrXml = buildLoginTicketRequestXml(service);
  const cms = signCms(ltrXml, cfg.certificadoPem, cfg.clavePrivadaPem);
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const parsed = await soapPost(WSAA_URL[cfg.ambiente], "", envelope);
  const body = buscar(buscar(parsed, "Envelope"), "Body");
  const loginCmsResponse = buscar(body, "loginCmsResponse");
  const loginCmsReturn = buscar(loginCmsResponse, "loginCmsReturn") ?? (typeof loginCmsResponse === "string" ? loginCmsResponse : undefined);
  if (!loginCmsReturn) {
    const fault = buscar(body, "Fault");
    throw new Error(fault ? `WSAA rechazó el login: ${JSON.stringify(fault)}` : "WSAA no devolvió loginCmsReturn (respuesta inesperada, revisar formato)");
  }

  const inner = new XMLParser({ ignoreAttributes: false }).parse(String(loginCmsReturn));
  const ticketResponse = buscar(inner, "loginTicketResponse");
  const credentials = buscar(ticketResponse, "credentials");
  const header = buscar(ticketResponse, "header");
  const token = credentials?.token;
  const sign = credentials?.sign;
  if (!token || !sign) throw new Error("WSAA no devolvió token/sign en la respuesta");

  const expirationTime = header?.expirationTime;
  const expiraEn = expirationTime ? new Date(String(expirationTime)).getTime() : Date.now() + 10 * 60_000;
  const ticket: TicketAcceso = { token: String(token), sign: String(sign), expiraEn };
  ticketCache.set(cacheKey, ticket);
  return ticket;
}

export interface ResultadoPadron {
  cuit: string;
  encontrado: boolean;
  /** "activo" | "inactivo" | "desconocido" — desconocido si la respuesta no trae el campo esperado. */
  estado: "activo" | "inactivo" | "desconocido";
  tipoPersona?: string;
  denominacion?: string;
  /** Estructura completa parseada de `getPersonaReturn`, tal cual la devolvió AFIP — por si hace
   *  falta algún dato que el mapeo de arriba no extrajo. */
  raw: any;
}

/** Consulta el estado de un CUIT/CUIL en el Padrón de AFIP (servicio A13). */
export async function consultarPadron(tenantId: string, cfg: TenantAfipConfig, cuitConsultado: string): Promise<ResultadoPadron> {
  const cuit = normalizarCuit(cuitConsultado);
  if (!cuit) throw new Error(`CUIT inválido: "${cuitConsultado}"`);

  const ticket = await obtenerTicket(tenantId, cfg, PADRON_A13_SERVICE);
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersona>
      <token>${ticket.token}</token>
      <sign>${ticket.sign}</sign>
      <cuitRepresentada>${normalizarCuit(cfg.cuitRepresentada)}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

  const parsed = await soapPost(PADRON_A13_URL[cfg.ambiente], "", envelope);
  const body = buscar(buscar(parsed, "Envelope"), "Body");
  const fault = buscar(body, "Fault");
  if (fault) {
    // "No existe persona con el Id solicitado" es la respuesta normal para un CUIT no encontrado, no
    // un error de comunicación — se informa como "no encontrado" en vez de tirar excepción.
    const mensaje = JSON.stringify(fault);
    if (/no existe persona/i.test(mensaje)) {
      return { cuit, encontrado: false, estado: "desconocido", raw: fault };
    }
    throw new Error(`Consulta Padrón rechazó la consulta: ${mensaje}`);
  }

  const getPersonaResponse = buscar(body, "getPersonaResponse");
  const getPersonaReturn = buscar(getPersonaResponse, "getPersonaReturn");
  const persona = buscar(getPersonaReturn, "persona") ?? getPersonaReturn;
  if (!persona) return { cuit, encontrado: false, estado: "desconocido", raw: getPersonaReturn };

  const estadoClaveRaw = String(buscar(persona, "estadoClave") ?? "").toUpperCase();
  const estado: ResultadoPadron["estado"] = estadoClaveRaw === "ACTIVO" ? "activo" : estadoClaveRaw === "INACTIVO" ? "inactivo" : "desconocido";
  const tipoPersona = buscar(persona, "tipoPersona");
  const datosGenerales = buscar(persona, "datosGenerales");
  const denominacion = buscar(datosGenerales, "razonSocial") ?? [buscar(datosGenerales, "nombre"), buscar(datosGenerales, "apellido")].filter(Boolean).join(" ");

  return {
    cuit,
    encontrado: true,
    estado,
    tipoPersona: tipoPersona ? String(tipoPersona) : undefined,
    denominacion: denominacion ? String(denominacion) : undefined,
    raw: getPersonaReturn,
  };
}

/** Valida credenciales pidiendo un ticket real — se usa al conectar, antes de guardar nada. */
export async function verificarCredenciales(tenantId: string, cfg: TenantAfipConfig): Promise<void> {
  await obtenerTicket(tenantId, cfg, PADRON_A13_SERVICE);
}

/** Invalida el ticket cacheado del tenant (al desconectar o cambiar credenciales). */
export function clearTenantTicket(tenantId: string): void {
  for (const key of [...ticketCache.keys()]) {
    if (key.startsWith(`${tenantId}:`)) ticketCache.delete(key);
  }
}

export async function findTenantAfipConfig(tenantId: string): Promise<TenantAfipConfig | null> {
  const tenant = await Tenant.findById(tenantId).lean();
  return getTenantAfipConfig(tenant);
}
