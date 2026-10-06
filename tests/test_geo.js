// Pruebas de los cálculos del SAR Planner (app/geo.js). Ejecutar desde la carpeta fpl:  node tests/test_geo.js
const fs = require("fs"), path = require("path"), assert = require("assert");
const dir = path.join(__dirname, "..");
const geo = fs.readFileSync(path.join(dir, "data/iamsar.js"), "utf8") + "\n" + fs.readFileSync(path.join(dir, "app/geo.js"), "utf8");
for (const f of fs.readdirSync(path.join(dir, "app")).filter(f => f.endsWith(".js"))) // sintaxis de todos los .js
  new Function(fs.readFileSync(path.join(dir, "app", f), "utf8"));
const g = new Function(geo + `;return {buildPattern, buildPln, departurePosition, sweepWidth, bestAreaRoute, polyAreaM2, splitPlan,
  icaoCoord, resolveVia, procPoints, bestHeading, buildFplIcao, dist, brg, proj, turnRadius, groundSpeed, pathTime, NM, gtnTurns, easeTurn, procRwyOk, windRunway, bestProc}`)();
const { NM } = g, c = [41.4, 2.0], R = g.turnRadius(120, 25);
const at = (n, e) => g.proj(g.proj(c, 0, n * NM), 90, e * NM);
const legStr = w => w.slice(1).map((x, i) => (g.dist(w[i].pos, x.pos) / NM).toFixed(1) + "@" + Math.round(g.brg(w[i].pos, x.pos)));
const turnsOf = w => w.slice(1, -1).map((x, i) => Math.abs(((g.brg(x.pos, w[i + 2].pos) - g.brg(w[i].pos, x.pos) + 540) % 360) - 180));
const ok = msg => console.log("✓ " + msg);

// ---------- Patrones clásicos ----------
const base = { csp: c, hdg: 45, len: 8 * NM, sp: 1 * NM, n: 8, dir: 1, gota: false, il: "1", vs2: false, radius: g.turnRadius(140, 25) };
let w = g.buildPattern({ ...base, type: "PS" });
assert.equal(w.length, 16); assert.equal(w[0].name, "CSP");
assert.deepEqual(legStr(w).slice(0, 2), ["8.0@45", "1.0@135"]);
w = g.buildPattern({ ...base, type: "SS", n: 6, hdg: 0 });
assert.deepEqual(legStr(w).map(s => s.split("@")[0]), ["1.0", "1.0", "2.0", "2.0", "3.0", "3.0"]);
w = g.buildPattern({ ...base, type: "SSI", n: 6, hdg: 0 });
assert.equal(w[w.length - 1].name, "CSP"); assert(g.dist(w[w.length - 1].pos, c) < 1);
w = g.buildPattern({ ...base, type: "VS", len: 2 * NM, hdg: 45 });
assert.deepEqual(legStr(w).map(s => +s.split("@")[1]), [45, 165, 285, 285, 45, 165, 165, 285, 45]);
w = g.buildPattern({ ...base, type: "VS", vs2: true, len: 2 * NM });
assert.equal(new Set(w.map(x => x.name)).size, 19);
w = g.buildPattern({ ...base, type: "SPI", sp: 1 * NM, n: 2, hdg: 0 });
assert(Math.abs(g.dist(c, w[1].pos) / NM - 1) < 0.01 && Math.abs(g.dist(c, w[13].pos) / NM - 2) < 0.01);
w = g.buildPattern({ ...base, type: "ZZ", hdg: 90, len: 5 * NM, sp: 2 * NM, n: 4 });
assert.deepEqual(legStr(w), ["5.4@158", "5.4@22", "5.4@158", "5.4@22"]);
w = g.buildPattern({ ...base, type: "TRI", hdg: 180, len: 6 * NM, sp: 0.5 * NM, n: 6 });
assert(Math.abs(g.dist(w[11].pos, w[12].pos) / NM - 6) < 0.01);
for (const type of ["PS", "CS", "TSN", "TSR", "SS", "SSI", "VS", "BP", "OR", "SPI", "CL", "F8", "ZZ", "TRI"])
  for (const gota of [false, true]) for (const xh of [false, true]) {
    const q = g.buildPattern({ ...base, type, gota, xh, len: 3 * NM, n: 5 });
    assert.equal(new Set(q.map(x => x.name)).size, q.length, `${type} nombres repetidos`);
    assert(q.every(x => x.name.length <= 10 && isFinite(x.pos[0])), `${type} nombre/posición inválidos`);
  }
// Gota solo donde hay giro de verdad (el sector pasa recto por el CSP)
w = g.buildPattern({ ...base, type: "VS", vs2: true, gota: true, len: 5 * NM, dir: -1, hdg: 220 });
const ext = w.filter(x => x.ext).map(x => x.name);
assert(!ext.includes("CSP2X") && ext.includes("CSP4X") && ext.includes("V1X"));
// Crosshatch: la 2ª pasada empieza en la esquina más cercana (sin vuelta de 180°)
w = g.buildPattern({ ...base, type: "PS", xh: true, hdg: 90, len: 6 * NM, sp: 1.5 * NM, n: 4, radius: R });
assert(turnsOf(w).every(a => a < 170), "crosshatch sin giros de 180°");
ok("patrones clásicos, gota y crosshatch");

// ---------- Plan .pln ----------
assert.equal(g.departurePosition("P|P|12"), "PARKING NONE 12 PARKING NONE");
assert.equal(g.departurePosition("P|GA|3"), "GATE_A NONE 3 GATE_A NONE");
assert.equal(g.departurePosition("R|31"), "31");
const apt = i => (i === "LELL" ? { name: "Sabadell", pos: [41.52, 2.105], alt: 468 } : null);
const pln = g.buildPln(g.buildPattern({ ...base, type: "PS" }), { dep: "LELL", arr: "LELL", alt: 1000, pos: "P|P|5" }, apt);
assert(pln.includes("<DeparturePosition>PARKING NONE 5 PARKING NONE</DeparturePosition>"));
assert(pln.includes("<RouteType>Direct</RouteType>") && (pln.match(/<ATCWaypoint id="LELL">/g) || []).length === 2);
ok("plan .pln (posición de salida, RouteType, destino al final)");

// ---------- Tablas IAMSAR / USCG ----------
const W = o => +g.sweepWidth(o).toFixed(3);
assert.equal(W({ craft: "plane", obj: "Raft 6 person", altFt: 1000, visNm: 10 }), 2.2);
assert.equal(W({ craft: "heli", obj: "Sail Boat 40 ft", altFt: 300, visNm: 30 }), 16.7);
assert.equal(W({ craft: "plane", obj: "Raft 4 person", altFt: 750, visNm: 7.5 }), 1.55);
assert.equal(W({ craft: "plane", obj: "Raft 6 person", altFt: 1000, visNm: 10, sea: 1 }), 1.1);
assert.equal(W({ craft: "plane", obj: "Ship 120 ft", altFt: 1000, visNm: 10, sea: 1 }), 9.99);
assert.equal(W({ craft: "heli", obj: "Person in Water", altFt: 300, visNm: 10, pfd: true }), 0.4);
assert.equal(W({ craft: "heli", obj: "Person in Water", altFt: 1000, visNm: 10, pfd: true }), 0.1);
assert.equal(W({ craft: "plane", obj: "Raft 6 person", altFt: 1000, visNm: 10, fatigue: true }), 1.98);
assert.equal(W({ craft: "plane", obj: "Raft 6 person", altFt: 5000, visNm: 50 }), 2.9);
// Velocidad (H-9): avión a ≤150 kt ×1,1 (balsa), helicóptero a 105 kt entre 90 (1,0) y 120 (0,8) para persona en el agua
assert.equal(W({ craft: "plane", obj: "Raft 6 person", altFt: 1000, visNm: 10, tas: 120 }), 2.42);
assert.equal(W({ craft: "plane", obj: "Raft 6 person", altFt: 1000, visNm: 10, tas: 250 }), 1.98);
assert.equal(W({ craft: "heli", obj: "Person in Water", altFt: 300, visNm: 10, pfd: true, tas: 105 }), 0.36);
ok("tablas IAMSAR: valores, interpolación y correcciones");

// ---------- Viento ----------
const kt = v => +(v / 0.514444).toFixed(1);
assert.equal(kt(g.groundSpeed(100, 180, 0, 20)), 120);
assert.equal(kt(g.groundSpeed(100, 0, 0, 20)), 80);
assert.equal(kt(g.groundSpeed(100, 90, 0, 20)), 98);
ok("velocidad sobre el suelo con viento");

// ---------- Área ----------
const ab = { sp: 0.5 * NM, radius: R, auto: true, hdg: 0, il: "1", tas: 120, wind: {} };
const rect = [[0, 0], [0, 10], [2, 10], [2, 0]].map(([n, e]) => at(n, e));
const best = g.bestAreaRoute(rect, ab);
assert(Math.abs(best.brg - 90) < 3 && best.out.length === 8, `rectángulo: ${best.brg}° ${best.out.length / 2} legs`);
assert(Math.abs(g.polyAreaM2(rect) / (NM * NM) - 20) < 0.1);
assert.equal(g.bestAreaRoute(rect, { ...ab, windAlign: true, wind: { dir: 10, kt: 20 } }).brg, 10);
assert(Math.abs(g.bestAreaRoute(rect, { ...ab, il: "auto" }).brg - 90) <= 3);
const tri = [[0, 0], [0, 6], [6, 0]].map(([n, e]) => at(n, e));
const pa = { type: "AREA", csp: c, hdg: 0, sp: 1 * NM, dir: 1, il: "1", gota: false, radius: R, auto: true, area: tri, from: at(-5, -5), tas: 120, wind: {} };
w = g.buildPattern(pa);
assert(w.every(x => /^[A-Z]\d+_[12]$/.test(x.name)) && new Set(w.map(x => x.name)).size === w.length);
const man = g.buildPattern({ ...pa, auto: false, hdg: 30 });
assert(Math.abs(g.brg(man[0].pos, man[1].pos) % 180 - 30) < 1);
const irr = [[0, 0], [1, 7], [5, 6], [6, 1]].map(([n, e]) => at(n, e));
for (const il of ["1", "auto"]) {
  const q = g.buildPattern({ ...pa, area: irr, il, sp: 1.5 * NM });
  assert(turnsOf(q).every(a => Math.abs(a - 90) < 3), `área il=${il}: giros ${turnsOf(q).map(Math.round)}`);
}
const U = [[0, 0], [0, 8], [6, 8], [6, 5], [2, 5], [2, 3], [6, 3], [6, 0]].map(([n, e]) => at(n, e));
const inside = (pt, poly) => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};
for (const hdg of [0, 90]) {
  const q = g.buildPattern({ ...pa, area: U, auto: false, hdg, from: at(-3, 4) });
  const legs = []; for (let i = 0; i + 1 < q.length; i += 2) legs.push([q[i].pos, q[i + 1].pos]);
  const crossing = legs.filter(([a, b]) => [0.2, 0.35, 0.5, 0.65, 0.8].some(t => !inside([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], U)));
  assert(new Set(q.map(x => x.name[0])).size >= 2 && crossing.length === 0, `U ${hdg}°: ${crossing.length} legs sobre el hueco`);
}
ok("área: rumbo óptimo, viento, entrelazado, giros de 90° y áreas cóncavas");

// ---------- División en vuelos (GTN750: 100 waypoints) ----------
for (const n of [99, 150, 260, 400]) {
  const big = []; for (let k = 1; k <= n / 2; k++) big.push({ name: `A${k}_1` }, { name: `A${k}_2` });
  const parts = g.splitPlan(big);
  assert(parts.flat().length === big.length && parts.every(p => p.length <= 98 && /_1$/.test(p[0].name)));
  assert(Math.max(...parts.map(p => p.length)) - Math.min(...parts.map(p => p.length)) <= 4, parts.map(p => p.length).join("+"));
}
ok("división del plan en vuelos de ≤ 100 waypoints");

// ---------- Ruta: coordenadas ICAO, puntos intermedios, SID/STAR, .pln IFR ----------
assert.equal(g.icaoCoord([41.4, 1.95]), "4124N00157E");
assert.equal(g.icaoCoord([41.9999, -2.0001]), "4200N00200W");
const nav = { SLL: [["VOR", 41.52, 2.11, "LE", "SABADELL"]], KANIG: [["FIX", 42.48, 2.98, "LE", ""], ["FIX", 10, 10, "XX", ""]] };
const via = g.resolveVia("sll kanig 4124N00157E NOEXISTE", nav, c);
assert.deepEqual(via.unknown, ["NOEXISTE"]);
assert.deepEqual(via.pts.map(x => x.kind || "User"), ["VOR", "Intersection", "User"]);
assert.equal(via.pts[1].region, "LE"); // de dos KANIG, el cercano
const procs = { LEBL: { SID: { "AGEN2J 20": [["DER20", 41.28, 2.08, "LE"], ["AGENA", 41.54, 3.48, "LE"]] }, STAR: {} } };
const sid = g.procPoints(procs, "LEBL", "SID", "AGEN2J 20");
assert(sid.length === 2 && sid[0].sid === "AGEN2J" && sid[0].rwy === "20");
const plnIfr = g.buildPln([...sid, ...g.buildPattern({ ...base, type: "PS" })], { dep: "LELL", arr: "LELL", alt: 3000 }, apt);
assert(plnIfr.includes("<FPType>IFR</FPType>") && plnIfr.includes("<DepartureFP>AGEN2J</DepartureFP>") && plnIfr.includes("<RunwayNumberFP>20</RunwayNumberFP>"));
assert(plnIfr.includes("<ICAORegion>LE</ICAORegion>") && plnIfr.includes("<ATCWaypointType>Intersection</ATCWaypointType>"));
ok("coordenadas ICAO, puntos intermedios, SID/STAR y .pln IFR");

// ---------- Rumbo óptimo: el patrón se orienta hacia donde se ahorra tránsito ----------
const lell = [41.52, 2.105], csp = [41.40, 2.30];
const hb = g.bestHeading({ ...base, type: "PS", csp, len: 6 * NM, n: 4, tas: 120, wind: {} }, lell, lell);
const tOf = h => g.pathTime([lell, ...g.buildPattern({ ...base, type: "PS", csp, len: 6 * NM, n: 4, hdg: h }).map(x => x.pos), lell], 120, {});
assert([0, 45, 90, 135, 180, 225, 270, 315].every(h => tOf(hb) <= tOf(h) + 1), "el rumbo elegido es el más rápido");
ok(`rumbo óptimo (${hb}°)`);

// ---------- Plan de vuelo ICAO ----------
const fpl = g.buildFplIcao({ callsign: "ECGCM", rules: "Y", ftype: "X", actype: "B350", wake: "L", equip: "SDFGRY", surv: "S",
  dep: "LELL", eobt: "1300", cruiseKt: 250, cruiseFt: 10000, patKt: 180, patFt: 3500, sid: "", out: ["SLL"],
  pattern: [[41.4, 1.95], [41.4, 1.9501], [41.87, 2.58]], back: ["SLL"], dest: "LELL", eetSec: 9000, altn: "LEBL",
  sts: "STATE", pbn: "B2D2S2", nav: "SBAS", sur: "260B", dof: "261006", reg: "ECGCM", opr: "IGN", rmk: "LIDAR SURVEY" });
// Y: tránsitos IFR y zona VFR (al volver a la ruta, otra vez IFR)
assert.equal(fpl, "(FPL-ECGCM-YX\n-B350/L-SDFGRY/S\n-LELL1300\n-N0250F100 DCT SLL 4124N00157E VFR 4152N00235E SLL/N0250F100 IFR\n"
  + "-LELL0230 LEBL\n-STS/STATE PBN/B2D2S2 NAV/SBAS SUR/260B DOF/261006 REG/ECGCM OPR/IGN RMK/LIDAR SURVEY)");
// LELL (aeródromo VFR): sale VFR, pasa a IFR sobre SLL a 3500 ft y cancela IFR en SLL al volver -> letra Z
const fplLELL = g.buildFplIcao({ callsign: "ECGCM", rules: "I", ftype: "X", actype: "C750", wake: "M", equip: "SDFGRY", surv: "S",
  dep: "LELL", eobt: "1335", cruiseKt: 440, cruiseFt: 1000, patKt: 150, patFt: 1000, sid: "", out: ["SLL"],
  pattern: [[41.45, 2.18], [41.27, 1.97]], back: ["SLL"], dest: "LELL", eetSec: 4800, altn: "LEBL",
  depGate: { fix: "SLL", ft: 3500 }, arrGate: { fix: "SLL" }, sts: "", pbn: "", nav: "", sur: "", dof: "", reg: "", opr: "", rmk: "" });
assert(fplLELL.includes("(FPL-ECGCM-ZX") && fplLELL.includes("\n-N0440VFR DCT SLL/N0440A035 IFR DCT 4127N00211E/N0150A010 4116N00158E SLL VFR\n"), fplLELL);
const fplZ = g.buildFplIcao({ callsign: "ECGCM", rules: "Z", ftype: "X", actype: "C750", wake: "M", equip: "SDFGRY", surv: "S",
  dep: "LELL", eobt: "1335", cruiseKt: 300, cruiseFt: 10000, patKt: 220, patFt: 3500, sid: "", out: ["SLL"],
  pattern: [[41.4, 1.95]], back: [], dest: "LEMD", eetSec: 4800, altn: "", sts: "", pbn: "", nav: "", sur: "", dof: "", reg: "", opr: "", rmk: "" });
assert(fplZ.includes("-N0300VFR DCT SLL 4124N00157E/N0220A035 IFR") && fplZ.endsWith("-LEMD0120\n-0)"), fplZ);
ok("plan de vuelo ICAO (Y y Z)");
// ---------- Giros del GTN750 ----------
{ // 90° con tramos largos: recorta R; dos 90° separados menos de 2R: se reparten el tramo y el radio baja (el avión se pasa)
  const pt = (n, e) => ({ pos: at(n, e) }), Rg = 0.5 * NM;
  let t = g.gtnTurns([pt(0, 0), pt(5, 0), pt(5, 5)], Rg);
  assert(Math.abs(t[1].D - Rg) < 5 && t[1].fit === 1 && !t[1].over);
  t = g.gtnTurns([pt(0, 0), pt(5, 0), pt(5, 0.6), pt(0, 0.6)], Rg);
  assert(Math.abs(t[1].r - 0.3 * NM) < 5 && Math.abs(t[2].fit - 0.6) < 0.01);
  assert(g.gtnTurns([pt(0, 0), pt(5, 0), pt(0, 0.01)], Rg)[1].over); // >175°: viraje de procedimiento
  // Entrada de 135° a un leg hacia el sur: se alarga hacia el norte hasta que el giro cabe fuera del área
  const q = g.easeTurn(at(-5, 0), at(0, 0), at(-1, -4), Rg), back = g.dist(q, at(0, 0));
  const ad = Math.abs(((g.brg(q, at(-5, 0)) - g.brg(at(-1, -4), q) + 540) % 360) - 180);
  assert(back > 0 && Rg * Math.tan(ad / 2 * Math.PI / 180) <= Rg + back + 1, back);
  assert.deepEqual(g.easeTurn(at(-5, 0), at(0, 0), at(0, -4), Rg), at(0, 0)); // 90°: no se toca
}
{ // Entrelazado auto: elige el salto con el que caben todos los giros (aquí el 5, fuera de la regla 2R/S que daba 4)
  const Rg = g.turnRadius(150, 17.5), w = g.buildPattern({ ...base, type: "PS", len: 10 * NM, sp: 0.6 * NM, n: 10, il: "auto", radius: Rg });
  assert.equal(w.il, "5");
  assert(g.gtnTurns(w, Rg).every(x => x.fit > 1 - 1e-6));
}
ok("giros del GTN750 (recorte, radio repartido, alargar legs)");
{ // Pista por viento y mejor SID/STAR para la zona
  assert(g.procRwyOk("GODO4M 06B", "06L") && g.procRwyOk("X1A ALL", "24R") && g.procRwyOk("AGEN4F 24L", "24L"));
  assert(!g.procRwyOk("AGEN4F 24L", "24R") && !g.procRwyOk("GODO4M 06B", "24L") && g.procRwyOk("AGEN4F 24L", null));
  assert.equal(g.windRunway(["06L", "24R", "06R", "24L"], 230, 12, 1), "24R"); // viento de 230°: pistas 24
  assert.equal(g.windRunway(["06", "24"], 60, 2), null); // calma: cualquiera
  const procs = { XXXX: { SID: { "NORTE1A 06": [["N", 41.5, 2.0]], "SUR1A 06": [["S", 41.3, 2.0]], "SUR1B 24": [["S", 41.3, 2.0]] } } };
  assert.equal(g.bestProc(procs, "XXXX", "SID", "06", c, at(-10, 0)), "SUR1A 06"); // zona al sur
  assert.equal(g.bestProc(procs, "XXXX", "SID", "24", c, at(10, 0)), "SUR1B 24"); // en la 24 solo hay esa
  assert.equal(g.bestProc(procs, "XXXX", "STAR", null, c, c), "");
}
ok("pista por viento y mejor SID/STAR");
console.log("TODO OK");
