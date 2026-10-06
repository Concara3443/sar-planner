# Costa para «🎲 Simular un caso»: tierra de Natural Earth 10m (land + minor_islands) recortada a la zona de las bases
# SAR españolas y simplificada a ~1 km -> data/costa.js (polígonos [lat, lon, lat, lon, ...]).
# Uso: python scripts/exportar_costa.py ne_10m_land.geojson ne_10m_minor_islands.geojson
# (descarga: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson)
import json, sys, os

S, N, W, E = 25.0, 47.0, -21.0, 10.0  # Canarias, península, Baleares, sur de Francia, norte de África
TOL = 0.01                             # simplificación (°), ~1 km


def clip(ring):  # Sutherland-Hodgman contra el rectángulo; ring = [(lon, lat)]
    for inside, cut in (
        (lambda p: p[0] >= W, lambda a, b: (W, a[1] + (b[1] - a[1]) * (W - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= E, lambda a, b: (E, a[1] + (b[1] - a[1]) * (E - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= S, lambda a, b: (a[0] + (b[0] - a[0]) * (S - a[1]) / (b[1] - a[1]), S)),
        (lambda p: p[1] <= N, lambda a, b: (a[0] + (b[0] - a[0]) * (N - a[1]) / (b[1] - a[1]), N)),
    ):
        out = []
        for i, b in enumerate(ring):
            a = ring[i - 1]
            if inside(b):
                if not inside(a): out.append(cut(a, b))
                out.append(b)
            elif inside(a): out.append(cut(a, b))
        ring = out
        if not ring: break
    return ring


def rdp(pts):  # Douglas-Peucker iterativo
    keep, stack = {0, len(pts) - 1}, [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = pts[i], pts[j]
        dx, dy, best, k = x2 - x1, y2 - y1, 0, None
        L = (dx * dx + dy * dy) ** 0.5 or 1e-12
        for m in range(i + 1, j):
            d = abs(dy * (pts[m][0] - x1) - dx * (pts[m][1] - y1)) / L
            if d > best: best, k = d, m
        if k is not None and best > TOL:
            keep.add(k); stack += [(i, k), (k, j)]
    return [pts[m] for m in sorted(keep)]


polys = []
for path in sys.argv[1:]:
    for f in json.load(open(path))["features"]:
        g = f["geometry"]
        for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]):
            r = poly[0]  # anillo exterior (los lagos interiores no importan para el mar)
            if max(p[0] for p in r) < W or min(p[0] for p in r) > E or max(p[1] for p in r) < S or min(p[1] for p in r) > N: continue
            r = clip([tuple(p) for p in r])
            if len(r) < 3: continue
            if len(r) > 8:  # anillo cerrado: se parte por el vértice más lejano al primero y se simplifica cada mitad
                k = max(range(len(r)), key=lambda m: (r[m][0] - r[0][0]) ** 2 + (r[m][1] - r[0][1]) ** 2)
                r = rdp(r[:k + 1])[:-1] + rdp(r[k:] + [r[0]])[:-1]
            if len(r) >= 3: polys.append([round(v, 3) for p in r for v in (p[1], p[0])])

out = os.path.join(os.path.dirname(__file__), "..", "data", "costa.js")
with open(out, "w") as fh:
    fh.write("// Tierra (Natural Earth 10m, dominio público) de la zona de las bases SAR: polígonos [lat, lon, ...]. "
             "Generado por scripts/exportar_costa.py\nconst COAST = " + json.dumps(polys, separators=(",", ":")) + ";\n")
print(len(polys), "polígonos,", sum(len(p) for p in polys) // 2, "vértices,", os.path.getsize(out) // 1024, "KB")
