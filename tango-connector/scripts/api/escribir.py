"""Hace una escritura (Create, Update, Delete) en la API pública de Tango y muestra la respuesta.

Uso:
    python scripts/api/escribir.py <Create|Update|Delete> --company N process=<id> [id=<id>] [--body archivo.json]

Escribe en Tango: usarlo solo contra empresas de prueba y con aprobación. La empresa
es obligatoria, para que nunca se escriba en una por defecto. El token se lee de
TANGO_API_TOKEN en el .env de la raíz del repo y nunca se imprime.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Con `python -I` la carpeta del script no entra en sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leer import token  # noqa: E402

METODOS = {"Create": "POST", "Update": "PUT", "Delete": "DELETE"}


def main(args: list[str]) -> None:
    endpoint = args.pop(0)
    if endpoint not in METODOS:
        sys.exit(f"Solo escrituras: {', '.join(METODOS)}")
    base, company, body, params = "http://servertango:17000", None, None, {}
    while args:
        a = args.pop(0)
        if a == "--base":
            base = args.pop(0)
        elif a == "--company":
            company = args.pop(0)
        elif a == "--body":
            body = open(args.pop(0), "rb").read()
        else:
            k, _, v = a.partition("=")
            params[k] = v
    if not company:
        sys.exit("Falta --company")

    url = f"{base}/Api/{endpoint}?{urllib.parse.urlencode(params)}"
    headers = {"ApiAuthorization": token(), "Company": company, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=body, method=METODOS[endpoint], headers=headers)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            status, cuerpo = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, cuerpo = e.code, e.read()
    print(f"HTTP {status} {time.time() - t0:.1f}s")
    try:
        print(json.dumps(json.loads(cuerpo), ensure_ascii=False, indent=2))
    except ValueError:
        print(cuerpo[:500])


if __name__ == "__main__":
    main(sys.argv[1:])
