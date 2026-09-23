# Mapas imprimibles del MIMP

Aplicación web estática que genera mapas de los servicios del MIMP **listos para
imprenta**, como PDF vectorial. El usuario elige tamaño de hoja, orientación, ámbito
(Perú, departamento, provincia, distrito), capas, tipos de servicio y textos; la
aplicación compone el mapa y lo descarga.

No es una captura de pantalla ampliada: el PDF se construye a partir de la geometría,
con las fuentes incrustadas, de modo que se puede imprimir en A0 sin que aparezca un
solo píxel.

> **Estado: Fase 4 — motor de etiquetado.**
> A lo anterior se suman los nombres de departamentos y provincias, colocados por
> prioridad y sin una sola superposición. Falta la interfaz web (Fase 5): la página
> publicada todavía no compone mapas.

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
| `DATOS_TAG` | [Distancia-al-centro-de-atencion](https://github.com/Rodasluis/Distancia-al-centro-de-atencion) | `centros.json`, `iconos.json` y los PNG de los íconos |
| `GEO_TAG` | [Peru-maps](https://github.com/Rodasluis/Peru-maps) | límites de departamento, provincia y distrito (INEI) |
| `NATURAL_EARTH_TAG` | [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) | países vecinos, océano y lagos |
| `POPPINS_TAG` | [google/fonts](https://github.com/google/fonts) | Poppins (SIL OFL 1.1) |
| `SOURCE_SANS_TAG` | [adobe-fonts/source-sans](https://github.com/adobe-fonts/source-sans) | Source Sans 3 (SIL OFL 1.1) |

`DATOS_TAG` y `GEO_TAG` admiten una etiqueta, una rama o un SHA de commit. Hoy apuntan
a un commit porque esos repositorios todavía no publican etiquetas; en cuanto exista
una, basta con poner su nombre.

### Actualizar el directorio de servicios

1. Cambia `DATOS_TAG` en `package.json` por la versión nueva del buscador.
2. `npm run datos` — vuelve a descargarlo y **lo verifica**.
3. Revisa el informe que imprime: total de centros, recuento por tipo y calidad de las
   coordenadas. Debe cuadrar con lo que publique el buscador en esa versión.
4. `npm run build`.

La versión queda registrada en `public/data/version.json` y aparece en el pie de cada
PDF, para que un mapa impreso siempre diga de qué corte de datos salió.

### El criterio de publicación no se toca aquí

Qué centros se publican lo decide el buscador, con una tabla de clasificación auditada.
Este proyecto **no reclasifica nada**: si un tipo no está en `centros.json`, no existe
para el mapa. Los **Hogares de Refugio Temporal** quedan fuera en origen —su dirección
está reservada para proteger a las víctimas— y `npm run datos` se detiene si alguna vez
apareciera uno, incluso dentro de un recuento agregado.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run datos` | Descarga y **verifica** el directorio de servicios |
| `npm run fuentes` | Descarga Poppins y Source Sans 3 con sus licencias |
| `npm run geo` | Descarga la cartografía y construye el TopoJSON |
| `npm run preparar` | Ejecuta los pasos anteriores que falten (`-- --forzar` rehace todo) |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Prepara lo necesario y compila en `dist/` |
| `npm run logos` | Normaliza los logotipos de `referencias/logos/` |
| `npm run metricas` | Extrae las métricas de las tipografías |
| `npm run muestras` | Genera y verifica los PDF de `muestras/` |

## Cómo está organizado

```
scripts/      build: descarga, verificación y construcción de la cartografía
src/motor/    composición del mapa y exportación a PDF (Fase 1)
src/ui/       interfaz de configuración (Fase 5)
src/estilo/   tokens.js — única definición de colores, tipografías y grosores
public/       lo que se sirve tal cual (datos y tipografías, generados)
referencias/  mapa de 2020 y logotipos que sirven de referencia
muestras/     PDF de prueba que genera cada fase
tests/        pruebas de integridad y de regresión visual (Fase 8)
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

La leyenda va **siempre abajo a la izquierda**, en todos los formatos: que cambiara de
esquina según la hoja obligaba a buscarla de nuevo en cada mapa. Cuando no cabe no se
muda, encoge — más columnas, siglas en lugar de nombres y cuerpos menores, en ese
orden, porque un nombre completo en cuerpo pequeño se lee mejor que «CARPAM» en cuerpo
grande.

### Los íconos

El mapa de 2020 usa insignias con forma de casa, color por tipo y un pictograma
dentro. Los PNG que publica el buscador son esa misma familia, pero de 22 × 22 px: a
ese tamaño sólo distinguen por el color, y el color no basta, porque de los veinte
tipos **cinco son rojos casi idénticos** (CEM, UA, CAI, CARPAM y SAR). A 3 mm serían el
mismo punto.

Se conserva la forma y el color de `iconos.json`, y se redibuja el interior: cada tipo
lleva un pictograma propio trazado con la geometría más simple que lo haga
reconocible. `muestras/iconos.pdf` los imprime a 3, 4,5 y 6 mm junto a su tipo, sigla
y color: es a la vez la documentación de la correspondencia y la comprobación de que
a tamaño real siguen distinguiéndose.

### Los recuadros de zoom

**Qué se amplía.** En automático no hay una lista de «amplía Lima y Cusco»: el motor
mide, provincia a provincia, qué fracción de su grupo de íconos pisa la del vecino,
agrupa las que pasan del umbral y las amplía. El criterio vale para cualquier hoja y
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

| Hoja | Recuadros | Tamaño del mayor |
|---|---:|---|
| A4 | 1 | 55 × 51 mm |
| A3 | 2 | 85 × 69 mm |
| A2 | 2 | 89 × 137 mm |
| A1 | 3 | 167 × 177 mm |
| A0 | 4 | 337 × 351 mm |

## Los rótulos

El problema no es escribir nombres: es decidir cuáles caben. Hay 25 departamentos y
196 provincias, y en A4 no entran ni la mitad sin pisarse ni tapar los símbolos. Un
mapa con rótulos superpuestos es ilegible y uno que los omita en silencio es engañoso,
así que el motor coloca lo que cabe **por prioridad** y deja constancia de lo que no.

Cada rótulo prueba hasta diez puntos interiores de su polígono —no sólo el polo, que
es justo donde está el grupo de íconos— y, en cada uno, la posición centrada más las
ocho de alrededor, primero en una línea y luego partido en dos. Se mide con las
métricas reales de la tipografía incrustada y se comprueba el choque con **rectángulos
exactos**, no con la rejilla de ocupación: su celda de 2 mm sirve para decidir si un
bloque cabe en una esquina, pero no para garantizar que dos rótulos no se tocan.

El orden es determinista —prioridad, luego superficie, luego ubigeo— porque la Fase 8
compara PDF contra PDF.

| Hoja | Departamentos | Provincias |
|---|---:|---:|
| A0 vertical | 24/25 | 184/196 |
| A1 vertical | 23/25 | 161/196 |
| A3 vertical | 18/24 | 88/195 |
| A4 vertical | 10/24 | 51/195 |

Las provincias que el mapa principal no llega a nombrar son las que su propio grupo de
íconos llena por completo: Lima, Callao, Huamanga. Son justamente las que acaban en un
recuadro de zoom, así que **los recuadros también rotulan sus provincias** y esos
nombres no se pierden.

El comando de muestras comprueba por pares que ninguna caja se superpone a otra, sin
fiarse del índice que las colocó.

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
—A4 1,0 · A3 1,37 · A2 1,87 · A1 2,56 · A0 3,50—, porque un cartel se mira de lejos y
con el cuerpo de un A4 el título se perdería.

La retícula sigue la misma lógica que el mapa de referencia: en vez de una separación
fija en papel, que daba seis columnas en A4 y quince en A0 para el mismo mapa, se fija
el NÚMERO de divisiones a lo ancho (seis) y de ahí sale el paso redondo.

El logotipo va siempre arriba a la izquierda y el título arriba a la derecha, en todas
las hojas: son la cabecera del documento. Cuando el título no cabe ahí sin tapar el
país no se muda de sitio, **encoge**: el motor prueba cuerpos cada vez menores hasta
que deja de estorbar, y sólo el título lleva fondo blanco.

### Dos comprobaciones que el propio motor hace

- **La escala gráfica mide lo que dice.** El motor invierte los dos extremos de la
  barra por la proyección y mide la distancia real entre ellos: en las cinco muestras
  el error queda por debajo del 0,43 %.
- **El navegador mide con las tipografías incrustadas.** svg2pdf coloca el texto con lo
  que mide el navegador, no con las métricas del TTF que incrusta jsPDF; si el
  navegador no tiene las familias cargadas, mide con una de reserva y todo lo centrado
  sale corrido. Se comprueba contra una familia inexistente para confirmar que la
  diferencia (≈1,8 %, que es el interletraje) no es la de una fuente equivocada (≈20 %).

## Despliegue

Cada push a `main` publica en GitHub Pages
(`.github/workflows/deploy.yml`). El trabajo por fases va en ramas `fase-N-...` y `main`
sólo recibe fusiones revisadas, porque cualquier cosa que llegue a `main` se publica.

## Licencias

Poppins y Source Sans 3 se distribuyen bajo SIL Open Font License 1.1; su texto viaja
junto a los archivos en `public/fonts/`. La cartografía procede del INEI y de Natural
Earth (dominio público).
