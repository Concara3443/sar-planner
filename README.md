# SAR Planner

Planificador de búsquedas SAR y vuelos de fotografía aérea para **Microsoft Flight Simulator 2020/2024**.
Dibujas la zona o eliges un patrón de búsqueda y te genera el plan para el **GTN750**, el **plan de vuelo ICAO** para
VATSIM y una **hoja de vuelo** imprimible, con los giros calculados como los vuela de verdad el GTN.

**Web:** https://guillermocort.es/sar/

Es una página estática (HTML + JavaScript, sin servidor ni compilación). También funciona abriendo `sar.html` con
doble clic, mejor en Chrome o Edge.

## Qué hace

- **Patrones de búsqueda IAMSAR**: pasadas paralelas (PS), escalera (CS), cuadrado expansivo (SS), sector (VS) y
  búsqueda por la derrota (TSR, TSN). También incluye triángulo de deriva, zigzag, cuadrado convergente, espiral,
  trébol, ocho, barrera y órbita.
- **Áreas a medida**: dibujas el polígono y calcula el barrido con el rumbo más rápido, teniendo en cuenta el viento.
  Las áreas cóncavas se dividen en zonas y los giros quedan fuera del área.
- **Giros como el GTN750**: reproduce el cálculo de anticipación del GTN750 de PMS50 (motor LNAV de Working Title,
  17,5° de banco a la velocidad sobre el suelo). Marca en rojo los giros que no caben y en naranja los que recortan
  mucho, y propone correcciones con cifras exactas: TAS, separación, entrelazado o agrandar el patrón.
- **Entrelazado automático**: prueba todos los saltos y se queda con el que menos distancia vuela sin giros imposibles.
- **Separación de pasadas real**:
  - SAR visual, con las tablas de anchura de barrido del USCG SAR Addendum (= IAMSAR vol. II) y sus correcciones por
    tiempo, fatiga, chaleco salvavidas y velocidad.
  - Fotografía, a partir de la calidad deseada en cm/px, el campo de visión de la cámara y el solape.
- **Viento**: manual o real (pronóstico a tu altitud y METAR de la salida). Los tiempos y el rumbo óptimo lo tienen en
  cuenta.
- **Ruta completa**: SID y STAR de la base de datos de MSFS, con filtro por pista (pista en servicio elegida por el
  viento) y elección automática de la que acorta el camino a la zona. Admite puntos intermedios: fixes, VOR, NDB o
  coordenadas.
- **Bases SAR reales en España** (Salvamento Marítimo y Ejército del Aire): ponen salida, destino, operador, tipo de
  vuelo y STS/SAR en el plan.
- **Salidas**:
  - Guardar directamente en el GTN750.
  - Descargar el `.pln`.
  - Plan ICAO para VATSIM: reglas I/V/Y/Z, casillas 10 y 18 automáticas; con botones de copiar, VATSIM y SimBrief.
  - Hoja de vuelo estilo SimBrief.
  - Planes de más de 100 waypoints divididos en varios vuelos.
- **Misiones guardadas** con nombre: exportar e importar.

## Uso

1. **Avión y vuelo**: avión, salida y destino (o una base SAR real), TAS y altitud de búsqueda, crucero y viento.
2. **Qué vas a hacer**: buscar (SAR visual), fotografía o libre.
3. **Dónde**: dibuja un área o elige un patrón; arrastra el CSP (rojo) y el rumbo (azul) en el mapa.
4. **Ruta** (opcional): pistas, SID, STAR y puntos intermedios.
5. **✨**: ajusta velocidad, altitud y rumbo a tu avión. Después guarda en el GTN750, descarga el `.pln` o copia el
   plan ICAO.

## Estructura

```
sar.html                     página (formulario y mapa)
app/geo.js                   cálculos: patrones, giros del GTN, viento, tablas IAMSAR, .pln, plan ICAO
app/ui.js                    interfaz: mapa Leaflet, formulario, avisos, hoja de vuelo
app/sar.css                  estilos
data/aeropuertos.js          aeropuertos, helipuertos, parkings y pistas (exportados de Little Navmap)
data/navdata.js              fixes, VOR, NDB, SID y STAR (exportados de Little Navmap)
data/iamsar.js               tablas de anchura de barrido y correcciones (USCG SAR Addendum, apéndice H)
data/sarbases.js             bases SAR reales en España
scripts/exportar_aeropuertos.py   regenera data/aeropuertos.js y data/navdata.js
tests/test_geo.js            pruebas de los cálculos
```

## Desarrollo

```sh
node tests/test_geo.js                      # pruebas (Node, sin dependencias)
python scripts/exportar_aeropuertos.py      # actualiza datos de navegación (regiones LE GC GE LP LX)
python scripts/exportar_aeropuertos.py LF   # u otras regiones ICAO
```

El exportador lee la base de datos de **Little Navmap** para MSFS 2024
(`%APPDATA%\ABarthel\little_navmap_db\little_navmap_msfs24.sqlite`). Vuelve a ejecutarlo después de recargar la
escena en Little Navmap.

**Despliegue:** el servidor tiene un clon de este repositorio y nginx lo sirve como estático en `/sar/`.
Para publicar los cambios: `git pull` en el clon del servidor.

## A tener en cuenta

- Los perfiles de avión (velocidades, equipos ICAO, consumos) son orientativos: tablas `PROFILES` y `FPL_EQ` en
  `app/ui.js`.
- El radio de giro usa la velocidad sobre el suelo con el viento de cola máximo para todo el patrón, así que queda del
  lado seguro. La deriva por viento dentro de los giros no se dibuja.
- Si se cambia el banco en el código del GTN750, hay que cambiar también `GTN_BANK` en `app/geo.js`.
- Los datos de navegación proceden de MSFS (Navigraph) y son para uso en el simulador, no para navegación real.

## Fuentes

- *U.S. Coast Guard Addendum to the U.S. National SAR Supplement*, CI 16130.2G (2022), apéndice H: tablas H-8 a H-18
  de anchura de barrido visual y sus correcciones.
- *IAMSAR Manual*, vol. II y III (OMI/OACI): patrones de búsqueda.
- SDK de Working Title (incluido en el GTN750 de PMS50): `FlightPathTurnCalculator`, cálculo de la anticipación de los
  giros.
- Bases SAR: prensa especializada (AIN, defensa.com, helis.com), octubre de 2026.
