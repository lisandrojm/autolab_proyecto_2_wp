"""Separa un export de GetMenuItems en un JSON por módulo y genera procesos.csv.

Uso:
    python scripts/catalogo/menus.py <export.json> <carpeta-destino>

El export es el JSON que se arma en el navegador con las respuestas de
POST /Module/GetMenuItems de cada módulo (ver docs/tango/catalogo/README.md).
"""
import csv
import json
import os
import sys


def main(src: str, dst: str) -> None:
    data = json.load(open(src, encoding="utf-8"))
    menu_dir = os.path.join(dst, "menu")
    os.makedirs(menu_dir, exist_ok=True)

    rows = []
    for n, mod in enumerate(data["modules"], start=1):
        name = mod["name"]
        with open(os.path.join(menu_dir, f"{n:02d}-{name}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump({"module": mod["module"], "name": name, "menuItems": mod["menuItems"]},
                      f, ensure_ascii=False, indent=2)
            f.write("\n")
        for it in mod["menuItems"]:
            if it["isProcess"]:
                rows.append({
                    "modulo": name,
                    "moduleNumber": it["moduleNumber"],
                    "accessNumber": it["accessNumber"],
                    "menuId": it["menuId"],
                    "path": it["path"] or "",
                    "descripcion": (it["description"] or "").strip(),
                    "migrated": int(bool(it["migrated"])),
                })

    with open(os.path.join(dst, "procesos.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    meta = {k: data[k] for k in ("capturedAt", "company", "tangoVersion")}
    with open(os.path.join(dst, "meta.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{len(data['modules'])} módulos, {len(rows)} procesos")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
