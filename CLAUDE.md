# Mapas imprimibles del MIMP

## Propósito
Aplicación web estática (GitHub Pages) que genera mapas de los servicios del MIMP
listos para imprenta, como PDF vectorial, con calidad comparable a un layout de QGIS/ArcGIS.
El usuario configura tamaño de hoja, orientación, ámbito (Perú, departamento, provincia,
distrito), capas, tipos de servicio y textos; la app compone el mapa y descarga el PDF.
No es una captura de pantalla: el PDF se construye a partir de geometría vectorial.

## Fuentes
- Directorio Nacional de Servicios del MIMP (DIRECTORIO_URL en package.json): fuente
  ÚNICA y oficial de los servicios. Su URL no cambia entre versiones, así que se ancla por
  DIRECTORIO_SHA256 (hash del archivo) y DIRECTORIO_FECHA (fecha de publicación).
- Rodasluis/Peru-maps (solo lectura): límites departamentales, provinciales y
  distritales (INEI).
- Este proyecto es INDEPENDIENTE del buscador (Rodasluis/Distancia-al-centro-de-atencion):
  no lee sus datos y no tiene que coincidir con él. Sus criterios sirvieron de punto de
  partida y nada más.

## Reglas no negociables
1. El criterio de publicación es propio y vive en un solo sitio: scripts/lib/criterios.mjs.
   Cada valor de la columna CENTRO del directorio está decidido a mano, con su motivo; un
   valor sin decidir se EXCLUYE y el build avisa. La columna CENTRO se usa tal cual como
   tipo (sólo se unifican variantes de escritura declaradas en VARIANTES).
   Los Hogares de Refugio Temporal se muestran SOLO por distrito: su ícono va en un punto
   interior del distrito de su ubigeo, nunca en una coordenada ni en una dirección, y
   llevan la marca de ubicación no exacta. Si el directorio llegara a publicar la
   dirección de un hogar, el build se detiene. Los CAR Especializados con dirección
   reservada reciben el mismo trato (siReservada: 'distrito'). Cualquier otro registro
   con dirección reservada queda fuera salvo que su tipo lo declare expresamente.
   npm run datos escribe en auditoria/ la hoja de auditoría del directorio (hallazgos y
   cambios por registro); se regenera con cada versión y no se edita a mano.
2. Salida 100 % vectorial: ninguna imagen raster en el PDF (ni teselas, ni PNG).
   Fuentes incrustadas. Colores definidos una sola vez en tokens.
3. Todo PDF lleva en el pie: fuente de datos, versión del directorio (fecha de
   publicación y comienzo del hash), fecha de generación y la nota
   "Escala válida al imprimir al 100 %".
4. Salida determinista: la misma configuración produce el mismo PDF (salvo la fecha).
5. Trabajo por fase en rama propia (fase-N-...). main solo recibe merges revisados,
   porque cada push a main despliega en Pages.
6. Al terminar cada fase: detente, reporta qué hiciste, qué quedó pendiente y
   los PDF de prueba generados en /muestras. No empieces la fase siguiente sin aprobación.

## Stack
- Vite (vanilla JS, módulos ES), sin framework de UI.
- d3-geo para proyección y paths; proj4 para coordenadas UTM de la grilla.
- jsPDF + svg2pdf.js para exportar; fuentes TTF incrustadas.
- topojson-server/simplify/client en scripts de build (Node).
- Playwright para tests de regresión visual de los PDF.
- Proyección: UTM zona 18S (EPSG:32718) como referencia. Para el dibujo:
  d3.geoTransverseMercator().rotate([75, 0]); la grilla se rotula con valores UTM de proj4.

## Tipografía y estilo
- Poppins (títulos, leyenda, bloques de texto) — formato institucional MIMP.
- Source Sans 3 (rótulos del mapa, por su legibilidad en tamaños pequeños).
- Paleta institucional: azul y rojo MIMP; coropletas en rampa de naranjas como el
  mapa de referencia (referencias/mapa_referencia_2020.png).
- Unidades internas en milímetros; conversión a puntos solo al exportar.

## Idioma
Interfaz, código comentado, commits y documentación en español.
