// Bases SAR reales en España (comprobadas en prensa especializada, octubre 2026). Las usa app/ui.js en «Base SAR real».
// icao: código en data/aeropuertos.js · ftype: casilla 8 del FPL · real: aparato que hay de verdad (solo informativo)
// Fuentes: AIN (contrato SASEMAR-Avincis, 2024), defensa.com (Helimer 401 EC-225, 2026), helis.com (escuadrones 801 y 803).
const SAR_UNITS = {
  helimer: { name: 'Salvamento Marítimo · Helimer', opr: 'SALVAMENTO MARITIMO', ftype: 'X',
    real: 'AW139 (ICAO A139); el Helimer 401 es un EC-225 (EC25) desde febrero de 2026',
    radio: 'Helimer + número (p. ej. «Helimer 401»)', note: 'Helicópteros de SASEMAR operados por Avincis. Coordina el centro de salvamento (CCS) de la zona.' },
  eda: { name: 'Ejército del Aire y del Espacio · SAR', opr: 'EJERCITO DEL AIRE', ftype: 'M',
    real: 'HD.21 Super Puma (ICAO AS32); el 803 opera NH90 (NH90)',
    radio: 'indicativo militar del escuadrón', note: 'Rescate de tripulaciones y apoyo a Salvamento Marítimo. Coordina el RCC de Palma, Madrid o Canarias.' },
};
const SAR_BASES = [
  { icao: 'LECO', unit: 'helimer', where: 'A Coruña (Alvedro)' },
  { icao: 'LEN8G', unit: 'helimer', where: 'Cee (Costa da Morte)' },
  { icao: 'LEEL', unit: 'helimer', where: 'Gijón (puerto de El Musel)' },
  { icao: 'LEXJ', unit: 'helimer', where: 'Santander' },
  { icao: 'LERS', unit: 'helimer', where: 'Reus' },
  { icao: 'LEVC', unit: 'helimer', where: 'Valencia' },
  { icao: 'LEPA', unit: 'helimer', where: 'Palma de Mallorca' },
  { icao: 'LEAM', unit: 'helimer', where: 'Almería' },
  { icao: 'LEJR', unit: 'helimer', where: 'Jerez' },
  { icao: 'GCTS', unit: 'helimer', where: 'Tenerife Sur' },
  { icao: 'LEPA', unit: 'eda', where: 'Escuadrón 801 · Son Sant Joan (Palma)', area: 'Mediterráneo español y Baleares (FIR Barcelona)' },
  { icao: 'GCLP', unit: 'eda', where: 'Escuadrón 802 · Gando (Gran Canaria)', area: 'Canarias y Atlántico (FIR Canarias)' },
  { icao: 'LECU', unit: 'eda', where: 'Escuadrón 803 · Cuatro Vientos (Madrid)', area: 'Península (FIR Madrid); también operaciones especiales' },
];
