// Bases SAR reales en España (comprobadas en prensa especializada, octubre 2026). Las usa app/ui.js en «Base SAR real».
// icao: código en data/aeropuertos.js · ftype: casilla 8 del FPL · real: aparato que hay de verdad (solo informativo)
// types: tipos ICAO del aparato real (botones «Avión en el plan») · plane: unidad de ala fija (🎲 Simular un caso elige base según sea tu avión o helicóptero)
// Fuentes: AIN (contrato SASEMAR-Avincis, 2024), defensa.com (Helimer 401 EC-225, 2026), helis.com (escuadrones 801 y 803),
// jetphotos.com (CN-235 de SASEMAR fotografiados en Santiago, Valencia y Gran Canaria).
const SAR_UNITS = {
  helimer: { name: 'Salvamento Marítimo · Helimer', opr: 'SALVAMENTO MARITIMO', ftype: 'X', types: ['A139', 'EC25'],
    real: 'AW139 (ICAO A139); el Helimer 401 es un EC-225 (EC25) desde febrero de 2026',
    radio: 'Helimer + número (p. ej. «Helimer 401»)', note: 'Helicópteros de SASEMAR operados por Avincis. Coordina el centro de salvamento (CCS) de la zona.' },
  eda: { name: 'Ejército del Aire y del Espacio · SAR', opr: 'EJERCITO DEL AIRE', ftype: 'M', types: ['AS32', 'NH90'],
    real: 'HD.21 Super Puma (ICAO AS32); el 803 opera NH90 (NH90)',
    radio: 'indicativo militar del escuadrón', note: 'Rescate de tripulaciones y apoyo a Salvamento Marítimo. Coordina el RCC de Palma, Madrid o Canarias.' },
  sasemarAvion: { name: 'Salvamento Marítimo · aviones', opr: 'SALVAMENTO MARITIMO', ftype: 'X', plane: true, types: ['CN35'],
    real: 'CASA CN-235-300 de patrulla marítima (ICAO CN35)',
    radio: 'Sasemar + número (p. ej. «Sasemar 103»)', note: 'Aviones de búsqueda de SASEMAR: localizan y guían a los helicópteros y barcos. Coordina el centro de salvamento (CCS) de la zona.' },
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
  { icao: 'LEST', unit: 'sasemarAvion', where: 'Santiago de Compostela' },
  { icao: 'LEVC', unit: 'sasemarAvion', where: 'Valencia' },
  { icao: 'GCLP', unit: 'sasemarAvion', where: 'Gran Canaria (Gando)' },
  { icao: 'LECU', unit: 'eda', where: 'Escuadrón 803 · Cuatro Vientos (Madrid)', area: 'Península (FIR Madrid); también operaciones especiales' },
];
