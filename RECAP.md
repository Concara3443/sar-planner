# SAR Planner — lo pedido y su estado

Abrir: doble clic en `sar.html` (mejor en Chrome o Edge). Pruebas: `node tests/test_geo.js`.
Datos (aeropuertos, fixes, SID, STAR): `python scripts/exportar_aeropuertos.py` tras actualizar Little Navmap.

## Cómo se usa
1. **Avión y vuelo**: tu avión, salida, destino, posición, TAS y altitud de búsqueda, crucero, viento (o «Viento real»).
2. **Qué vas a hacer**: Buscar (SAR, con tablas IAMSAR), Fotografía (calidad cm/px → altura) o Libre.
3. **Dónde**: dibuja un área o elige un patrón. Rumbo automático = el más rápido.
4. **Ruta** (opcional): SID, puntos intermedios (fixes, VOR, NDB o coordenadas), STAR.
5. Pulsa **✨** → guarda en el GTN750, descarga el .pln, copia el **plan ICAO** para VATSIM o abre la **hoja de vuelo**.

## Todo lo pedido — hecho
- [x] Sustituir OpenCPN → GPX → .bat por una web con mapa satélite y preview
- [x] Patrones IAMSAR (PS, CS, SS, VS, TSR, TSN) + extras (TRI, ZZ, SSI, SPI, CL, F8) + básicos (BP, OR), agrupados
- [x] Aeropuertos / helipuertos / parkings / pistas desde Little Navmap (MSFS 2024)
- [x] Unidades NM / km / m · valores estándar en gris · ↺ Recomendado · F5 no recupera planes imposibles
- [x] Trayectoria prevista con giros reales (rojo = no cabe, naranja = muy cerrado) · capa activable · ⟳
- [x] Correcciones con cifras exactas · elegir una opción nunca deja un plan imposible (TAS mínima 60 kt)
- [x] SAR visual con tablas IAMSAR / USCG reales (comprobadas con CI 16130.2G; con corrección por velocidad H-9) · fotografía con calidad cm/px, solape y ángulo de cámara
- [x] Área dibujada: rumbo óptimo, entrelazado, viento, giros de 90° fuera del área, áreas cóncavas por zonas
- [x] Viento manual y real (METAR + viento en ruta a tu altitud) · tiempos con viento
- [x] Timelapse del vuelo · leyenda · nombres de waypoints activables
- [x] ✨ velocidad, altitud y rumbo ideales con los perfiles de tus aviones; resultado visible en los campos
- [x] Panel nuevo más simple: ① avión y vuelo · ② qué haces · ③ dónde · ④ ruta · ajustes avanzados plegados
- [x] Rumbo inicial óptimo por defecto al cargar un patrón (el que hace más corto el vuelo completo)
- [x] División en vuelos de ≤ 100 waypoints (GTN750): elegir vuelo, los otros en gris, «Guardar todos»
- [x] Puntos intermedios (fixes, VOR, NDB, coordenadas) y SID / STAR de tu base de datos, en el .pln y en el FPL
- [x] Plan de vuelo ICAO para VATSIM: reglas I/V/Y/Z, tipo X/G/M/N, ruta con coordenadas, STS, PBN, NAV, SUR, DOF, REG, OPR, RMK automático · copiar · VATSIM · SimBrief
- [x] Hoja de vuelo (kneeboard) estilo SimBrief: rumbos °T/°M, GS con viento, tiempos, combustible orientativo, croquis, FPL, imprimible
- [x] Misiones guardadas con nombre: guardar, cargar, borrar, exportar, importar
- [x] Código dividido (sar.html + app/ + data/ + tests/), sin código muerto, CSS ordenado, pruebas en un solo fichero
- [x] Viejo conversor (.bat y scripts GPX) y aeropuertos.js antiguo → Papelera

- [x] Bases SAR reales (Salvamento Marítimo y Ejército del Aire, `data/sarbases.js`): salida/destino, OPR/, tipo y STS/SAR del FPL; «la más cercana a la zona»

## A tener en cuenta
- Velocidades, equipos ICAO y consumos de cada avión son orientativos (tablas `PROFILES` y `FPL_EQ` en `app/ui.js`).
- En el .pln los fixes de SID/STAR van marcados como procedimiento; si el GTN750 o MSFS no los reconocen como SID/STAR, igualmente se vuelan como puntos.
- Los giros se calculan como el GTN750 de PMS50 (SDK Working Title): 17,5° de banco a la GS con viento de cola; poner más banco no cierra los giros.
- La trayectoria y el timelapse no calculan la deriva del viento en los giros.
- «Guardar en GTN750» y el viento real no se pueden probar sin abrir la página a mano (piden permiso / internet).
