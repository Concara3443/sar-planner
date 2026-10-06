#!/usr/bin/env python3
"""
Exporta de la base de datos de Little Navmap (MSFS 2024) los datos que usa sar.html:

  data/aeropuertos.js  aeropuertos y helipuertos, parkings, cabeceras y variación magnética
  data/navdata.js      fixes, VOR y NDB (para puntos intermedios) y SID / STAR con sus fixes

Uso:
    python scripts/exportar_aeropuertos.py              -> regiones LE GC GE LP LX
    python scripts/exportar_aeropuertos.py LE LF EG     -> las regiones ICAO que digas

Volver a ejecutarlo después de recargar la base de datos en Little Navmap.
"""

import json
import os
import sqlite3
import sys
from pathlib import Path

DB = Path(os.environ["APPDATA"]) / "ABarthel" / "little_navmap_db" / "little_navmap_msfs24.sqlite"
OUT = Path(__file__).resolve().parent.parent / "data"


def write_js(name, var, data):
    (OUT / name).write_text(f"const {var} = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                            encoding="utf-8")


def main():
    regions = [r.upper() for r in sys.argv[1:]] or ["LE", "GC", "GE", "LP", "LX"]
    OUT.mkdir(exist_ok=True)
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    q = ",".join("?" * len(regions))

    # ---------- Aeropuertos ----------
    # [nombre, lat, lon, altitud ft, parkings [nombre, número, tipo], cabeceras, "A"/"H", variación magnética (+E)]
    apts, ids = {}, {}
    for aid, ident, name, lat, lon, alt, n_rwy, n_heli, mv in con.execute(
            f"select airport_id, ident, name, laty, lonx, altitude, num_runways, num_helipad, mag_var from airport "
            f"where region in ({q}) and is_closed = 0", regions):
        kind = "H" if n_rwy == 0 and n_heli > 0 else "A"
        apts[ident] = [name, round(lat, 6), round(lon, 6), round(alt), [], [], kind, round(mv or 0, 1)]
        ids[aid] = ident
    for aid, name, num, ptype in con.execute("select airport_id, name, number, type from parking order by airport_id, name, number"):
        if aid in ids:
            apts[ids[aid]][4].append([name or "", num, ptype])
    for aid, rwy in con.execute("select airport_id, runway_name from start where type = 'R' order by runway_name"):
        if aid in ids and rwy:
            apts[ids[aid]][5].append(rwy)
    write_js("aeropuertos.js", "AIRPORTS_DB", apts)

    # ---------- Fixes, VOR, NDB: {ident: [[tipo, lat, lon, región, nombre], ...]} (un ident puede repetirse) ----------
    nav = {}
    def add(ident, kind, lat, lon, region, name=""):
        nav.setdefault(ident, []).append([kind, round(lat, 6), round(lon, 6), region, name or ""])
    for ident, region, lat, lon, apt in con.execute(
            f"select ident, region, laty, lonx, airport_ident from waypoint where region in ({q}) and coalesce(artificial, 0) = 0", regions):
        add(ident, "FIX" if not apt else "FIX " + apt, lat, lon, region)
    for ident, name, region, lat, lon in con.execute(f"select ident, name, region, laty, lonx from vor where region in ({q})", regions):
        add(ident, "VOR", lat, lon, region, name)
    for ident, name, region, lat, lon in con.execute(f"select ident, name, region, laty, lonx from ndb where region in ({q})", regions):
        add(ident, "NDB", lat, lon, region, name)

    # ---------- SID / STAR: {aeropuerto: {"SID": {"NOMBRE RWY": [[fix, lat, lon, región], ...]}, "STAR": {...}}} ----------
    # Los tramos de procedimiento no traen coordenadas: se buscan por ident + región en waypoint / vor / ndb
    where = {}
    for table in ("waypoint", "vor", "ndb"):
        for ident, region, lat, lon in con.execute(f"select ident, region, laty, lonx from {table}"):
            where.setdefault((ident, region), (lat, lon))
    procs = {}
    rows = con.execute(
        f"select a.approach_id, a.airport_ident, a.suffix, a.fix_ident, a.arinc_name from approach a "
        f"join airport p on p.airport_id = a.airport_id where p.region in ({q}) and a.type = 'GPS' and a.suffix in ('D', 'A')",
        regions).fetchall()
    for pid, apt, suffix, name, arinc in rows:
        legs = []
        for fix, region in con.execute(
                "select fix_ident, fix_region from approach_leg where approach_id = ? and is_missed = 0 "
                "order by approach_leg_id", (pid,)):
            lat, lon = where.get((fix, region), (None, None))
            if fix and lat is not None and not (legs and legs[-1][0] == fix):
                legs.append([fix, round(lat, 6), round(lon, 6), region or ""])
        if not legs:
            continue
        rwy = (arinc or "").replace("RW", "") or "ALL"
        procs.setdefault(apt, {"SID": {}, "STAR": {}})["SID" if suffix == "D" else "STAR"][f"{name} {rwy}"] = legs

    write_js("navdata.js", "NAV_DB", {"nav": nav, "proc": procs})
    n_heli = sum(a[6] == "H" for a in apts.values())
    n_sid = sum(len(p["SID"]) for p in procs.values())
    n_star = sum(len(p["STAR"]) for p in procs.values())
    print(f"{len(apts) - n_heli} aeropuertos, {n_heli} helipuertos · {sum(len(v) for v in nav.values())} fixes/VOR/NDB · "
          f"{n_sid} SID y {n_star} STAR en {len(procs)} aeropuertos ({' '.join(regions)}) -> {OUT}")


if __name__ == "__main__":
    main()
