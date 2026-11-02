# Mapas imprimibles del MIMP

Aplicación web estática que genera mapas de los servicios del MIMP **listos para
imprenta**, como PDF vectorial. El usuario elige tamaño de hoja, orientación, ámbito
(Perú, departamento, provincia, distrito), capas, tipos de servicio y textos; la
aplicación compone el mapa y lo descarga.

No es una captura de pantalla ampliada: el PDF se construye a partir de la geometría,
con las fuentes incrustadas, de modo que se puede imprimir en A0 —o en 2A0 y 4A0— sin
que aparezca un solo píxel.

> **En producción** en **https://rodasluis.github.io/Mapas-de-servicios-de-MIMP/**.
> Cuatro ámbitos, hojas de A4 a 4A0 y nivel de división elegible. El repositorio se comprueba
> solo: regresión visual de los PDF, integridad de los totales, vectorialidad y
> rendimiento, en cada pull request y antes de cada despliegue.

Documentación: **[manual de uso](docs/manual.md)** para quien produce mapas y
**[decisiones cartográficas](docs/decisiones-cartograficas.md)** para quien necesita
saber por qué el mapa es como es.

## Puesta en marcha

```bash
npm install
npm run dev        # servidor de desarrollo (prepara los datos la primera vez)
```

Para generar el sitio tal y como se publica:

```bash
npm run build      # prepara lo que falte y compila en dist/
npm run preview    # sirve dist/ para revisarlo
```

La primera ejecución descarga unos 95 MB de cartografía y tipografías y tarda algo más
de un minuto. Queda todo en `.cache/`, así que las siguientes son de segundos.

## De dónde salen los datos

Nada de lo que hay en `public/data` ni en `public/fonts` se versiona: son material
derivado que el build reconstruye desde orígenes **anclados a una versión concreta**,
declarada en `package.json`. Así dos personas que compilen el mismo commit obtienen
exactamente el mismo mapa.

| Variable | Origen | Qué aporta |
|---|---|---|
| `DIRECTORIO_URL` + `DIRECTORIO_SHA256` + `DIRECTORIO_FECHA` | [Directorio Nacional de Servicios del MIMP](https://www.mimp.gob.pe/omep/Consolidado_Directorio_Nacional_2026.xlsx) (publicación abierta) | todos los servicios: `centros.json` |
| `GEO_TAG` | [Peru-maps](https://github.com/Rodasluis/Peru-maps) | límites de departamento, provincia y distrito (INEI) |
| `NATURAL_EARTH_TAG` | [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) | países vecinos, océano y lagos |
| `POPPINS_TAG` | [google/fonts](https://github.com/google/fonts) | Poppins (SIL OFL 1.1) |
| `SOURCE_SANS_TAG` | [adobe-fonts/source-sans](https://github.com/adobe-fonts/source-sans) | Source Sans 3 (SIL OFL 1.1) |
| `POBLACION_URL` + `POBLACION_SHA256` + `POBLACION_FECHA` + `POBLACION_ANIO` | [INEI: población total proyectada 2018-2026 por departamento, provincia y distrito](https://www.gob.pe/institucion/inei/informes-publicaciones/6894980-peru-poblacion-total-proyectada-al-30-de-junio-de-cada-ano-segun-departamento-provincia-y-distrito-2018-2026) | población para la tasa por cada 100 mil habitantes: `indicadores.json` |
| `POBREZA_URL` + `POBREZA_SHA256` + `POBREZA_FECHA` | [INEI: mapa de pobreza monetaria provincial y distrital 2018, anexo estadístico](https://www.gob.pe/institucion/inei/informes-publicaciones/3204872-mapa-de-pobreza-provincial-y-distrital-2018) | pobreza monetaria total: `indicadores.json` |

`GEO_TAG` admite una etiqueta, una rama o un SHA de commit.

La única fuente de los servicios es el **Directorio Nacional de Servicios del MIMP**,
que el ministerio publica en abierto. Este proyecto es independiente del buscador
(Distancia-al-centro-de-atencion): no lee sus datos y no tiene por qué coincidir con él.

A diferencia del resto de orígenes, la versión anclada del directorio **se versiona en
el repositorio**, en `origenes/directorio/` (234 KB). El build la lee de ahí y no
depende de que mimp.gob.pe esté en línea: el 12 de octubre de 2026 el sitio no
respondía y, mientras el directorio se descargaba en cada build, no se pudo publicar.

### Actualizar el directorio de servicios

La URL del directorio no cambia entre versiones, así que se ancla por el hash del
archivo. Para saber si el MIMP publicó otra versión:

1. `npm run datos -- --comprobar` descarga lo que hay hoy en la URL y dice si es la
   versión anclada o, si no, qué hash y qué fecha poner en `package.json`.
2. Con `DIRECTORIO_SHA256` y `DIRECTORIO_FECHA` actualizados, `npm run datos`
   descarga la versión nueva, la verifica y la deja en `origenes/directorio/` en lugar
   de la anterior. Confírmala en git junto con `package.json`.
3. Lee el informe: total, recuento por tipo, calidad de las coordenadas, centros
   reubicados, excluidos con su motivo y **tipos sin criterio** (un servicio nuevo del
   MIMP queda fuera hasta que se decida en `scripts/lib/criterios.mjs`).
4. `npm run build` y vuelve a aprobar las referencias visuales.

La versión queda registrada en `public/data/version.json` y va en las propiedades de
cada PDF (palabras clave), para que un archivo siempre diga de qué corte de datos
salió. Hasta la revisión de la Fase 20 también se imprimía en el pie; el área usuaria
pidió un pie con sólo las fuentes y la cartografía (ver «El pie»).

### Población y pobreza del INEI

Desde la Fase 22 el color del mapa puede medir algo más que los servicios (ver «Qué mide
el color»), y para eso hay dos fuentes del INEI, tratadas como el directorio: cada
archivo se ancla por su SHA-256 en `package.json`, su copia verificada se versiona en
`origenes/indicadores/` (750 KB entre los dos) y el build la lee de ahí, así que no
depende de que gob.pe responda. `scripts/fetch-indicadores.mjs` comprueba el hash, lee
los cuadros y escribe `public/data/indicadores.json` (57 KB), con los valores por ubigeo
en el formato de la cartografía. Si algo no cuadra, el build se detiene.

- **Población**: el cuadro «Población total proyectada al 30 de junio de cada año, según
  departamento, provincia y distrito, 2018-2026», publicado el 31 de diciembre de 2025
  para los 1.892 distritos actuales. Se usa el año `POBLACION_ANIO` (2026). Antes de
  publicarla se comprueba que la población de cada provincia sea la suma de sus
  distritos y la del país, la de sus departamentos.
- **Pobreza**: el anexo estadístico del «Mapa de pobreza monetaria provincial y
  distrital 2018», publicado el 20 de febrero de 2020. El INEI no da una cifra por
  distrito sino el **intervalo de confianza al 95 %** de la incidencia de pobreza
  monetaria total; se usa su **punto medio**, que es la estimación puntual, y la leyenda
  lo dice. 476 distritos se estimaron agrupados y comparten valor. El anexo trae también
  los departamentos, salvo Amazonas, cuya fila viene vacía: por departamentos, Amazonas
  sale «Sin dato».

Frente a la cartografía quedan sin dato los distritos creados después de cada cuadro:
uno sin población (Sangani, 120307) y diecinueve sin pobreza. El mapa los deja en blanco
y la leyenda los nombra como «Sin dato»: un hueco sin explicar se leería como un cero.

Para pasar a otra versión de cualquiera de los dos, se cambian su URL, su hash y su
fecha en `package.json` y se ejecuta `npm run preparar`: el archivo nuevo se descarga,
se comprueba y sustituye al anterior en `origenes/indicadores/`.

### Criterio de publicación

Qué se publica lo decide `scripts/lib/criterios.mjs`: cada valor de la columna CENTRO
del directorio tiene su decisión y su motivo escritos. Un valor que no figure ahí se
excluye y el build avisa. El resultado actual: 22 tipos publicados y 7 excluidos por no
tener local de atención al público (Línea 100, Chat 100, Coordinación Territorial,
SOUFCAT, Familias Igualitarias, Inabif en Acción y la Unidad de Asistencia Económica).

Dos decisiones propias de este proyecto:

- **Educadores de Calle** (23): intervienen en vía pública; se dibuja la sede desde la
  que opera cada equipo.
- **Hogares de Refugio Temporal** (29): el directorio no publica su dirección («No se
  registra por confidencialidad») ni su coordenada, sólo el ubigeo. El ícono se pone en
  el polo de inaccesibilidad de su distrito, con asterisco, y la leyenda y la tabla
  dicen que el punto es el distrito y no la sede. Si el directorio llegara a publicar la
  dirección de un hogar, `npm run datos` se detiene: la tabla la imprimiría.

Los **CAR Especializados** con la dirección reservada (6 de 12) reciben el mismo trato
que los hogares: se sitúan en su distrito, con asterisco. Los otros seis van en su
coordenada. Es una decisión expresa del criterio (`siReservada: 'distrito'`): cualquier
otro registro con la dirección reservada **queda fuera** mientras su tipo no la declare.

### Coordenadas

Cada coordenada se repara si viene mal escrita (coma decimal, punto decimal perdido) y
se comprueba contra el polígono de su distrito:

- a menos de 100 m fuera: es la simplificación de la cartografía; se da por buena;
- a menos de 2 km: sede junto al límite; se conserva, con asterisco;
- más lejos: la coordenada es de otro sitio; se sitúa en un punto interior de su
  distrito, con asterisco, y la original queda en `coordenadaOriginal` para auditarla.

Como esa comprobación usa los polígonos distritales, el paso de datos se ejecuta después
de la cartografía.

### Hoja de auditoría

`npm run datos` escribe también `auditoria/auditoria_directorio_<fecha>.xlsx`: el
directorio completo, con sus columnas originales, y a la derecha lo que este proyecto
hizo con cada registro. Sirve para revisar las coordenadas y los ubigeos y, si procede,
pedir la corrección al MIMP.

| Hoja | Contenido |
|---|---|
| Directorio auditado | Una fila por registro. Columnas añadidas: tipo y nombre en el mapa, si se publica y por qué, **Hallazgos** (lo encontrado en el tipo, el ubigeo o la coordenada), **Cambio realizado** (lo que se hizo para subsanarlo), dónde se dibuja, a cuántos km de su distrito cae la coordenada y en qué distrito cae de verdad. Las filas con hallazgos van resaltadas y las que no se publican, en gris. |
| Criterios | Cada valor de la columna CENTRO con su decisión, su motivo y cuántos registros tiene y se publican. |
| Léeme | Versión del directorio, recuentos y las reglas aplicadas. |

El directorio del MIMP no se modifica: los cambios sólo se aplican al mapa. La hoja es
determinista —el mismo directorio produce el mismo archivo byte a byte— y sólo se
conserva la de la versión vigente; las anteriores quedan en el historial de git.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run datos` | Construye y **verifica** el directorio de servicios (`-- --comprobar` mira si el MIMP publicó otra versión) |
| `npm run fuentes` | Descarga Poppins y Source Sans 3 con sus licencias |
| `npm run geo` | Descarga la cartografía y construye el TopoJSON |
| `npm run preparar` | Ejecuta los pasos anteriores que falten (`-- --forzar` rehace todo) |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Prepara lo necesario y compila en `dist/` |
| `npm run logos` | Normaliza los logotipos de `referencias/logos/` |
| `npm run metricas` | Extrae las métricas de las tipografías |
| `npm run muestras` | Genera y verifica los PDF de `muestras/`, y compara la descarga de la web con ellos |
| `npm run qa` | Que el dibujo no cambió, vectorialidad y rendimiento (`-- --aprobar` fija referencias) |

## Cómo está organizado

```
scripts/      build: descarga, verificación y construcción de la cartografía
src/motor/    composición del mapa y exportación a PDF
src/iconos/   estilos de íconos (estilos.js) y siglas de cada tipo de servicio
src/ui/       interfaz: configuración, panel y vista previa
src/estilo/   tokens.js — única definición de colores, tipografías y grosores
public/       lo que se sirve tal cual (datos y tipografías, generados)
referencias/  mapa de 2020 y logotipos que sirven de referencia
muestras/     PDF de prueba que genera `npm run muestras` (no se versionan)
origenes/     copia versionada del directorio del MIMP anclado (DIRECTORIO_SHA256)
auditoria/    hoja de auditoría del directorio del MIMP, regenerada por `npm run datos`
tests/        verificación de los PDF, regresión visual y la web frente a las muestras
docs/         manual de uso y registro de decisiones cartográficas
```

### La cartografía, en tres niveles

`scripts/build-geo.mjs` publica cada capa en tres niveles de detalle, elegidos por un
criterio de imprenta y no a ojo: en papel no se distinguen dos trazos separados por
menos de unos 0,15 mm, así que un nivel con tolerancia *T* sobre el terreno es
indistinguible del original desde la escala 1:(*T* / 0,15 mm) hacia escalas menos
detalladas.

Cada nivel indica el denominador de escala **mínimo** al que sigue siendo
indistinguible del original; el motor escoge el más ligero que cumpla `N >= mínimo`.

| Nivel | Tolerancia | Válido desde | En la práctica |
|---|---:|---|---|
| `bajo` | 1 200 m | 1:8 000 000 | mapas de ubicación |
| `medio` | 300 m | 1:2 000 000 | nacional en A4 (1:7,9 M) y A3 (1:5,4 M) |
| `alto` | 40 m | 1:266 000 | nacional en A0 (1:1,8 M), departamento, provincia y distrito |

Dos detalles que evitan defectos visibles al imprimir:

- La simplificación se hace **sobre una topología común**, de modo que un límite
  compartido por dos distritos se simplifica igual en los dos. Simplificados por
  separado, aparecen hilos blancos a lo largo de las fronteras.
- Provincias y distritos se reparten en un archivo por departamento conservando **los
  mismos arcos** de esa topología, así que el borde entre dos departamentos encaja
  exactamente aunque cada uno se cargue de un archivo distinto. El build lo comprueba.

El build termina midiendo la superficie del Perú sobre la geometría ya publicada y
comparándola con los 1 285 216 km² oficiales del INEI: sale 1 291 717 km² (+0,51 %),
lo que valida de una vez el sentido de giro de los anillos, la topología y las unidades.

`public/data/geo/indice.json` describe los niveles, los archivos y las cajas
envolventes; es lo que el motor consulta para elegir qué cargar.

## El motor: del dato al PDF

`src/motor/` compone **un solo SVG** que sirve a la vez de vista previa y de original
de imprenta, y `svg2pdf` lo traduce trazo por trazo a operadores de dibujo del PDF. No
hay dos caminos de dibujo, así que la pantalla y el papel no pueden divergir.

- **Todo se mide en milímetros.** El `viewBox` del SVG es la hoja en mm, de modo que un
  `stroke-width` de 0,3 son 0,3 mm impresos. Los grosores y los cuerpos de texto están
  en medidas **reales de imprenta** (`src/estilo/tokens.js`): un límite departamental
  mide lo mismo en A4 que en A0. Lo que cambia con la hoja es cuánto cabe, no el tamaño.
- **La escala se mide, no se deduce.** Se compara una distancia sobre el terreno con la
  que ocupa en el papel, en el centro del marco. Como la Mercator transversa estira al
  alejarse del meridiano central, se comprueban también las esquinas: en el nacional la
  variación es del 0,7 %, que se absorbe en el redondeo de la escala impresa.
- **Nada de mapas de bits.** `tests/verificar-pdf.mjs` rechaza cualquier PDF que
  contenga un `<image>` o que caiga en una tipografía del visor.

`npm run muestras` genera los PDF desde un Chromium sin ventana en lugar de componerlos
en Node, porque `svg2pdf` mide el texto con el motor de tipografía del navegador: así
una muestra y una descarga desde la web salen del mismo código y del mismo medidor.

Con `-- --fecha=AAAA-MM-DD` la salida es reproducible **byte a byte**: además de la
fecha se fija el identificador de archivo del PDF, que jsPDF sortea al azar en cada
ejecución. Sin ese detalle, dos salidas idénticas no se parecen al compararlas.

## La capa temática

Cada provincia se rellena según **cuántos tipos de servicio distintos** tiene, con las
clases del mapa de 2020 (1 · 2-3 · 4-6 · 7-9 · 10+). Las que no tienen ninguno quedan
en blanco: «sin servicio» y «con uno» no pueden compartir tono. Encima van los
símbolos: **un ícono por tipo presente, con el número de sedes debajo**, agrupados
alrededor del polo de inaccesibilidad de la provincia y no de su centroide, que en una
forma cóncava cae fuera.

Nada de esto está escrito a mano. El filtro de tipos recorre todo el camino: al dejar
un tipo activo, el coropletas se recalcula, la leyenda se queda con una línea y las
clases altas desaparecen porque ninguna provincia llega a ellas.

La rampa **empieza en el tono más claro** para la clase más baja que el mapa use. El
Perú por departamentos no tiene ninguno con menos de cuatro tipos de servicio, y con la
rampa fija salía entero en los tres tonos oscuros; ahora sus clases (4-6, 7-9 y 10+)
toman los tres primeros. La rampa se desplaza, no se reparte: las distancias entre
clases se conservan —un hueco sigue viéndose como un salto— y un mapa cuya clase más
baja ya es la primera sale igual que antes. La leyenda y los recuadros usan la misma
rampa desplazada.

La leyenda va **siempre abajo a la izquierda**, en todos los formatos: que cambiara de
esquina según la hoja obligaba a buscarla de nuevo en cada mapa. Cuando no cabe no se
muda, encoge — más columnas, siglas en lugar de nombres y cuerpos menores, en ese
orden, porque un nombre completo en cuerpo pequeño se lee mejor que «CARPAM» en cuerpo
grande.

**Los tipos que el directorio escribe abreviados van enteros**: «CAR» es Centro de
Acogida Residencial, «SAIPD» Servicio de Atención Integral de Personas con Discapacidad
y «PCD» personas con discapacidad (`nombre` en `src/iconos/catalogo.js`; lo pidió el
área usuaria en la revisión de la Fase 20). Del mismo modo, «Centro de Atencion
Institucional», que el directorio escribe sin tilde, lleva su tilde en la leyenda. El
tipo sigue siendo la clave del directorio: sólo cambia lo que se lee. Estos tipos no se
abrevian nunca, y para que la leyenda no se
ensanche **un nombre más largo que su columna se parte en líneas**, con el ícono a la
altura de la primera. Así en A4 la leyenda pasó de dos columnas con siglas a una con
los nombres completos.

**Y cada nombre lleva su sigla** (`nombreConSigla` en `src/motor/leyenda.js`), con el
formato del propio directorio: «Centro Emergencia Mujer y Familia - CEM», «Centro de
Acogida Residencial Básico - CAR Básico». El directorio ya escribe así once tipos
(«Servicio de Atención Rural - SAR») y a ésos no se les repite. La sigla es la del
catálogo, la misma de la hoja de íconos y de los enlaces de la web. Lo pidió el área
usuaria después de la Fase 20, y con ella las siglas de los CAR pasaron de «CAR B»,
«CAR E» y «CAR U» a «CAR Básico», «CAR Especializado» y «CAR Urgencia». Un enlace
guardado con las de antes sigue abriendo el mismo mapa.

**Y se dibuja al 70 %** (`REDUCCION_LEYENDA` en `src/motor/render.js`), para dejar más
sitio al recuadro de zoom; también lo pidió el área usuaria. El tamaño se elige como
siempre, con la leyenda entera, y sólo después se reduce: elegirlo ya reducida daba
una caja más holgada que la leyenda llenaba con un cuerpo mayor. El texto no baja de
4 pt (`CUERPO_MINIMO_LEYENDA_PT`), así que en A4, donde ya iba a ese cuerpo, apenas
encoge.

**Dos cajas: los tipos y, aparte, las clases.** «Presencia de servicios por …» va en
una caja propia (`bloqueClases`), más pequeña, a la derecha de la leyenda y alineada
por abajo (`sitioJunto` en `src/motor/layout.js`), con el mismo cuerpo de letra. Juntas
eran una caja tan alta como la columna de los tipos.

**La fila de abajo: leyenda, clases y escala.** Abajo a la izquierda sobra ancho —es el
Pacífico— y lo que le falta al recuadro de zoom, que va encima, es alto. Por eso la
leyenda procura ser ancha y baja, con cada nombre en una línea: se prueban de una a
cuatro columnas, cada columna tan ancha como su nombre más largo y con el aire de un
ícono hasta la siguiente. Una disposición sólo vale si detrás caben, en la fila de
abajo, la caja de las clases y la **escala gráfica** (`sitioAbajo`), que con la leyenda
ancha se iba encima de ella y le quitaba al recuadro lo que la leyenda le daba. Se
empieza por el cuerpo de la leyenda de una columna, y un cuerpo menor sólo gana si deja
la leyenda al menos un 15 % más baja (`MEJORA_POR_CUERPO`): el área usuaria prefiere la
letra algo menor y la escala abajo a una leyenda alta. A la leyenda ancha no se le
tolera tapar más de un 0,5 % de país (`TERRITORIO_TOLERADO_LEYENDA_ANCHA`): un 8 % de
una caja de medio metro son centímetros de costa. Si nada de eso cabe —en un mapa
departamental la esquina puede ser tierra—, queda la de una columna con los nombres
partidos. Los títulos en negrita llevan sólo el aire de su línea: antes dejaban otra
media en blanco.

Con la leyenda reducida y baja, las clases aparte y el pie a la mitad, el recuadro de
Lima y Callao gana el alto que ellos dejan:

| Hoja | Leyenda | Recuadro de Lima y Callao, antes → ahora |
|---|---|---|
| A3 | 67 × 65 mm, una columna | 39 × 67 → 60 × 108 mm |
| A1 | 212 × 65 mm, dos columnas | 89 × 150 → 148 × 258 mm |
| A0 | 361 × 97 mm, dos columnas | 121 × 205 → 216 × 372 mm |
| 2A0 por distritos | 537 × 94 mm, tres columnas | 286 × 492 → 310 × 532 mm |

`npm run muestras` dice qué composición eligió cada lámina.

Hasta la revisión de la Fase 20 la leyenda llevaba al pie una nota sobre los centros
dibujados en su distrito y no en su sede; se quitó a pedido del área usuaria. La marca
de ubicación no exacta sigue en los datos y en la tabla de los mapas distritales.

Sus íconos crecen con la hoja **igual que su texto**: 3,4 mm en A4 y lo mismo
multiplicado por el factor del formato en las demás (`ICONO_LEYENDA_MM` en
`src/motor/leyenda.js`). Hasta la Fase 20 tomaban el tamaño del ícono del mapa con un
tope de 5 mm; el del mapa crece sólo con la raíz del formato, porque tiene que caber en
las provincias, y en un A0 el ícono de la leyenda medía la mitad que la letra de al
lado.

### Qué mide el color

Hasta la Fase 21 el color de cada unidad decía siempre lo mismo: cuántos tipos de
servicio distintos hay en ella. Desde la Fase 22 se elige en el panel, en «Color del
mapa», y viaja en la URL como `variable` (`src/motor/variables.js`):

| Variable | Qué mide | Clases | Rampa |
|---|---|---|---|
| `presencia` (la de siempre) | tipos de servicio distintos en la unidad | 1 · 2-3 · 4-6 · 7-9 · 10+ | naranjas, desplazada |
| `centros` | centros de atención en la unidad, de los tipos marcados | los mismos tramos, en centros | naranjas, desplazada |
| `cobertura` | distancia en línea recta al centro de atención más cercano | con centro en la unidad · hasta 10 km · 10-25 · 25-50 · 50-100 · más de 100 | azules, fija |
| `tasa` | centros de atención por cada 100 mil habitantes | menos de 2 · 2-5 · 5-10 · 10-25 · 25 o más | naranjas, fija |
| `pobreza` | pobreza monetaria total, 2018 (%) | menos de 15 · 15-30 · 30-45 · 45-60 · 60 o más | morados, fija |

Lo que se cuenta y se mide son **centros de atención**, cada sede del directorio; el
**servicio** es el tipo (CEM, SAR…). El área usuaria pidió esa distinción al revisar la
fase: la segunda opción se llamaba «número de servicios». Todas cuentan con los **tipos
marcados**: con sólo los CEM, el número es de CEM y la distancia es al CEM más cercano,
y la leyenda lo dice («al CEM más cercano»). La pobreza es la excepción: no depende de
los servicios, aunque los íconos sí.

- **La distancia** se mide desde el **centro geográfico** de cada unidad hasta el
  centro de atención más cercano de esos tipos, esté donde esté: una provincia de Puno
  puede tener el suyo en Cusco. En línea recta, no por carretera, que es lo único que se
  puede afirmar con estos datos; la leyenda lo explica en una nota bajo su título. Una
  unidad con algún centro forma su propia clase, «Con centro de atención en el
  distrito». Los cortes salen del reparto real: con todos los tipos, la mitad de los
  distritos sin ningún centro tiene uno a menos de 15 km, y con sólo los CAR la mayoría
  pasa de 50, por eso hay un tramo más allá de 100. Por provincias o departamentos la
  medida es gruesa —todas las provincias tienen algún centro— y un aviso ofrece dividir
  hasta distritos.
- **La tasa** divide los centros de atención de la unidad entre su población
  proyectada. Una unidad sin centros queda en blanco, como en el mapa de siempre, y la
  nota de la leyenda lo recuerda.
- **La pobreza** usa el punto medio del intervalo del INEI (ver «Población y pobreza del
  INEI»).

Cada familia lleva **su color**: naranjas para lo que cuenta centros, azules para la
distancia —más oscuro es más lejos, al revés que en los naranjas, y con la misma rampa
las dos lecturas se confundirían— y morados para la pobreza, que no es un dato de los
servicios. Las rampas viven en `src/estilo/tokens.js`. Sólo la de siempre se
**desplaza** según la clase más baja que el mapa use; en las nuevas cada tono significa
siempre lo mismo, y el más claro de la distancia es «hay servicio aquí». Lo que no tiene
dato va en blanco y, si aparece, la leyenda lo nombra.

Con población o pobreza, **el pie lleva una tercera línea** con esa fuente («Población:
INEI, población total proyectada al 30 de junio de 2026.»), y las propiedades del PDF
guardan el comienzo del hash de cada archivo. El mapa de siempre no carga los
indicadores y sale idéntico byte a byte al de la Fase 21.

### Los íconos

Los servicios se dibujan con **círculos** de color y pictograma blanco, centrados en el
punto que representan. Hasta la Fase 15 había además un estilo casa, a elegir en el
panel; se retiró en la Fase 16 a pedido del área usuaria, y un enlace antiguo con
`?iconos=casa` o `?iconos=circulo` abre hoy el mismo mapa que sin el parámetro.

Salen del archivo de diseño entregado por el MIMP («iconos (1) PROPFINAL.ai», 15 de
octubre de 2026): la geometría y los colores se extrajeron de su mesa de círculos y se
transcribieron a `src/iconos/estilos.js`, que es la **única definición** de la forma y el
color de cada tipo. No se redibujó nada. Respecto del archivo anterior cambiaron tres
íconos —el escudo del UPE, la familia del CEDIF y la figura del Mi60+, que pierde el
bastón—, y `estilos.js` anota también las diferencias del archivo que no son de diseño
y se dejaron como estaban. **Educadores de Calle** sigue sin estar en el archivo y lleva
un ícono **provisional** hasta que diseño entregue el suyo.

El tamaño se fija en milímetros reales de impresión y ningún trazo baja de 0,1 mm, que
es lo que una imprenta offset garantiza. Los íconos se diseñaron para 3,4 mm en A4;
**en el mapa se dibujan a la mitad** (`tamanoDeIcono` en `src/motor/servicios.js`):
1,7 mm en A4, 2 mm en A3, 2,3 mm en A2 y 2,7 mm en A1, **y en el A1 se quedan**: A0,
2A0 y 4A0 llevan el mismo ícono de 2,7 mm. La mitad la pidió el área usuaria en la
revisión de la Fase 20, para que los grupos no se choquen; el tope en A1, en la revisión
de la Fase 21, porque en 4A0 —donde el ícono llegaba a 4,1 mm— los grupos de Trujillo y
de Áncash se veían saturados. Es menos que los 3 mm en los que el pictograma se lee
bien, así que a ese tamaño los tipos se distinguen sobre todo por el color. La leyenda
no se reduce: tiene su propia medida.
`muestras/iconos.pdf` imprime cada ícono a 3, 4,5 y 6 mm junto a su tipo, sigla y color:
es a la vez la documentación de la correspondencia y la comprobación de que a tamaño
real siguen distinguiéndose.

Un aviso sobre la paleta, que es la del diseño: CAR Básico, CAR de Urgencia y
Plataforma de Atención llevan tres azules casi iguales (#0066c5, #0069cc y #0067c7) y se
distinguen sólo por el pictograma. Con el ícono del mapa a 1,7 mm, en un A4 apenas se
distinguen: es la contrapartida de reducirlo.

### Cómo se reparten los íconos de un grupo

Por omisión, los íconos de cada unidad van **en rejilla, adaptada a la forma de la
unidad** (`repartirEnRejilla` en `src/motor/servicios.js`). Es el punto medio entre la
cuadrícula fija de antes y el anillo de QGIS: se lee como una tabla —de izquierda a
derecha y de arriba abajo, el tipo más frecuente primero— siempre que la unidad lo
permite y, cuando no, sigue su forma. Cada ícono ocupa una celda, él y su cifra debajo.
Se prueba, por este orden:

1. **La rejilla junto a su nombre.** El nombre de la unidad, medido igual que lo mide el
   motor de rótulos (`medirRotulo`), se pone encima de la rejilla, debajo o a un lado,
   en una línea, en dos o —si el nivel lo admite— en vertical, y el bloque entero se
   corre por los puntos interiores de la unidad hasta que cabe dentro. Si no cabe entero,
   vale el que deje el nombre menos fuera, hasta la mitad, y lo que sale cuenta a la
   mitad si el nombre va encima o debajo de la rejilla (`DESCUENTO_APILADO`); si el
   nombre es estricto (los distritos del Perú por distritos), sólo entero dentro, y
   además se prueba alineado con un borde de la rejilla y, si a su cuerpo no hay
   bloque posible, con la letra un 15 % menor, como lo probará el motor de rótulos. Ese
   hueco queda **reservado** para el nombre: otro rótulo que lo pise paga un coste, así
   que una provincia no se lo quita a su distrito teniendo otro sitio.
2. **La rejilla compacta**, la más cuadrada, en el punto de la unidad, si cabe entera.
3. **Las demás rejillas**, de la más cuadrada a la más alargada —dos filas, una fila,
   una columna—, en cada uno de los diez puntos interiores de la unidad y corridas hasta
   una celda alrededor de cada uno. Hasta la Fase 21 sólo se probaban en el centro y con
   medio corrimiento, y en una unidad irregular la rejilla cabía entera unos milímetros
   más allá y se quedaba asomando.
4. **La forma.** Si ninguna cabe, las celdas se toman de una en una a partir de cada
   punto interior, siempre la más cercana que toque a las ya puestas y caiga dentro: en
   una provincia angosta y torcida el grupo se estira a lo largo de ella en vez de
   salirse por los lados. Huancayo en A1 tiende sus íconos por el brazo norte de la
   provincia, y Arequipa en A4 los escalona según su contorno.

Gana la que deja más íconos dentro de la unidad; a igualdad, la que va antes. En una
unidad donde no cabe ni un ícono queda la compacta. Como un grupo que sigue la forma no
es un rectángulo, los rótulos, la ocupación y el apiñamiento lo miden **celda por
celda**, no por su caja envolvente. Y ninguna celda pisa los nombres del nivel previo
—los departamentos del mapa del país—, que se colocan antes que las rejillas (ver «El
nivel previo se coloca antes que las rejillas»), ni las rejillas ya puestas: los grupos
se colocan **de la unidad más estrecha a la más ancha** —por el radio de su polo—, y
cada uno esquiva los anteriores y el hueco que dejaron a su nombre cuando cae entero
dentro de su unidad (revisión de la Fase 21).

En la Fase 20 la disposición por omisión fue el **anillo**, como el «desplazamiento de
puntos» de QGIS, y el área usuaria prefirió la rejilla. El anillo sigue disponible en el
panel («Íconos de cada grupo») o con `?disposicion=anillo` (`repartirEnAnillo`): de 2 a
6 íconos, un solo anillo del radio justo; con siete o más, el más frecuente en el centro
y los demás en anillos concéntricos, el empaquetado del panal.

**La cifra bajo cada ícono** (cuántas sedes de ese tipo hay) va pegada al borde
inferior del círculo y sólo reserva el alto real de un dígito más un hilo de aire
(`cifraDeGrupo`, el mismo para el mapa y los recuadros). Iba en 5,2 pt y reservaba una
línea entera de texto, con su sitio para acentos y descendentes que una cifra no tiene:
cada ícono con su número ocupaba casi una vez y media su propio alto. En la Fase 20 pasó
a 3,8 pt, y con la cifra compacta los grupos que se tocan en el Perú A4 bajaron de 142
a 108 en anillo y de 89 a 65 en rejilla; en A1, de 34 a 18 y de 5 a 2. En la revisión
de la Fase 21 el área usuaria la vio todavía grande frente al ícono —el dígito medía
algo más de la mitad del diámetro— y pidió un 40 % menos: se aplica con un **suelo de
2,8 pt**, porque el 40 % a secas dejaría la cifra en 2,3 pt en A4, medio milímetro de
alto, que en papel no se lee a ojo. Queda A4 2,8 · A3 2,8 · A2 3,1 · A1 3,6 pt, el
dígito en torno al 40 % del diámetro del ícono, y de A0 en adelante se queda en los
3,6 pt del A1, como el ícono; el halo sigue al dígito (un cuarto de su alto) en vez de
crecer con la hoja. El aire a los lados de cada ícono (12 % de su
lado, `ANCHO_CELDA`: 0,2 mm en A4) se dejó como estaba: es lo justo para que dos
círculos no se toquen.

### Los recuadros de zoom

**De quién es cada recuadro.** Uno por **departamento**, y se llama por su nombre.
Antes la región se armaba fusionando las cajas de las provincias apiñadas que se
tocaban, y salían conjuntos sin correspondencia con ninguna división real —tres
provincias de Áncash, una de La Libertad y media de Huánuco— que sólo se podían rotular
«Zoom 1». Un recuadro que hay que ir a buscar al mapa para saber de dónde sale no es un
zoom: es otro mapa suelto. Ahora dice «Cusco» y dentro sólo hay provincias de Cusco.

Lima se parte en dos zonas, y no por capricho administrativo. **Lima Metropolitana y
Callao van juntos**: son dos ámbitos en el papel y una sola mancha urbana en el mapa, y
ampliarlos por separado daría dos recuadros que enseñan lo mismo. **Lima provincias va
aparte**: las otras nueve provincias se extienden trescientos kilómetros al norte y al
sur, y meterlas en el mismo recuadro obligaría a una escala en la que la conurbación
—que es lo apiñado— volvería a ser un punto.

**Qué se amplía.** Los departamentos con **más servicios**, de mayor a menor. El
criterio anterior era el apiñamiento, que mide otra cosa: cuánto se pisan los íconos en
el papel, lo cual depende del tamaño de la hoja y de la forma de la provincia. Con él,
una provincia diminuta con tres servicios salía por delante de un departamento con
cuarenta repartidos. Lo que se quiere ver de cerca es dónde hay más.

**Qué trozo del departamento.** El departamento **entero**, siempre que quepa ampliado.
Cuando no cabe, su núcleo, y el informe lo dice.

Es una limitación de superficie, no una decisión: Cusco ocupa 154 × 185 mm en un A1 y el
mayor hueco libre de la lámina son 131 × 156, porque el Perú está en medio y a los lados
sólo quedan dos franjas de unos 130 mm. Dibujarlo ahí daría un «zoom» a 0,85 veces el
tamaño del mapa: una reducción rotulada como ampliación. En A0 horizontal, donde el hueco
sí da, Cusco sale completo con sus trece provincias a ×1,9; en A2 sale su núcleo —las
provincias del entorno de la ciudad— a ×4,3. El rectángulo rojo sobre el mapa principal
marca exactamente el trozo ampliado, y cuando es parcial el informe avisa de que hace
falta una hoja mayor para verlo completo.

**Cómo se ve qué zona amplía cada recuadro.** El nombre va sólo en el recuadro, no
sobre el rectángulo rojo del mapa: hasta la revisión de la Fase 20 lo llevaban los dos, y
el del mapa tapaba los íconos de la unidad vecina («Lima Metropolitana y Callao» caía
sobre los de Huaral). Lo que une cada rectángulo con su recuadro son **dos líneas en
degradado** entre esquinas iguales —las dos de fuera, que no atraviesan ninguno de los
rectángulos—, a plena tinta junto a cada uno y casi transparentes a mitad de camino
(`lineasDeEnlace` en `src/motor/zoom.js`). Van por debajo de nombres e íconos, así que
cruzan el mapa sin tapar ningún dato. El degradado se hace por tramos con su propia
opacidad y no con un gradiente SVG, que es lo que svg2pdf pasa al PDF como trazo
vectorial sin sorpresas. El criterio vale para cualquier hoja y
cualquier filtro; con un solo tipo activo los símbolos dejan de estorbarse y no se
dibuja ninguno. También se pueden **elegir a mano** por ubigeo de provincia o de
departamento, y entonces el motor avisa si la selección abarca demasiado para que
ampliarla signifique algo.

**Cuánto mide y dónde va.** No se colocan en anclajes con tamaño fijo: cada recuadro
le pregunta a la rejilla de ocupación por el **mayor hueco libre con su proporción**.
De ahí salen dos cosas a la vez. El tamaño se adapta al formato —en A0 los recuadros
llegan a 257 × 247 mm, en A4 apenas a 55 × 51— y **la forma de la zona decide la
ubicación**: una provincia alargada en vertical encaja en el mar, que es alto y
estrecho, y una alargada en horizontal sobre Brasil, que es ancho. Cuando se acaba el
hueco se dejan de dibujar, y eso es el máximo dinámico: A4 admite uno, A0 hasta cuatro.

Cada recuadro tiene un tope del 48 % del lado menor del marco, para que el primero no
se quede con todo el hueco. Cuando es **el único** —el de Lima Metropolitana y Callao
que el mapa del país lleva por omisión— no hay con quién repartir: el tope sube al 75 %
y el hueco se busca de abajo arriba, así que el recuadro queda pegado a la leyenda en
vez de arriba con un vacío debajo (`LADO_MAXIMO_SI_ES_UNO` y `desdeAbajo`; revisión de
la Fase 20). Crece lo que permite la costa: Lima es alta y estrecha y el recuadro guarda
su proporción, así que para ser más alto tendría que ser más ancho, y en A3 y A1 su
esquina de arriba ya toca la costa de Áncash. En 2A0 horizontal, donde sí había sitio,
pasó de unos 306 × 526 a 427 × 717 mm.

| Hoja | Recuadros | Tamaño del mayor |
|---|---:|---|
| A4 | 1 | 55 × 51 mm |
| A3 | 2 | 85 × 69 mm |
| A2 | 2 | 89 × 137 mm |
| A1 | 3 | 167 × 177 mm |
| A0 | 4 | 337 × 351 mm |
| 2A0, 4A0 | 4 | crece con el hueco libre |

## Ámbitos: el país, un departamento, una provincia

Un mapa del Perú, uno de Cusco y uno de la provincia de Lima no se diferencian sólo en
el encuadre. Cambia la unidad que colorea el coropletas, cambia qué representa cada
símbolo y cambian los nombres que se escriben. `src/motor/ambito.js` concentra esas tres
decisiones y el resto del motor —proyección, layout, rótulos, recuadros— trabaja igual
sea cual sea el ámbito. Que sea el mismo no es economía de código: es lo que garantiza
que un mapa de Cusco se mida, se rotule y se imprima con el mismo criterio que el del
país, y no con una variante que se le parezca.

**Cada mapa se agrega un nivel por debajo del que retrata.** Es la regla que ordena
todo lo demás, y es de lectura, no de implementación.

| Ámbito | Coropletas y símbolos | Límite intermedio | Rótulos |
|---|---|---|---|
| Perú | por provincia | — | departamentos y provincias |
| Departamento | por distrito | provincias | provincias y distritos |
| Provincia | **cada centro en su sitio** | — | distritos |
| Distrito | **cada centro numerado**, sin coropletas | — | distritos vecinos |

En ámbito provincial ya no se agrega nada. El mapa nacional responde «qué servicios
llegan a esta provincia»; a escala de provincia esa pregunta ya está contestada y la que
queda es «dónde está cada uno», que sólo se responde poniendo cada centro en su
coordenada real. El círculo se centra en ella: lo que señala el punto es el ícono, no
un borde del dibujo.

Los recuadros de zoom dibujan **lo mismo** que el mapa principal: si éste pinta cada
centro en su sitio, el recuadro también, y si agrupa por distrito con sus cifras, el
recuadro agrupa por distrito con sus cifras. Un zoom que contara de otra manera estaría
diciendo dos cosas distintas del mismo lugar en la misma lámina. Entre las Fases 17 y 20
hubo una excepción —partido hasta distritos, el recuadro ponía cada centro en su sitio,
sin cifras— y se retiró cuando Lima y Callao pasaron a llevar los íconos sólo en su
recuadro: ahí es el único sitio donde se pueden contar.

Dentro del recuadro sólo la **zona ampliada** —el departamento, la provincia o el
distrito— lleva íconos. Lo que la rodea se sigue dibujando, para que el recorte no
parezca una isla, pero bajo un velo blanco semitransparente y sin nombres: se lee como
entorno y la zona queda con su color. Sólo se rotula la zona; los nombres de los
vecinos ya están en el mapa principal. El velo es un
trazado vectorial con opacidad (`opacidad.veloZoom` en los tokens), no un desenfoque,
que acabaría rasterizado en el PDF.

En la web los recuadros automáticos no se dibujan por omisión: se piden con
`?zoom=auto`, o se eligen las zonas. El único que se pone solo es el de Lima y Callao
en el mapa del país (ver más abajo).

### El nivel de división

La regla es la de **por omisión**, no la única. El **nivel de división**
(`?division=` en la URL, `DIVISIONES` en `ambito.js`) deja partir el ámbito más grueso
o más fino; se ofrecen sólo los niveles que hay por debajo de él, y un enlace sin
`division` sale igual que antes de existir la opción.

| Ámbito | División | Coropletas | Símbolos | Límite intermedio | Rótulos |
|---|---|---|---|---|---|
| Perú | `departamento` | por departamento | por departamento | — | departamentos |
| Perú | `provincia` (omisión) | por provincia | por provincia | — | departamentos y provincias |
| Perú | `distrito` | por distrito | por distrito | provincias | departamentos, provincias y **distritos donde caben** |
| Departamento | `provincia` | por provincia | por provincia | — | provincias |
| Departamento | `distrito` (omisión) | por distrito | por distrito | provincias | provincias y distritos |

En el Perú por distritos cada uno de los 432 distritos con servicios lleva su grupo de
íconos, **al mismo tamaño que en cualquier otro mapa de esa hoja**: el tamaño crece o
se achica con el papel y con nada más. En la sierra y en Lima los grupos se tocan, y
los recuadros de zoom son los que los separan. En la Fase 18 se probó a achicar los
íconos distrito por distrito para que cupieran (entre 2 mm y el tamaño de la hoja); el
área usuaria prefirió un tamaño único y se retiró en la Fase 19. Lo que sí quedó es la
rejilla fina de respaldo: una unidad más chica que la celda con la que se busca su
polo no tenía dónde anclar sus íconos y se quedaba sin ellos, sin aviso.

Los **nombres de distrito** se escriben donde caben enteros dentro de su distrito, sin
tocar otros nombres y sin más que un roce de ícono (rótulo `estricto`); los demás se
omiten sin aviso, porque
a esta escala es lo esperado (nivel `opcional`), y su recuento queda en el resumen. A
las provincias, en cambio, se les deja asomar o montarse sobre los íconos antes que
perder el nombre: con 1.893 distritos eso llenaría el país de texto. Van en un tercer
nivel visual, más pequeño y en gris más claro que las provincias
(`rotuloDistritoNacional`), para que «Purús» provincia y «Purus» distrito no se lean
iguales. En A1 caben unos 190.

Los 1.893 distritos se cargan al mismo nivel de detalle que el resto del mapa —los 25
archivos por departamento—, para que sus bordes coincidan con los de provincia y
departamento, y con trazos propios: el distrito al mínimo imprimible en el gris medio
(`limiteDistritalNacional`) y la provincia en gris oscuro
(`limiteProvincialSobreDistritos`), por debajo del negro del departamento. En A1 la lámina pesa unos
5 MB; por debajo de A1 la interfaz avisa de que muchos distritos miden menos de 2 mm.

Los recuadros de zoom arman sus zonas con las unidades de los íconos, que son las que
se estorban: el Perú por departamentos amplía departamentos, y el Perú por distritos,
departamentos, provincias o distritos.

### Lima y Callao, en su recuadro

En la web, el mapa del Perú —hasta provincias y hasta distritos— abre con un recuadro de
**Lima Metropolitana y Callao** juntos (`zoomPorDefecto` en `src/ui/config.js`): son
156 centros en unos pocos milímetros, en 2 provincias o en 41 de sus 50 distritos, y sin
ampliarlos el mapa enseña ahí una mancha de grupos que se pisan. Se pone sólo si no hay
otro zoom pedido, se quita al pasar a *hasta departamentos* o a otro ámbito, y vuelve al
regresar; un enlace con `zoom=ninguno` lo desactiva. Hasta departamentos no se ofrece:
sus unidades son departamentos y Lima Metropolitana es sólo una parte del de Lima.

Mientras ese recuadro está en la lámina, **los íconos de Lima Metropolitana y Callao se
dibujan sólo en él** (`SOLO_EN_RECUADRO` en `src/motor/zoom.js`); en el mapa queda el
color y el rectángulo rojo que dice dónde está. Se quitan después de colocar el recuadro
y sólo los de las unidades que el recuadro ha dibujado: si no cupiera, se quedan en el
mapa, porque no pueden desaparecer de la lámina. El apiñamiento se vuelve a medir sin
ellos, y el resumen dice cuántas unidades van sólo en el recuadro
(`unidadesSoloEnRecuadro`). Pasa igual con un recuadro automático o elegido a mano que
amplíe esa zona.

En el Perú por distritos el recuadro amplía unas tres veces en A1, y el centro de Lima
—Cercado, Breña, La Victoria, Lince y alrededores— sigue apretado: son una veintena de
grupos en unos 15 km.

### Lo que rodea al ámbito

El territorio de alrededor se dibuja siempre, atenuado y con su nombre. Un departamento
que acabara en su propio límite parecería una isla y nadie sabría por dónde se entra. Va
en un gris algo más oscuro que un país vecino, para que no se confunda con el
extranjero, y sin color de clase: ahí no se está midiendo nada, y pintarlo como si sí
invitaría a compararlo con lo que el mapa sí mide.

Eso cambia también qué puede tapar un bloque del layout. «Territorio» pasa a ser el
**ámbito**, no todo el Perú: en un mapa de Cusco, poner la leyenda sobre Madre de Dios
no le estorba a nadie, y prohibirlo dejaría la lámina sin ningún sitio donde colocarla.

### El localizador

Un mapa de la provincia de Yungay no dice dónde está Yungay: quien lo mira o ya lo sabe,
o no tiene manera de averiguarlo, porque el encuadre ha eliminado justamente la
referencia que haría falta. Por eso toda lámina de ámbito reducido lleva el Perú en
miniatura, con el departamento teñido y el ámbito exacto en rojo encima. Con sólo el
departamento, un mapa de Yungay y otro de todo Áncash llevarían el mismo localizador;
con sólo la provincia, muchas son a ese tamaño una mancha de dos milímetros que no se
encuentra. Los dos juntos dan la pieza del rompecabezas y, dentro de ella, el punto.

Cuántas miniaturas lleva depende del ámbito. Un departamento o una provincia, una sola:
el Perú con el departamento en un rojo suave y, en la provincial, la provincia en rojo
intenso encima (la miniatura provincial es algo más ancha, para que la provincia se
distinga). Un distrito, dos: el Perú con su departamento, y al lado el departamento con
la provincia teñida y el distrito en rojo, porque en la miniatura del país un distrito
no se ve.

Se dibuja con su propia proyección y con el contorno más ligero: a cuatro centímetros de
ancho la diferencia entre niveles de detalle no se ve, y el pesado multiplicaría por
veinte el tamaño del PDF.

### Los recuadros de zoom, en cualquier ámbito

La regla de los recuadros —uno por zona, nombrado, con las unidades de esa zona y nada
más— se generaliza sin excepciones: **la zona es siempre el nivel inmediatamente
superior a la unidad que se dibuja.**

| Ámbito | Unidad | Zona ampliable | Ejemplo de título |
|---|---|---|---|
| Perú | provincia | departamento | «Cusco» |
| Departamento | distrito | provincia | «Calca» |
| Provincia | distrito | el propio distrito | «San Miguel» |

A mano se puede pedir cualquier nivel que el mapa dibuje: la selección son ubigeos de
departamento, provincia o distrito, y una unidad del mapa entra en el recuadro si su
ubigeo empieza por uno de ellos. En el panel se eligen con tres selectores encadenados
y un botón «Añadir zona»; en el mapa del Perú, que dibuja provincias, el de distrito
queda deshabilitado.

Cada ámbito lo declara en una línea —cuántos dígitos del ubigeo forman la clave de la
zona y cómo se llama cada una—, así que el módulo de recuadros no tiene que saber en
qué ámbito está. El corte de Lima Metropolitana y Callao sólo se aplica cuando las
zonas son departamentos: dentro de un mapa del departamento de Lima, «Lima
Metropolitana» ya es una de sus provincias y partirla otra vez no significaría nada.

### Girar la hoja, no agrandarla

Cuando una zona no cabe ampliada, el consejo obvio —«usa una hoja mayor»— es falso, y
medirlo lo deja claro. Cusco con el departamento entero:

| | A4 v | A3 v | A2 v | A1 v | A0 v | A2 **horizontal** |
|---|---|---|---|---|---|---|
| Cusco mide | 53×63 | 76×91 | 108×130 | 154×185 | 218×262 mm | 75×89 mm |
| Mayor hueco libre | 55×68 | 71×85 | 103×124 | 151×180 | 219×263 mm | 133×160 mm |
| Ampliación | ×1,03 | ×0,93 | ×0,95 | ×0,98 | ×1,00 | **×1,77** |

En vertical la zona y el hueco crecen **a la vez**, así que la proporción se queda
clavada en torno a ×1 de A4 a A0: cambiar de tamaño no arregla nada. Lo que abre sitio
es girar la hoja. El Perú es alto y estrecho; en horizontal el marco se ensancha, el país
no, y aparece un hueco grande a los lados. Con el mismo papel, Cusco pasa de ×0,95 a
×1,77. Los avisos lo dicen así.

### En manual manda la selección

El umbral de ampliación es del modo **automático**, donde el motor elige y no debe
gastar el mayor hueco de la lámina en un recuadro que no amplía. Cuando la selección es
de una persona, el motor obedece: dibuja la zona entera a la escala que toque y explica
en el informe cuánto amplía en realidad. Antes el umbral se aplicaba a los dos casos, y
seleccionar Cusco en una hoja vertical no dibujaba **nada**.

Comprobado sobre los 25 departamentos, uno a uno, seleccionándolos a mano:

- **25 de 25 se dibujan**, en las tres hojas probadas, y siempre completos.
- **24 de 25 amplían ×1,5 o más en A2 horizontal.** La excepción es Loreto, que es casi un
  tercio del país: ni girando ni agrandando la hoja cabe ampliado, y su aviso lo dice sin
  ofrecer un remedio que no existe.
- En A2 vertical, diez quedan por debajo de ×1,5 y se dibujan igual, con el aviso.

### Cada recuadro, del lado donde está su zona

El hueco se busca primero en la mitad de la lámina donde cae la zona, y sólo si ahí no
cabe se admite el resto. Con «Lima Metropolitana y Callao» en el flanco derecho y
«Cusco» en el izquierdo había que cruzar la lámina entera para ir de cada rectángulo
rojo a su ampliación, y con dos o más recuadros tocaba compararlos para saber cuál era
cuál. Cada uno de su lado, la línea entre el sitio y su detalle es corta y evidente.

La preferencia cede si el hueco del lado bueno no amplía: un hueco pequeño del lado
correcto no vale más que uno grande del otro.

### La barra de escala se coloca antes que los recuadros

Es pequeña y se acomoda en cualquier parte, así que parecía natural dejarla para el
final. No lo es: en una Mercator transversa la escala crece al alejarse del meridiano
central, de modo que una barra puesta en un flanco **mide algo distinto de lo que
dice**. Cuando un recuadro le quitó el centro del ancho en A4 horizontal, la barra
declaraba 500 km y cubría 489,6 — un 2,1 % de error en el único elemento de la lámina
que sirve para medir. Un recuadro puede ir a cualquier hueco; la barra, no.

### El recuadro es un recorte ampliado del mapa

Se rellenaba de color de mar y encima se dibujaban sólo las unidades de la zona, de modo
que Cusco o San Miguel aparecían **flotando en el Pacífico**. Ahora dentro del recuadro
se dibujan las mismas capas que en el mapa —países, territorio de fuera del ámbito,
coropleta, límites, símbolos— recortadas a su marco, así que lo que rodea a la zona
ampliada es lo que de verdad la rodea.

El asunto del recuadro se distingue por su **contorno destacado**, no por ser lo único
que se dibuja. Eso permite que la zona sea exactamente lo que el título dice —un
departamento en el mapa nacional, una provincia en el departamental, **un distrito** en
el provincial— sin que el resultado quede descolgado: el recuadro titulado «San Miguel»
amplía San Miguel, y alrededor se ve Pueblo Libre, Magdalena del Mar y el Cercado porque
es lo que hay alrededor.

### En la interfaz

El selector es encadenado —departamento y luego provincia— porque una lista plana de las
196 provincias obligaría a buscar «Lima» entre tres entradas con ese nombre en
departamentos distintos. Las zonas que se ofrecen para ampliar siguen al ámbito: en el
nacional son provincias; en un departamento, sus provincias; en una provincia, sus
distritos.

En la URL el ámbito viaja como un ubigeo suelto (`?ambito=1501`), porque su longitud ya
dice de qué nivel se trata. El subtítulo vacío significa **automático**: el campo enseña
como marcador el texto que va a usarse («Departamento de Cusco»), de modo que no hay que
adivinar, al cambiar de ámbito, si lo que hay escrito lo puso una persona o la
aplicación.

## El ámbito distrital: cada centro identificado

Es el único ámbito en el que el mapa no responde «dónde hay servicios» sino **cuáles
son**, y eso no cabe en un ícono. Un pictograma sobre una manzana dice que ahí hay un
Centro Emergencia Mujer; no dice cuál, ni en qué calle, ni si la coordenada es de fiar.

Por eso la lámina se parte en dos mitades que se leen juntas: cada centro lleva un
**número de referencia** junto a su ícono, y una tabla vectorial al margen lleva ese
número, el nombre, el tipo y la dirección. La numeración se fija una sola vez, antes de
dibujar nada, de modo que el número del mapa y el de la tabla no pueden discrepar.

**No se colorea por clases.** El coropletas compara unidades entre sí y aquí sólo hay
una: pintarla de un tono de la rampa invitaría a leer una intensidad que no significa
nada. La leyenda se queda con los tipos de servicio y no anuncia una comparación que
este mapa no hace.

**Tampoco lleva recuadros de zoom**: la zona ampliable sería el propio distrito, así que
el recuadro repetiría el mapa entero a su lado.

### La tabla cede antes de mentir

Compite por el sitio como cualquier otra pieza del layout: declara cuánto mide y el
motor decide dónde va. Cuando no cabe entera, cede en este orden —cuerpo más pequeño,
direcciones fuera, y sólo al final menos filas— y **en todos los casos lo declara**. Una
tabla recortada en silencio obliga a contar los íconos del mapa para descubrir que
faltan centros.

### Coordenadas que no señalan la sede con exactitud

De los 762 centros publicados, 16 tienen la coordenada junto al límite de otro distrito,
29 se situaron en su distrito porque su coordenada caía lejos, y los 29 Hogares de
Refugio Temporal y 6 CAR Especializados de dirección reservada se sitúan por distrito. Un asterisco tras el número —en el mapa y en la tabla— los marca, y la
tabla explica al pie qué significa. No es un adorno: quien vaya a esa dirección tiene
que saber que el punto del mapa puede no ser exacto.

### Un distrito sin centros también se imprime

El mapa se genera igual, y su respuesta es **«Sin servicios del MIMP en el distrito»** en
la cabecera de la tabla, seguida de los seis centros más cercanos con su distancia en
línea recta desde el centro del distrito. La distancia se mide desde el centroide y no
desde el borde: el borde daría metros para un centro al otro lado de la calle, que es
cierto y no ayuda a nadie a decidir a dónde ir.

Cuando esos centros quedan fuera del encuadre —lo normal: los más próximos a un distrito
sin servicios suelen estar a veinte o treinta kilómetros y el encuadre mide diez—, la
tabla lo dice. Un número de referencia que no está en el mapa es un cabo suelto.

Los distritos se eligen desde la **cartografía**, no desde `centros.json`: su catálogo
sólo lista los que tienen algún centro, y precisamente los que no lo tienen
son los que necesitan este mapa. Se cargan por departamento y a demanda, porque los de
los veinticinco departamentos juntos son varios megas que casi ninguna sesión necesita.

### El localizador baja un nivel

En los demás ámbitos enseña el Perú con el departamento teñido. Para un distrito eso no
sirve: a escala de país es una mota de medio milímetro. El localizador distrital enseña
el **departamento** con sus provincias, la provincia teñida y el distrito en rojo.

## Los rótulos

El problema no es escribir nombres: es decidir cuáles caben. Hay 25 departamentos y
196 provincias, y en A4 no entran ni la mitad sin pisarse ni tapar los símbolos. Un
mapa con rótulos superpuestos es ilegible y uno que los omita en silencio es engañoso,
así que el motor coloca lo que cabe **por prioridad** y deja constancia de lo que no.

### El método de QGIS

Desde la Fase 20 `src/motor/etiquetas.js` sigue el método del motor de etiquetado de
QGIS (PAL), **reescrito aquí y no copiado**: QGIS es GPL y este proyecto no comparte su
licencia, pero las ideas no tienen dueño.

1. **Candidatos con coste.** Cada nombre genera sus posiciones posibles, en una línea o
   partido en dos. Si su unidad tiene íconos, las primeras van **pegadas a su rejilla**,
   a un hilo de ella: encima, debajo o a un lado, centradas o alineadas con un borde, y
   en las esquinas. Después, centrado sobre cada uno de hasta diez puntos interiores de
   la unidad y en las ocho direcciones de alrededor, a tres distancias. Cada una lleva
   un coste: la parte del nombre que sale de su unidad, la distancia a sus íconos,
   partirlo en dos líneas, pisar el hueco reservado a otro nombre o montarse sobre
   íconos cuestan más. Las que pisan la leyenda, un recuadro u otro bloque no son
   candidatas. Se guardan las 36 más baratas.
2. **Solución inicial.** Por prioridad —departamento, provincia, distrito— y, dentro de
   cada nivel, primero los que tienen **menos** posiciones posibles, que son los que se
   pierden si otro les quita el hueco. Cada uno toma su candidato libre más barato.
3. **Mejora por cadenas.** Un nombre que se quedó fuera prueba sus candidatos y, si
   choca con otros ya puestos, intenta moverlos a otra de sus posiciones. Nunca desplaza
   a uno más importante, y a uno menos importante puede dejarlo fuera: un nombre de
   provincia vale más que uno de distrito.
4. **Pulido.** Cada nombre colocado baja al candidato libre más barato que le quede.

El motor anterior colocaba uno por uno y el primero que encontraba sitio se lo quedaba
para siempre. Ahora un nombre puede apartarse un poco para que entre otro, que es lo que
hace QGIS y lo que le permite nombrar más con menos choques.

### Dentro de su territorio y junto a sus íconos

**Los nombres de los territorios van al 60 % del cuerpo con que se calibraron**
(`ESCALA_NOMBRES` en `src/estilo/tokens.js`): una provincia, 3,9 pt en A4, 4,6 pt en A3
y 6,2 pt en A1; un departamento, 5,4 pt en A4. Vale también para los recuadros de zoom y
para los nombres de fuera del ámbito. Lo pidió el área usuaria, después de reducir los
íconos a la mitad, para que el nombre cupiera dentro de su territorio; en A4 queda por
debajo de lo que se lee con comodidad a simple vista.

En la revisión de la Fase 20 el área usuaria pidió que los nombres se ubicaran mejor
dentro de su territorio y más cerca de su rejilla. Hasta entonces cada nombre buscaba
sitio alrededor del centro del grupo a la distancia de su propio alto, así que un grupo
más alto que el nombre lo empujaba lejos; y lo que salía de la unidad se medía sólo
por las cuatro esquinas. Ahora:

- **Lo que sale se mide en el contorno del nombre**, con puntos repartidos por sus
  bordes (`fraccionFuera`), y pesa más que partirlo en dos líneas: un nombre largo que
  dentro sólo cabe en dos líneas va en dos.
- **El nombre se pega a su rejilla** y la rejilla le deja sitio (ver «Cómo se reparten
  los íconos de un grupo»).
- **Un nombre no tapa más del 10 % de su caja con íconos** (`TAPADO_MAXIMO`), salvo el
  nivel superior del mapa. Los rótulos van debajo de los símbolos y uno con media caja
  bajo una rejilla dejaba ver unas letras sueltas. Si sólo cabe así, se omite y queda
  anotado.

Con los íconos a la mitad y los nombres al 60 %, las provincias del Perú con el nombre
entero dentro de su territorio:

| Hoja | Nombradas | Enteras dentro | Antes de reducir los nombres |
|---|---:|---:|---|
| A0 | 196/196 | 188 | 196 nombradas, 159 dentro |
| A1 | 196/196 | 183 | 195 nombradas, 124 dentro |
| A3 | 194/195 | 127 | 176 nombradas, 55 dentro |
| A4 | 191/195 | 82 | 145 nombradas, 27 dentro |

En las hojas chicas el límite sigue siendo de superficie: en un A4 muchas provincias
miden menos que su nombre más sus íconos. Ahí el nombre va pegado a su rejilla aunque
asome y, si sólo cabe tapándola, se omite.

`npm run muestras` revisa los territorios **uno por uno**: escribe en
`muestras/territorios.csv` una fila por cada departamento, provincia o distrito de cada
lámina, con si se puso su nombre, cuánto sale de su unidad, a qué distancia queda de sus
íconos, si los toca y cómo se dispusieron, e imprime el resumen por lámina.

Dos nombres en la misma línea necesitan además **un tercio de letra de aire** entre
ellos, no sólo la holgura de 0,35 mm: «Santiago» y «San Sebastián», en el recuadro de
Cusco, se leían como un solo nombre. Con media letra el mapa nacional en A4 perdía una
docena de provincias.

La prueba de «¿cae este punto dentro de la unidad?», que el motor hace miles de veces
por nombre, ya no recorre todo el contorno: `pruebaDentro` reparte los lados en franjas
horizontales una sola vez y cada consulta mira sólo los de su franja, con el mismo
resultado. Era casi la mitad del tiempo de composición; con ella, el motor nuevo es más
rápido que el anterior aunque pruebe más posiciones.

### Los nombres de distrito del mapa del país

En el Perú por distritos, los nombres de distrito sólo se ponen si caben dentro de su
distrito, sin tocar otros nombres y sin más que un roce de ícono (son *estrictos* y
opcionales: hay más de 1.800). El área
usuaria vio, sobre todo en hojas mayores que A1, distritos sin servicios —sin íconos que
estorbaran— y con sitio, pero sin nombre (revisión de la Fase 20). El motor descartaba
cualquier posición en la que la caja del texto tocara el límite, y tres cosas lo hacían
demasiado estricto:

- **Se medía la caja y no las letras.** La caja incluye el aire de acentos y colas, que
  casi nunca se ocupa. Ahora se mide la franja de las letras (`fraccionFuera`).
- **Rozar el borde lo descartaba.** Ahora las letras pueden rozarlo, hasta un 10 % de
  los puntos de su contorno (`FUERA_TOLERADA_ESTRICTO`), con el centro siempre dentro.
- **Sólo se escribía en horizontal.** Muchos distritos de la sierra son altos y
  estrechos: Huachocolpa mide 8 mm de ancho y su nombre, 10. Como último recurso, el
  nombre se prueba girado un cuarto de vuelta, leyéndose de abajo arriba, como los
  números de la retícula y como hace QGIS con las unidades alargadas (`COSTE.VERTICAL`).

| Perú por distritos | Distritos nombrados antes | Fase 20 |
|---|---:|---:|
| A1 | 573 | 768 |
| A0 | 824 | 1.042 (107 en vertical) |
| 2A0 | — | 1.290 de 1.868 |

Los que siguen sin nombre no caben de ninguna de esas formas o se quedaron sin hueco
porque otros nombres ocuparon sus posiciones. El CSV de territorios lo dice para cada
uno: «no cabe» o «sin hueco libre», y para los que no caben, cuánto mide el nombre y el
mayor círculo interior de la unidad, que es lo que dice si la unidad es de verdad más
chica que su nombre.

### Fase 21: el nombre y los íconos, dentro de su territorio

El área usuaria pidió revisar uno por uno los departamentos, provincias y distritos en
todas las hojas, y que en lo posible el nombre y los íconos de cada uno quedaran dentro
de su territorio. La revisión se hizo con un **censo**: un guion compone 584 mapas —el
Perú en sus tres divisiones y las siete hojas en vertical y horizontal, los 25
departamentos por provincias y por distritos en A4, A3 y A1, y las 196 provincias en
A4 y A2— y anota, para cada territorio de cada mapa, si su nombre se puso, si quedó
entero dentro, si va girado y si sus íconos cayeron dentro: 38.402 filas. Se corrió
con el motor de la Fase 20 y con el de ésta, y se compararon fila a fila. De ahí
salieron cinco cambios:

- **La rejilla busca en toda la unidad** (puntos 3 y 4 de «Cómo se reparten los íconos
  de un grupo»): en cada punto interior y corrida hasta una celda, no sólo en el centro.
  Es el cambio que más íconos mete dentro.
- **El nombre en vertical, en todos los niveles en minúsculas**, no sólo en los
  distritos estrictos: provincias del mapa del país y distritos de los mapas
  departamental y provincial (`admiteVertical`). También pegado a su rejilla, y la
  rejilla puede dejarle el sitio en vertical. Gira sólo si acostado dejaría más de un
  tercio del nombre fuera (`COSTE.VERTICAL`).
- **El nombre en diagonal, a lo largo del eje de la unidad**, sólo para los distritos
  estrictos del mapa del país (`ejeDe` en `src/motor/ocupacion.js`, `COSTE.DIAGONAL`).
  El censo mostró que de los distritos sin nombre en A1, el 91 % son *estrechos*: cabe
  el alto del nombre pero no el ancho, y muchos son valles largos y torcidos. Se probó
  también en las provincias y se perdían más nombres de los que se ganaban: la caja
  envolvente de un nombre en diagonal es ancha y estorba a los vecinos.
- **La rejilla deja sitio también a los nombres opcionales**: en las capitales de
  provincia la rejilla se plantaba en el centro del distrito y el nombre, que sí cabía,
  se quedaba fuera (Cajatambo, Abancay, Celendín en A1).
- **El nivel previo se coloca antes que las rejillas** (siguiente apartado).

En las 38.402 filas del censo, los nombres puestos pasan de 25.585 a 26.164, los que
quedan enteros dentro de su territorio de 22.143 a 22.635, y los grupos con todos sus
íconos dentro de 7.452 a 7.897 (de 10.418). Lo que más se mueve:

| Mapa | Nombres puestos (Fase 20 → 21) | Grupos con todos los íconos dentro |
|---|---|---|
| Perú por distritos, distritos, A1 | 43 % → 46 % (768 → 809 de 1.775) | 65 % → 72 % |
| Perú por distritos, distritos, A0 | 57 % → 60 % | 75 % → 81 % |
| Perú por distritos, distritos, 2A0 | 69 % → 72 % | 82 % → 87 % |
| Perú por distritos, provincias, A4 vertical | 87 % → 98 % | — |
| Perú por distritos, provincias, A4 horizontal | 57 % → 75 % | — |
| Perú por provincias, provincias, A3 horizontal | 90 % → 95 % (176 → 186) | 79 % → 82 % |
| Perú por provincias, provincias, A4 horizontal | 70 % → 78 % | 58 % → 67 % |
| Departamentos por distritos, distritos, A4 | 99 % → 100 % | 84 % → 86 % |

Lo que queda sin nombre en el Perú por distritos es, casi todo, lo que no cabe: en A1,
de los 870 distritos sin nombre, 26 son más chicos que el alto de su nombre y unos 800
son más estrechos que su ancho en cualquier dirección. Caben sólo con una letra menor o
con el nombre abreviado, que son decisiones del área usuaria, no del motor. El área
usuaria eligió probar la letra menor (siguiente apartado).

### Revisión de la Fase 21: letra menor, nombres apilados, límites y líneas

De la revisión del área usuaria salieron cuatro pedidos más, cada uno con su mecanismo
en el motor:

- **Letra un 15 % menor para los nombres que no caben** (`reduccion` en
  `colocarEtiquetas`, `REDUCCION_NOMBRES` en render.js). Es una pasada más del motor,
  después de la normal: los nombres que se quedaron sin sitio se prueban otra vez con el
  cuerpo reducido, respetando todo lo ya puesto, y quedan anotados (`reducido`) para
  que el censo los cuente aparte. Es lo que ArcGIS llama reducción del tamaño de fuente.
  En el Perú por distritos en A1 nombra 118 distritos más (809 → 927).
- **El nombre apilado sobre sus íconos en las provincias estrechas** (Carlos Fermín
  Fitzcarrald, Mariscal Luzuriaga, Carhuaz, Aija y Asunción en el Perú A3). Lo que
  sale de la unidad cuenta a la mitad cuando el nombre va centrado justo encima o
  debajo de su rejilla (`DESCUENTO_APILADO`): en una provincia más estrecha que su
  nombre, el nombre sobresale haga lo que haga, y sobre sus íconos se lee de quién es,
  mientras que al costado parece de la vecina. Con eso solo no bastaba, porque las
  rejillas se colocaban sin saber de las vecinas y la de Mariscal Luzuriaga se
  plantaba donde la de Carlos Fermín Fitzcarrald había dejado sitio a su nombre: ahora
  **las rejillas se colocan de la unidad más estrecha a la más ancha y cada una esquiva
  las ya puestas** y el hueco de su nombre, con un índice de colisiones en
  `dibujarSimbolos`. El hueco se reserva en firme si cae entero dentro de su unidad;
  si asoma a la vecina, sólo cuando el nombre va apilado sobre su rejilla y como
  obstáculo **blando**: la rejilla vecina lo esquiva si puede y lo ignora si con él no
  le caben los íconos dentro (`repartirEnRejilla`). Y un nombre de pie ya no puede
  alejarse de su unidad más de la mitad de su largo: medido con la caja envolvente,
  «Carlos Fermín Fitzcarrald» se iba dos provincias más allá.
- **El nombre del departamento cruza un límite entre provincias** («CUSCO» entero
  dentro de La Convención se leía como el nombre de esa provincia). El nivel previo
  recibe las pruebas de interior de sus unidades (`subunidades`, de `subunidadesDe`
  en render.js) y una posición cuyas letras caen todas en una sola paga
  `COSTE.UNA_SUBUNIDAD`; la paga también toda posición que asome del departamento, de
  modo que entero dentro y cruzando gana a entero dentro en una sola provincia, y las
  dos ganan a asomando. Como el nivel previo se coloca antes que las rejillas, se le
  dan además las **rejillas previstas** —la cuadrícula compacta de cada grupo en su
  polo, que es donde se queda una rejilla que no cabe (`prepararSimbolos`)— con un
  coste por la parte que tapa (`COSTE.SOBRE_PREVISTA`), menor que el de un ícono real
  porque la rejilla suele poder correrse: «CUSCO» acababa sobre los íconos de la
  provincia de Cusco y «ÁNCASH» sobre el único sitio donde cabía el ícono de Carhuaz.
- **Nombres con línea en los recuadros de zoom** (`enlace`, `despejado`,
  `COSTE.ENLACE`): en Lima y Callao los distritos de la costa son más chicos que su
  nombre y éste iba de pie sobre el mar, sin nada que dijera de qué distrito era. Ahora
  va acostado sobre terreno despejado —el mar: ningún punto de sus letras sobre una
  unidad del recuadro— con una línea desde el borde de su caja hasta el borde de la
  caja de sus íconos, de no más de diez alturas de letra. Es el «callout» de QGIS. Va
  en una pasada propia después de la normal, para que un nombre de tierra adentro, que
  sólo cabe sobre el mar con una línea larga, no le quite el sitio al de la costa, que
  lo tiene junto a sus íconos; y en la pasada normal un nombre que admite línea no
  toma una posición peor que la que tendría con ella. **Las líneas no se cruzan entre
  sí ni pasan sobre otro nombre**: cada línea puesta es un obstáculo más, para las
  cajas de los demás nombres y para las demás líneas, tanto al generar candidatos
  (`indice.cruza`, `segmentosSeCruzan` en colisiones.js) como en el solucionador, donde
  un choque de línea contra caja o contra línea cuenta como un choque de cajas. Sobre
  íconos sí pueden pasar (`atravesable`): en el centro de Lima no hay otro camino. El
  área usuaria pidió esto al ver líneas horizontales cruzadas con verticales. En el
  recuadro del Perú A3 por distritos se nombran 39 distritos en vez de 34, cinco de
  ellos con línea; en A1, 52 con siete líneas.

Medido con el censo (Fase 21 → revisión): nombres puestos 26.164 → 27.286, de ellos
1.257 con letra menor (1.228 son distritos del Perú por distritos); enteros dentro de
su territorio 22.635 → 23.261; grupos con todos sus íconos dentro 7.897 → 7.874. Se
ganan 1.398 nombres y se pierden 276: de los perdidos, 162 iban de pie y 149 con la
mitad o más fuera de su unidad —nombres que flotaban sobre la vecina, como el de Carlos
Fermín Fitzcarrald, y que la regla de cercanía ya no admite—, casi todos en A4 y en A3
horizontal. Otros 156 pasan de enteros dentro a asomar (97 de ellos, menos de un
cuarto). Los recuadros de zoom no entran en el censo. Un efecto colateral: como las
rejillas ya no se pisan entre sí, el apiñamiento que dispara los recuadros automáticos
baja (Lima por distritos en A1: de 6 a 2 provincias sobre el umbral), y esos mapas
salen con menos recuadros.

El informe de muestras y el censo distinguen ahora los nombres con letra menor y con
línea (`reducido`, `enlace` en `meta.etiquetas.colocados`), y cada grupo de íconos
lleva su caja y el polo de su unidad (`meta.servicios.grupos`).

**La cifra bajo cada ícono, un 40 % menor** (segunda ronda de la revisión). El área
usuaria la vio grande frente al ícono: el dígito medía algo más de la mitad del
diámetro. Se aplica con un suelo de 2,8 pt, porque el 40 % a secas la dejaría en 2,3 pt
en A4, medio milímetro de alto, ilegible en papel: queda A4 2,8 · A3 2,8 · A2 3,1 ·
A1 3,6 pt (`cifraDeGrupo`), y el halo sigue al dígito. La celda de cada ícono
baja un 16 % de alto (en A4, de 2,85 a 2,39 mm) y nada de ancho: el aire lateral (12 %
del lado del ícono, 0,2 mm en A4) es lo justo para que dos círculos no se toquen y se
dejó como estaba. La celda más baja mueve las rejillas unas décimas y con ellas el
racimo de provincias chicas de Áncash se volvió a resolver: para que una rejilla no
volviera a caer en el hueco del nombre apilado de su vecina, ese hueco se reserva ahora
como obstáculo blando (ver «Cómo se reparten los íconos»).

**El ícono deja de crecer en el A1** (tercera ronda). En 4A0 el ícono llegaba a 4,1 mm
—el tope de 6 mm calibrado en A0 se estiraba con la escala del mapa— y el área usuaria
vio saturados los grupos de Trujillo y de Áncash: la rejilla de Trujillo, con ocho
íconos, medía 14 × 18 mm, y en el Perú por distritos sólo 3 de los 14 íconos de la
ciudad de Trujillo caían en su distrito. Ahora el ícono crece con la hoja hasta los
2,7 mm del A1 y ahí se queda (`tamanoDeIcono`, en `src/motor/servicios.js`): A0 pasa
de 3 a 2,7 mm, 2A0 de 3,5 a 2,7 y 4A0 de 4,1 a 2,7, y la cifra lo acompaña (3,6 pt en
vez de 4,3, 5 y 5,8). La rejilla de Trujillo queda en 9 × 11 mm; en el Perú por distritos en
4A0 los íconos dentro de su distrito suben de 466 a 504 de 540 (del 86 al 93 %) y los
pares de rejillas que se pisan bajan de 35 a 16; en el censo, los íconos dentro de su
distrito suben en A0 del 82 al 85 % (vertical) y del 71 al 74 % (horizontal), en 2A0
del 88 al 90 y del 79 al 85, y en 4A0 del 90 al 95 y del 85 al 90. Lo que no cabe ni
así —los siete íconos del distrito de Trujillo en una ciudad de 8 mm— es trabajo de un
recuadro de zoom, no del ícono. De A4 a A1 no cambia nada: las medidas son idénticas bit
a bit y las láminas, las mismas. Se probó también achicarlo en todas las hojas (raíz
cuarta del factor de formato: 1,8 mm en A3, 2,2 en A1, 2,3 en A0): en A3 ganaba tres
íconos dentro de su provincia a cambio de que Pomabamba pasara a vertical, y en el Perú
por distritos en A1 subía los íconos dentro de su distrito del 69 al 77 %. Queda como
opción si el área usuaria quiere íconos menores también en A1.

**Un nombre de distrito puede rozar un ícono** (cuarta ronda). El área usuaria vio en
Lambayeque distritos con sitio de sobra y sin nombre, y pidió tolerar algo de
superposición con los íconos. La causa era la regla estricta: un nombre de distrito no
podía tocar un ícono ni un 1 % de su caja, y en Cañaris —todo el distrito libre—
cualquier posición junto a su ícono lo rozaba un 3 %; con letra reducida, al distrito de
Lambayeque le pasaba igual. Ahora los nombres estrictos admiten lo mismo que los demás
niveles: hasta un 10 % de su caja bajo íconos (`TAPADO_MAXIMO`), y sólo cuando no hay
ninguna posición libre, porque montarse sobre íconos sigue costando más que todo lo
demás. En el Perú por distritos en A1 se ganan 16 nombres (937 → 953; 36 rozan un ícono,
ninguno más del 9 %) y en 4A0 seis (1.609 → 1.615). Lo que sigue sin nombre no cabe
dentro de su distrito ni con letra menor ni de pie: el nombre es más ancho que el
distrito (Pueblo Nuevo, José Leonardo Ortiz, La Victoria) o los íconos lo tapan casi
entero (Chiclayo, cinco íconos sobre un distrito de 6 mm en 4A0).

**La rejilla deja sitio al nombre de distrito también reducido o al costado** (quinta
ronda). El área usuaria notó que el distrito de Ferreñafe había perdido su nombre en el
Perú por distritos en 4A0. No era una regla de los rótulos: el distrito mide unos 6 mm y
su nombre, aun con la letra un 15 % menor, 8,5. Antes la rejilla, más grande, no cabía
centrada, se corría media celda hacia abajo y por casualidad dejaba arriba el hueco
justo; con el ícono y la cifra más chicos cabe centrada y se quedaba donde iba el
nombre. La rejilla sólo se apartaba a propósito para un nombre a su cuerpo y centrado
sobre ella, y el de Ferreñafe en esa posición deja un 17 % de las letras fuera de su
distrito (el tope de un nombre estricto es el 10 %). Ahora, para los nombres de
distrito, el bloque prueba también el nombre alineado con un borde de la rejilla y, si
a su cuerpo no hay bloque posible, con la letra reducida (`elegirRejilla`, en
`src/motor/servicios.js`). Ferreñafe vuelve, a su cuerpo, de pie junto a su ícono y
entero dentro. Hacen falta las dos cosas: sólo con las alineaciones, Ferreñafe no
vuelve y en el resto del país se gana mucho menos.

En el censo de las catorce láminas del Perú por distritos se ganan 135 nombres de
distrito y se pierden 55 (neto, 80 más), y en A4 vertical una provincia más; por hoja,
entre 6 y 23 ganados y entre ninguno y 9 perdidos (A2 vertical queda en 8 y 9). Los
íconos dentro no cambian salvo en dos distritos: Mazamari pierde uno en A2 horizontal y
Pichari gana uno en A0 horizontal. De los perdidos, 47 son distritos sin íconos cuyo
único sitio ocupó la rejilla de un vecino al apartarse para el nombre del vecino: es el
intercambio de esta regla. Otros 6 (Matucana y Huanta en A0, entre ellos) tienen su
rejilla apartada para su nombre reducido, pero los nombres reducidos se colocan en una
segunda pasada y para entonces los vecinos ya ocuparon el hueco a su cuerpo normal
(`COSTE.RESERVA_AJENA` lo encarece, no lo prohíbe). Los mapas por provincias y los de
un departamento no cambian: no tienen nombres estrictos.

### El nivel previo se coloca antes que las rejillas

Con la rejilla buscando por toda la unidad apareció un conflicto: en A3 horizontal la
rejilla de Bolognesi se corrió justo al sitio donde iba «ÁNCASH», y el nombre del
departamento acabó un 70 % fuera. Desde la Fase 21 el nivel de lectura gruesa —los
departamentos en el mapa del país, las provincias en el de un departamento
(`esNivelPrevio`)— se coloca **antes** que las rejillas, los recuadros y el layout, con
el mapa aún vacío, y queda marcado en la ocupación como un bloque más: son las rejillas
y los recuadros los que lo esquivan. En el Perú por departamentos no hace falta: ahí el
nombre y la rejilla del departamento siguen yendo juntos como un bloque. En A3
horizontal los 24 departamentos vuelven a quedar enteros dentro, y se nombran 186
provincias en vez de 176.

### Lo que no cambia

**Los rótulos van debajo de los símbolos, y los ceden sólo si no hay más remedio.** El
grupo de íconos de una unidad se ancla en su polo de inaccesibilidad, que es justamente
el mejor sitio para su nombre. Tratarlo como obstáculo insalvable dejaba nombres fuera;
permitirlo sin más los escondía bajo las insignias. Por eso montarse sobre íconos no
está prohibido pero cuesta más que todo lo demás junto: sólo ocurre cuando no queda una
posición libre, y nunca pasando del 10 % de la caja fuera del nivel superior. La
leyenda, los recuadros y la cabecera siguen siendo intocables.

Se mide con las métricas reales de la tipografía incrustada y se comprueba el choque con
**rectángulos exactos**, no con la rejilla de ocupación. Todo es determinista —la
generación y los empates siguen siempre el mismo orden— porque la Fase 8 compara PDF
contra PDF.

Las provincias que el mapa principal no llega a nombrar son las que su propio grupo de
íconos llena por completo: Lima, Callao, Huamanga. Son justamente las que acaban en un
recuadro de zoom, así que **los recuadros también rotulan sus unidades** con el mismo
motor y esos nombres no se pierden.

El comando de muestras comprueba por pares que ninguna caja se superpone a otra, sin
fiarse del motor que las colocó.

## El layout se coloca solo

El mapa de referencia no manda los bloques a los márgenes: los mete dentro del marco,
sobre el océano y los países vecinos. Reproducir eso a mano exigiría una plantilla por
cada combinación de hoja, orientación y ámbito, así que cada pieza declara dónde
**prefiere** ir y el motor busca el primer sitio que quepa entero, no pise otra pieza y
no tape territorio peruano. Si sus preferencias fallan, barre el resto de posiciones
antes de resignarse; y si aun así no hay sitio limpio, elige la que menos tape y lo
**anota en el informe** en vez de disimularlo.

Para decidirlo dibuja el país en una rejilla de 2 mm y consulta, para cada rectángulo,
cuánto territorio cubriría. La misma rejilla resuelve dónde poner los nombres de los
países —en el **polo de inaccesibilidad** de la parte visible, no en el centroide, que
en una forma cóncava cae fuera— y dónde cabe «OCÉANO PACÍFICO» sin tocar tierra.

### Ningún nombre de país sobre el Perú

Cuando un recuadro de zoom ocupa el hueco de Brasil, el rótulo «BRASIL» buscaba sitio
al lado, y al oeste de Brasil está el Perú: el nombre acababa sobre territorio peruano y
el mapa decía algo **falso**. Comprobar sólo el punto de anclaje no bastaba, porque
«BRASIL» mide unos treinta milímetros en A1 y un ancla a dos de la frontera deja media
palabra al otro lado.

Ahora se comprueba la **caja entera** del texto contra la rejilla de territorio, y las
posiciones candidatas son una retícula sobre la parte visible del país, ordenada
prefiriendo el desplazamiento vertical: por encima y por debajo de un recuadro se sigue
estando en Brasil, al lado no. Si aun así no queda sitio, el nombre se **omite** y el
informe dice por qué; un país sin su nombre se sigue reconociendo por su posición,
mientras que un país mal nombrado engaña.

### Jerarquía de los límites

El salto entre el límite departamental y el provincial es deliberado y grande, en color
y en grosor a la vez: 0,5 mm casi negro frente a 0,18 mm de gris claro. Desde la
revisión de la Fase 20 los límites provinciales y distritales van un 20 % más gruesos
que como se calibraron (`GROSOR_LIMITES` en `src/estilo/tokens.js`), para que las
unidades se sigan leyendo con los íconos y los nombres reducidos. Con los dos en
grises parecidos no se distinguía a qué departamento pertenece cada provincia, que es la
primera lectura que se le pide a este mapa.

### La retícula lleva coordenadas UTM

El mapa se dibuja con la Mercator transversa esférica de d3 pero se rotula en UTM 18S,
que es el sistema con el que se trabaja en el Perú. Comparten meridiano central, así
que las líneas salen casi rectas, pero no del todo: UTM va sobre el elipsoide y con
factor 0,9996. Cada línea se calcula punto a punto con proj4 en vez de trazarse recta,
y el informe dice cuánto se curva (entre 0,01 y 0,14 mm según el formato).

Los estes negativos no son un error: el Perú desborda el huso 18 por ambos lados y, al
forzar el país a un solo huso, el extremo occidental cae por debajo del falso origen de
500 000 m. El mapa de referencia de 2020 rotula igual.

### Qué crece con la hoja y qué no

El trazo del mapa y sus rótulos se mantienen en medidas reales de imprenta: un límite
departamental mide 0,3 mm en A4 y en A0. Las piezas del layout sí crecen con la hoja
—A4 1,0 · A3 1,37 · A2 1,87 · A1 2,56 · A0 3,50 · 2A0 4,76 · 4A0 6,50—, porque un
cartel se mira de lejos y con el cuerpo de un A4 el título se perdería.

### El pie

Dos líneas a la izquierda y la escala a la derecha, a la mitad del cuerpo con que se
calibró (`ESCALA_PIE` en `src/motor/render.js`), para dar ese alto al mapa:

```
Fuentes: MIMP (Directorio Nacional de Servicios), INEI (Límites), Natural Earth 1:10m (Contexto).   Escala 1:5,451,994
Cartografía: Proyección UTM Zona 18S (Meridiano Central 75° O). Retícula UTM 18S.
```

Es el pie que pidió el área usuaria en la revisión de la Fase 20. Antes llevaba
también la versión del directorio, los centros publicados, quién lo elaboró, la fecha
de generación y la nota «Escala válida al imprimir al 100 %», que sigue siendo cierta
aunque ya no se imprima. **La versión y la fecha siguen en el archivo**: el compositor las deja en
un `<metadata id="procedencia">` que no se dibuja y `aPdf` las copia a las palabras
clave del PDF. Una lámina impresa ya no dice de qué corte de datos salió; el PDF sí. El
campo «Elaborado por» del panel se retiró con su línea.

### 2A0 y 4A0

Son los múltiplos del A0 que define la norma ISO 216: 1189 × 1682 mm (el doble de área)
y 1682 × 2378 mm (el cuádruple). No existe un «3A0». Se componen con el mismo nivel de
detalle que el A0, así que cuestan casi lo mismo: unos 30 s y 12-13 MB de PDF, frente a
los 28 s y 11 MB del A0 nacional vertical.

El ícono no crece con ellas: desde la revisión de la Fase 21 se queda en los 2,7 mm del
A1 (ver «Los íconos»). Hasta entonces el tope de 6 mm calibrado en A0 se estiraba con
la escala del mapa —7 mm en 2A0 y 8,2 en 4A0; 3,5 y 4,1 en el mapa— y en 4A0 la rejilla
de Trujillo, con ocho íconos, medía 14 × 18 mm.

Para imprimirlos hace falta un plóter con rollo de al menos 1,2 m (2A0) o 1,7 m (4A0).

La retícula sigue la misma lógica que el mapa de referencia: en vez de una separación
fija en papel, que daba seis columnas en A4 y quince en A0 para el mismo mapa, se fija
el NÚMERO de divisiones a lo ancho (seis) y de ahí sale el paso redondo.

El logotipo va siempre arriba a la izquierda y el título arriba a la derecha, en todas
las hojas: son la cabecera del documento. Cuando el título no cabe ahí sin tapar el
país no se muda de sitio, **encoge**: el motor prueba cuerpos cada vez menores hasta
que deja de estorbar, y sólo el título lleva fondo blanco.

### Tres comprobaciones que el propio motor hace

- **La escala gráfica mide lo que dice.** El motor invierte los dos extremos de la
  barra por la proyección y mide la distancia real entre ellos: en las cinco muestras
  el error queda por debajo del 0,43 %.
- **El centrado no se le pide al navegador.** svg2pdf resuelve `text-anchor` midiendo
  el texto con `measureText`, al cuerpo que lleve el SVG —y este SVG va en milímetros,
  así que 10 pt son 3,53 px—. A ese tamaño Chromium sobre Linux devuelve los avances
  cuadriculados al píxel entero y el ancho se desvía hasta un 24 %: el texto centrado
  saldría corrido, y cuánto dependería del renderizador del anfitrión. Así que el motor
  calcula la `x` desplazada con las métricas del TTF y emite el texto anclado en
  `start`, el único caso en el que svg2pdf no mide nada. El PDF deja de depender del
  anfitrión y el centrado pasa a ser exacto, porque quien dibuja —jsPDF— usa esas
  mismas métricas.
- **Las familias correctas están cargadas.** Las métricas del TTF son con las que se
  dimensiona cada caja y se resuelve el centrado, así que tienen que ser las de la
  tipografía que se incrusta. Se mide el texto en el navegador a un cuerpo cien veces
  mayor —para que el redondeo de avances no contamine la medida— y se compara con una
  familia inexistente: la diferencia queda en ≈1,5 % (el interletraje) frente al ≈20 %
  de una fuente equivocada.

## La interfaz

El panel construye sus controles a partir de los datos publicados: los veintidós tipos de
servicio salen de `centros.json` con su recuento, no de una lista escrita a mano, así
que al cambiar de versión del directorio la interfaz se actualiza sola. Todo son controles nativos
—`select`, `input`, `fieldset`— porque un panel hecho de `div` con `role="button"`
obliga a reimplementar el foco, las flechas y el anuncio del estado, y casi siempre se
reimplementa peor.

**La vista previa es el PDF.** No se dibuja una versión de pantalla: se inserta en la
página la misma cadena SVG que `svg2pdf` convertirá en PDF. El zoom y el desplazamiento
son una transformación CSS por encima, así que mirar el mapa de cerca no puede cambiar
lo que se exporta.

**La configuración vive en la URL.** Cada ajuste que se aparta de lo normal se escribe
en la barra de direcciones con nombres legibles —`?hoja=A2&tipos=CEM&division=departamento`—,
nunca con índices que se desplacen al añadir un tipo ni con JSON en base64. Una
configuración por omisión deja la dirección limpia, de modo que cada parámetro que
aparece señala una decisión que alguien tomó, y el enlace se puede corregir a mano,
mandar por correo y volver a abrir meses después.

El parámetro opcional `fecha=AAAA-MM-DD` fija la fecha de generación: con él, repetir
un enlace produce el **mismo PDF byte a byte**, incluida la fecha de generación que
guardan sus propiedades.

La composición tiene freno: escribir un título dispararía un mapa nacional por cada
tecla, y en A0 cada uno tarda trece segundos. Se espera a que la escritura se detenga y,
si ya hay una composición en marcha, la nueva la **sustituye**, porque lo que importa es
el último estado y no los intermedios.

**Se compone en segundo plano** (Fase 22). El motor corre en un *worker*
(`src/trabajador.js`, gestionado por `src/ui/compositor.js`): la página sigue
respondiendo mientras compone. La revisión de uso midió en el sitio publicado que un A0
congelaba la página 12 s seguidos y un A0 por distritos, 20 s; ahora el mayor bloqueo
del A0 es de 0,7 s, el de insertar el dibujo en la vista. Un cambio durante una
composición la descarta —se detiene el *worker* y arranca otro—, en vez de esperar a que
termine un mapa que ya no sirve. Mientras compone, una barra recorre el borde de la vista,
un reloj cuenta los segundos y «Generar PDF» queda desactivado: sólo se descarga el mapa
que corresponde a lo elegido. El motor no toca el DOM —mide con las métricas de las
tipografías y devuelve una cadena SVG—, por eso corre igual en Node, en la página y en el
*worker*; si el navegador no admite *workers* de tipo módulo, se compone en la página como
antes. El PDF sí necesita el navegador (svg2pdf mide el texto con él) y sigue en la página.

**«Ninguno» ya no dibuja todos los tipos.** Ningún tipo marcado era «todos» y el mapa se
llenaba justo cuando se iba a elegir; ahora se espera a que se marque alguno, el estado lo
dice y no se puede descargar. El motor sigue tratando una lista vacía como «todos», porque
puede llegar así en una URL escrita a mano.

Al pie de la vista hay un resumen en una línea —escala, precisión de los límites,
servicios, nombres puestos y recuadros, en palabras de quien prepara el mapa y no del
motor—, y los avisos viven en un diálogo que se abre desde la barra. Desde la Fase 22
están escritos en llano y, cuando el remedio es otra hoja u otra división, lo ofrecen con
un botón («Probar en A3», «Dividir hasta distritos») que cambia el control del panel como
si se hubiera tocado. La regla de los avisos es señalar lo que el mapa **no** está diciendo:
símbolos que se estorban, rótulos omitidos por falta de sitio, zonas que pedían
ampliación y no cupieron, piezas del layout que no entraron. Un mapa incompleto sin
avisos parece completo, así que lo que se oculta es el texto, nunca que exista: el botón
está siempre a la vista y se tiñe de ámbar con el número en cuanto hay alguno. La lista
llegaba a comerse unos ciento setenta píxeles de alto del mapa, que es lo que se ha
venido a mirar.

**El zoom cambia el tamaño del lienzo, no lo escala.** Parece un detalle de
implementación y decide si la vista sirve para algo: una hoja A3 mide 1122 × 1587 px sin
escalar y una A0, 3178 × 4494. Al reducir por CSS una capa de ese tamaño, el navegador la
rasteriza entera y luego la encoge, y en esa reducción **desaparecía el texto pequeño**
—el título, los nombres de los países y la leyenda completa— justo al nivel de zoom en
que se revisa el mapa entero. Dándole al SVG su tamaño real de pantalla, el dibujo
vectorial se hace a esa escala y el texto sale nítido a cualquier zoom; cada paso cuesta
90 ms en A3 y 128 ms en A0.

**Ayuda y datos a la vista** (Fase 22). La cabecera enlaza al manual de uso y a las
decisiones cartográficas, y dice de qué corte del directorio salen los servicios
(«publicado el 25/09/2026 · 762 centros de atención»), que antes sólo constaba en las propiedades
del PDF. La pestaña lleva un ícono, compuesto con el rojo de `tokens.js`.

**El panel se acorta**: «Recuadros de zoom», «Capas» y «Layout», que casi nunca se
tocan, empiezan plegados y se abren solos si la configuración se aparta de lo normal en
algo que contienen. «Layout» reúne los textos de la lámina —título, subtítulo y
periodo— y los elementos que se pueden apagar; los textos iban en un grupo propio hasta
que el área usuaria pidió llevarlos ahí. «Color del mapa» va después de los tipos de
servicio, con una nota que dice en una frase qué mide cada opción.

**El título sigue al tipo de mapa.** Cada opción de «Color del mapa» tiene su título
(`TITULOS_POR_VARIABLE` en `src/ui/config.js`): «Ubicación de los servicios que brinda
el MIMP» —el de siempre—, «Número de centros de atención del MIMP», «Distancia al centro
de atención del MIMP más cercano», «Centros de atención del MIMP por cada 100 mil
habitantes» y «Servicios del MIMP y pobreza monetaria». Al cambiar de tipo, el título
cambia con él mientras sea el que puso la aplicación; uno escrito a mano no se toca. El
enlace sólo lleva el título si alguien lo escribió.

**Los tipos de servicio van agrupados por viceministerio**, cada grupo plegado: en su
cabecera, la casilla del viceministerio, que marca o desmarca todos sus tipos, y un botón
que despliega la lista para elegirlos uno por uno. Los veintidós tipos seguidos ocupaban
media pantalla del panel. Un grupo con una selección a medias se abre solo, para que se
vea qué está marcado.

**En pantallas angostas** la página se desplaza: la vista previa va primero, con un alto
propio, la barra se parte en dos líneas y «Generar PDF» queda fijo al pie de la pantalla
mientras se recorre el panel. Antes la página estaba clavada al alto de la pantalla y a
la vista le quedaban 52 px. La vista admite además **pellizcar** con dos dedos para
acercar y alejar; antes un teléfono sólo tenía los botones + y −.

### Lo descargado es lo verificado

El criterio de aceptación de esta fase es que el PDF que descarga un usuario desde la
web sea **idéntico** al que genera `npm run muestras` con la misma configuración. No se
comprueba que se parezca: se comparan los bytes.

`tests/web-igual-que-muestras.mjs` conduce el navegador como lo haría una persona —abre
la página con la configuración en la URL, espera la vista previa, pulsa «Generar PDF» y
recoge la descarga— y la compara con la que produce el banco de pruebas sin interfaz. La
traducción de la configuración a los argumentos del motor está en un único sitio
(`aLlamadasDelMotor`), de modo que la vista, la descarga y las muestras no pueden
divergir.

La igualdad byte a byte por sí sola no bastaría: los dos lados leen la URL con la misma
función, así que un parámetro que se ignorara se ignoraría en ambos y la comparación
seguiría saliendo verde. Por eso cada caso declara además qué tiene que haber pasado
—tamaño de página medido **en el archivo**, estado de los controles del panel y
parámetros que sobreviven en la barra de direcciones—, y se comprueba que cambiar un
control recompone el mapa y actualiza la URL.

## Control de calidad

```bash
npm run muestras    # 25 láminas y lo que se puede medir mientras compone
npm run qa          # lo que sólo se ve mirando el archivo terminado
npm run censo       # nombres e íconos, territorio por territorio, en 584 mapas
```

Los dos primeros corren en cada pull request (`.github/workflows/pruebas.yml`) con
**los mismos comandos** que en local: no hay una versión «de CI» del control que
pudiera pasar mientras la de verdad falla. El censo no: tarda unos 25 minutos y es la
herramienta para medir un cambio del motor de rótulos antes y después (`npm run censo
-- --etiqueta=antes`, el cambio, `--etiqueta=despues` y `--comparar antes despues`;
ver «Fase 21: el nombre y los íconos, dentro de su territorio»).

Y corren **antes de publicar**: el despliegue a Pages llama a ese mismo workflow y no
publica si no pasa, porque una lámina mal compuesta en la web no lleva ningún aviso de
que no pasó el control. A cambio, publicar tarda lo que tarda comprobar.

### Que el dibujo no cambie sin que nadie lo decida

**Lo decide el hash del PDF.** Es la regla 4 dicha en una línea —la misma configuración
produce el mismo PDF— y cualquier cambio del dibujo la rompe, porque el dibujo *es* el
archivo. Se compara el archivo final y no el SVG del que salió: entre el SVG y el papel
está svg2pdf, que es justamente donde han aparecido los fallos más caros de este
proyecto —el texto en Times, los halos sin `paint-order`, el interletraje—. Un control
que mirara el SVG los habría dado todos por buenos.

**El rasterizado diagnostica, no juzga.** Cuando un hash no cuadra, la lámina se
rasteriza y se compara con una **firma** aprobada —la lámina reducida a una rejilla de
64 × 64 grises, unos kilobytes en vez de los 35 megapíxeles de un A0 a 150 ppp—, y se
escribe en `muestras/regresion/` con las celdas que cambiaron en rojo. «El hash cambió»
no es accionable sin poder mirar qué cambió.

Antes el veredicto era de la firma, y era un error de diseño: afirmaba algo
independiente de la máquina —el dibujo— midiéndolo con algo que no lo es. Las
tolerancias se calibraron entre dos ejecuciones en la misma máquina, donde la diferencia
es exactamente cero, y ninguna otra máquina podía cumplirlas: pdf.js sobre Linux suaviza
y ajusta los glifos distinto que sobre Windows. Medido: los PDF que generó la
integración continua, rasterizados en Windows, dan media 0,001 contra las firmas
aprobadas en Windows; los mismos archivos rasterizados en Linux dan 0,40, con el umbral
en 0,15. El archivo era idéntico y el control fallaba.

Las tolerancias siguen siendo estrechas, ahora como umbrales del diagnóstico: un cambio
pequeño y repartido es justo el que se escapa mirando. Con umbrales holgados —el primer
intento— cambiar el azul del mar de `#d9f1ff` a `#d4eeff` no encendía ni una celda.

### Rendimiento

| Lámina | Componer | Exportar | Total |
|---|---:|---:|---:|
| Perú A0 vertical | 12,4 s | 9,8 s | **22,8 s** |
| Departamento de Lima A1 | 5,4 s | 4,3 s | 10,1 s |
| Perú A0 horizontal | 3,9 s | 3,8 s | 7,9 s |
| Distrito de Lima A3 | 2,0 s | 2,4 s | 4,5 s |
| Perú A4 vertical | 1,4 s | 2,2 s | 3,8 s |

El A0 vertical pasa del presupuesto de 20 s y el control lo dice sin fallar: la lámina
sale bien, lo que se resiente es la espera. Es el caso extremo —el país entero al nivel
de detalle más fino, con cuatro recuadros que redibujan su entorno— y el informe
propone por dónde recortar: bajar de cuatro a tres recuadros en A0 quita una cuarta
parte del entorno redibujado, y ese entorno podría ir al nivel medio si se comprueba que
no abre hilos blancos en los límites compartidos.

## Despliegue

Cada push a `main` publica en GitHub Pages
(`.github/workflows/deploy.yml`). El trabajo por fases va en ramas `fase-N-...` y `main`
sólo recibe fusiones revisadas, porque cualquier cosa que llegue a `main` se publica.

## Licencias

Poppins y Source Sans 3 se distribuyen bajo SIL Open Font License 1.1; su texto viaja
junto a los archivos en `public/fonts/`. La cartografía procede del INEI y de Natural
Earth (dominio público).
