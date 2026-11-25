"""Filtra procesos.csv a los candidatos a tener API: isProcess y migrated.

Uso:
    python scripts/catalogo/candidatos.py <carpeta-del-relevamiento> [carpeta-menus-abril]

Genera candidatos.csv con un proceso por fila (agrupado por accessNumber). Si se pasa la
carpeta de menús del relevamiento de abril (lumba-tango/docs/tango-gestion/menu), agrega
la columna apiAbril: si, no, o vacío si no figuraba.
"""
import csv
import glob
import json
import os
import sys


def april_has_api(menu_dir: str) -> dict[str, bool]:
    found: dict[str, bool] = {}

    def walk(node: dict) -> None:
        if node.get("isEndpoint") and node.get("id"):
            found[str(node["id"])] = bool(node.get("hasAPI"))
        for child in node.get("children") or []:
            walk(child)

    for f in glob.glob(os.path.join(menu_dir, "*.json")):
        walk(json.load(open(f, encoding="utf-8")))
    return found


def main(folder: str, april_dir: str | None) -> None:
    rows = list(csv.DictReader(open(os.path.join(folder, "procesos.csv"), encoding="utf-8")))
    april = april_has_api(april_dir) if april_dir else {}

    groups: dict[str, list[dict]] = {}
    for r in rows:
        if r["migrated"] == "1":
            groups.setdefault(r["accessNumber"], []).append(r)

    out = []
    for access, rs in groups.items():
        main_row = next((r for r in rs if r["modulo"] != "Live"), rs[0])
        out.append({
            "accessNumber": int(access),
            "descripcion": main_row["descripcion"],
            "modulo": main_row["modulo"],
            "path": main_row["path"],
            "otrasUbicaciones": " | ".join(f"{r['path']} > {r['descripcion']}" for r in rs if r is not main_row),
            "apiAbril": {True: "si", False: "no"}.get(april.get(access), ""),
        })
    order = ["Ventas", "Stock", "Compras", "Tesoreria", "CashFlow", "Contabilidad", "Sueldos",
             "ControlDePersonal", "ProcesosGenerales", "Live", "Administrador", "AplicacionesNexo"]
    out.sort(key=lambda r: (order.index(r["modulo"]), r["path"], r["accessNumber"]))

    with open(os.path.join(folder, "candidatos.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    by_mod: dict[str, list[int]] = {}
    for r in out:
        c = by_mod.setdefault(r["modulo"], [0, 0, 0, 0])
        c[0] += 1
        c[{"si": 1, "no": 2, "": 3}[r["apiAbril"]]] += 1
    print("modulo,candidatos,apiAbril_si,apiAbril_no,no_figuraba")
    for m in order:
        if m in by_mod:
            print(m, *by_mod[m], sep=",")
    print("TOTAL", len(out), sep=",")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
