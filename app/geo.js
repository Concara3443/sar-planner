// Cálculos del SAR Planner: patrones, giros, viento, tablas IAMSAR, área y plan .pln.
// Sin nada de pantalla: las pruebas lo cargan directamente con node.
const R_EARTH = 6371000, NM = 1852, RAD = Math.PI / 180;
// Tope de legs por pasada: con valores absurdos (S de centímetros) el mapa se colgaría dibujando cientos de miles de puntos
const MAX_LEGS = 400;
// Velocidad mínima que se propone al corregir giros: por debajo ningún avión vuela (un helicóptero sí, pero no para buscar así)
const TAS_MIN = 60;

function proj([lat, lon], brg, dist) {
  const d = dist / R_EARTH, b = brg * RAD, p1 = lat * RAD, l1 = lon * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / RAD, l2 / RAD];
}

function dist([la1, lo1], [la2, lo2]) {
  const a = Math.sin((la2 - la1) * RAD / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin((lo2 - lo1) * RAD / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

function brg([la1, lo1], [la2, lo2]) {
  const p1 = la1 * RAD, p2 = la2 * RAD, dl = (lo2 - lo1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

// Radio de giro en metros para TAS (kt) y banco (°)
function turnRadius(tas, bank) {
  const v = tas * 0.514444;
  return v * v / (9.81 * Math.tan(bank * RAD));
}
// El GTN750 (PMS50, motor LNAV de Working Title) dibuja los giros con 17,5° de banco a la velocidad sobre el suelo,
// y el autopiloto sigue ese dibujo: con más banco en el avión el giro no se cierra más.
const GTN_BANK = 17.5;
// Giros fly-by tal y como los calcula el GTN750 (FlightPathTurnCalculator.computeTrackTrackTurn del SDK de Working Title):
// todo giro de 1° a 175° se anticipa D = r·tan(giro/2). Si dos giros comparten un tramo que no llega para los dos,
// se lo reparten con el mismo radio r = L / (tan₁ + tan₂): el GTN dibuja un giro más cerrado de lo que el avión
// puede volar y el avión se pasa (fit < 1). Más de 175° (o punto ext): no anticipa, sobrevuela y da la vuelta.
// wps: [{pos, ext}], R: radio deseado (m). Devuelve por punto {ad, sgn, D, r, fit, over}.
function gtnTurns(wps, R) {
  const n = wps.length, P = wps.map(w => w.pos);
  const ang = P.map((q, i) => (i && i < n - 1 ? ((brg(q, P[i + 1]) - brg(P[i - 1], q) + 540) % 360) - 180 : 0));
  const over = ang.map((a, i) => i > 0 && i < n - 1 && (wps[i].ext || Math.abs(a) > 175));
  const t = ang.map((a, i) => (over[i] || Math.abs(a) < 1 ? 0 : Math.tan(Math.abs(a) / 2 * RAD)));
  // ponytail: reparto por parejas; el GTN encadena la restricción hacia delante (un poco más de sitio en cadenas de tramos cortos)
  return ang.map((a, i) => {
    const r = t[i] ? Math.min(R, dist(P[i - 1], P[i]) / (t[i - 1] + t[i]), dist(P[i], P[i + 1]) / (t[i] + t[i + 1])) : R;
    return { ad: Math.abs(a), sgn: a > 0 ? 1 : -1, D: r * t[i], r, fit: r / R, over: over[i] };
  });
}
// Un giro de más de 90° al entrar o salir de un leg se anticipa más de R y el GTN recortaría el leg dentro del área.
// Alarga el leg moviendo q (alejándolo de fixed) hasta que el giro hacia/desde other quepa en lo que sobra fuera
// del área (R de squareEnds más lo alargado). Si no se consigue (el otro punto está demasiado cerca) lo deja como está.
function easeTurn(fixed, q, other, R) {
  const b = brg(fixed, q);
  for (let x = 0; x <= 6 * R; x += R / 4) {
    const m = proj(q, b, x), ad = Math.abs(((brg(m, other) - b + 540) % 360) - 180);
    if (ad > 175) break;
    if (R * Math.tan(ad / 2 * RAD) <= R + x + 1) return m;
  }
  return q;
}

// ---- Área a medida: barrido en peine (lawnmower) de un polígono ----
// Proyección plana local alrededor del centro del polígono (vale para áreas de decenas de km)
function localFrame(poly) {
  const lat0 = poly.reduce((a, q) => a + q[0], 0) / poly.length, lon0 = poly.reduce((a, q) => a + q[1], 0) / poly.length;
  const k = Math.cos(lat0 * RAD) * R_EARTH * RAD, m = R_EARTH * RAD;
  return { fw: ([la, lo]) => [(lo - lon0) * k, (la - lat0) * m], bw: ([x, y]) => [lat0 + y / m, lon0 + x / k] };
}
function polyAreaM2(poly) {
  const f = localFrame(poly), q = poly.map(f.fw);
  return Math.abs(q.reduce((a, [x, y], i) => { const [x2, y2] = q[(i + 1) % q.length]; return a + x * y2 - x2 * y; }, 0)) / 2;
}
// Barrido del polígono con líneas de rumbo legBrg separadas como máximo sp (centradas: el borde queda a S/2).
// Cada línea guarda TODOS sus tramos dentro del área (en áreas cóncavas una línea puede entrar y salir varias veces).
function areaSweep(poly, sp, legBrg) {
  const f = localFrame(poly), b = legBrg * RAD, d = [Math.sin(b), Math.cos(b)], n = [Math.cos(b), -Math.sin(b)];
  const uv = poly.map(f.fw).map(([x, y]) => [x * d[0] + y * d[1], x * n[0] + y * n[1]]);
  const vs = uv.map(c => c[1]), vmin = Math.min(...vs), vmax = Math.max(...vs);
  // 5 % de tolerancia: que unos metros de más (curvatura, redondeo) no añadan un leg entero
  const lines = Math.min(MAX_LEGS, Math.max(1, Math.ceil((vmax - vmin) / sp - 0.05))), step = (vmax - vmin) / lines;
  const rows = [];
  for (let k = 0; k < lines; k++) {
    const v = vmin + step * (k + 0.5), us = [];
    for (let i = 0; i < uv.length; i++) {
      const [u1, v1] = uv[i], [u2, v2] = uv[(i + 1) % uv.length];
      if ((v1 <= v && v < v2) || (v2 <= v && v < v1)) us.push(u1 + (u2 - u1) * (v - v1) / (v2 - v1));
    }
    us.sort((x, y) => x - y);
    const segs = [];
    for (let i = 0; i + 1 < us.length; i += 2) if (us[i + 1] - us[i] > 1) segs.push({ k, v, u1: us[i], u2: us[i + 1] });
    rows.push(segs);
  }
  const toLL = (u, v) => f.bw([u * d[0] + v * n[0], u * d[1] + v * n[1]]);
  return { rows, toLL, f, d };
}
// Celdas: tramos de líneas consecutivas que se solapan uno a uno. Un área convexa es una sola celda;
// donde el área se bifurca (forma de U, C, L...) o el borde da un salto mayor que maxJump, empieza una celda nueva
// (si no, al escuadrar los extremos un leg corto se alargaría por encima de una zona que no hay que cubrir).
function areaCells(sw, maxJump = Infinity) {
  const cells = [];
  let prev = [];
  for (const segs of sw.rows) {
    prev = segs.map(seg => {
      const over = (a, b) => a.u1 < b.u2 && b.u1 < a.u2;
      const ov = prev.filter(q => over(q.seg, seg));
      const q = ov[0]?.seg, smooth = q && Math.abs(seg.u1 - q.u1) <= maxJump && Math.abs(seg.u2 - q.u2) <= maxJump;
      if (ov.length === 1 && smooth && segs.filter(o => over(ov[0].seg, o)).length === 1) {
        cells[ov[0].cell].push(seg);
        return { seg, cell: ov[0].cell };
      }
      cells.push([seg]);
      return { seg, cell: cells.length - 1 };
    });
  }
  return cells;
}
// Extremos escuadrados: cada par de legs que se une acaba a la misma altura y un radio de giro FUERA del área.
// Así cada vuelta son dos giros de 90° (nunca ángulos agudos) y el leg llega entero al borde antes de girar.
function squareEnds(seq, sw, ext) {
  const U = q => { const [x, y] = sw.f.fw(q); return x * sw.d[0] + y * sw.d[1]; };
  const shift = (q, du) => { const [x, y] = sw.f.fw(q); return sw.f.bw([x + sw.d[0] * du, y + sw.d[1] * du]); };
  const side = j => Math.sign(U(seq[j + 1].pos) - U(seq[j].pos)) || 1; // sentido del leg que empieza en seq[j]
  seq[0].pos = shift(seq[0].pos, -side(0) * ext); // entrada (run-in)
  const last = seq.length - 2;
  seq[last + 1].pos = shift(seq[last + 1].pos, side(last) * ext); // salida (run-out)
  for (let j = 0; j + 2 < seq.length; j += 2) {
    const sj = side(j), E = seq[j + 1], S = seq[j + 2];
    const u = sj > 0 ? Math.max(U(E.pos), U(S.pos)) + ext : Math.min(U(E.pos), U(S.pos)) - ext;
    E.pos = shift(E.pos, u - U(E.pos));
    S.pos = shift(S.pos, u - U(S.pos));
  }
}
// Ruta completa para un rumbo de legs: celdas en orden (siempre a la más cercana), cada una en peine
// empezando por su extremo más próximo. Nombres A1_1, A1_2... (celda A), B1_1... (celda B).
function areaRoute(poly, p, legBrg) {
  const sw = areaSweep(poly, p.sp, legBrg), cells = areaCells(sw, 2 * p.sp + 2 * p.radius), left = cells.map((c, i) => i), out = [];
  let pos = p.from || poly[0], letter = 0;
  while (left.length) {
    let best = null;
    for (const ci of left)
      for (const rev of [false, true])
        for (const flip of [false, true]) {
          const legs = (rev ? cells[ci].slice().reverse() : cells[ci]).map(s => {
            const a = sw.toLL(s.u1, s.v), b = sw.toLL(s.u2, s.v);
            return flip ? [b, a] : [a, b];
          });
          const dd = dist(pos, legs[0][0]);
          if (!best || dd < best.dd) best = { ci, legs, dd };
        }
    left.splice(left.indexOf(best.ci), 1);
    const seq = orderLegs(best.legs, p, String.fromCharCode(65 + (letter++ % 26)));
    squareEnds(seq, sw, p.radius);
    // Giro al pasar de una celda a otra (o desde la salida): que el GTN no se coma el final ni el principio de los legs
    if (out.length) out[out.length - 1].pos = easeTurn(out[out.length - 2].pos, out[out.length - 1].pos, seq[0].pos, p.radius);
    seq[0].pos = easeTurn(seq[1].pos, seq[0].pos, out.length ? out[out.length - 1].pos : pos, p.radius);
    out.push(...seq);
    pos = seq[seq.length - 1].pos;
  }
  out.cells = cells.length;
  return out;
}
// Mejor rumbo (0-179°): el de menos TIEMPO volando la ruta real (celdas, entrelazado, extremos fuera del área)
// con el viento; cada vuelta entre legs suma medio círculo de giro. Si auto=false usa p.hdg.
// Con p.windAlign y viento, los legs van a favor/en contra del viento (fotos sin deriva lateral).
function bestAreaRoute(poly, p) {
  const wind = p.wind || {}, v = Math.max(1, p.tas || 120) * 0.514444;
  const angles = !p.auto ? [p.hdg] : p.windAlign && wind.kt > 0 ? [((wind.dir % 180) + 180) % 180] : [...Array(180).keys()];
  let best = null;
  for (const a of angles) {
    const out = areaRoute(poly, p, a);
    if (!out.length) continue;
    const c = pathTime(out.map(w => w.pos), p.tas || 120, wind) + (out.length / 2 - 1) * Math.PI * p.radius / v;
    if (!best || c < best.c) best = { brg: a, out, c };
  }
  return best;
}
// Divide el plan en vuelos de como mucho maxPts waypoints (el GTN750 admite 100 contando salida y llegada),
// cortando siempre al empezar un leg (nunca entre su _1 y su _2) y repartiendo por igual.
function splitPlan(w, maxPts = 98) {
  if (w.length <= maxPts) return [w];
  // Probar con n vuelos (empezando por el mínimo): cortes repartidos por igual y llevados al inicio de leg más cercano
  for (let n = Math.ceil(w.length / maxPts); n <= w.length; n++) {
    const cuts = [0];
    for (let k = 1; k < n; k++) {
      let c = Math.round(w.length * k / n);
      for (let d = 0; d < 4; d++) { // buscar un inicio de leg (…_1) a ±3 posiciones
        if (/_1$/.test(w[c - d]?.name) && c - d > cuts[cuts.length - 1]) { c -= d; break; }
        if (/_1$/.test(w[c + d]?.name)) { c += d; break; }
      }
      cuts.push(c);
    }
    cuts.push(w.length);
    const parts = cuts.slice(1).map((c, i) => w.slice(cuts[i], c));
    if (parts.every(pt => pt.length && pt.length <= maxPts)) return parts;
  }
  return [w];
}

// Velocidad sobre el suelo (m/s) siguiendo la derrota trk con TAS (kt) y viento que VIENE de wdir (°) a wkt (kt)
function groundSpeed(tasKt, trk, wdir = 0, wkt = 0) {
  const v = tasKt * 0.514444, w = wkt * 0.514444, rel = (wdir - trk) * RAD;
  const cross = w * Math.sin(rel), head = w * Math.cos(rel);
  return Math.max(v * 0.1, Math.sqrt(Math.max(0, v * v - cross * cross)) - head);
}
// Tiempo (s) de volar una lista de puntos en línea recta con ese viento
function pathTime(pts, tasKt, wind = {}) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]) / groundSpeed(tasKt, brg(pts[i - 1], pts[i]), wind.dir, wind.kt);
  return t;
}

// Legs paralelos: legBrg = rumbo del leg, stepBrg = hacia dónde se desplaza el siguiente
function parallelLegs(p, n, legBrg, stepBrg) {
  const legs = [];
  for (let k = 0; k < n; k++) {
    const a = proj(p.csp, stepBrg, k * p.sp);
    legs.push([a, proj(a, legBrg, p.len)]);
  }
  return orderLegs(legs, p);
}
// Orden de vuelo (entrelazado) y sentido alterno de una lista de legs paralelos [inicio, fin]
function orderLegs(legs, p, prefix = '') {
  const n = legs.length;
  let skip = +p.il || 1; // «auto» lo resuelve buildPattern probando saltos
  skip = Math.max(1, Math.min(skip, n));
  const order = [];
  for (let s = 0; s < skip; s++) for (let k = s; k < n; k += skip) order.push(k);
  // Los legs alternan sentido en el orden de vuelo, así cada conexión queda en el mismo lado
  const out = [];
  order.forEach((k, j) => {
    const [a, b] = j % 2 ? [legs[k][1], legs[k][0]] : legs[k];
    out.push({ name: `${prefix}${k + 1}_1`, pos: a, turn: false }, { name: `${prefix}${k + 1}_2`, pos: b, turn: true });
  });
  if (!prefix) out[0].name = 'CSP';
  return out;
}

function sector(csp, hdg, r, t, tag) {
  const v = k => proj(csp, hdg + 60 * k * t, r);
  return [[`${tag}1`, v(0)], [`${tag}2`, v(1)], ['C', csp], [`${tag}3`, v(4)], [`${tag}4`, v(5)],
          ['C', csp], [`${tag}5`, v(2)], [`${tag}6`, v(3)], ['C', csp]];
}

// Distancia que vuela de verdad el GTN750: cada giro anticipado cambia 2·D de recta por un arco r·giro;
// un sobrevuelo suma más o menos media vuelta. Los giros que no caben (fit < 1) penalizan mucho, así sale el que mejor quepa.
function gtnCost(wps, R) {
  const t = gtnTurns(wps, R);
  let c = 0;
  for (let i = 1; i < wps.length; i++) c += dist(wps[i - 1].pos, wps[i].pos);
  for (const x of t) c += x.over ? Math.PI * R : x.r * x.ad * RAD - 2 * x.D + (x.fit < 1 - 1e-6 ? 1e9 * (2 - x.fit) : 0);
  return c;
}
// p: distancias (len, sp, radius) en METROS. Devuelve [{name, pos, turn}] — turn=true donde se aplica la gota
// Entrelazado «auto»: prueba sin entrelazar y todos los saltos, y se queda con el que
// menos distancia vuela el GTN sin giros que no quepan (desde la salida, si se sabe).
function buildPattern(p) {
  if (p.il !== 'auto' || !['PS', 'CS', 'AREA'].includes(p.type)) return buildOne(p);
  // ponytail: saltos hasta 10 (o hasta n); más allá el tránsito entre pasadas ya no compensa
  const top = p.type === 'AREA' ? 10 : Math.min(10, p.n);
  const skips = [...Array(top).keys()].map(k => String(k + 1));
  let best = null;
  for (const il of skips) {
    const w = buildOne({ ...p, il });
    const c = gtnCost(p.from ? [{ pos: p.from }, ...w] : w, p.radius);
    if (!best || c < best.c) best = { w, c, il };
  }
  best.w.il = best.il;
  return best.w;
}
function buildOne(p) {
  const t = p.dir, csp = p.csp;
  let out = [];
  if (p.type === 'AREA') {
    const poly = p.area && p.area.length >= 3 ? p.area
      : [0, 90, 180, 270].map(b => proj(csp, b + 45, 1.5 * Math.SQRT2 * NM)); // sin área dibujada: cuadrado de 3 NM en el CSP
    const best = bestAreaRoute(poly, p);
    out = best.out;
    out.areaCells = best.out.cells;
    out.areaBrg = best.brg;
  } else if (p.type === 'PS') {
    out = parallelLegs(p, p.n, p.hdg, p.hdg + 90 * t);
    // Cuadrícula cruzada: mismo rectángulo barrido otra vez con legs perpendiculares
    if (p.xh) {
      // 2ª pasada desde la esquina del rectángulo más cercana a donde acaba la 1ª, cruzando hacia el lado opuesto
      const wid = (p.n - 1) * p.sp, end = out[out.length - 1].pos;
      const corners = [[0, 0], [p.len, 0], [p.len, wid], [0, wid]]
        .map(([a, c]) => ({ a, c, pos: proj(proj(csp, p.hdg, a), p.hdg + 90 * t, c) }));
      // Elegir esquina: la más cercana que no obligue a darse la vuelta (llegar y salir en sentidos opuestos)
      const legOf = cn => p.hdg + 90 * t * (cn.c ? -1 : 1), tol = Math.min(p.sp, p.len) / 4;
      const ab = brg(out[out.length - 2].pos, end), turnAng = (x, y) => Math.abs(((y - x + 540) % 360) - 180);
      const evalCorner = cn => {
        const d = dist(cn.pos, end), tb = d > tol ? brg(end, cn.pos) : ab;
        const revA = d > tol && turnAng(ab, tb) > 135, revB = turnAng(tb, legOf(cn)) > 135;
        return { cn, d, tb, revA, revB, cost: d + (revA ? 1e6 : 0) + (revB ? 1e6 : 0) };
      };
      const e = corners.map(evalCorner).reduce((b, c) => (c.cost < b.cost ? c : b));
      const k = e.cn, legBrg = legOf(k), stepBrg = p.hdg + (k.a ? 180 : 0);
      const x = parallelLegs({ ...p, csp: k.pos, len: wid }, Math.min(MAX_LEGS, Math.floor(p.len / p.sp + 1e-6) + 1), legBrg, stepBrg)
        .map((w, i) => ({ ...w, name: 'X' + (i ? w.name : '0_1'), turn: true }));
      // Si no hay forma de evitar el giro de 180°, se añade una gota (sobrevuelo + vuelta) para que sea volable
      const tear = (pos, b, name) => ({ name, pos: proj(pos, b, p.radius), turn: false, ext: true });
      if (e.revA) { out[out.length - 1].turn = false; out.push(tear(end, ab, 'XE')); }
      const xs = e.d < tol ? x.slice(1) : x; // misma esquina: no repetir el punto
      if (e.revB) { const at = e.d < tol ? out[out.length - 1] : xs[0]; at.turn = false;
        if (e.d < tol) out.push(tear(end, ab, 'XC')); else xs.splice(1, 0, tear(k.pos, e.tb, 'XC')); }
      out = out.concat(xs);
    }
  }
  else if (p.type === 'CS') out = parallelLegs(p, p.n, p.hdg + 90 * t, p.hdg);
  else if (p.type === 'TSN') out = parallelLegs({ ...p, il: '1' }, 1, p.hdg, 0);
  else if (p.type === 'TSR') out = parallelLegs({ ...p, il: '1' }, 2, p.hdg, p.hdg + 90 * t);
  else if (p.type === 'SS' || p.type === 'SSI') {
    let pos = csp, h = p.hdg;
    out.push({ name: 'CSP', pos, turn: false });
    for (let i = 0; i < p.n; i++) {
      pos = proj(pos, h, p.sp * (Math.floor(i / 2) + 1));
      out.push({ name: `S${i + 1}`, pos, turn: true });
      h += 90 * t;
    }
  } else if (p.type === 'VS') { // 3 triángulos equiláteros, 120° de giro, todos pasan por el CSP
    let seq = [['C', csp], ...sector(csp, p.hdg, p.len, t, 'V')];
    if (p.vs2) seq = seq.concat(sector(csp, p.hdg + 30 * t, p.len, t, 'W'));
    let c = 0;
    out = seq.map(([name, pos]) => ({ name: name === 'C' ? (c++ ? `CSP${c}` : 'CSP') : name, pos, turn: true }));
  } else if (p.type === 'BP') { // circuito cerrado sobre la línea barrera, repetido n veces
    const a = csp, b = proj(a, p.hdg, p.len), b2 = proj(b, p.hdg + 90 * t, p.sp), a2 = proj(a, p.hdg + 90 * t, p.sp);
    out.push({ name: 'CSP', pos: a, turn: false });
    for (let i = 1; i <= p.n; i++)
      out.push({ name: `B${i}_1`, pos: b, turn: true }, { name: `B${i}_2`, pos: b2, turn: true },
               { name: `B${i}_3`, pos: a2, turn: true }, { name: `B${i}_4`, pos: a, turn: true });
  } else if (p.type === 'OR') { // círculo de radio len alrededor del CSP, 12 puntos por vuelta
    for (let i = 0; i <= 12 * p.n; i++)
      out.push({ name: `O${i + 1}`, pos: proj(csp, p.hdg + 30 * i * t, p.len), turn: false });
  } else if (p.type === 'SPI') { // espiral de Arquímedes: cada vuelta se separa S de la anterior, un punto cada 30°
    out.push({ name: 'CSP', pos: csp, turn: false });
    for (let i = 12; i <= 12 * (p.n + 1); i++) // desde una vuelta (radio S): más cerca del centro no se puede girar
      out.push({ name: `P${i - 11}`, pos: proj(csp, p.hdg + 30 * i * t, p.sp * i / 12), turn: false });
  } else if (p.type === 'F8') { // ocho: dos círculos de radio len que se cruzan sobre el CSP, 12 puntos por círculo
    for (let r = 0; r < p.n; r++)
      for (const s of [1, -1]) {
        const c = proj(csp, p.hdg + 90 * t * s, p.len);
        for (let i = 0; i < 12; i++) out.push({ name: `E${out.length + 1}`, pos: proj(c, p.hdg - 90 * t * s + 30 * i * t * s, p.len), turn: false });
      }
    out.push({ name: 'CSP', pos: csp, turn: false });
    out[0].name = 'CSP0';
  } else if (p.type === 'TRI') { // triángulo de deriva: legs perpendiculares al eje, cada uno más ancho; el último mide len
    out.push({ name: 'CSP', pos: csp, turn: false });
    for (let k = 1; k <= p.n; k++) {
      const c = proj(csp, p.hdg, k * p.sp), half = k * p.len / p.n / 2, side = (k % 2 ? 1 : -1) * t;
      out.push({ name: `T${k}_1`, pos: proj(c, p.hdg - 90 * side, half), turn: true },
               { name: `T${k}_2`, pos: proj(c, p.hdg + 90 * side, half), turn: true });
    }
  } else if (p.type === 'ZZ') { // legs en diagonal: avanza sp por el eje en cada leg y cruza de un borde al otro (ancho len)
    for (let k = 0; k <= p.n; k++)
      out.push({ name: k ? `Z${k}` : 'CSP', pos: proj(proj(csp, p.hdg, k * p.sp), p.hdg + 90 * t, (k % 2) * p.len), turn: true });
  } else if (p.type === 'CL') { // 4 pétalos de radio len, cada uno sale y vuelve por el CSP (búsqueda de ELT/baliza)
    out.push({ name: 'CSP', pos: csp, turn: false });
    for (let k = 0; k < 4; k++) {
      const b = p.hdg + 90 * k * t;
      out.push({ name: `L${k + 1}A`, pos: proj(csp, b - 20 * t, p.len), turn: true },
               { name: `L${k + 1}B`, pos: proj(csp, b + 20 * t, p.len), turn: true },
               { name: `CSP${k + 2}`, pos: csp, turn: true });
    }
  }
  if (p.type === 'SSI') { // cuadrado convergente: el SS al revés, termina en el CSP
    out = out.reverse().map((w, i, a) => ({ ...w, name: i === a.length - 1 ? 'CSP' : `S${i + 1}` }));
  }
  out[0].turn = false;
  out[out.length - 1].turn = false;
  if (!p.gota || !p.radius) return out;
  const areaBrg = out.areaBrg;
  const res = [];
  out.forEach((w, i) => {
    res.push(w);
    // Solo hay gota si de verdad se gira (el VS pasa recto por el CSP)
    const turnDeg = i > 0 && i < out.length - 1 ? Math.abs((brg(w.pos, out[i + 1].pos) - brg(out[i - 1].pos, w.pos) + 540) % 360 - 180) : 0;
    if (w.turn && turnDeg > 30) res.push({ name: (w.name + 'X').slice(0, 10), pos: proj(w.pos, brg(out[i - 1].pos, w.pos), p.radius), turn: false, ext: true });
  });
  res.areaBrg = areaBrg;
  res.areaCells = out.areaCells;
  return res;
}

function dms(dec, isLat) {
  const h = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  const d = Math.abs(dec), deg = Math.floor(d), mf = (d - deg) * 60, m = Math.floor(mf);
  return `${h}${deg}° ${m}' ${((mf - m) * 60).toFixed(2)}"`;
}
const worldPos = ([lat, lon], alt = 0) => `${dms(lat, true)},${dms(lon, false)},+${alt.toFixed(2).padStart(9, '0')}`;

// Nombre de parking de Little Navmap -> nombre que usa MSFS en DeparturePosition
function msfsParkName(n) {
  if (n === 'P') return 'PARKING';
  if (n === 'G') return 'GATE';
  if (n === 'D') return 'DOCK';
  if (/^G[A-Z]$/.test(n)) return 'GATE_' + n[1];
  if (/^[NESW]{1,2}P$/.test(n)) return n.slice(0, -1) + '_PARKING';
  return 'NONE';
}
// pos: 'R|31' (cabecera) o 'P|P|12' (parking nombre|número)
function departurePosition(pos) {
  if (!pos) return '';
  const [kind, a, b] = pos.split('|');
  if (kind === 'R') return a;
  const nm = msfsParkName(a);
  return `${nm} NONE ${b} ${nm} NONE`;
}

function airportWpt(icao, pos, alt) {
  return [`        <ATCWaypoint id="${icao}">`, '            <ATCWaypointType>Airport</ATCWaypointType>',
    `            <WorldPosition>${worldPos(pos, alt)}</WorldPosition>`, '            <SpeedMaxFP>-1</SpeedMaxFP>',
    '            <ICAO>', `                <ICAOIdent>${icao}</ICAOIdent>`, '            </ICAO>', '        </ATCWaypoint>'];
}

// apt(icao) -> {name, pos, alt} o null
// Pista de un procedimiento ("06L", "24", "ALL") -> RunwayNumberFP / RunwayDesignatorFP del .pln
function runwayFP(rwy) {
  const m = /^(\d{1,2})([LRC]?)$/.exec(rwy || '');
  if (!m) return [];
  const des = { L: 'LEFT', R: 'RIGHT', C: 'CENTER' }[m[2]];
  return [`            <RunwayNumberFP>${+m[1]}</RunwayNumberFP>`, ...(des ? [`            <RunwayDesignatorFP>${des}</RunwayDesignatorFP>`] : [])];
}
// wpts: puntos entre salida y llegada. Cada uno {name, pos} y opcionalmente kind ('Intersection'|'VOR'|'NDB'), region,
// sid / star (nombre del procedimiento) y rwy. Los que no tienen kind van como 'User' (los del patrón).
function buildPln(wpts, { dep, arr, alt, pos, ifr = false }, apt) {
  const D = apt(dep), A = apt(arr);
  const depPos = D ? D.pos : wpts[0].pos, arrPos = A ? A.pos : wpts[wpts.length - 1].pos;
  const depAlt = D ? D.alt : 0, arrAlt = A ? A.alt : 0;
  const title = `${D ? D.name : dep} to ${A ? A.name : arr}`;
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', '', '<SimBase.Document Type="AceXML" version="1,0">',
    '    <Descr>AceXML Document</Descr>', '    <FlightPlan.FlightPlan>',
    `        <Title>${title}</Title>`, `        <FPType>${ifr || wpts.some(w => w.sid || w.star) ? 'IFR' : 'VFR'}</FPType>`, '        <RouteType>Direct</RouteType>', `        <CruisingAlt>${alt.toFixed(3)}</CruisingAlt>`,
    `        <DepartureID>${dep}</DepartureID>`, `        <DepartureLLA>${worldPos(depPos, depAlt)}</DepartureLLA>`,
    `        <DestinationID>${arr}</DestinationID>`, `        <DestinationLLA>${worldPos(arrPos, arrAlt)}</DestinationLLA>`,
    `        <Descr>${title}</Descr>`];
  const dp = departurePosition(pos);
  if (dp) L.push(`        <DeparturePosition>${dp}</DeparturePosition>`);
  L.push(`        <DepartureName>${D ? D.name : dep}</DepartureName>`, `        <DestinationName>${A ? A.name : arr}</DestinationName>`,
    '        <AppVersion>', '            <AppVersionMajor>11</AppVersionMajor>', '            <AppVersionBuild>282174</AppVersionBuild>', '        </AppVersion>');
  L.push(...airportWpt(dep, depPos, depAlt));
  for (const w of wpts) {
    const kind = w.kind || 'User';
    L.push(`        <ATCWaypoint id="${w.name}">`, `            <ATCWaypointType>${kind}</ATCWaypointType>`, `            <WorldPosition>${worldPos(w.pos, w.alt || 0)}</WorldPosition>`);
    if (w.sid) L.push(`            <DepartureFP>${w.sid}</DepartureFP>`, ...runwayFP(w.rwy));
    if (w.star) L.push(`            <ArrivalFP>${w.star}</ArrivalFP>`, ...runwayFP(w.rwy));
    L.push('            <SpeedMaxFP>-1</SpeedMaxFP>');
    if (kind !== 'User') L.push('            <ICAO>', ...(w.region ? [`                <ICAORegion>${w.region}</ICAORegion>`] : []),
      `                <ICAOIdent>${w.name}</ICAOIdent>`, '            </ICAO>');
    L.push('        </ATCWaypoint>');
  }
  L.push(...airportWpt(arr, arrPos, arrAlt)); // siempre: el FMS necesita el destino como último punto
  L.push('    </FlightPlan.FlightPlan>', '</SimBase.Document>', '');
  return L.join('\n');
}

// Tablas SWEEP / SWEEP_VIS / SWEEP_OBJ / SWEEP_SMALL / SWEEP_TINY / SWEEP_SPEED: en data/iamsar.js (se cargan antes que este fichero)

// Interpolación lineal en una tabla x -> y (fuera de rango se queda en el extremo)
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++)
    if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}
// W corregida en NM. sea: 0 calma, 1 moderado, 2 fuerte (tabla H-10). pfd: chaleco (x4 hasta 500 ft). fatigue: x0,9
// W corregida = W sin corregir × tiempo (H-10) × fatiga × velocidad (H-9, solo si se da tas) — apartado H.3.5.2
function sweepWidth({ craft, obj, altFt, visNm, sea = 0, pfd = false, fatigue = false, tas }) {
  if (obj in SWEEP_FIXED) return SWEEP_FIXED[obj] * (fatigue ? 0.9 : 1); // señales: valor fijo de las tablas H-20 a H-24
  const t = SWEEP[craft], alts = Object.keys(t).map(Number).sort((a, b) => a - b);
  const wAt = a => interp(SWEEP_VIS, t[a][obj], visNm);
  let w = interp(alts, alts.map(wAt), altFt);
  const small = SWEEP_SMALL.includes(obj);
  w *= [1, small ? 0.5 : 0.9, small ? 0.25 : 0.9][sea];
  if (pfd && obj === 'Person in Water' && altFt <= 500) w *= 4;
  if (fatigue) w *= 0.9;
  if (tas) w *= interp(SWEEP_SPEED[craft].kt, SWEEP_SPEED[craft].f[SWEEP_SPEED_ROW[obj]], tas);
  return w;
}

// ---------- Deriva: dónde estará el objeto (datum) y qué área buscar (USCG SAR Addendum, apéndice H) ----------
// Vectores en nudos como [norte, este]; dirección = hacia dónde va
const vec = (deg, kt) => [kt * Math.cos(deg * RAD), kt * Math.sin(deg * RAD)];
// Corriente por viento (H.3.1.1, tabla H-1a) con el mismo viento las últimas 48 h: suma de los 8 periodos de 6 h
function windCurrent(lat, wdir, wkt) {
  if (Math.abs(lat) < 2.5) return vec(wdir + 180, 0.05 * wkt);
  const col = Math.min(12, Math.max(0, Math.round(Math.abs(lat) / 5) - 1)); // columna más cercana, sin interpolar
  return WIND_CURRENT_N.reduce(([n, e], [ang, f]) => { const [a, b] = vec(wdir + ang[col], wkt * f[col]); return [n + a, e + b]; }, [0, 0]);
}
// Leeway (H.3.4.1): velocidad según el viento y divergencia a cada lado del viento
function leeway(obj, wkt) {
  const [, , slope, y0, div] = LEEWAY.find(l => l[0] === obj) || LEEWAY[0];
  return { kt: Math.max(0, wkt >= 6 ? slope * wkt + y0 : (slope + y0 / 6) * wkt), div };
}
// Datum tras `hours` horas a la deriva desde lkp. Dos datums (leeway a izquierda y derecha del viento) y su punto medio.
// E = √(X² + Y² + De²) por datum (Y = 0,1 NM: el buscador navega con GPS); De = 0,3 × deriva (regla del IAMSAR vol. II,
// no viene en el addendum). Con dos datums, E total = E + media distancia entre ellos (H.3.7 d). Radio de búsqueda
// R = 1,1 × E total (factor óptimo de la primera búsqueda, H.3.9). Distancias en NM.
function driftDatum({ lkp, hours, wdir = 0, wkt = 0, obj = 'piw', x = 0.1, wc = true, sea = { dir: 0, kt: 0 } }) {
  const c = wc ? windCurrent(lkp[0], wdir, wkt) : [0, 0], s = vec(sea.dir, sea.kt), lw = leeway(obj, wkt);
  const twc = [c[0] + s[0], c[1] + s[1]];
  const at = side => { const l = vec(wdir + 180 + side * lw.div, lw.kt), n = twc[0] + l[0], e = twc[1] + l[1];
    return { pos: proj(lkp, Math.atan2(e, n) / RAD, Math.hypot(n, e) * hours * NM), nm: Math.hypot(n, e) * hours }; };
  const L = at(-1), Rt = at(1), datum = proj(L.pos, brg(L.pos, Rt.pos), dist(L.pos, Rt.pos) / 2);
  const driftNm = (L.nm + Rt.nm) / 2, E = Math.sqrt(x * x + 0.01 + (0.3 * driftNm) ** 2);
  const Etot = E + dist(L.pos, Rt.pos) / NM / 2;
  return { dL: L.pos, dR: Rt.pos, datum, driftNm, driftBrg: driftNm > 0.01 ? brg(lkp, datum) : 0,
    lwKt: lw.kt, div: lw.div, twcKt: Math.hypot(...twc), E: Etot, R: 1.1 * Etot };
}

// ---------- Ruta: puntos intermedios, SID/STAR, rumbo óptimo y plan de vuelo ICAO ----------

// Coordenada en formato ICAO de la casilla 15: 4124N00157E (grados y minutos)
function icaoCoord([lat, lon]) {
  const f = v => { const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60); return m === 60 ? [d + 1, 0] : [d, m]; };
  const [la, lm] = f(lat), [lo, om] = f(lon);
  return `${String(la).padStart(2, '0')}${String(lm).padStart(2, '0')}${lat >= 0 ? 'N' : 'S'}`
    + `${String(lo).padStart(3, '0')}${String(om).padStart(2, '0')}${lon >= 0 ? 'E' : 'W'}`;
}
// Puntos intermedios escritos como texto ("SLL VLA 4124N00157E"): idents de la base de datos (si el nombre se repite,
// el más cercano al punto anterior) o coordenadas ICAO. Devuelve {pts, unknown}.
function resolveVia(text, nav, near) {
  const pts = [], unknown = [];
  let last = near;
  for (const tok of (text || '').toUpperCase().split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])$/.exec(tok);
    if (m) {
      const pos = [(+m[1] + m[2] / 60) * (m[3] === 'S' ? -1 : 1), (+m[4] + m[5] / 60) * (m[6] === 'W' ? -1 : 1)];
      pts.push({ name: tok.slice(0, 10), pos, icao: tok });
    } else if (nav[tok]) {
      const c = nav[tok].reduce((b, x) => (last && dist(last, [x[1], x[2]]) < dist(last, [b[1], b[2]]) ? x : b));
      const kind = c[0] === 'VOR' ? 'VOR' : c[0] === 'NDB' ? 'NDB' : 'Intersection';
      pts.push({ name: tok, pos: [c[1], c[2]], kind, region: c[3], icao: tok, info: c[4] || c[0] });
    } else { unknown.push(tok); continue; }
    last = pts[pts.length - 1].pos;
  }
  return { pts, unknown };
}
// Fixes de una SID o STAR ("AGEN2J 20" -> [{name, pos, kind, region, sid|star, rwy}])
function procPoints(procs, apt, type, key) {
  const legs = procs?.[apt]?.[type]?.[key];
  if (!legs) return [];
  const [name, rwy] = key.split(' ');
  return legs.map(([fix, lat, lon, region]) => ({ name: fix, pos: [lat, lon], kind: 'Intersection', region, icao: fix,
    [type === 'SID' ? 'sid' : 'star']: name, rwy }));
}
// ¿Vale el procedimiento (clave «NOMBRE PISTA») para la pista rwy? «06B» vale para 06L y 06R, «ALL» para todas
function procRwyOk(key, rwy) {
  const r = key.split(' ')[1];
  return !rwy || r === 'ALL' || r === rwy || r === rwy.replace(/[LRC]$/, '') + 'B';
}
// Pista en servicio con ese viento (de dónde viene, °verdaderos): la de más viento de cara. Con menos de 3 kt, ninguna
// (cualquiera vale). magVar: variación magnética del aeropuerto (+E), porque el número de pista es magnético.
function windRunway(rwys, wdir, wkt, magVar = 0) {
  if (!(wkt >= 3) || !rwys.length) return null;
  const head = r => Math.cos(((wdir - (parseInt(r, 10) * 10 + magVar)) * RAD));
  return rwys.reduce((a, b) => (head(b) > head(a) ? b : a));
}
// Mejor SID/STAR para esa pista (null = cualquiera): la que hace más corto el recorrido de a a b pasando por sus fixes
// (SID: aeropuerto → fixes → zona; STAR: zona → fixes → aeropuerto). Devuelve la clave o '' si no hay ninguna.
function bestProc(procs, apt, type, rwy, a, b) {
  let best = '', bc = Infinity;
  for (const [key, legs] of Object.entries(procs?.[apt]?.[type] || {})) {
    if (!procRwyOk(key, rwy) || !legs.length) continue;
    const pts = [a, ...legs.map(([, lat, lon]) => [lat, lon]), b];
    let c = 0;
    for (let i = 1; i < pts.length; i++) c += dist(pts[i - 1], pts[i]);
    if (c < bc) { bc = c; best = key; }
  }
  return best;
}
// Patrones cuyo rumbo es libre (no lo fija la costa, la deriva o una ruta): se puede elegir el más rápido
const AUTO_HDG = ['PS', 'SS', 'SSI', 'VS', 'CL', 'F8', 'OR', 'SPI'];
// Rumbo inicial (de 5 en 5°) que hace más corto el vuelo completo salida → patrón → llegada, con el viento
function bestHeading(p, from, to) {
  let best = null;
  for (let h = 0; h < 360; h += 5) {
    const w = buildPattern({ ...p, hdg: h }).map(x => x.pos);
    const t = pathTime([...(from ? [from] : []), ...w, ...(to ? [to] : [])], p.tas || 120, p.wind);
    if (!best || t < best.t - 1) best = { h, t };
  }
  return best.h;
}
// Nivel de la casilla 15: altitud (A035) por debajo de la altitud de transición, nivel de vuelo (F100) por encima
const icaoLevel = (ft, ta = 6000) => (ft >= ta ? 'F' : 'A') + String(Math.round(ft / 100)).padStart(3, '0');
const icaoSpeed = kt => 'N' + String(Math.round(kt)).padStart(4, '0');
const hhmm = sec => { const m = Math.round(sec / 60); return String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0'); };
// Aeródromos VFR bajo TMA: punto y altitud donde se pasa a IFR al salir (Z) y donde se cancela IFR al llegar (Y).
// LELL (AIP / guía Y-Z de Sabadell): salida VFR, IFR sobre el VOR SLL a 3500 ft; llegada: cancelar IFR antes de SLL (2000 ft).
const VFR_GATES = { LELL: { fix: 'SLL', depFt: 3500, arrFt: 2000 } };
// Plan de vuelo ICAO (casillas 7 a 18), como los que se presentan en VATSIM.
// rules = qué tramos van en IFR: I (todo), V (nada), Y (tránsitos IFR, zona VFR), Z (tránsitos VFR, zona IFR).
// depGate / arrGate: {fix, ft} de VFR_GATES si se sale / llega a un aeródromo VFR con tránsito IFR.
// out / back: tokens de la ruta de ida / vuelta (SID y su último fix, idents, coordenadas); pattern: posiciones del patrón.
// La letra de reglas (I/V/Y/Z) y los cambios «PUNTO/N0150A035 IFR» / «PUNTO VFR» se deducen de cómo se vuela cada tramo.
function buildFplIcao(o) {
  const transitVfr = o.rules === 'V' || o.rules === 'Z', patVfr = o.rules === 'V' || o.rules === 'Y';
  const pat = o.pattern.map(icaoCoord).filter((c, i, a) => c !== a[i - 1]); // resolución de 1': quitar repetidos seguidos
  // Cada punto con cómo se vuela DESPUÉS de él: {vfr, kt, ft}
  const start = { vfr: transitVfr || !!o.depGate, kt: o.cruiseKt, ft: o.cruiseFt };
  const pts = [];
  let cur = start;
  o.out.forEach((tok, i) => {
    if (i === 0 && o.depGate && tok === o.depGate.fix) cur = { vfr: false, kt: o.cruiseKt, ft: o.depGate.ft };
    pts.push({ tok, ...cur });
  });
  pat.forEach((tok, i) => { if (i === 0) cur = { vfr: patVfr, kt: o.patKt, ft: o.patFt }; pts.push({ tok, ...cur }); });
  o.back.forEach((tok, i) => {
    if (i === 0) cur = { vfr: transitVfr, kt: o.cruiseKt, ft: o.cruiseFt };
    if (i === o.back.length - 1 && o.arrGate && tok === o.arrGate.fix) cur = { ...cur, vfr: true };
    pts.push({ tok, ...cur });
  });
  // Escribir la ruta: cambio a IFR = «PUNTO/velocidad+nivel IFR», a VFR = «PUNTO VFR», solo velocidad/nivel = «PUNTO/…»
  const toks = [];
  let prev = start;
  for (const q of pts) {
    if (q.vfr !== prev.vfr) toks.push(q.vfr ? `${q.tok} VFR` : `${q.tok}/${icaoSpeed(q.kt)}${icaoLevel(q.ft)} IFR`, ...(q.vfr ? [] : ['DCT']));
    else if (!q.vfr && (q.kt !== prev.kt || q.ft !== prev.ft)) toks.push(`${q.tok}/${icaoSpeed(q.kt)}${icaoLevel(q.ft)}`);
    else toks.push(q.tok);
    prev = q;
  }
  if (toks[toks.length - 1] === 'DCT') toks.pop();
  const states = [start.vfr, ...pts.map(q => q.vfr)];
  const letter = states.every(v => !v) ? 'I' : states.every(v => v) ? 'V' : start.vfr ? 'Z' : 'Y';
  const route = (o.out.length && o.out[0] === o.sid ? '' : 'DCT ') + toks.join(' ');
  const f18 = [['STS', o.sts], ['PBN', o.pbn], ['NAV', o.nav], ['SUR', o.sur], ['DOF', o.dof], ['REG', o.reg], ['OPR', o.opr], ['RMK', o.rmk]]
    .filter(([, v]) => v).map(([k, v]) => `${k}/${String(v).toUpperCase()}`).join(' ');
  return `(FPL-${o.callsign}-${letter}${o.ftype}\n-${o.actype}/${o.wake}-${o.equip}/${o.surv}\n-${o.dep}${o.eobt}\n`
    + `-${icaoSpeed(start.kt)}${start.vfr ? 'VFR' : icaoLevel(start.ft)} ${route}\n-${o.dest}${hhmm(o.eetSec)}${o.altn ? ' ' + o.altn : ''}\n-${f18 || '0'})`;
}
