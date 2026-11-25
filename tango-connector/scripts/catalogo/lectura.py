"""Arma el catálogo de lectura: qué procesos se pueden leer por API y qué campos devuelven.

Uso:
    python scripts/catalogo/lectura.py <carpeta-del-relevamiento>

Lee api.csv y los <id>-api.json de procesos/. Genera:
- lectura.csv: un proceso por fila, con sus endpoints de lectura y sus tablas.
- campos.csv: un campo por fila (proceso, tabla, campo), para buscar dónde está un dato.
"""
import csv
import glob
import json
import os
import sys

LECTURA = ["Api/GetApiLiveQueryData", "Api/Get", "Api/GetByFilter", "Api/GetById", "Api/GetPdf"]


def main(folder: str) -> None:
    procesos = {r["accessNumber"]: r for r in csv.DictReader(open(os.path.join(folder, "api.csv"), encoding="utf-8"))}
    archivos = {os.path.basename(os.path.dirname(f)): f for f in glob.glob(os.path.join(folder, "procesos", "*", "*", "*-api.json"))}

    lectura, campos = [], []
    for access, p in procesos.items():
        if p["estado"] != "api":
            continue
        if access not in archivos:
            print("sin archivo -api.json:", access, p["descripcion"])
            continue
        api = json.load(open(archivos[access], encoding="utf-8"))
        endpoints = [x["name"] for x in api.get("paths") or [] if x["name"] in LECTURA]
        if not endpoints:
            continue
        # En los PDF, tables trae los nombres de endpoint, no tablas.
        tablas = {k: v for k, v in (api.get("tables") or {}).items() if not k.startswith("Api/")}
        lectura.append({
            "accessNumber": int(access),
            "descripcion": p["descripcion"],
            "modulo": p["modulo"],
            "path": p["path"],
            "tipo": p["tipo"],
            "lectura": " ".join(e.removeprefix("Api/") for e in endpoints),
            "tablas": " ".join(f"{k}({len(v)})" for k, v in tablas.items()),
            "campos": sum(len(v) for v in tablas.values()),
        })
        for orden, (tabla, cols) in enumerate(tablas.items()):
            for c in cols:
                campos.append({
                    "accessNumber": int(access),
                    "descripcion": p["descripcion"],
                    "modulo": p["modulo"],
                    "tipo": p["tipo"],
                    "tabla": tabla,
                    "principal": "si" if orden == 0 else "no",
                    "campo": c,
                })

    for nombre, filas in (("lectura.csv", lectura), ("campos.csv", campos)):
        with open(os.path.join(folder, nombre), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
            w.writeheader()
            w.writerows(filas)

    por_tipo: dict[str, int] = {}
    for r in lectura:
        por_tipo[r["tipo"]] = por_tipo.get(r["tipo"], 0) + 1
    print("procesos con lectura:", len(lectura), por_tipo)
    print("campos:", len(campos))


if __name__ == "__main__":
    main(sys.argv[1])
