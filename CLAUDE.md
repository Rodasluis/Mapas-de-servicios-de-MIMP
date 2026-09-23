# Mapas imprimibles del MIMP

## Propósito
Aplicación web estática (GitHub Pages) que genera mapas de los servicios del MIMP
listos para imprenta, como PDF vectorial, con calidad comparable a un layout de QGIS/ArcGIS.
El usuario configura tamaño de hoja, orientación, ámbito (Perú, departamento, provincia,
distrito), capas, tipos de servicio y textos; la app compone el mapa y descarga el PDF.
No es una captura de pantalla: el PDF se construye a partir de geometría vectorial.

## Relación con otros repos (solo lectura)
- Rodasluis/Distancia-al-centro-de-atencion (el "buscador"): fuente ÚNICA de
  centros.json e iconos.json y de los PNG de íconos. Se descargan en el build desde un
  TAG anclado (variable DATOS_TAG en package.json). Nunca se modifica ese repo desde aquí.
- Rodasluis/Peru-maps: fuente de límites departamentales, provinciales y distritales (INEI).

## Reglas no negociables
1. No se reclasifican centros. El criterio de publicación (tabla CLASIFICACION del buscador)
   es auditado. Si un tipo no está en centros.json, no existe para este proyecto.
   Los Hogares de Refugio Temporal nunca aparecen, ni siquiera agregados en conteos.
2. Salida 100 % vectorial: ninguna imagen raster en el PDF (ni teselas, ni PNG).
   Fuentes incrustadas. Colores definidos una sola vez en tokens.
3. Todo PDF lleva en el pie: fuente de datos, versión del directorio (DATOS_TAG),
   fecha de generación y la nota "Escala válida al imprimir al 100 %".
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
