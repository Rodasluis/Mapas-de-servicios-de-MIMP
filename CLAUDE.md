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
  DIRECTORIO_SHA256 (hash del archivo) y DIRECTORIO_FECHA (fecha de publicación). La
  versión anclada se versiona en origenes/directorio/ y el build la lee de ahí: publicar
  no depende de que mimp.gob.pe responda. Sólo se descarga al pasar a una versión nueva
  (npm run datos -- --comprobar dice si la hay).
- Rodasluis/Peru-maps (solo lectura): límites departamentales, provinciales y
  distritales (INEI).
- INEI (Fase 22), sólo para el color del mapa, nunca para los servicios: población total
  proyectada por departamento, provincia y distrito (POBLACION_*) y mapa de pobreza
  monetaria 2018 (POBREZA_*). Se anclan por SHA-256 en package.json y se versionan en
  origenes/indicadores/, como el directorio; scripts/fetch-indicadores.mjs los publica en
  public/data/indicadores.json. Con ellos, el pie cita esa fuente en una línea más.
- Ríos y vías (Fase 23): red hidrográfica de la ANA y Red Vial Nacional y Departamental
  del MTC. Son servicios vivos sin versión: se ancla una INSTANTÁNEA simplificada en
  origenes/redes/ por su SHA-256 (REDES_SHA256, REDES_FECHA en package.json); se toma con
  npm run redes -- --anclar y el build (scripts/build-capas.mjs) la lee de ahí.
- VRAEM (Fase 23): la lista de sus 80 distritos vive en src/motor/vraem.js, tomada del
  D.S. N.º 040-2016-PCM modificado por el D.S. N.º 133-2022-PCM; el build la comprueba
  contra la cartografía. La marca «Zona Vraem» del directorio NO define el ámbito.
- Datos propios (Fase 23): archivos que carga quien hace el mapa, sólo en su navegador;
  nunca en el enlace. Sus puntos se dibujan con una forma que ningún
  servicio usa (rombo gris) y el pie cita la fuente que escriba.
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
   Fuentes incrustadas. Colores definidos una sola vez: los del mapa en
   src/estilo/tokens.js; los de los servicios, con su forma, en src/iconos/estilos.js
   (un solo estilo, círculo, transcrito del archivo de diseño del MIMP; el estilo casa
   se retiró en la Fase 16).
3. Todo PDF lleva en el pie las fuentes (MIMP, INEI, Natural Earth, y desde la Fase 23
   las de cada capa encendida: ANA, MTC, el decreto del VRAEM, los datos propios), la cartografía
   (proyección y retícula) y la escala. La versión del directorio (fecha de
   publicación y comienzo del hash) y la fecha de generación ya no se imprimen, ni la
   nota "Escala válida al imprimir al 100 %" —decisiones del área usuaria en la
   revisión de la Fase 20—: la versión y la fecha van en las propiedades del PDF
   (palabras clave).
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
