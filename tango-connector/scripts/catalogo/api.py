"""Consolida los _indice.json de cada módulo en api.csv.

Uso:
    python scripts/catalogo/api.py <carpeta-del-relevamiento>

Lee <carpeta>/procesos/*/_indice.json (generados al recorrer getapi) y candidatos.csv,
y escribe <carpeta>/api.csv con un proceso por fila.
"""
import csv
import glob
import json
import os
import sys


def main(folder: str) -> None:
    cand = {r["accessNumber"]: r for r in csv.DictReader(open(os.path.join(folder, "candidatos.csv"), encoding="utf-8"))}
    out = []
    for f in sorted(glob.glob(os.path.join(folder, "procesos", "*", "_indice.json"))):
        modulo = os.path.basename(os.path.dirname(f))
        for access, c in json.load(open(f, encoding="utf-8"))["procesos"].items():
            r = cand.get(access, {})
            out.append({
                "accessNumber": int(access),
                "descripcion": r.get("descripcion", c.get("titulo") or ""),
                "modulo": modulo,
                "path": r.get("path", ""),
                "estado": c["estado"],
                "tipo": c.get("tipo", ""),
                "endpoints": " ".join(e.split(" ")[1].replace("Api/", "") for e in c.get("endpoints", [])),
                "tablas": " ".join(c.get("tablas", [])),
                "apiAbril": r.get("apiAbril", ""),
                "detalle": c.get("detalle") or "",
            })
    out.sort(key=lambda r: (r["modulo"], r["path"], r["accessNumber"]))
    with open(os.path.join(folder, "api.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f"{len(out)} procesos")


if __name__ == "__main__":
    main(sys.argv[1])
