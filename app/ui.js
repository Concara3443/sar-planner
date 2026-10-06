// Pantalla del SAR Planner: mapa, panel, avisos, simulación, guardado. Usa las funciones de geo.js.

// ---------- Valores estándar (distancias en NM) ----------
// ponytail: valores orientativos para avión/helicóptero de búsqueda visual a baja cota; ajústalos aquí si usas otros
// Cámara estándar: objetivo de 35 mm (54°), solape lateral 30 %, foto de 6000 px (≈ 24 MP)
const STD_COMMON = { tas: 120, bank: GTN_BANK, alt: 1000, fov: 54, ov: 30, px: 6000 };
const STD = {
  PS:  { len: 10, sp: 1,   n: 6 },
  CS:  { len: 10, sp: 1,   n: 6 },
  ZZ:  { len: 5,  sp: 2,   n: 8 },
  TRI: { len: 6,  sp: 0.5, n: 6 },
  SS:  { sp: 1,   n: 12 },
  VS:  { len: 3 },
  TSR: { len: 20, sp: 1 },
  TSN: { len: 20 },
  BP:  { len: 10, sp: 2,   n: 3 },
  OR:  { len: 1,  n: 2 },
  SSI: { sp: 1,   n: 12 },
  SPI: { sp: 1,   n: 4 },
  CL:  { len: 3 },
  F8:  { len: 1,  n: 2 },
  AREA: { sp: 1 },
};
// Qué campos usa cada patrón y cómo se llaman
const UI = {
  PS:  { len: 'Longitud leg', sp: 'Separación S', n: 'Nº de legs', il: 1, xh: 1, hint: 'Barrido en peine (lawnmower / boustrophedon). Legs paralelos al rumbo; avanza hacia el lado del primer giro. Con cuadrícula cruzada barre el área dos veces (crosshatch).' },
  TRI: { len: 'Ancho del último leg', sp: 'Leg space', n: 'Nº de legs', hdg: 'Rumbo de la deriva (hacia donde va)', hint: 'No está en el manual IAMSAR. Empieza en el datum y avanza a favor de la marea/viento con legs perpendiculares cada vez más anchos: cubre cómo se abre la deriva de un objeto en el agua.' },
  ZZ:  { len: 'Ancho de la franja', sp: 'Avance por leg', n: 'Nº de legs', hdg: 'Rumbo de avance (eje)', hint: 'Como el creeping line pero en triángulo: cada leg cruza en diagonal de un borde al otro mientras avanza por el eje. Sin giros de 180°, así que vale para aviones rápidos. Pon el eje a lo largo de la costa o del tren de olas.' },
  CS:  { len: 'Longitud leg', sp: 'Separación S', n: 'Nº de legs', il: 1, hdg: 'Rumbo de avance (eje)', hint: 'Creeping line ahead (CSA). Legs perpendiculares al eje; avanza a lo largo del rumbo, p. ej. siguiendo una costa o ruta.' },
  SS:  { sp: 'Separación S', n: 'Nº de legs', hint: 'Cuadrado expansivo (box search) desde el CSP: S, S, 2S, 2S, 3S…' },
  VS:  { len: 'Radio', vs2: 1, hint: 'Tres triángulos con giros de 120°, todos pasan por el CSP.' },
  TSR: { len: 'Longitud ruta', sp: 'Separación S', hint: 'Ida por la ruta y vuelta desplazada S.' },
  TSN: { len: 'Longitud ruta', hint: 'Una pasada por la ruta, sin regreso.' },
  BP:  { len: 'Longitud barrera', sp: 'Ancho circuito', n: 'Nº de circuitos', hint: 'Hipódromo (racetrack): circuito cerrado sobre una línea barrera o de vigilancia.' },
  OR:  { len: 'Radio', n: 'Nº de vueltas', hint: 'Órbita (pylon turn) alrededor del CSP, 12 puntos por vuelta. Lo que hace un helicóptero de policía sobre un objetivo.' },
  SSI: { sp: 'Separación S', n: 'Nº de legs', hint: 'Cuadrado que se cierra hacia el CSP: empieza fuera y termina sobre el datum. Útil si llegas desde lejos.' },
  SPI: { sp: 'Separación entre vueltas', n: 'Nº de vueltas', hint: 'Espiral continua desde el CSP, sin giros bruscos. Ideal para helicóptero a baja velocidad.' },
  CL:  { len: 'Radio pétalo', hint: 'Cuatro pétalos que pasan por el CSP (ASW / sonoboyas, búsqueda de ELT): cruzas el datum desde cuatro direcciones.' },
  AREA: { sp: 'Separación S', il: 1, area: 1, hdg: 'Rumbo de los legs (° true)', hint: 'Dibuja el área (clic en cada vértice) y calcula el barrido que la cubre en menos tiempo: prueba todos los rumbos y empieza por el lado más cercano a la salida. Para fotografiar, usa «Separación entre legs → Fotografía».' },
  F8:  { len: 'Radio de cada lazo', n: 'Nº de ochos', hint: 'Ocho (figure-8) sobre el CSP: vigilancia ISR de un punto, cruzándolo siempre en la misma dirección y con el objetivo a ambos lados.' },
};
const UNIT_M = { NM: NM, km: 1000, m: 1 };
const UNIT_STEP = { NM: 0.1, km: 0.1, m: 50 };

// ---------- Aeropuertos ----------
const FALLBACK = { LELL: ['Sabadell', 41.520832, 2.105, 468, [], ['13', '31']] };
const DB = typeof AIRPORTS_DB === 'object' && Object.keys(AIRPORTS_DB).length ? AIRPORTS_DB : FALLBACK;
// Viento real descargado (open-meteo) y METAR de la salida
const WX = { key: null, at: 0, data: null, metar: '', metarFor: '', busy: false, timer: 0, err: '' };
const apt = icao => { const a = DB[icao]; return a ? { name: a[0], pos: [a[1], a[2]], alt: a[3], parks: a[4], rwys: a[5] } : null; };

function nearestApt(pos) {
  let best = null;
  for (const [icao, a] of Object.entries(DB)) {
    const d = dist(pos, [a[1], a[2]]);
    if (!best || d < best.d) best = { icao, name: a[0], d };
  }
  return best;
}

const $ = id => document.getElementById(id);
// ---- Bases SAR reales (data/sarbases.js): elegir una pone salida y destino, operador y tipo de vuelo (el avión es el tuyo) ----
const sarOpts = () => SAR_BASES.map((b, i) => ({ ...b, i, u: SAR_UNITS[b.unit] }));
$('sarbase').innerHTML = '<option value="">— ninguna —</option><option value="near">📍 La más cercana a la zona</option>'
  + Object.entries(SAR_UNITS).map(([k, u]) => `<optgroup label="${u.name}">`
    + sarOpts().filter(b => b.unit === k).map(b => `<option value="${b.i}">${b.where} · ${b.icao}</option>`).join('') + '</optgroup>').join('');
function sarBase() {
  const v = $('sarbase').value;
  if (v !== 'near') return sarOpts()[v] || null;
  const c = [+$('lat').value, +$('lon').value];
  return sarOpts().filter(b => DB[b.icao]).reduce((a, b) => (dist(c, apt(b.icao).pos) < dist(c, apt(a.icao).pos) ? b : a));
}
$('sarbase').addEventListener('change', () => {
  const b = sarBase();
  if (b) {
    $('dep').value = $('arr').value = b.icao; fillPositions('');
    $('opr').value = b.u.opr; $('ftype').value = b.u.ftype; $('sts').value = 'SAR';
  }
  update();
});
// Nota bajo el selector: qué hay de verdad en esa base y cómo queda en el FPL
function sarBaseInfo() {
  const b = sarBase();
  $('sarbaseInfo').innerHTML = !b ? '' : `${$('sarbase').value === 'near' ? `<b>${b.where} · ${b.icao}</b> (${showD(dist([+$('lat').value, +$('lon').value], apt(b.icao).pos))}). ` : ''}`
    + `${b.u.note}${b.area ? ` Zona: ${b.area}.` : ''}<br>Aparato real: ${b.u.real}.`
    + ` Radio: ${b.u.radio}. FPL: tipo ${b.u.ftype}, STS/SAR, OPR/${b.u.opr}.`
    // «La más cercana» y se ha movido la zona: ofrecer cambiar (no se cambia sola para no pisar lo que hayas tocado)
    + ($('dep').value.trim().toUpperCase() !== b.icao ? ` <button class="sec small" data-set="dep=${b.icao};arr=${b.icao}">Salir y volver a ${b.icao}</button>` : '');
}
for (const id of ['sarbaseInfo', 'driftInfo']) $(id).addEventListener('click', e => { if (e.target.dataset?.set) applySet(e.target.dataset.set); });
// Cambiar la salida a mano deja de usar una base fija (la nota ya no valdría)
$('dep').addEventListener('change', () => { if (/^\d+$/.test($('sarbase').value) && $('dep').value.trim().toUpperCase() !== sarBase().icao) $('sarbase').value = ''; });
$('apts').innerHTML = Object.entries(DB).map(([k, a]) => `<option value="${k}">${a[0]}</option>`).join('');

const NAVDB = typeof NAV_DB === 'object' && NAV_DB.nav ? NAV_DB : { nav: {}, proc: {} };
// SID de la salida y STAR del destino (de la base de datos de Little Navmap)
// Viento en superficie para elegir pista: el METAR si es de ese aeropuerto; si no, el de los campos de viento
function surfWind(icao) {
  const x = WX.metarFor === icao && /\b(\d{3})(\d{2,3})(?:G\d{2,3})?KT\b/.exec(WX.metar || '');
  return x ? { dir: +x[1], kt: +x[2] } : { dir: +$('wdir').value, kt: +$('wkt').value };
}
// Pista de la ruta: la elegida o, en «Auto», la de más viento de cara (null = cualquiera)
function routeRwy(icao, sel) {
  if (sel) return sel;
  const a = apt(icao), w = surfWind(icao);
  return a ? windRunway(a.rwys, w.dir, w.kt, DB[icao][7] || 0) : null;
}
// Listas de pista, SID y STAR. Las SID/STAR se filtran por la pista; «✨» elige la mejor hacia la zona en update()
function fillProcs(keepSid = $('sid').value, keepStar = $('star').value, keepDep = $('rwyDep').value, keepArr = $('rwyArr').value) {
  const dep = $('dep').value.trim().toUpperCase(), arr = $('arr').value.trim().toUpperCase();
  const setSel = (id, html, keep, fallback = '') => { $(id).innerHTML = html; $(id).value = keep; if ($(id).value !== keep) $(id).value = $(id).querySelector(`[value="${fallback}"]`) ? fallback : ''; };
  for (const [id, icao, keep] of [['rwyDep', dep, keepDep], ['rwyArr', arr, keepArr]]) {
    const r = routeRwy(icao, '');
    setSel(id, `<option value="">Auto${r ? ` (${r} por el viento)` : ' (cualquiera)'}</option>`
      + (apt(icao)?.rwys || []).map(x => `<option value="${x}">${x}</option>`).join(''), keep);
  }
  const opts = (icao, type, rwy, none) => {
    const keys = Object.keys(NAVDB.proc[icao]?.[type] || {});
    const ok = keys.filter(k => procRwyOk(k, rwy)).sort();
    return [`<option value="">${!keys.length ? `— este aeropuerto no tiene ${type} —` : `— sin ${type} (directo) —`}</option>`,
      ...(ok.length ? [`<option value="auto">✨ La mejor hacia la zona</option>`] : []),
      ...ok.map(k => `<option value="${k}">${k.replace(' ', ' · pista ')}</option>`)].join('');
  };
  // Si la SID elegida no vale para la nueva pista, pasa a «la mejor» en vez de quedarse sin ninguna
  setSel('sid', opts(dep, 'SID', routeRwy(dep, $('rwyDep').value)), keepSid, 'auto');
  setSel('star', opts(arr, 'STAR', routeRwy(arr, $('rwyArr').value)), keepStar, 'auto');
}
function fillPositions(keep) {
  const a = apt($('dep').value.trim().toUpperCase());
  const opts = ['<option value="">— Por defecto del sim —</option>'];
  if (a) {
    a.rwys.forEach(r => opts.push(`<option value="R|${r}">Pista ${r}</option>`));
    a.parks.forEach(([n, num, ty]) => opts.push(`<option value="P|${n}|${num}">${msfsParkName(n)} ${num} (${ty})</option>`));
  }
  $('park').innerHTML = opts.join('');
  $('park').value = keep;
  if ($('park').value !== keep) $('park').value = '';
}

// ---------- Estado de los campos ----------
const FIELDS = ['type', 'lat', 'lon', 'hdg', 'unit', 'len', 'sp', 'n', 'dir', 'vs2', 'xh', 'tas', 'bank', 'alt', 'gota', 'wdir', 'wkt', 'walign', 'wreal', 'acft', 'il', 'auto', 'area', 'trail', 'cov', 'spman', 'sobj', 'pfd', 'craft', 'vis', 'sea', 'cf', 'fat', 'fov', 'ov', 'agl', 'px', 'dep', 'park', 'arr', 'fname', 'cruise', 'sid', 'star', 'viaOut', 'viaBack',
  'cs', 'rules', 'ftype', 'eobt', 'altn', 'sts', 'opr', 'equip', 'rmk', 'fplType', 'fplWake', 'sarbase', 'rwyDep', 'rwyArr',
  'endur', 'resv', 'drift', 'lkpLat', 'lkpLon', 'dObj', 'dHours', 'dX', 'dWc', 'dCdir', 'dCkt'];
const DIST = ['len', 'sp', 'spman'];
const DEFAULTS = { type: 'PS', lat: 41.392957, lon: 1.944372, hdg: 45, unit: 'NM', dir: '1', vs2: false, gota: false, acft: 'custom', wdir: 0, wkt: 0, walign: false, wreal: false, il: '1', auto: true, area: '', trail: true, cov: 'sar', spman: '', sobj: 'Raft 6 person', pfd: false, craft: 'plane', vis: 10, sea: '0', cf: '1', fat: false, fov: 54, ov: 30, agl: '', px: 6000, cruise: '', sid: 'auto', star: 'auto', viaOut: '', viaBack: '',
                   cs: 'ECGCM', rules: 'I', ftype: 'X', eobt: '', altn: '', sts: '', opr: '', equip: '', rmk: '', fplType: '', fplWake: '', sarbase: '', rwyDep: '', rwyArr: '',
                   endur: '', resv: 30, drift: false, lkpLat: '', lkpLon: '', dObj: 'piw', dHours: 2, dX: '0.1', dWc: true, dCdir: 0, dCkt: 0,
                   dep: 'LELL', park: '', arr: 'LELL', fname: 'fpl', ...STD_COMMON, ...STD.PS };
const fmt = v => +(+v).toFixed(3);
const unitM = () => UNIT_M[$('unit').value];
const stdOf = f => (STD[$('type').value] || {})[f] ?? STD_COMMON[f];
// Valor estándar en las unidades actuales (para comparar y para rellenar)
const stdShown = f => (stdOf(f) === undefined ? undefined : DIST.includes(f) ? fmt(stdOf(f) * NM / unitM()) : stdOf(f));
const isStd = f => stdShown(f) !== undefined && Math.abs(+$(f).value - stdShown(f)) < 1e-6;

function markStd() {
  for (const f of ['len', 'sp', 'n', 'tas', 'bank', 'alt', 'fov', 'ov', 'px']) $(f).classList.toggle('std', isStd(f));
}

$('dObj').innerHTML = LEEWAY.map(([k, es]) => `<option value="${k}">${es}</option>`).join('');
$('dX').innerHTML = POS_ERROR.map(([es, nm]) => `<option value="${nm}">${es} (${String(nm).replace('.', ',')} NM)</option>`).join('');
$('sobj').innerHTML = SWEEP_OBJ.map(([g, items]) => `<optgroup label="${g}">` + items.map(([k, es]) => `<option value="${k}">${es}</option>`).join('') + '</optgroup>').join('');
let saved = {};
try { saved = JSON.parse(localStorage.getItem('sarPlanner2') || '{}'); } catch {}
for (const f of FIELDS) {
  const v = saved[f] ?? DEFAULTS[f];
  if (['park', 'sid', 'star', 'rwyDep', 'rwyArr'].includes(f)) continue;
  $(f).type === 'checkbox' ? ($(f).checked = v) : ($(f).value = v);
}
fillPositions(saved.park ?? '');
fillProcs(saved.sid ?? DEFAULTS.sid, saved.star ?? DEFAULTS.star, saved.rwyDep ?? '', saved.rwyArr ?? '');

// ---------- Mapa ----------
const map = L.map('map').setView([+$('lat').value, +$('lon').value], 10);
const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Esri World Imagery' }).addTo(map);
const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19 }).addTo(map);
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
const layersCtl = L.control.layers({ 'Satélite': sat, 'Mapa': osm }, { 'Nombres de lugares': labels }).addTo(map);
L.control.scale({ imperial: false, metric: true }).addTo(map);

// Aeropuertos y helipuertos de la base de datos: clic = elegir como salida o destino
const KIND = {
  A: { label: 'Aeropuerto', color: '#00bcd4', r: 5 },
  H: { label: 'Helipuerto', color: '#e040fb', r: 3 },
};
const kindOf = a => KIND[a[6]] || KIND.A;
const aptLayers = { A: L.layerGroup().addTo(map), H: L.layerGroup().addTo(map) };
layersCtl.addOverlay(aptLayers.A, `<span style="color:${KIND.A.color}">●</span> Aeropuertos`);
layersCtl.addOverlay(aptLayers.H, `<span style="color:${KIND.H.color}">●</span> Helipuertos`);
const aptMarkers = {};
const canvas = L.canvas();
for (const [icao, a] of Object.entries(DB)) {
  const k = kindOf(a);
  aptMarkers[icao] = L.circleMarker([a[1], a[2]], { renderer: canvas, radius: k.r, color: '#fff', weight: 1, fillColor: k.color, fillOpacity: .9 })
    .bindTooltip(`${icao} · ${a[0]} (${k.label})`)
    .bindPopup(`<b>${icao}</b> ${a[0]}<br>${k.label} · ${a[3]} ft · ${a[4].length} parkings<br>
      <button class="small" onclick="pickApt('dep','${icao}')">Salida</button> <button class="small" onclick="pickApt('arr','${icao}')">Destino</button>
      <button class="small" onclick="pickApt('both','${icao}')">Ambos</button>`)
    .addTo(aptLayers[a[6] === 'H' ? 'H' : 'A']);
}
function pickApt(which, icao) {
  if (which !== 'arr') { $('dep').value = icao; fillPositions(''); }
  if (which !== 'dep') $('arr').value = icao;
  map.closePopup();
  update();
}
// Resalta salida y destino
function styleApts() {
  const dep = $('dep').value.trim().toUpperCase(), arr = $('arr').value.trim().toUpperCase();
  for (const [icao, m] of Object.entries(aptMarkers)) {
    const sel = icao === dep || icao === arr;
    const k = kindOf(DB[icao]);
    m.setStyle({ radius: sel ? 8 : k.r, fillColor: sel ? '#5fd18b' : k.color, weight: sel ? 2 : 1 });
    if (sel) m.bringToFront();
  }
}

const layer = L.layerGroup().addTo(map);
map.createPane('cover').style.zIndex = 380;
map.createPane('trail').style.zIndex = 390;
const trackLayer = L.layerGroup().addTo(map);
const coverLayer = L.layerGroup().addTo(map);
layersCtl.addOverlay(layer, '<span style="color:#ffd23f">━</span> Plan (waypoints del GTN)');
layersCtl.addOverlay(trackLayer, '<span style="color:#3d8bff">━</span> Trayectoria prevista');
// Nombres de waypoints: capa vacía que solo activa/desactiva las etiquetas por CSS
const labelsToggle = L.layerGroup().addTo(map);
layersCtl.addOverlay(labelsToggle, 'Nombres de waypoints');
map.on('overlayadd overlayremove', e => { if (e.layer === labelsToggle) map.getContainer().classList.toggle('nolabels', e.type === 'overlayremove'); });
layersCtl.addOverlay(coverLayer, '<span style="color:#7fd3ff">▬</span> Franja cubierta');
// La casilla y el botón de capas controlan la misma capa
map.on('overlayadd overlayremove', e => { if (e.layer === trackLayer) $('trail').checked = e.type === 'overlayadd'; });
// Mostrar/ocultar la trayectoria no recalcula nada: solo pone o quita la capa
const syncTrail = () => ($('trail').checked ? map.addLayer(trackLayer) : map.removeLayer(trackLayer));
const icon = c => L.divIcon({ className: '', html: `<div style="width:16px;height:16px;border-radius:50%;background:${c};border:2px solid #fff;box-shadow:0 0 4px #000"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
const arrowIcon = (deg, c) => L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
  html: `<svg width="18" height="18" viewBox="-9 -9 18 18" style="transform:rotate(${deg}deg);filter:drop-shadow(0 0 2px #000)"><path d="M0,-7 L6,6 L0,3 L-6,6 Z" fill="${c}"/></svg>` });
const cspM = L.marker([0, 0], { draggable: true, icon: icon('#e53935'), zIndexOffset: 1000 }).addTo(map).bindTooltip('CSP');
const hdgM = L.marker([0, 0], { draggable: true, icon: icon('#1e88e5'), zIndexOffset: 1000 }).addTo(map).bindTooltip('Rumbo / longitud');

const areaPts = () => { try { return JSON.parse($('area').value || '[]'); } catch { return []; } };
// Radio con el que el GTN750 dibuja los giros: su banco (o el del avión si es menor) a la velocidad sobre el suelo.
// ponytail: GS del peor caso (viento de cola) para todo el patrón; el GTN la recalcula en cada momento
const gtnRadius = (tas, wkt, bank) => turnRadius(tas + wkt, Math.min(bank, GTN_BANK));
function params() {
  const g = f => +$(f).value, u = unitM();
  return { type: $('type').value, csp: [g('lat'), g('lon')], hdg: g('hdg'), len: g('len') * u, sp: g('sp') * u,
           n: Math.min(MAX_LEGS, Math.max(1, Math.round(g('n')))), dir: +$('dir').value, gota: $('gota').checked, vs2: $('vs2').checked, xh: $('xh').checked,
           il: $('il').value, radius: gtnRadius(g('tas'), g('wkt'), g('bank')), auto: $('auto').checked, area: areaPts(),
           tas: g('tas'), wind: { dir: g('wdir'), kt: g('wkt') }, windAlign: $('walign').checked,
           from: apt($('dep').value.trim().toUpperCase())?.pos };
}
// Punto azul = final del primer leg: desfase de rumbo y campo de distancia que controla
// Punto azul. Normal: final del primer leg (fija rumbo y una distancia).
// TRI: esquina de la base del triángulo (gira y escala todo el triángulo manteniendo su forma).
function handleOf(p) {
  if (p.type === 'TRI') {
    const along = p.n * p.sp, half = p.len / 2, side = (p.n % 2 ? 1 : -1) * p.dir;
    return { off: Math.atan2(half, along) / RAD * side, d: Math.hypot(along, half), scale: ['sp', 'len'] };
  }
  const key = ['SS', 'SSI', 'SPI', 'ZZ'].includes(p.type) ? 'sp' : 'len';
  return { off: p.type === 'CS' ? 90 * p.dir : 0, d: p[key], key };
}
const showD = m => `${(m / unitM()).toLocaleString('es', { maximumFractionDigits: $('unit').value === 'm' ? 0 : 1 })} ${$('unit').value}`;

let wpts = [], lastReds = 0, flight = null, lastTimes = {};
// Plan actual: vuelos de la división, el que se ve (k), la ruta de ida/vuelta y el patrón completo
const plan = { parts: [], k: 0, pre: [], post: [], all: [] };
// Sobrevuelo: desde W (rumbo b1) gira con radio r hacia el lado sgn hasta apuntar a B (o pasarse), en pasos de 10°
function flyOverArc(W, b1, B, sgn, r) {
  const C = proj(W, b1 + 90 * sgn, r), pts = [];
  for (let k = 1; k <= 36; k++) {
    const h = b1 + sgn * 10 * k, q = proj(C, h - 90 * sgn, r);
    pts.push(q);
    const need = ((brg(q, B) - h + 540) % 360) - 180;
    if (Math.abs(need) < 10 || Math.sign(need) !== sgn) break;
  }
  return pts;
}
// Separación entre legs calculada: fotografía (franja según altura) o SAR visual (S = W / C). null = manual
function coverage() {
  const mode = $('cov').value;
  if (mode === 'cam') {
    const aglM = (+$('agl').value || +$('alt').value) * 0.3048;
    const swath = 2 * aglM * Math.tan(+$('fov').value / 2 * RAD), s = swath * (1 - +$('ov').value / 100);
    const gsd = swath / (+$('px').value || 6000) * 100;
    return { swath, s, info: `A ${Math.round(aglM / 0.3048)} ft la cámara cubre <b>${showD(swath)}</b> (${Math.round(swath)} m) con <b>${gsd < 10 ? gsd.toFixed(1).replace('.', ',') : Math.round(gsd)} cm/px</b>. Con ${$('ov').value}% de solape → S = <b>${showD(s)}</b>.` };
  }
  if (mode === 'sar') {
    const altFt = +$('alt').value, c = +$('cf').value || 1, obj = $('sobj').value;
    const w = sweepWidth({ craft: $('craft').value, obj, altFt, visNm: +$('vis').value || 10, sea: +$('sea').value,
                           pfd: $('pfd').checked, fatigue: $('fat').checked, tas: +$('tas').value }) * NM;
    const pod = Math.round((1 - Math.exp(-c)) * 100), name = $('sobj').selectedOptions[0]?.text || obj;
    let info = `${name} desde ${$('craft').value === 'heli' ? 'helicóptero' : 'avión'} a ${altFt} ft con ${$('vis').value} NM de visibilidad: `
      + `lo verías en una franja de <b>${showD(w)}</b>. Para un ${pod} % de encontrarlo → S = <b>${showD(w / c)}</b>.`;
    if (SWEEP_TINY.includes(obj) && altFt > 1000) info += ' <span style="color:var(--warn)">El manual desaconseja buscar objetos pequeños por encima de 1000 ft.</span>';
    if (w < 0.15 * NM) info += ' <span style="color:var(--warn)">Objeto casi invisible: hace falta pasar muy cerca, '
      + ($('craft').value === 'plane' ? 'mejor en helicóptero y despacio.' : 'vuela bajo y despacio.')
      + (obj === 'Person in Water' && !$('pfd').checked && altFt <= 500 ? ' Si lleva chaleco se ve 4 veces mejor.' : '') + '</span>';
    return { swath: w, s: w / c, info };
  }
  return null;
}

// Deriva: datum al llegar a la zona (lo perdido + el tránsito hasta allí), dibujo en el mapa y botones para usarlo
function driftView(D, p) {
  $('driftBox').style.display = $('drift').checked ? '' : 'none';
  const lkp = [+$('lkpLat').value, +$('lkpLon').value];
  if (!$('drift').checked) return;
  if (!$('lkpLat').value || !$('lkpLon').value) { $('driftInfo').innerHTML = 'Pon la última posición conocida (o pulsa 📍 para usar el CSP).'; return; }
  const kt = (PROFILES[$('acft').value] || PROFILES.custom).cruise || p.tas || 120;
  const tr = D ? dist(D.pos, lkp) / NM / kt : 0, hours = Math.max(0, +$('dHours').value) + tr;
  const d = driftDatum({ lkp, hours, wdir: p.wind.dir, wkt: p.wind.kt, obj: $('dObj').value, x: +$('dX').value, wc: $('dWc').checked,
    sea: { dir: +$('dCdir').value, kt: +$('dCkt').value } });
  const R = d.R * NM, sq = [45, 135, 225, 315].map(b => proj(d.datum, d.driftBrg + b, R * Math.SQRT2));
  const opt = { color: '#4dd0e1', weight: 2, interactive: false };
  L.circleMarker(lkp, { radius: 5, color: '#fff', weight: 2, fillColor: '#4dd0e1', fillOpacity: 1 }).bindTooltip('Última posición conocida').addTo(layer);
  for (const q of [d.dL, d.dR]) L.polyline([lkp, q], { ...opt, dashArray: '4 4' }).addTo(layer);
  L.circleMarker(d.datum, { radius: 6, color: '#111', weight: 1, fillColor: '#4dd0e1', fillOpacity: 1 }).bindTooltip(`Datum (dentro de ${(hours).toFixed(1).replace('.', ',')} h)`).addTo(layer);
  L.circle(d.datum, { ...opt, radius: d.E * NM, dashArray: '2 6' }).addTo(layer);
  L.polygon(sq, { ...opt, fill: false, dashArray: '8 6' }).addTo(layer);
  const f = v => v.toFixed(1).replace('.', ',');
  $('driftInfo').innerHTML = `Cuando llegues habrán pasado <b>${f(hours)} h</b> (${f(+$('dHours').value)} perdido + ${f(tr)} de tránsito). `
    + `El objeto habrá derivado <b>${f(d.driftNm)} NM hacia el ${String(Math.round(d.driftBrg)).padStart(3, '0')}°</b> `
    + `(leeway ${d.lwKt.toFixed(2).replace('.', ',')} kt ±${d.div}° del viento, corriente ${d.twcKt.toFixed(2).replace('.', ',')} kt). `
    + `Error probable ${f(d.E)} NM (círculo) → buscar un cuadrado de <b>${f(2 * d.R)} × ${f(2 * d.R)} NM</b> (en el mapa).<br>`
    + `<button class="sec small" data-set="lat=${d.datum[0].toFixed(5)};lon=${d.datum[1].toFixed(5)}">Poner el CSP en el datum</button> `
    + `<button class="sec small" data-set="type=AREA;area=${JSON.stringify(sq.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]))}">Buscar en ese cuadrado (área)</button>`
    + (p.wind.kt ? '' : ' <span style="color:var(--warn)">Sin viento no hay leeway: pon el viento en «Avión y vuelo».</span>');
}
$('lkpCsp').onclick = () => { $('lkpLat').value = $('lat').value; $('lkpLon').value = $('lon').value; update(); };
function update() {
  fillProcs(); // salida/destino pueden cambiar por código (base SAR, botones, mapa): listas de SID/STAR al día
  layer.clearLayers(); trackLayer.clearLayers(); coverLayer.clearLayers();
  windFromCache();
  if (!['man', 'sar', 'cam'].includes($('cov').value)) $('cov').value = 'man';
  $({ man: 'covMan', sar: 'covSar', cam: 'covCam' }[$('cov').value]).checked = true;
  const ph = coverage();
  if (ph && ph.s > 0) $('sp').value = fmt(ph.s / unitM());
  $('sp').classList.toggle('auto', !!ph);
  $('sp').title = ph ? 'Calculada por ' + ($('cov').value === 'sar' ? 'SAR visual (W ÷ C)' : 'la cámara') + '. Si escribes un valor pasas a Manual.' : '';
  $('camBox').style.display = $('cov').value === 'cam' ? '' : 'none';
  $('sarBox').style.display = $('cov').value === 'sar' ? '' : 'none';
  $('pfdL').style.display = $('sobj').value === 'Person in Water' ? '' : 'none';
  const p = params(), ui = UI[p.type];
  $('covInfo').innerHTML = !ph ? 'S se pone a mano en el patrón.' : ui.sp ? ph.info : `Este patrón no usa S, pero la franja azul claro muestra lo que cubres (${showD(ph.swath)} de ancho).`;
  $('typeHint').textContent = ui.hint;
  $('hdgTxt').textContent = ui.hdg || 'Rumbo inicial (° true)';
  for (const f of ['len', 'sp', 'n']) {
    $(f + 'L').style.display = ui[f] ? '' : 'none';
    if (ui[f]) $(f + 'Txt').textContent = ui[f] + (f === 'n' ? '' : ` (${$('unit').value})`);
  }
  for (const f of ['len', 'sp']) $(f).step = UNIT_STEP[$('unit').value];
  $('ilL').style.display = ui.il ? '' : 'none';
  $('areaBox').style.display = ui.area ? '' : 'none';
  $('cspRow').style.display = $('dirL').style.display = ui.area ? 'none' : ''; // en AREA mandan los vértices
  const autoable = !!ui.area || AUTO_HDG.includes(p.type);
  $('autoL').style.display = autoable ? '' : 'none';
  $('hdg').disabled = autoable && $('auto').checked;
  $('vs2L').style.display = ui.vs2 ? '' : 'none';
  $('xhL').style.display = ui.xh ? '' : 'none';
  markStd();

  const dep = $('dep').value.trim().toUpperCase(), arr = $('arr').value.trim().toUpperCase();
  const D = apt(dep), A = apt(arr);
  // Ruta de ida (SID + puntos intermedios) y de vuelta (puntos intermedios + STAR)
  const vOut = resolveVia($('viaOut').value, NAVDB.nav, D?.pos), vBack = resolveVia($('viaBack').value, NAVDB.nav, A?.pos);
  // Aeródromo VFR (p. ej. LELL) con tránsito IFR: se pasa a IFR sobre su punto (SLL a 3500 ft) y se cancela en él al volver (2000 ft)
  const transitIfr = ['I', 'Y'].includes($('rules').value);
  const gate = (g, ft, kind) => { const q = g && resolveVia(g.fix, NAVDB.nav, apt(kind === 'dep' ? dep : arr)?.pos).pts[0]; return q ? [{ ...q, alt: ft, gate: kind }] : []; };
  // SID/STAR: la elegida o, con «✨», la que hace más corto el camino entre el aeropuerto y la zona por la pista en servicio
  const zone = p.type === 'AREA' && p.area.length >= 3 ? p.area.reduce(([a, b], [x, y]) => [a + x / p.area.length, b + y / p.area.length], [0, 0]) : p.csp;
  const procKey = (id, icao, type, rwyId, a, b) => {
    if ($(id).value !== 'auto') return $(id).value;
    const k = a && b ? bestProc(NAVDB.proc, icao, type, routeRwy(icao, $(rwyId).value), a, b) : '';
    $(id).querySelector('[value=auto]').textContent = k ? `✨ La mejor: ${k.replace(' ', ' · pista ')}` : '✨ La mejor hacia la zona';
    return k;
  };
  const sidKey = procKey('sid', dep, 'SID', 'rwyDep', D?.pos, zone), starKey = procKey('star', arr, 'STAR', 'rwyArr', zone, A?.pos);
  const gD = transitIfr && !sidKey ? VFR_GATES[dep] : null, gA = transitIfr && !starKey ? VFR_GATES[arr] : null;
  const viaOut = vOut.pts.filter((q, i) => !(gD && i === 0 && q.name === gD.fix));
  const viaBack = vBack.pts.filter((q, i, a) => !(gA && i === a.length - 1 && q.name === gA.fix));
  const pre = [...procPoints(NAVDB.proc, dep, 'SID', sidKey), ...(gD ? gate(gD, gD.depFt, 'dep') : []), ...viaOut];
  const post = [...viaBack, ...(gA ? gate(gA, gA.arrFt, 'arr') : []), ...procPoints(NAVDB.proc, arr, 'STAR', starKey)];
  const from = pre.length ? pre[pre.length - 1].pos : D?.pos, to = post.length ? post[0].pos : A?.pos;
  p.from = from;
  // Rumbo automático: el que hace más corto el vuelo completo (en el área lo elige su propio cálculo)
  if (AUTO_HDG.includes(p.type) && $('auto').checked) $('hdg').value = p.hdg = bestHeading(p, from, to);
  const allW = buildPattern(p);
  // Qué ha elegido «Auto»
  $('il').querySelector('[value=auto]').textContent = allW.il ? `Auto (${allW.il === '1' ? 'sin entrelazar' : 'salto ' + allW.il})` : 'Auto';
  // El GTN750 admite 100 waypoints por plan: si no cabe, se divide en vuelos (cortando al empezar un leg)
  plan.parts = splitPlan(allW, Math.max(10, 98 - pre.length - post.length));
  const nParts = plan.parts.length;
  const k = Math.min(nParts - 1, +$('part').value || 0);
  $('part').innerHTML = plan.parts.map((x, i) => `<option value="${i}">${i + 1} de ${nParts} (${x.length} waypoints)</option>`).join('');
  $('part').value = k;
  $('partBox').classList.toggle('on', nParts > 1);
  wpts = plan.parts[k];
  Object.assign(plan, { pre, post, k, all: allW });
  const route = wpts.map(w => w.pos);
  // Los otros vuelos de la división, en gris
  plan.parts.forEach((x, i) => { if (i !== k) L.polyline(x.map(w => w.pos), { color: '#9aa3ad', weight: 1.5, dashArray: '2 6', interactive: false }).addTo(layer); });
  // Fixes de la ruta (SID, STAR, puntos intermedios)
  for (const q of [...pre, ...post]) L.circleMarker(q.pos, { radius: 4, color: '#111', weight: 1, fillColor: '#c9a7ff', fillOpacity: 1 })
    .bindTooltip(q.name + (q.sid ? ` · ${q.sid}` : q.star ? ` · ${q.star}` : ''), { permanent: true, direction: 'right', className: 'wlbl', offset: [4, 0] }).addTo(layer);
  const bad = [...vOut.unknown, ...vBack.unknown];
  $('routeInfo').innerHTML = (pre.length || post.length || bad.length)
    ? [gD && `<span class="via-ok">${dep} es VFR: sales VFR y pasas a IFR sobre ${gD.fix} a ${gD.depFt} ft.</span>`,
       gA && `<span class="via-ok">${arr} es VFR: cancelas IFR antes de ${gA.fix} (crúzalo a ${gA.arrFt} ft).</span>`,
       pre.length && `<span class="via-ok">Ida: ${pre.map(q => q.name).join(' ')}</span>`,
       post.length && `<span class="via-ok">Vuelta: ${post.map(q => q.name).join(' ')}</span>`,
       bad.length && `<span class="via-bad">No encontrado: ${bad.join(' ')} (¿está en tu región? vuelve a exportar los datos)</span>`].filter(Boolean).join('<br>')
    : 'Sin procedimientos ni puntos intermedios: se vuela directo de la salida a la zona y de vuelta.';
  $('depName').textContent = D ? D.name : 'Aeropuerto no encontrado';
  sarBaseInfo();
  $('arrName').textContent = A ? A.name : 'Aeropuerto no encontrado';
  // Plan = lo que se guarda en el GTN: línea amarilla fina punto a punto (tránsitos discontinuos)
  L.polyline([...(D ? [D.pos] : []), ...pre.map(q => q.pos), route[0]], { color: '#ffd23f', weight: 1.5, dashArray: '5 6', opacity: .9 }).addTo(layer);
  L.polyline([route[route.length - 1], ...post.map(q => q.pos), ...(A ? [A.pos] : [])], { color: '#ffd23f', weight: 1.5, dashArray: '5 6', opacity: .9 }).addTo(layer);
  L.polyline(route, { color: '#ffd23f', weight: 1.8 }).addTo(layer);

  // Flechas de sentido a mitad de cada tramo (la primera en verde)
  for (let i = 1; i < route.length; i++) {
    const a = map.latLngToLayerPoint(route[i - 1]), b = map.latLngToLayerPoint(route[i]);
    if (a.distanceTo(b) < 1) continue;
    const deg = Math.atan2(b.x - a.x, a.y - b.y) / RAD;
    const mid = [(route[i - 1][0] + route[i][0]) / 2, (route[i - 1][1] + route[i][1]) / 2];
    L.marker(mid, { icon: arrowIcon(deg, i === 1 ? '#5fd18b' : '#ffd23f'), interactive: false }).addTo(layer);
  }

  wpts.forEach((w, i) => L.circleMarker(w.pos, { radius: w.ext ? 2.5 : 4, color: w.ext ? '#ff8a3d' : '#ffd23f', fillOpacity: 1, weight: 1 })
    .bindTooltip(`${i + 1}·${w.name}`, { permanent: !w.ext && p.type !== 'OR', direction: 'right', className: 'wlbl', offset: [4, 0] }).addTo(layer));
  // Trayectoria prevista (como el rastro de Little Navmap): legs recortados + arco de radio R en cada giro (fly-by).
  // Los giros que no caben (el GTN tiene que cerrarlos más de lo que el avión puede) se marcan en rojo.
  // Recorrido completo: salida → patrón → llegada (los giros al entrar y salir del patrón también se dibujan)
  const R = [...(D ? [{ pos: D.pos }] : []), ...pre, ...wpts, ...post, ...(A ? [{ pos: A.pos }] : [])];
  const i0 = (D ? 1 : 0) + pre.length, i1 = i0 + wpts.length - 1; // primer y último waypoint del patrón dentro de R
  const path = [R[0].pos], reds = [];
  let minFit = 1, patStart = 0, patEnd = 0; // minFit: fracción del radio actual que cabría en el giro más justo
  // Giros como los dibuja el GTN750 (gtnTurns): recorte D = r·tan(giro/2), radio menor si dos giros no caben en un tramo
  const WIDE = 125, tp = gtnTurns(R, p.radius);
  const oranges = [];
  for (let i = 1; i < R.length - 1; i++) {
    if (i === i0) patStart = path.length;
    const A = R[i - 1].pos, W = R[i].pos, B = R[i + 1].pos;
    const b1 = brg(A, W), { ad, sgn, D, r, fit, over } = tp[i];
    if (ad < 1) { path.push(W); if (i === i1) patEnd = path.length - 1; continue; }
    const m = Math.ceil(ad / 10), arc = [];
    if (over) { // sobrevuelo: pasa por el punto, gira hasta apuntar al siguiente y va recto
      arc.push(...flyOverArc(W, b1, B, sgn, p.radius));
      path.push(W, ...arc);
      if (!R[i].ext) oranges.push(L.polyline(arc, { pane: 'trail', color: '#ff9f1c', weight: 5 })
        .bindTooltip(`Giro de ${Math.round(ad)}°: el GTN750 no lo anticipa, hace un viraje de procedimiento (bucle de ${showD(2 * p.radius)}).`));
      if (i === i1) patEnd = path.length - 1;
      continue;
    }
    const C = proj(proj(W, b1 + 180, D), b1 + 90 * sgn, r);
    for (let j = 0; j <= m; j++) arc.push(proj(C, b1 - 90 * sgn + sgn * ad * j / m, r));
    path.push(...arc);
    if (ad > WIDE) { // giro anticipado tan cerrado que el avión pasa lejos del waypoint
      const cut = r / Math.cos(ad / 2 * RAD) - r;
      oranges.push(L.polyline(arc, { pane: 'trail', color: '#ff9f1c', weight: 5 })
        .bindTooltip(`Giro de ${Math.round(ad)}°: el GTN750 empieza a girar ${showD(D)} antes y pasa a ${showD(cut)} del waypoint, sin sobrevolarlo.`));
    }
    if (i === i1) patEnd = path.length - 1;
    if (fit < 1 - 1e-6) {
      minFit = Math.min(minFit, fit);
      reds.push(L.polyline(arc, { pane: 'trail', color: '#ff3b3b', weight: 5 })
        .bindTooltip(`Este giro no cabe: el GTN750 lo dibuja con radio ${showD(r)} en vez de ${showD(p.radius)} y el avión se pasa`));
    }
  }
  path.push(R[R.length - 1].pos);
  if (!A) patEnd = path.length - 1;
  flight = { pts: path, patStart, patEnd };
  L.polyline(path, { pane: 'trail', color: '#0b1a33', weight: 7, opacity: .55, interactive: false }).addTo(trackLayer);
  L.polyline(path, { pane: 'trail', color: '#3d8bff', weight: 4, interactive: false }).addTo(trackLayer);
  oranges.forEach(o => o.addTo(trackLayer));
  reds.forEach(r => r.addTo(trackLayer)); // encima de la línea azul
  lastReds = reds.length;
  // Franja que cubre la cámara a lo largo de cada tramo: los huecos entre franjas son zona sin fotografiar
  if (ph) for (let i = 1; i < wpts.length; i++) {
    const a = wpts[i - 1].pos, b = wpts[i].pos, bb = brg(a, b), w = ph.swath / 2;
    if (dist(a, b) < ph.swath) continue; // tramos cortos de transición entre legs: no se fotografía
    L.polygon([proj(a, bb - 90, w), proj(b, bb - 90, w), proj(b, bb + 90, w), proj(a, bb + 90, w)],
      { pane: 'cover', stroke: false, fillColor: '#7fd3ff', fillOpacity: .18, interactive: false }).addTo(coverLayer);
  }

  driftView(D, p);
  areaShape.setLatLngs(p.type === 'AREA' ? (p.area.length >= 3 ? p.area : []) : []);
  if (p.type === 'AREA') {
    if (allW.areaBrg !== undefined && $('auto').checked) $('hdg').value = Math.round(allW.areaBrg);
    let legLen = 0;
    for (let i = 1; i < allW.length; i++) if (allW[i].name.endsWith('_2') && allW[i - 1].name.endsWith('_1')) legLen += pathTime([allW[i - 1].pos, allW[i].pos], +$('tas').value || 1, p.wind);
    $('areaInfo').innerHTML = p.area.length < 3
      ? 'No hay área: pulsa <b>✏ Dibujar área</b> y haz clic en el mapa en cada vértice (mínimo 3). Ahora se usa un cuadrado de ejemplo.'
      : `Área ${(polyAreaM2(p.area) / 1e6).toFixed(2).replace('.', ',')} km² · ${Math.round(allW.length / 2)} legs a ${Math.round(allW.areaBrg ?? p.hdg)}°${allW.areaCells > 1 ? ` en ${allW.areaCells} zonas` : ''}.`
        + ` Tiempo útil (sobre el área): <b>${Math.round(legLen / 60)} min</b>. Arrastra los vértices para ajustarla.`;
  }
  const h = handleOf(p);
  for (const m of [hdgM, cspM]) p.type === 'AREA' ? map.removeLayer(m) : m.addTo(map); // en AREA no hay CSP ni rumbo que arrastrar
  cspM.setLatLng(p.csp);
  hdgM.setLatLng(proj(p.csp, p.hdg + h.off, h.d));

  // Distancias y tiempos sobre la trayectoria prevista (con giros), con el viento
  const tas = +$('tas').value, wind = p.wind;
  const len = pts => pts.reduce((a, q, i) => (i ? a + dist(pts[i - 1], q) : 0), 0);
  const secs = pts => (tas ? pathTime(pts, tas, wind) : NaN);
  const outP = path.slice(0, patStart + 1), patP = path.slice(patStart, patEnd + 1), backP = path.slice(patEnd);
  const tot = len(patP), transit = len(outP) + len(backP), tPat = secs(patP), tTr = secs(outP) + secs(backP);
  const min = sec => {
    if (!isFinite(sec)) return '—';
    const m = Math.round(sec / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  };
  lastTimes = { pat: tPat, tr: tTr };
  // Autonomía: con la reserva final, ¿llegas, completas el plan y vuelves? Si no, punto de no retorno (PNR):
  // el último punto del recorrido desde el que aún puedes volver directo al destino.
  const endur = +$('endur').value * 60, avail = endur - (+$('resv').value || 0) * 60;
  let fuelRow = null, fuelWarn = '';
  if (endur > 0 && tas) {
    const home = A ? A.pos : path[path.length - 1], back = q => pathTime([q, home], tas, wind);
    let t = 0, pnr = path.length - 1;
    for (let i = 0; i < path.length; i++) {
      if (i) t += pathTime([path[i - 1], path[i]], tas, wind);
      if (t + back(path[i]) > avail) { pnr = i - 1; break; }
    }
    if (tPat + tTr <= avail) fuelRow = ['Autonomía', `te sobran ${min(avail - tPat - tTr)} (en zona hasta ${min(avail - tTr)})`];
    else {
      const q = path[Math.max(0, pnr)], done = pnr <= patStart ? 0 : Math.min(1, len(path.slice(patStart, Math.min(pnr, patEnd) + 1)) / tot);
      L.marker(q, { icon: L.divIcon({ className: '', html: '<div style="font-size:20px;filter:drop-shadow(0 0 2px #000)">⛽</div>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1500 })
        .bindTooltip('Punto de no retorno: desde aquí vuelve al destino').addTo(layer);
      fuelRow = ['Autonomía', `<span style="color:var(--warn)">faltan ${min(tPat + tTr - avail)}</span>`];
      fuelWarn = `<span style="color:var(--warn)">⛽ Con ${$('endur').value} min de autonomía y ${$('resv').value || 0} de reserva no completas el plan: `
        + (pnr < patStart ? 'ni siquiera llegas a la zona y vuelves.' : `vuelve en el ⛽ del mapa (habrás hecho el ${Math.round(done * 100)} % del patrón).`)
        + ' Divide la zona, reposta más cerca o sal de una base más próxima.</span>';
    }
  }
  $('stats').innerHTML = [
    ['Waypoints', wpts.length],
    ['Patrón', `${showD(tot)} · ${min(tPat)}`],
    ['Tránsito', `${showD(transit)} · ${min(tTr)}`],
    ['Total', `${min(tPat + tTr)}` + (wind.kt > 0 ? ` (viento ${String(Math.round(wind.dir)).padStart(3, '0')}°/${wind.kt} kt)` : '')],
    ['Radio de giro (GTN)', `${showD(p.radius)} (${Math.round(p.radius)} m)`],
    ...(fuelRow ? [fuelRow] : []),
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');

  // Avisos con botones de corrección: cada botón lleva data-set="campo=valor;campo=valor"
  const fixBtn = (txt, set) => `<button class="sec small" data-set="${set}">${txt}</button> `;
  // Cómo conseguir la S mínima según el modo: a mano, subiendo la altura (cámara) o bajando C (SAR)
  const sFix = minS => {
    const mode = $('cov').value, sM = minS * unitM();
    if (mode === 'cam') {
      const k = 2 * Math.tan(+$('fov').value / 2 * RAD) * (1 - +$('ov').value / 100);
      const ft = Math.ceil(sM / k / 0.3048 / 100) * 100;
      return $('agl').value ? fixBtn(`Altura AGL ${ft} ft`, `agl=${ft}`) : fixBtn(`Altitud ${ft} ft`, `alt=${ft}`);
    }
    if (mode === 'sar') {
      const w = coverage().swath, c = [1.5, 1, 0.5].find(v => v < +$('cf').value && w / v >= sM);
      return (c ? fixBtn(`Búsqueda menos a fondo (C ${c})`, `cf=${c}`) : '') + ($('craft').value === 'plane' ? fixBtn('Buscar en helicóptero', 'craft=heli') : '');
    }
    return fixBtn(`S = ${minS} ${$('unit').value}`, `sp=${minS}`);
  };
  let warn = '';
  if (['PS', 'CS', 'TSR', 'AREA'].includes(p.type) && (p.il === '1' || p.type === 'TSR') && 2 * p.radius > p.sp) {
    const g = 9.81, bank = +$('bank').value, wkt = p.wind.kt || 0;
    const maxTas = Math.floor(Math.sqrt(g * Math.tan(Math.min(bank, GTN_BANK) * RAD) * p.sp / 2) / 0.514444 - wkt);
    const minBank = Math.ceil(Math.atan(((tas + wkt) * 0.514444) ** 2 / (g * p.sp / 2)) / RAD);
    const minS = fmt(Math.ceil(2 * p.radius / unitM() * 100) / 100);
    const skip = Math.max(2, Math.ceil(2 * p.radius / p.sp));
    warn = `El giro de 180° a ${tas} kt y ${bank}° necesita Ø ${showD(2 * p.radius)}, pero S = ${showD(p.sp)}. Corregir con:<br>`
      + (maxTas >= TAS_MIN ? fixBtn(`TAS ≤ ${maxTas} kt`, `tas=${maxTas}`) : '')
      + (minBank <= GTN_BANK ? fixBtn(`Banco ${minBank}°`, `bank=${minBank}`) : '')
      + sFix(minS)
      + (p.type !== 'TSR' && skip < (p.type === 'AREA' ? wpts.length / 2 : p.n) ? fixBtn(`Entrelazado salto ${skip}`, `il=${Math.min(skip, 4) === skip ? skip : 'auto'}`) : '');
  }
  // Resto de patrones: si algún giro no cabe, cuánto bajar la TAS o subir el banco para que quepan todos
  if (!warn && reds.length) {
    const bank = Math.min(+$('bank').value, GTN_BANK), wkt = p.wind.kt || 0;
    const maxTas = Math.floor((tas + wkt) * Math.sqrt(minFit * 0.99) - wkt);
    const minBank = Math.ceil(Math.atan(Math.tan(bank * RAD) / (minFit * 0.99)) / RAD);
    warn = `${reds.length} giro${reds.length > 1 ? 's no caben' : ' no cabe'} a ${tas} kt y ${bank}° (en rojo en el mapa). Corregir con:<br>`
      + (UI[p.type].il && p.il === '1' ? fixBtn('Entrelazado auto', 'il=auto') : '')
      + (maxTas >= TAS_MIN ? fixBtn(`TAS ≤ ${maxTas} kt`, `tas=${maxTas}`) : '') + (minBank <= GTN_BANK ? fixBtn(`Banco ${minBank}°`, `bank=${minBank}`) : '')
      // Con cámara: subir (menos calidad) separa los legs en proporción a la altura
      + ($('cov').value === 'cam' && !$('agl').value ? fixBtn(`Altitud ${Math.ceil(+$('alt').value / minFit / 100) * 100} ft (menos calidad)`, `alt=${Math.ceil(+$('alt').value / minFit / 100) * 100}`) : '');
    // Agrandar: escalar las distancias que se ponen a mano (solo S, solo longitud o las dos), probándolo de verdad:
    // en un PS los giros dependen de S y alargar los legs no arregla nada. Solo se ofrece si quedan todos dentro.
    const ui2 = UI[p.type], canS = ui2.sp && $('cov').value === 'man';
    const grow = [canS && ['sp'], ui2.len && ['len'], canS && ui2.len && ['len', 'sp']].filter(Boolean).map(fs => {
      let k = 1, fit = minFit;
      for (let it = 0; it < 4 && fit < 1 - 1e-6; it++) {
        k *= Math.ceil(102 / fit) / 100;
        const q = { ...p };
        for (const f of fs) q[f] = p[f] * k;
        fit = Math.min(...gtnTurns(R.slice(0, i0).concat(buildPattern(q), R.slice(i1 + 1)), p.radius).map(x => x.fit));
      }
      return fit >= 1 - 1e-6 && { fs, k };
    }).find(Boolean);
    if (grow) warn += fixBtn(`Agrandar ${grow.fs.length > 1 ? 'patrón' : grow.fs[0] === 'sp' ? 'S' : 'legs'} ×${grow.k.toFixed(2)}`,
      grow.fs.map(f => `${f}=${fmt(+$(f).value * grow.k)}`).join(';'));
  }
  if (fuelWarn) warn += (warn ? '<br>' : '') + fuelWarn;
  if (oranges.length) warn += (warn ? '<br>' : '') + `<span style="color:#ff9f1c">${oranges.length} giro${oranges.length > 1 ? 's' : ''} muy cerrado${oranges.length > 1 ? 's' : ''} (en naranja en el mapa): el avión no pasará exactamente por ese waypoint. Pasa el ratón por encima para ver cuánto.</span>`;
  // El GTN750 real admite 100 waypoints por plan (contando los aeropuertos)
  if (nParts > 1) warn += (warn ? '<br>' : '') + `<span style="color:var(--muted)">El plan completo tiene ${allW.length + pre.length + post.length + 2} waypoints y el GTN750 admite 100: `
    + `lo he dividido en ${nParts} vuelos. Elige cuál ver arriba y guárdalos con «Guardar todos».</span>`;
  for (const [id, a] of [['dep', D], ['arr', A]]) {
    if (a) continue;
    const near = nearestApt(p.csp);
    warn += (warn ? '<br>' : '') + `${id === 'dep' ? 'Salida' : 'Destino'} "${$(id).value}" no está en la base de datos. `
      + (near ? fixBtn(`Usar ${near.icao} (${near.name}, ${showD(near.d)} del CSP)`, `${id}=${near.icao}`) : '');
  }
  $('warn').innerHTML = warn;

  styleApts();
  tlRefresh();
  $('fplOut').value = fplText();
  scheduleWind();
  const st = {};
  for (const f of FIELDS) st[f] = $(f).type === 'checkbox' ? $(f).checked : $(f).value;
  try { localStorage.setItem('sarPlanner2', JSON.stringify(st)); } catch {}
}

// ---------- Viento real: METAR de la salida (VATSIM, real) + viento en ruta a tu altitud (Open-Meteo, por niveles de presión) ----------
const WX_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200];
const wxCenter = () => { const q = wpts.map(w => w.pos); return [q.reduce((a, x) => a + x[0], 0) / q.length, q.reduce((a, x) => a + x[1], 0) / q.length]; };
// Viento (de dónde viene, kt) a una altitud en pies, interpolando entre niveles por componentes
function windAt(altFt) {
  const h = WX.data?.hourly;
  if (!h) return null;
  const now = new Date().toISOString().slice(0, 13), idx = Math.max(0, h.time.findIndex(t => t.startsWith(now)));
  const lv = WX_LEVELS.map(l => ({ z: h[`geopotential_height_${l}hPa`][idx], s: h[`wind_speed_${l}hPa`][idx], d: h[`wind_direction_${l}hPa`][idx] }))
    .filter(x => x.z != null && x.s != null).sort((a, b) => a.z - b.z);
  const z = altFt * 0.3048;
  let i = lv.findIndex(x => x.z >= z);
  if (i <= 0) i = i === 0 ? 1 : lv.length - 1;
  const a = lv[i - 1], b = lv[i], f = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
  const uv = x => [x.s * Math.sin(x.d * RAD), x.s * Math.cos(x.d * RAD)];
  const [ua, va] = uv(a), [ub, vb] = uv(b), u = ua + (ub - ua) * f, v = va + (vb - va) * f;
  return { dir: (Math.atan2(u, v) / RAD + 360) % 360, kt: Math.hypot(u, v), hour: h.time[idx] };
}
const metarWind = m => { const x = /\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/.exec(m); return !x ? '—' : +x[2] === 0 ? 'calma' : `${x[1] === 'VRB' ? 'variable' : x[1] + '°'}/${+x[2]} kt${x[3] ? ' rachas ' + +x[3] : ''}`; };
// Con «Viento real» activo los campos de viento se rellenan solos para la altitud de «Avión y giros»
function windFromCache() {
  const on = $('wreal').checked;
  for (const f of ['wdir', 'wkt']) { $(f).readOnly = on; $(f).classList.toggle('auto', on); }
  if (!on) { $('windInfo').innerHTML = ''; return; }
  const w = windAt(+$('alt').value);
  if (w) { $('wdir').value = Math.round(w.dir / 10) * 10 % 360; $('wkt').value = Math.round(w.kt); }
  $('windInfo').innerHTML = WX.err ? `<span style="color:var(--warn)">${WX.err}</span>`
    : !w ? 'Pidiendo el viento…'
    : `En ruta a ${$('alt').value} ft: <b>${String(Math.round(w.dir / 10) * 10 % 360).padStart(3, '0')}° / ${Math.round(w.kt)} kt</b> (previsión Open-Meteo ${w.hour.slice(11)}Z)`
      + (WX.metar ? `<br>Superficie en ${WX.metarFor}: ${metarWind(WX.metar)} · <span style="font-family:monospace">${WX.metar}</span>` : '');
}
async function fetchWind(force) {
  if (!$('wreal').checked || WX.busy) return;
  const c = wxCenter(), key = `${c[0].toFixed(1)},${c[1].toFixed(1)}`, dep = $('dep').value.trim().toUpperCase();
  const stale = Date.now() - WX.at > 30 * 60e3;
  if (!force && key === WX.key && dep === WX.metarFor && !stale) return;
  WX.busy = true; WX.err = '';
  try {
    if (force || key !== WX.key || stale) {
      const vars = WX_LEVELS.flatMap(l => [`wind_speed_${l}hPa`, `wind_direction_${l}hPa`, `geopotential_height_${l}hPa`]).join(',');
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c[0].toFixed(3)}&longitude=${c[1].toFixed(3)}&hourly=${vars}&wind_speed_unit=kn&forecast_days=2&timezone=UTC`);
      if (!r.ok) throw new Error('Open-Meteo ' + r.status);
      WX.data = await r.json(); WX.key = key; WX.at = Date.now();
    }
    if (dep && (force || dep !== WX.metarFor || stale)) {
      const m = await fetch(`https://metar.vatsim.net/${encodeURIComponent(dep)}`);
      WX.metar = m.ok ? (await m.text()).trim().split('\n')[0] : ''; WX.metarFor = dep;
    }
  } catch (e) { WX.err = 'No se pudo traer el viento (¿sin internet?): ' + e.message; }
  WX.busy = false;
  update();
}
// Tras mover el patrón o cambiar la salida, esperar 1 s quieto antes de pedir datos nuevos
function scheduleWind() { if (!$('wreal').checked) return; clearTimeout(WX.timer); WX.timer = setTimeout(() => fetchWind(false), 1000); }
$('wreal').addEventListener('change', () => { if ($('wreal').checked) fetchWind(true); else update(); });

// ---------- Editor del área: clic para añadir vértices, arrastrar para mover, clic derecho en un vértice para quitarlo ----------
const areaShape = L.polygon([], { color: '#ffffff', weight: 2, dashArray: '8 6', fillColor: '#ffffff', fillOpacity: .07, interactive: false }).addTo(map);
layersCtl.addOverlay(areaShape, '<span style="color:#fff">┅</span> Área dibujada');
const areaHandles = L.layerGroup().addTo(map);
let areaDrawing = false;
const vIcon = L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6],
  html: '<div style="width:12px;height:12px;background:#fff;border:2px solid #111;border-radius:2px;box-shadow:0 0 3px #000"></div>' });
function setArea(pts) { $('area').value = pts.length ? JSON.stringify(pts.map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)])) : ''; }
function drawAreaHandles() {
  areaHandles.clearLayers();
  if ($('type').value !== 'AREA') return;
  areaPts().forEach((pt, i) => {
    L.marker(pt, { icon: vIcon, draggable: true, zIndexOffset: 2000 }).addTo(areaHandles)
      .bindTooltip('Arrastra para mover · clic derecho para quitar')
      .on('drag', e => { const q = areaPts(); q[i] = [e.latlng.lat, e.latlng.lng]; setArea(q); update(); })
      .on('contextmenu', () => { const q = areaPts(); q.splice(i, 1); setArea(q); drawAreaHandles(); update(); });
  });
}
function setDrawing(on) {
  areaDrawing = on;
  $('areaDraw').textContent = on ? '✔ Terminar' : '✏ Dibujar área';
  map.getContainer().style.cursor = on ? 'crosshair' : '';
}
$('areaDraw').onclick = () => { setDrawing(!areaDrawing); update(); }; // si ya hay área, se añaden vértices a ella
$('areaClear').onclick = () => { setArea([]); setDrawing(false); drawAreaHandles(); update(); };
$('type').addEventListener('change', () => { setDrawing(false); drawAreaHandles(); });

function setCsp(ll) { $('lat').value = ll.lat.toFixed(6); $('lon').value = ll.lng.toFixed(6); update(); }
map.on('click', e => {
  if ($('type').value !== 'AREA') return setCsp(e.latlng);
  if (!areaDrawing) return;
  setArea([...areaPts(), [e.latlng.lat, e.latlng.lng]]); drawAreaHandles(); update();
});
map.on('zoomend', update);
cspM.on('drag', e => setCsp(e.target.getLatLng()));
hdgM.on('drag', e => {
  $('auto').checked = false; // lo has elegido tú
  const ll = e.target.getLatLng(), c = [+$('lat').value, +$('lon').value], pt = [ll.lat, ll.lng], h = handleOf(params());
  $('hdg').value = Math.round((brg(c, pt) - h.off + 360) % 360);
  if (h.scale) { const k = dist(c, pt) / h.d; for (const f of h.scale) $(f).value = fmt(+$(f).value * k); }
  else $(h.key).value = fmt(dist(c, pt) / unitM());
  update();
});

// Al cambiar de patrón, los campos que estaban en el estándar pasan al estándar del nuevo patrón
let prevType = $('type').value;
$('type').addEventListener('change', () => {
  const now = $('type').value, wasStd = {};
  $('type').value = prevType;
  for (const f of ['len', 'sp', 'n']) wasStd[f] = isStd(f) || !UI[prevType][f];
  $('type').value = prevType = now;
  for (const f of ['len', 'sp', 'n']) if (wasStd[f] && stdShown(f) !== undefined) $(f).value = stdShown(f);
});
// Cambio de unidades: convierte los valores, no los reinterpreta
let prevUnit = $('unit').value;
$('unit').addEventListener('change', () => {
  for (const f of DIST) $(f).value = fmt(+$(f).value * UNIT_M[prevUnit] / unitM());
  prevUnit = $('unit').value;
});
$('dep').addEventListener('input', () => { fillPositions($('park').value); fillProcs(); });
$('arr').addEventListener('input', () => fillProcs());
$('gsd').addEventListener('change', () => {
  if (!$('gsd').value) return;
  const swath = +$('gsd').value / 100 * (+$('px').value || 6000);
  const ft = Math.round(swath / (2 * Math.tan(+$('fov').value / 2 * RAD)) / 0.3048 / 50) * 50;
  $($('agl').value ? 'agl' : 'alt').value = ft; $('gsd').value = ''; update();
});
function applySet(set) {
  for (const kv of set.split(';')) { const [f, v] = kv.split('='); $(f).value = v; }
  if (set.startsWith('dep=')) fillPositions('');
  if (/(^|;)(type|area)=/.test(set)) drawAreaHandles(); // vértices arrastrables del área nueva
  update();
}
$('warn').addEventListener('click', e => { if (e.target.dataset?.set) applySet(e.target.dataset.set); });
const hasTurnErrors = () => lastReds > 0 || !!document.querySelector('#warn button[data-set^="tas="]');
// Al pasar a SAR/cámara se guarda la S manual; al volver a Manual se recupera (si no, se quedaría la S calculada)
for (const r of document.querySelectorAll('input[name=covR]')) r.addEventListener('change', () => {
  if ($('cov').value === 'man' && r.value !== 'man') $('spman').value = $('sp').value;
  if (r.value === 'man' && +$('spman').value > 0) $('sp').value = $('spman').value;
  $('cov').value = r.value;
  update();
});
// Valores estándar del patrón (mantiene CSP, rumbo, aeropuertos y unidades) y corrige los giros que aún no quepan
function resetRecommended() {
  for (const f of ['len', 'sp', 'n', 'tas', 'bank', 'alt', 'fov', 'ov', 'px']) if (stdShown(f) !== undefined) $(f).value = stdShown(f);
  for (const f of ['gota', 'xh', 'vs2']) $(f).checked = false;
  $('il').value = '1'; $('cov').value = 'man'; $('spman').value = ''; $('trail').checked = true; syncTrail();
  update();
  autoFix(['Agrandar', 'il=', 'tas=']);
}
// Pulsa los botones de corrección por orden de preferencia hasta que todos los giros quepan
function autoFix(prefs) {
  for (let i = 0; i < 8 && hasTurnErrors(); i++) {
    const btns = [...document.querySelectorAll('#warn button[data-set]')];
    const b = prefs.map(k => btns.find(x => x.textContent.startsWith(k) || x.dataset.set.startsWith(k))).find(Boolean);
    if (!b) break;
    applySet(b.dataset.set);
  }
}
// ---------- Generador: velocidad y altitud ideales ----------
// Perfiles orientativos: velocidad mínima cómoda, velocidad de búsqueda visual y crucero (TAS, kt)
// ponytail: cifras orientativas (no de manuales); ajústalas aquí si tu avión vuela distinto
const PROFILES = {
  custom:   { name: 'tu avión', min: 60, search: null, cruise: null, craft: 'plane' },
  c172:     { name: 'Cessna 172', min: 65, search: 90, cruise: 120, craft: 'plane' },
  c208:     { name: 'Grand Caravan', min: 75, search: 110, cruise: 175, craft: 'plane' },
  kodiak:   { name: 'Kodiak 100', min: 70, search: 110, cruise: 170, craft: 'plane' },
  dhc6:     { name: 'Twin Otter', min: 70, search: 110, cruise: 150, craft: 'plane' },
  pc12:     { name: 'PC-12', min: 100, search: 150, cruise: 280, craft: 'plane' },
  aerostar: { name: 'Aerostar 600', min: 110, search: 150, cruise: 220, craft: 'plane' },
  kingair:  { name: 'King Air 350i', min: 110, search: 160, cruise: 300, craft: 'plane' },
  c130:     { name: 'C-130J', min: 140, search: 180, cruise: 320, craft: 'plane' },
  lj35:     { name: 'Learjet 35A', min: 150, search: 220, cruise: 440, craft: 'plane' },
  cj3:      { name: 'Citation CJ3+', min: 140, search: 200, cruise: 410, craft: 'plane' },
  h160:     { name: 'H160', min: 40, search: 90, cruise: 160, craft: 'heli' },
  mh60:     { name: 'MH-60', min: 40, search: 90, cruise: 150, craft: 'heli' },
  ec135:    { name: 'EC135', min: 40, search: 80, cruise: 135, craft: 'heli' },
  h125:     { name: 'H125', min: 40, search: 80, cruise: 130, craft: 'heli' },
  b407:     { name: 'Bell 407', min: 40, search: 80, cruise: 130, craft: 'heli' },
  bo105:    { name: 'Bo 105', min: 40, search: 80, cruise: 120, craft: 'heli' },
  uh1:      { name: 'UH-1H', min: 40, search: 80, cruise: 110, craft: 'heli' },
  r66:      { name: 'R66', min: 35, search: 70, cruise: 110, craft: 'heli' },
};
const SEARCH_ALTS = [300, 500, 750, 1000, 1500, 2000, 2500, 3000];

function computeIdeal() {
  $('auto').checked = true; // rumbo: el más rápido (área o patrón de rumbo libre)
  const prof = PROFILES[$('acft').value] || PROFILES.custom, mode = $('cov').value, why = [];
  const watch = ['alt', 'agl', 'tas', 'bank', 'il', 'craft'], before = Object.fromEntries(watch.map(f => [f, $(f).value]));
  const userTas = +$('tas').value || 120;
  if (prof.craft === 'heli' && mode === 'sar') $('craft').value = 'heli';
  // 1) Altitud
  if (mode === 'sar') {
    const obj = $('sobj').value, small = SWEEP_TINY.includes(obj);
    // Persona en el agua: como mucho 500 ft (por encima el chaleco ya no se ve 4 veces mejor y se busca bajo)
    const alts = SEARCH_ALTS.filter(a => (!small || a <= 1000) && (obj !== 'Person in Water' || a <= 500));
    const w = a => sweepWidth({ craft: $('craft').value, obj, altFt: a, visNm: +$('vis').value || 10, sea: +$('sea').value, pfd: $('pfd').checked, fatigue: $('fat').checked });
    // la más alta de las que ven casi lo máximo (±3 %): misma eficacia, más segura
    const wMax = Math.max(...alts.map(w)), best = Math.max(...alts.filter(a => w(a) >= wMax * 0.97));
    $('alt').value = best;
    why.push(`altitud ${best} ft: donde mejor se ve ese objeto según las tablas IAMSAR${small ? ` (objeto pequeño: máximo ${obj === 'Person in Water' ? 500 : 1000} ft)` : ''}`);
  } else if (mode === 'cam') {
    why.push(`altitud ${$('agl').value || $('alt').value} ft: la que da la calidad elegida (cámbiala en «Calidad deseada»)`);
  } else why.push(`altitud ${$('alt').value} ft: sin cambios (con separación manual la altitud no influye en el patrón)`);
  // 2) Velocidad: la más rápida (hasta el límite del avión) a la que caben los giros; compara con entrelazar
  // Tope: la velocidad de búsqueda/trabajo del avión (buscar o fotografiar a crucero da peores resultados y giros enormes)
  const cap = prof.search ?? userTas;
  const minT = prof.min;
  const tryCfg = (tas, il) => { $('tas').value = tas; $('il').value = il; update(); return { ok: !hasTurnErrors(), t: lastTimes.pat, tas, il }; };
  const fastestFit = il => {
    if (tryCfg(cap, il).ok) return { tas: cap, il };
    if (!tryCfg(minT, il).ok) return null;
    let lo = minT, hi = cap;
    while (hi - lo > 2) { const m = Math.round((lo + hi) / 2); tryCfg(m, il).ok ? (lo = m) : (hi = m); }
    return { tas: lo, il };
  };
  const ilOk = !!UI[$('type').value].il;
  const cands = [fastestFit('1'), ilOk ? fastestFit('auto') : null].filter(Boolean)
    .map(c => ({ ...c, t: tryCfg(c.tas, c.il).t }));
  if (!cands.length) {
    tryCfg(minT, ilOk ? 'auto' : '1');
    if (!hasTurnErrors()) why.push(`velocidad ${minT} kt con ${$('bank').value}° de banco`);
    else
      why.push(`velocidad ${minT} kt (la mínima de ${prof.name}): ni así caben todos los giros; mira el aviso naranja`);
  } else {
    const best = cands.reduce((a, b) => (b.t < a.t - 1 ? b : a));
    tryCfg(best.tas, best.il);
    why.push(`velocidad ${best.tas} kt${best.tas === cap ? ` (${mode === 'sar' ? 'velocidad de búsqueda' : 'crucero'} de ${prof.name})` : ': la más rápida a la que caben los giros'}`
      + (best.il !== '1' ? ' con entrelazado (acaba antes que volando más despacio sin él)' : ''));
  }
  // Mostrarlo en los propios parámetros: campos cambiados en verde y resumen bajo el botón
  for (const f of watch) $(f).classList.toggle('changed', $(f).value !== before[f]);
  if (AUTO_HDG.includes($('type').value) || $('type').value === 'AREA') why.push(`rumbo ${$('hdg').value}°: el que hace más corto el vuelo`);
  $('idealInfo').innerHTML = '✨ ' + why.join('<br>✨ ') + `<br>Patrón: <b>${Math.round(lastTimes.pat / 60)} min</b>.`;
  $('ideal').closest('details').open = true;
  $('msg').innerHTML = '';
}
// Al tocar un campo a mano deja de estar resaltado; si se tocan otros parámetros el resumen deja de valer
for (const f of ['alt', 'agl', 'tas', 'bank', 'il', 'craft']) $(f).addEventListener('input', () => $(f).classList.remove('changed'));
// Otro patrón u otra área: el resumen de ✨ ya no vale
for (const id of ['type', 'area', 'cov']) $(id).addEventListener('change', () => { $('idealInfo').innerHTML = ''; });
$('ideal').onclick = computeIdeal;
// Al elegir avión: su velocidad de búsqueda/crucero como TAS de partida
$('acft').addEventListener('change', () => {
  const prof = PROFILES[$('acft').value];
  // TAS de la zona = velocidad de búsqueda/trabajo del avión (el tránsito va a crucero en el plan ICAO y la hoja de vuelo)
  if (prof.search) { $('tas').value = prof.search; if (prof.craft === 'heli') $('craft').value = 'heli'; update(); }
});
$('reset').onclick = () => {
  $('idealInfo').innerHTML = '';
  for (const f of ['alt', 'agl', 'tas', 'bank', 'il', 'craft']) $(f).classList.remove('changed');
  resetRecommended();
  $('msg').innerHTML = hasTurnErrors() ? '<span style="color:var(--warn)">Valores estándar puestos, pero aún hay giros que no caben.</span>'
                                       : '<span style="color:var(--ok)">Valores recomendados puestos. Todos los giros caben.</span>';
};
// Escribir S a mano con SAR/cámara activos = pasar a Manual con ese valor
$('sp').addEventListener('input', () => { if ($('cov').value !== 'man') { $('cov').value = 'man'; $('spman').value = ''; } });
for (const f of FIELDS) $(f).addEventListener('input', update);
for (const f of FIELDS) $(f).addEventListener('change', update);
$('trail').addEventListener('change', syncTrail);
// Elegir una opción de una lista nunca deja un plan imposible: si algún giro no cabe se corrige solo
// (primero entrelazado, que no toca la velocidad; luego TAS; luego banco) y se dice qué ha cambiado.
// Lo que se escribe a mano se respeta y solo se avisa.
function presetFix() {
  if (!hasTurnErrors()) return;
  const before = { il: $('il').value, tas: $('tas').value, bank: $('bank').value };
  autoFix(['il=', 'Entrelazado', 'tas=', 'bank=']);
  const ch = [];
  if ($('il').value !== before.il) ch.push(`entrelazado ${$('il').value === 'auto' ? 'automático' : 'salto ' + $('il').value}`);
  if ($('tas').value !== before.tas) ch.push(`TAS ${before.tas} → ${$('tas').value} kt`);
  if ($('bank').value !== before.bank) ch.push(`banco ${before.bank}° → ${$('bank').value}°`);
  const still = hasTurnErrors();
  if (ch.length || still) $('msg').innerHTML = `<span style="color:var(--warn)">`
    + (ch.length ? `${still ? 'He cambiado' : 'Para que los giros quepan he cambiado'}: ${ch.join(', ')}. ` : '')
    + (still ? 'Aun así algún giro no cabe: mira las opciones del aviso naranja.' : '') + '</span>';
}
for (const id of ['type', 'gsd', 'sobj', 'craft', 'sea', 'cf', 'fat', 'pfd', 'vis', 'unit', 'acft']) $(id).addEventListener('change', presetFix);
for (const r of document.querySelectorAll('input[name=covR]')) r.addEventListener('change', presetFix);

function plnText() {
  return buildPln([...plan.pre, ...wpts, ...plan.post], { dep: $('dep').value.trim().toUpperCase() || 'LELL', arr: $('arr').value.trim().toUpperCase() || 'LELL',
    alt: +$('cruise').value || +$('alt').value || 1000, pos: $('park').value, ifr: $('rules').value !== 'V' }, apt);
}
const fileName = () => ($('fname').value.trim() || 'fpl').replace(/\.pln$/i, '') + (plan.parts.length > 1 ? `_${plan.k + 1}` : '') + '.pln';

// La carpeta elegida se guarda en IndexedDB: la próxima vez basta con confirmar el permiso
const idb = (mode, fn) => new Promise((ok, ko) => {
  const r = indexedDB.open('sarPlanner', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onerror = () => ko(r.error);
  r.onsuccess = () => { const q = fn(r.result.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); };
});
let dirHandle = null;
idb('readonly', st => st.get('gtnDir')).then(h => { dirHandle = h || null; if (h) $('save').title = 'Carpeta: ' + h.name; }).catch(() => {});
// Carpeta del GTN750 (la elegida la primera vez, recordada) y escritura de un .pln
async function gtnDir() {
  if (!window.showDirectoryPicker) throw new Error('este navegador no deja escribir en carpetas: usa Chrome/Edge o «Descargar»');
  if (dirHandle && (await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') dirHandle = null;
  if (!dirHandle) {
    dirHandle = await showDirectoryPicker({ id: 'gtn750', mode: 'readwrite' });
    idb('readwrite', st => st.put(dirHandle, 'gtnDir')).catch(() => {});
    $('save').title = 'Carpeta: ' + dirHandle.name;
  }
  return dirHandle;
}
async function writePln(dir) {
  const w = await (await dir.getFileHandle(fileName(), { create: true })).createWritable();
  await w.write(plnText());
  await w.close();
  return fileName();
}
const saveErr = e => { if (e.name !== 'AbortError') $('msg').textContent = 'Error: ' + e.message; };
$('save').onclick = async () => {
  try {
    const dir = await gtnDir(), name = await writePln(dir);
    $('msg').innerHTML = `<span style="color:var(--ok)">Guardado ${name} en ${dir.name} (${new Date().toLocaleTimeString()})</span>`;
  } catch (e) { saveErr(e); }
};
// Todos los vuelos de la división: fpl_1.pln, fpl_2.pln…
$('saveAll').onclick = async () => {
  const keep = plan.k, names = [];
  try {
    const dir = await gtnDir();
    for (let i = 0; i < plan.parts.length; i++) { $('part').value = i; update(); names.push(await writePln(dir)); }
    $('msg').innerHTML = `<span style="color:var(--ok)">Guardados ${names.join(', ')} en ${dir.name}</span>`;
  } catch (e) { saveErr(e); }
  $('part').value = keep; update();
};
$('part').addEventListener('change', update);
$('save').addEventListener('contextmenu', e => { e.preventDefault(); dirHandle = null; $('msg').textContent = 'Carpeta olvidada: el próximo guardado te pedirá elegirla.'; });
$('dl').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([plnText()], { type: 'application/xml' }));
  a.download = fileName();
  a.click();
  URL.revokeObjectURL(a.href);
};


// ---------- Plan de vuelo ICAO (VATSIM / SimBrief) ----------
// Por avión: tipo ICAO, estela, equipo (casilla 10a), vigilancia (10b), PBN, SUR/ y consumo orientativo (kg/h)
// ponytail: equipos y consumos orientativos de cada modelo del simulador; ajústalos aquí si tu avión lleva otra cosa
const FPL_EQ = {
  custom:   ['ZZZZ', 'L', 'SGY', 'S', '', '', 0],
  c172:     ['C172', 'L', 'SGRY', 'S', 'B2S1', '', 30],
  c208:     ['C208', 'L', 'SDFGRY', 'S', 'B2D2S1', '', 160],
  kodiak:   ['KODI', 'L', 'SGRY', 'S', 'B2D2S1', '', 150],
  dhc6:     ['DHC6', 'L', 'SDFGRY', 'S', 'B2D2S1', '', 290],
  pc12:     ['PC12', 'L', 'SDFGRWY', 'SB1', 'B2D2O2S1', '260B', 230],
  aerostar: ['AEST', 'L', 'SDFGRY', 'S', 'B2S1', '', 140],
  kingair:  ['B350', 'L', 'SDFGRY', 'S', 'B2D2S2', '260B', 380],
  c130:     ['C30J', 'M', 'SDE2E3FGHIRWXY', 'LB1', 'A1B1C1D1O1S1', '260B', 2300],
  lj35:     ['LJ35', 'M', 'SDFGRWY', 'S', 'B2D2', '', 700],
  cj3:      ['C25B', 'L', 'SDE3FGHIRWY', 'SB1', 'B2C2D2O2S2', '260B', 400],
  h160:     ['H160', 'L', 'SDFGRY', 'S', 'B2S1', '260B', 400],
  mh60:     ['H60', 'M', 'SDFGRUY', 'S', 'B2', '', 550],
  ec135:    ['EC35', 'L', 'SDFGRY', 'S', 'B2', '', 220],
  h125:     ['AS50', 'L', 'SGY', 'S', '', '', 180],
  b407:     ['B407', 'L', 'SGY', 'S', '', '', 170],
  bo105:    ['B105', 'L', 'SGY', 'S', '', '', 180],
  uh1:      ['UH1', 'L', 'SY', 'S', '', '', 290],
  r66:      ['R66', 'L', 'SGY', 'S', '', '', 70],
};
// Estela de los tipos sugeridos en «Avión en el plan» (peso máximo: L < 7 t ≤ M < 136 t)
const TYPE_WAKE = { A139: 'L', EC25: 'M', AS32: 'M', NH90: 'M', CN35: 'M', C295: 'M', C30J: 'M', H60: 'M' };
const clean18 = t => t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ./-]/g, ' ').replace(/\s+/g, ' ').trim();
// Observaciones automáticas según lo que se hace
function autoRmk() {
  const p = params(), alt = Math.round(+$('alt').value), sp = (p.sp / NM).toFixed(1), ui = UI[p.type];
  const where = p.type === 'AREA' ? `AREA ${(polyAreaM2(p.area.length >= 3 ? p.area : plan.all.map(w => w.pos)) / 1e6).toFixed(0)}KM2 ${Math.round(plan.all.length / 2)} LEGS`
    : `${p.type} PATTERN CSP ${icaoCoord(p.csp)}`;
  const part = plan.parts.length > 1 ? ` FLT ${plan.k + 1} OF ${plan.parts.length}` : '';
  if ($('cov').value === 'sar') return clean18(`SAR MISSION ${where} SRCH ALT ${alt}FT TRK SPACING ${sp}NM OBJ ${$('sobj').selectedOptions[0]?.text || ''}${part}`);
  if ($('cov').value === 'cam') {
    const gsd = coverage()?.swath / (+$('px').value || 6000) * 100;
    return clean18(`AERIAL PHOTO SURVEY ${where} BLOCK ${alt}FT${gsd ? ` GSD ${Math.round(gsd)}CM` : ''}${part}`);
  }
  return clean18(`SURVEY FLIGHT ${where} ${alt}FT${ui.sp ? ` SPACING ${sp}NM` : ''}${part}`);
}
function fplFields() {
  const eq = FPL_EQ[$('acft').value] || FPL_EQ.custom, prof = PROFILES[$('acft').value] || PROFILES.custom;
  const dep = $('dep').value.trim().toUpperCase() || 'ZZZZ', arr = $('arr').value.trim().toUpperCase() || 'ZZZZ';
  const sidP = plan.pre.filter(q => q.sid), starP = plan.post.filter(q => q.star);
  const sid = sidP[0]?.sid || '', star = starP[0]?.star || '';
  // EOBT automática: dentro de 30 min, redondeada hacia arriba a 5 min
  const now = new Date(), eobtAuto = new Date(Math.ceil((now.getTime() + 30 * 60e3) / 300e3) * 300e3);
  const eobt = /^\d{4}$/.test($('eobt').value) ? $('eobt').value
    : String(eobtAuto.getUTCHours()).padStart(2, '0') + String(eobtAuto.getUTCMinutes()).padStart(2, '0');
  const cs = clean18($('cs').value).replace(/ /g, '') || 'ZZZZZ', equip = clean18($('equip').value).replace(/ /g, '') || eq[2];
  const actype = clean18($('fplType').value).replace(/ /g, '').slice(0, 4) || eq[0];
  return {
    // Tipo del plan: el del avión que vuelas o el que escribas (como si fuera ese); estela la elegida, la conocida o la del perfil
    callsign: cs, rules: $('rules').value, ftype: $('ftype').value, actype, wake: $('fplWake').value || (actype === eq[0] ? eq[1] : TYPE_WAKE[actype] || eq[1]), equip, surv: eq[3],
    dep, eobt, dest: arr, altn: clean18($('altn').value), sid,
    cruiseKt: prof.cruise || +$('tas').value, // tránsito a velocidad de crucero; la búsqueda, a la TAS de búsqueda
    cruiseFt: +$('cruise').value || +$('alt').value, patKt: +$('tas').value, patFt: +$('alt').value,
    out: [...(sid ? [sid, sidP[sidP.length - 1].name] : []), ...plan.pre.filter(q => !q.sid).map(q => q.icao || icaoCoord(q.pos))],
    pattern: wpts.map(w => w.pos),
    back: [...plan.post.filter(q => !q.star).map(q => q.icao || icaoCoord(q.pos)), ...(star ? [starP[0].name, star] : [])],
    eetSec: (lastTimes.pat || 0) + (lastTimes.tr || 0),
    depGate: plan.pre.filter(q => q.gate === 'dep').map(q => ({ fix: q.name, ft: q.alt }))[0] || null,
    arrGate: plan.post.filter(q => q.gate === 'arr').map(q => ({ fix: q.name, ft: q.alt }))[0] || null,
    sts: clean18($('sts').value) || ($('cov').value === 'sar' ? 'SAR' : ''),
    pbn: equip.includes('R') ? eq[4] : '', nav: equip.includes('G') && eq[4] ? 'SBAS' : '', sur: eq[5],
    dof: `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`,
    reg: /^[A-Z]{5}$/.test(cs) ? cs : '', opr: clean18($('opr').value), rmk: clean18($('rmk').value) || autoRmk(),
  };
}
const fplText = () => buildFplIcao(fplFields());
$('fplCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('fplOut').value); }
  catch { $('fplOut').select(); document.execCommand('copy'); }
  $('msg').innerHTML = '<span style="color:var(--ok)">Plan de vuelo ICAO copiado: pégalo en el prefile de VATSIM.</span>';
};
$('fplVatsim').onclick = () => window.open('https://my.vatsim.net/pilots/flightplan', '_blank');
$('fplSimbrief').onclick = () => {
  const o = fplFields(), route = $('fplOut').value.split('\n')[3].replace(/^-\S+ /, '');
  const q = new URLSearchParams({ orig: o.dep, dest: o.dest, type: o.actype, route, callsign: o.callsign, altn: o.altn, reg: o.reg });
  window.open('https://dispatch.simbrief.com/options/custom?' + q, '_blank');
};

// ---------- Hoja de vuelo (kneeboard): como un OFP de SimBrief, imprimible ----------
function kneeboard() {
  const o = fplFields(), eq = FPL_EQ[$('acft').value] || FPL_EQ.custom, D = apt(o.dep), A = apt(o.dest);
  const mv = D ? (DB[o.dep]?.[7] ?? 0) : 0; // variación magnética (+ Este)
  const tas = +$('tas').value, wind = { dir: +$('wdir').value, kt: +$('wkt').value };
  const pts = [...(D ? [{ name: o.dep, pos: D.pos }] : []), ...plan.pre, ...wpts, ...plan.post, ...(A ? [{ name: o.dest, pos: A.pos }] : [])];
  let cum = 0, cumD = 0;
  const rows = pts.slice(1).map((q, i) => {
    const a = pts[i].pos, b = q.pos, d = dist(a, b), trk = brg(a, b), gs = groundSpeed(tas, trk, wind.dir, wind.kt), t = d / gs;
    cum += t; cumD += d;
    return `<tr><td>${q.name}</td><td>${icaoCoord(b)}</td><td>${String(Math.round(trk)).padStart(3, '0')}</td>`
      + `<td>${String(Math.round((trk - mv + 360) % 360)).padStart(3, '0')}</td><td>${(d / NM).toFixed(1)}</td><td>${Math.round(gs / 0.514444)}</td>`
      + `<td>${fmtT(t)}</td><td>${fmtT(cum)}</td><td>${(cumD / NM).toFixed(0)}</td></tr>`;
  }).join('');
  const total = (lastTimes.pat || 0) + (lastTimes.tr || 0), ff = eq[6];
  const fuel = ff ? [['Viaje', total / 3600 * ff], ['Reserva final (45 min)', 0.75 * ff], ['Contingencia (5 %)', total / 3600 * ff * 0.05]] : [];
  const fuelRows = fuel.map(([k, v]) => `<tr><td>${k}</td><td>${Math.round(v)} kg</td></tr>`).join('')
    + (ff ? `<tr><th>Mínimo a bordo</th><th>${Math.round(fuel.reduce((s, [, v]) => s + v, 0))} kg</th></tr>` : '');
  // Croquis de la ruta
  const all = pts.map(q => q.pos), la = all.map(q => q[0]), lo = all.map(q => q[1]);
  const [y0, y1, x0, x1] = [Math.min(...la), Math.max(...la), Math.min(...lo), Math.max(...lo)], k = Math.cos((y0 + y1) / 2 * RAD);
  const sc = 300 / Math.max((x1 - x0) * k, y1 - y0, 1e-6), P = q => `${((q[1] - x0) * k * sc + 10).toFixed(1)},${((y1 - q[0]) * sc + 10).toFixed(1)}`;
  const svg = `<svg viewBox="0 0 ${((x1 - x0) * k * sc + 20).toFixed(0)} ${((y1 - y0) * sc + 20).toFixed(0)}" style="max-width:340px;max-height:340px;border:1px solid #999">`
    + `<polyline points="${all.map(P).join(' ')}" fill="none" stroke="#1565c0" stroke-width="1.5"/>`
    + (D ? `<circle cx="${P(D.pos).split(',')[0]}" cy="${P(D.pos).split(',')[1]}" r="4" fill="#2e7d32"/>` : '') + '</svg>';
  const fpl = $('fplOut').value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de vuelo ${o.callsign} ${o.dep}-${o.dest}</title><style>
    body{font:12px/1.35 Consolas,monospace;color:#111;margin:18px;max-width:820px} h1{font-size:18px;margin:0} h2{font-size:13px;border-bottom:2px solid #111;margin:16px 0 6px}
    table{border-collapse:collapse;width:100%} td,th{border:1px solid #bbb;padding:2px 5px;text-align:left} th{background:#eee}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px} pre{white-space:pre-wrap;background:#f4f4f4;padding:6px;border:1px solid #ccc}
    .sig{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:40px} .sig div{border-top:1px solid #111;padding-top:3px}
    @media print{button{display:none} body{margin:8mm}}</style></head><body>
    <h1>${o.callsign} · ${o.dep} → ${o.dest}${plan.parts.length > 1 ? ` · vuelo ${plan.k + 1}/${plan.parts.length}` : ''}</h1>
    <div>${new Date().toUTCString().slice(0, 16)} · EOBT ${o.eobt}Z · EET ${hhmm(total)} · ${o.actype}/${o.wake} · reglas ${o.rules}, tipo ${o.ftype}</div>
    <h2>Misión</h2><div class="grid">
      <div>${$('typeHint').textContent}</div><div>${$('covInfo').innerText}</div>
      <div>Búsqueda: ${$('alt').value} ft · ${tas} kt TAS · banco ${$('bank').value}°</div><div>Crucero: ${o.cruiseFt} ft · ${Math.round(o.cruiseKt)} kt</div>
      <div>Viento: ${wind.kt ? String(wind.dir).padStart(3, '0') + '° / ' + wind.kt + ' kt' : 'calma / sin datos'}</div><div>Alternativo: ${o.altn || '—'}</div>
      ${$('windInfo').innerText ? `<div style="grid-column:1/3">${$('windInfo').innerText.replace(/\n/g, '<br>')}</div>` : ''}
      ${$('areaInfo').innerText && $('type').value === 'AREA' ? `<div style="grid-column:1/3">${$('areaInfo').innerText}</div>` : ''}
    </div>
    <h2>Ruta y croquis</h2><div class="grid"><div>${svg}</div><div>${plan.pre.length || plan.post.length ? `Ida: ${plan.pre.map(q => q.name).join(' ') || 'directo'}<br>Vuelta: ${plan.post.map(q => q.name).join(' ') || 'directo'}<br><br>` : ''}
      Waypoints en el GTN: ${wpts.length + plan.pre.length + plan.post.length + 2}<br>${$('warn').innerText.replace(/\n/g, '<br>')}</div></div>
    <h2>Navegación</h2><table><tr><th>Punto</th><th>Coord.</th><th>°T</th><th>°M</th><th>NM</th><th>GS</th><th>Tramo</th><th>Acum.</th><th>NM acum.</th></tr>${rows}</table>
    <div>Variación magnética usada: ${mv >= 0 ? mv + '° E' : -mv + '° W'} (del aeropuerto de salida).</div>
    ${ff ? `<h2>Combustible (orientativo: ${ff} kg/h)</h2><table>${fuelRows}</table>` : ''}
    <h2>Plan de vuelo ICAO</h2><pre>${fpl}</pre>
    <div class="sig"><div>Piloto al mando</div><div>Despacho / Observaciones</div></div></body></html>`;
  // Se abre encima de la página (sin ventana emergente que el navegador pueda bloquear); Imprimir solo imprime la hoja
  const ov = document.createElement('div');
  ov.className = 'kb-overlay';
  ov.innerHTML = '<div class="kb-bar"><button class="small">🖨 Imprimir</button><button class="sec small">✕ Cerrar</button></div><iframe></iframe>';
  document.body.appendChild(ov);
  const fr = ov.querySelector('iframe'), [pr, cl] = ov.querySelectorAll('button');
  fr.srcdoc = html;
  pr.onclick = () => fr.contentWindow.print();
  cl.onclick = () => ov.remove();
}
$('kb').onclick = kneeboard;

// ---------- Misiones guardadas (en este navegador; exportables a un fichero) ----------
const MKEY = 'sarMissions';
const missions = () => { try { return JSON.parse(localStorage.getItem(MKEY) || '{}'); } catch { return {}; } };
const setMissions = m => { try { localStorage.setItem(MKEY, JSON.stringify(m)); } catch {} listMissions(); };
function listMissions(sel) {
  const names = Object.keys(missions()).sort();
  $('mList').innerHTML = names.length ? names.map(n => `<option>${n.replace(/</g, '&lt;')}</option>`).join('') : '<option value="">(ninguna guardada)</option>';
  if (sel) $('mList').value = sel;
}
const currentState = () => Object.fromEntries(FIELDS.map(f => [f, $(f).type === 'checkbox' ? $(f).checked : $(f).value]));
function applyState(st) {
  for (const f of FIELDS) if (f in st && !['park', 'sid', 'star', 'rwyDep', 'rwyArr'].includes(f)) $(f).type === 'checkbox' ? ($(f).checked = st[f]) : ($(f).value = st[f]);
  prevType = $('type').value; prevUnit = $('unit').value;
  fillPositions(st.park ?? ''); fillProcs(st.sid ?? '', st.star ?? '', st.rwyDep ?? '', st.rwyArr ?? '');
  drawAreaHandles(); syncTrail(); update();
  map.fitBounds(L.latLngBounds((flight?.pts?.length ? flight.pts : wpts.map(w => w.pos))).pad(0.15));
}
$('mSave').onclick = () => {
  const name = $('mName').value.trim() || `${$('type').selectedOptions[0].text.split(' (')[0]} ${new Date().toLocaleString()}`;
  setMissions({ ...missions(), [name]: currentState() });
  listMissions(name);
  $('msg').innerHTML = `<span style="color:var(--ok)">Misión «${name}» guardada.</span>`;
};
$('mLoad').onclick = () => { const st = missions()[$('mList').value]; if (st) { applyState(st); $('mName').value = $('mList').value; } };
// Borrar pide un segundo clic (sin ventanas de confirmación)
let delArmed = 0;
$('mDel').onclick = () => {
  const n = $('mList').value;
  if (!n) return;
  if (Date.now() - delArmed > 3000) { delArmed = Date.now(); $('mDel').textContent = '¿Seguro?'; setTimeout(() => ($('mDel').textContent = 'Borrar'), 3000); return; }
  const m = missions(); delete m[n]; setMissions(m); $('mDel').textContent = 'Borrar'; delArmed = 0;
};
$('mExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(missions(), null, 1)], { type: 'application/json' }));
  a.download = 'misiones_sar.json'; a.click(); URL.revokeObjectURL(a.href);
};
$('mImport').onchange = async e => {
  try {
    const add = JSON.parse(await e.target.files[0].text());
    setMissions({ ...missions(), ...add });
    $('msg').innerHTML = `<span style="color:var(--ok)">Importadas ${Object.keys(add).length} misiones.</span>`;
  } catch (err) { $('msg').textContent = 'Fichero de misiones no válido: ' + err.message; }
  e.target.value = '';
};
listMissions();

// ---------- Timelapse: el avión recorre la trayectoria prevista a su velocidad sobre el suelo (TAS + viento), acelerado ----------
const TL = { t: 0, playing: false, last: 0, cum: [], total: 0 };
const planeM = L.marker([0, 0], { interactive: false, zIndexOffset: 3000, icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
  html: '<svg width="30" height="30" viewBox="-15 -15 30 30" style="filter:drop-shadow(0 0 3px #000)"><path d="M0,-13 L2,-4 L12,1.5 L12,3.5 L2,1.5 L1.5,8.5 L5,11 L5,12.5 L0,11.5 L-5,12.5 L-5,11 L-1.5,8.5 L-2,1.5 L-12,3.5 L-12,1.5 L-2,-4 Z" fill="#fff" stroke="#111" stroke-width=".8"/></svg>' }) });
const flownLine = L.polyline([], { color: '#5fd18b', weight: 4, interactive: false });
const tlCtl = L.control({ position: 'bottomleft' });
tlCtl.onAdd = () => {
  const d = L.DomUtil.create('div', 'tl');
  d.innerHTML = `<button id="tlPlay" title="Simular el vuelo">▶ Simular</button>
    <input id="tlPos" type="range" min="0" max="1000" value="0" title="Arrastra para ir a un momento del vuelo">
    <select id="tlSpd" title="Velocidad de la simulación">
      <option value="30">×30</option><option value="60" selected>×60</option><option value="120">×120</option><option value="300">×300</option>
    </select>
    <span id="tlTime"></span>
    <button id="tlStop" class="sec" title="Quitar el avión del mapa">■</button>`;
  L.DomEvent.disableClickPropagation(d);
  L.DomEvent.disableScrollPropagation(d);
  return d;
};
tlCtl.addTo(map);
const legendCtl = L.control({ position: 'bottomright' });
legendCtl.onAdd = () => {
  const d = L.DomUtil.create('details', 'legend-map');
  d.open = true;
  d.innerHTML = `<summary>Leyenda</summary>
    <div><i style="border-color:#ffd23f;border-top-width:2px"></i>Plan: lo que va al GTN</div>
    <div><i style="border-color:#ffd23f;border-top-style:dashed;border-top-width:2px"></i>Tránsito (plan)</div>
    <div><i style="border-color:#3d8bff;border-top-width:4px"></i>Trayectoria prevista (con giros)</div>
    <div><i style="border-color:#ff3b3b;border-top-width:4px"></i>Giro que no cabe</div>
    <div><i style="border-color:#ff9f1c;border-top-width:4px"></i>Giro muy cerrado: no pasa por el punto</div>
    <div><i style="border-color:#5fd18b;border-top-width:4px"></i>Recorrido simulado</div>
    <div><i style="border-color:#7fd3ff;border-top-width:8px;opacity:.6"></i>Franja cubierta</div>
    <div><i style="border-color:#fff;border-top-style:dashed;border-top-width:2px"></i>Área dibujada</div>
    <div style="color:var(--muted)">Cada capa se quita en el botón de capas ⧉</div>`;
  L.DomEvent.disableClickPropagation(d);
  return d;
};
legendCtl.addTo(map);
// Botón ⟳: borra todo lo dibujado, para la simulación, recalcula y centra el patrón
const redrawCtl = L.control({ position: 'topleft' });
redrawCtl.onAdd = () => {
  const b = L.DomUtil.create('a', 'leaflet-bar');
  b.innerHTML = '⟳'; b.href = '#'; b.title = 'Redibujar: borra lo dibujado, para la simulación, recalcula y centra el patrón';
  b.style.cssText = 'display:block;width:30px;height:30px;line-height:30px;text-align:center;font-size:18px;background:#fff;color:#111;text-decoration:none';
  L.DomEvent.on(b, 'click', e => { L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e); redrawAll(); });
  return b;
};
redrawCtl.addTo(map);
function redrawAll() {
  // Cualquier línea suelta en el mapa que no pertenezca a ninguna capa conocida se borra
  const known = new Set([areaShape, flownLine]);
  for (const g of [layer, trackLayer, coverLayer, aptLayers.A, aptLayers.H]) g.eachLayer(l => known.add(l));
  const stray = [];
  map.eachLayer(l => { if (l instanceof L.Path && !known.has(l)) stray.push(l); });
  stray.forEach(l => map.removeLayer(l));
  map.addLayer(labelsToggle); map.getContainer().classList.remove('nolabels');
  $('tlStop').click();
  for (const g of [layer, trackLayer, coverLayer]) g.clearLayers();
  drawAreaHandles();
  update();
  map.fitBounds(L.latLngBounds((flight?.pts?.length ? flight.pts : wpts.map(w => w.pos))).pad(0.15));
}
const fmtT = sec => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`; };

// Tiempo acumulado en cada punto de la trayectoria, con la velocidad sobre el suelo de cada tramo (viento)
function tlRefresh() {
  if (!flight || flight.pts.length < 2) return;
  const tas = Math.max(1, +$('tas').value), w = { dir: +$('wdir').value, kt: +$('wkt').value }, pts = flight.pts;
  TL.cum = [0];
  for (let i = 1; i < pts.length; i++) TL.cum.push(TL.cum[i - 1] + dist(pts[i - 1], pts[i]) / groundSpeed(tas, brg(pts[i - 1], pts[i]), w.dir, w.kt));
  TL.total = TL.cum[TL.cum.length - 1];
  TL.t = Math.min(TL.t, TL.total);
  tlDraw();
}
function tlDraw() {
  const T = TL.total, tt = Math.min(TL.t, T), pts = flight.pts;
  let i = 1;
  while (i < TL.cum.length - 1 && TL.cum[i] < tt) i++;
  const seg = TL.cum[i] - TL.cum[i - 1], f = seg ? (tt - TL.cum[i - 1]) / seg : 0;
  const a = pts[i - 1], b = pts[i], pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const onMap = map.hasLayer(planeM);
  if (onMap) {
    planeM.setLatLng(pos);
    const pa = map.latLngToLayerPoint(a), pb = map.latLngToLayerPoint(b);
    const svg = planeM.getElement()?.querySelector('svg');
    if (svg) svg.style.transform = `rotate(${Math.atan2(pb.x - pa.x, pa.y - pb.y) / RAD}deg)`;
    flownLine.setLatLngs([...pts.slice(0, i), pos]);
  }
  const phase = i <= flight.patStart ? 'tránsito de ida' : i > flight.patEnd ? 'tránsito de vuelta' : 'patrón';
  $('tlTime').textContent = onMap ? `${fmtT(TL.t)} / ${fmtT(T)} · ${phase}` : `Vuelo completo: ${fmtT(T)}`;
  $('tlPos').value = T ? Math.round(TL.t / T * 1000) : 0;
}
function tlShow() { if (!map.hasLayer(planeM)) { flownLine.addTo(map); planeM.addTo(map); } }
// Temporizador (no requestAnimationFrame: se detiene si la pestaña no está en primer plano)
function tlTick() {
  const now = performance.now(), T = TL.total;
  TL.t = Math.min(T, TL.t + (now - TL.last) / 1000 * +$('tlSpd').value);
  TL.last = now;
  if (TL.t >= T) tlPause('↺ Repetir');
  tlDraw();
}
function tlPause(label) { TL.playing = false; clearInterval(TL.timer); $('tlPlay').textContent = label; }
$('tlPlay').onclick = () => {
  tlShow();
  if (TL.playing) return tlPause('▶ Seguir');
  if (TL.t >= TL.total - 0.01) TL.t = 0;
  TL.playing = true; TL.last = performance.now(); $('tlPlay').textContent = '❚❚ Pausa';
  TL.timer = setInterval(tlTick, 40);
  tlDraw();
};
$('tlPos').oninput = () => { tlShow(); TL.t = +$('tlPos').value / 1000 * TL.total; tlDraw(); };
$('tlStop').onclick = () => {
  tlPause('▶ Simular'); TL.t = 0;
  map.removeLayer(planeM); map.removeLayer(flownLine); tlDraw();
};
map.on('zoomend', () => flight && tlDraw());

// Secciones abiertas/plegadas: se recuerdan entre sesiones
document.querySelectorAll('details.card').forEach((d, i) => {
  try { const v = localStorage.getItem('sarCard3_' + i); if (v !== null) d.open = v === '1'; } catch {}
  d.addEventListener('toggle', () => { try { localStorage.setItem('sarCard3_' + i, d.open ? '1' : '0'); } catch {} });
});

drawAreaHandles();
syncTrail();
update();
if (hasTurnErrors()) { // lo guardado no era volable: primero arreglarlo sin cambiar el modo (entrelazar, altura, TAS); si no, lo recomendado
  autoFix(['il=', 'alt=', 'agl=', 'tas=']);
  if (hasTurnErrors()) {
    resetRecommended();
    $('msg').innerHTML = '<span style="color:var(--warn)">La configuración anterior tenía giros que no caben: he cargado la recomendada.</span>';
  } else $('msg').innerHTML = '<span style="color:var(--warn)">La configuración anterior tenía giros que no cabían: la he corregido (revisa entrelazado, altura o TAS).</span>';
}
map.fitBounds(L.latLngBounds(wpts.map(w => w.pos)).pad(0.3));
