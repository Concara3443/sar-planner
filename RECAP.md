# SAR Planner — lo pedido y su estado

Abrir: doble clic en `sar.html` (mejor en Chrome o Edge). Pruebas: `node tests/test_geo.js`.
Datos (aeropuertos, fixes, SID, STAR): `python scripts/exportar_aeropuertos.py` tras actualizar Little Navmap.

## Cómo se usa
1. **Misión**: Buscar (SAR, tablas IAMSAR; en 🌊 Deriva marcas en el mapa dónde se perdió), Fotografía (MP, objetivo,
   calidad cm/px → altura) o Libre.
2. **Avión y salida**: avión, salida, destino (o base SAR), TAS y altitud. Bajo la TAS: ⏱ con qué velocidad acaba antes
   el patrón y 🎯 la real para la misión. Autonomía y viento en sus desplegables.
3. **Zona o patrón**: elige un patrón o dibuja el área (fotografía). Punto rojo = centro del patrón. Gota, entrelazado y
   primer giro, aquí mismo.
4. **Ruta** (opcional): SID, puntos intermedios (fixes, VOR, NDB o coordenadas), STAR.
5. Pulsa **✨ Optimizar** → guarda en el GTN750, descarga el .pln, copia el **plan ICAO** o abre la **hoja de vuelo**.

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
- [x] Pista de salida/llegada (auto por viento: METAR o campos de viento) que filtra las SID/STAR; «✨ La mejor» elige la que acorta el camino a la zona
- [x] Deriva (apéndice H): última posición, objeto (27 tipos de la tabla H-7), horas perdido, corriente por viento y marina → datum al llegar, error probable y cuadrado de búsqueda; botones para poner el CSP o el área
- [x] Autonomía y reserva (las pones tú): tiempo en zona que te sobra o punto de no retorno ⛽ en el mapa y % del patrón que harías
- [x] Avión del plan ICAO: el que vuelas o el tipo que escribas (AW139, EC-225, Super Puma, CN-235…), con su estela
- [x] ✨ Mejor patrón con los datos de la deriva: área, cobertura y patrón (VS/SS/área) que dan más probabilidad de éxito en el tiempo que tienes, medido con el vuelo real
- [x] Señales y luces como objeto (estroboscópica, bengalas, espejo, humo…; tablas H-20 a H-24)
- [x] 🎲 Simular un caso con el avión elegido: búsqueda en el mar desde una base SAR real (con deriva, mejor patrón y posición real oculta que se puede revelar) o encargo de fotografía, según lo que pueda hacer el avión

- [x] Repo público con enlace al código y marca de agua; en el portfolio (apps y proyectos)
- [x] Gota como la vuela el GTN750: vuelta en bombilla con giros fly-by encadenados al banco marcado (sin el giro de 90°
      de después); en esquinas (sector, cuadrado, cuadrícula cruzada) el giro empieza justo sobre la esquina
- [x] Menús por misión: la misión primero y decide lo que se ve; cámara en megapíxeles; submenús desplegables;
      un solo ✨ Optimizar; 🎲 Simular y 🗑 Nueva en la cabecera; sin reinicios duplicados
- [x] Deriva marcada en el mapa (punto arrastrable); el patrón se centra solo en el datum (PS/CS por su centro);
      ✨ en SAR: PS con pasadas perpendiculares a la deriva y el primer giro hacia donde deriva (nada de polígono)
- [x] Precisión de la última posición según lo que buscas (persona, barco, avión), con casos sin posición precisa
- [x] ↺ Restablecer el patrón · opción de 30° del VS junto al patrón · punto rojo = centro del patrón
- [x] Giros que no caben, en rojo y dibujados como los vuela el autopiloto (simulado: se pasa y vuelve a la línea)
- [x] Velocidad: ⏱ con cuál acaba antes el patrón (probando cada TAS: gota, entrelazado y S cambian con ella) y 🎯 la real
      (SAR: tabla H-9; fotografía: sin fotos movidas a esa altitud); ✨ usa la misma cuenta
- [x] Hoja de vuelo con la deriva y el datum; tránsitos a crucero (cuadra con el EET)
- [x] Móvil: el mapa se ve (antes 0 px), arriba, con la leyenda plegada
- [x] Áreas: el rumbo cuenta los giros reales (un área convexa ya no sale en 9 zonas) y recalcular es ~6 veces más rápido;
      planes divididos sin media gota al final de un vuelo

## Dudas para hablar
- **Primer tramo del SS y del VS con deriva**: ahora salen con el rumbo automático (el más corto). El IAMSAR suele orientar
  el primer tramo según el viento o la deriva; no lo he tocado sin confirmarlo contigo.
- **Velocidad real en fotografía**: supone obturador a 1/2000 s y medio píxel de movimiento como máximo. Si tu cámara del
  simulador dispara más rápido, se puede subir.
- **Gota en el sector (VS)**: ya es fly-by y realista, pero a veces deja giros en rojo; sin gota el VS suele caber mejor.
- **Giros al salir o llegar al aeródromo**: se siguen dibujando en rojo (tramos cortos de SID/STAR), pero ya no cuentan
  como error del patrón.

## A tener en cuenta
- Velocidades, equipos ICAO y consumos de cada avión son orientativos (tablas `PROFILES` y `FPL_EQ` en `app/ui.js`).
- En el .pln los fixes de SID/STAR van marcados como procedimiento; si el GTN750 o MSFS no los reconocen como SID/STAR, igualmente se vuelan como puntos.
- Los giros se calculan como el GTN750 de PMS50 (SDK Working Title): 17,5° de banco a la GS con viento de cola; poner más banco no cierra los giros.
- La trayectoria y el timelapse no calculan la deriva del viento en los giros (la simulación de giros rojos tampoco).
- «Guardar en GTN750» y el viento real no se pueden probar sin abrir la página a mano (piden permiso / internet).
