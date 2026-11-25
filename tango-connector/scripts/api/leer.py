"""Hace un GET de lectura a la API pública de Tango y muestra un resumen.

Uso:
    python scripts/api/leer.py <endpoint> [clave=valor ...] [--base URL] [--company N] [--guardar archivo.json]

Ejemplos:
    python scripts/api/leer.py Get process=3142 pageSize=2 view=
    python scripts/api/leer.py GetApiLiveQueryData process=12836 fromDate= toDate= customQuery=0

Solo hace GET de lectura (incluido GetPdf): no sirve para Create, Update, Delete ni Process. El token se lee de
TANGO_API_TOKEN en el .env de la raíz del repo y nunca se imprime.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

LECTURA = {"Get", "GetById", "GetByFilter", "GetApiLiveQueryData", "GetPdf"}
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def token() -> str:
    for linea in open(os.path.join(RAIZ, ".env"), encoding="utf-8"):
        if linea.startswith("TANGO_API_TOKEN="):
            return linea.split("=", 1)[1].strip().strip('"')
    sys.exit("Falta TANGO_API_TOKEN en .env")


def leer(endpoint: str, params: dict, base: str, company: str) -> tuple[int, float, bytes]:
    if endpoint not in LECTURA:
        sys.exit(f"Solo lectura: {', '.join(sorted(LECTURA))}")
    url = f"{base}/Api/{endpoint}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"ApiAuthorization": token(), "Company": company})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, time.time() - t0, r.read()
    except urllib.error.HTTPError as e:
        return e.code, time.time() - t0, e.read()


def resumen(status: int, segundos: float, cuerpo: bytes) -> str:
    texto = cuerpo.decode("utf-8", errors="replace")
    try:
        j = json.loads(texto)
    except ValueError:
        return f"HTTP {status} {segundos:.1f}s no-JSON: {texto[:200]!r}"
    if not isinstance(j, dict):
        return f"HTTP {status} {segundos:.1f}s {type(j).__name__}"
    partes = [f"HTTP {status}", f"{segundos:.1f}s", f"claves={list(j)}"]
    rd = j.get("resultData")
    lista = (rd or {}).get("list") if isinstance(rd, dict) else None
    if lista is None and isinstance(j.get("list"), list):
        lista = j["list"]
        partes.append("list en la raíz")
    if isinstance(rd, dict):
        partes.append("resultData=" + str({k: v for k, v in rd.items() if k != "list"}))
    if lista is not None:
        partes.append(f"filas={len(lista)}")
        if lista:
            partes.append(f"columnas={len(lista[0])}")
    if isinstance(j.get("value"), dict):
        partes.append(f"value: {len(j['value'])} claves")
    if j.get("succeeded") is False or j.get("exceptionInfo"):
        info = j.get("exceptionInfo") or {}
        partes.append(f"ERROR message={j.get('message')!r} detalle={info.get('messages')}")
    return " | ".join(partes)


def main(args: list[str]) -> None:
    base, company, guardar, params = "http://servertango:17000", "13", None, {}
    endpoint = args.pop(0)
    while args:
        a = args.pop(0)
        if a == "--base":
            base = args.pop(0)
        elif a == "--company":
            company = args.pop(0)
        elif a == "--guardar":
            guardar = args.pop(0)
        else:
            k, _, v = a.partition("=")
            params[k] = v
    status, segundos, cuerpo = leer(endpoint, params, base, company)
    print(resumen(status, segundos, cuerpo))
    if guardar:
        os.makedirs(os.path.dirname(os.path.abspath(guardar)), exist_ok=True)
        with open(guardar, "wb") as f:
            f.write(cuerpo)


if __name__ == "__main__":
    main(sys.argv[1:])
