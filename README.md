# Mapas imprimibles del MIMP

Aplicación web estática que genera mapas de los servicios del MIMP **listos para
imprenta**, como PDF vectorial. El usuario elige tamaño de hoja, orientación, ámbito
(Perú, departamento, provincia, distrito), capas, tipos de servicio y textos; la
aplicación compone el mapa y lo descarga.

No es una captura de pantalla ampliada: el PDF se construye a partir de la geometría,
con las fuentes incrustadas, de modo que se puede imprimir en A0 sin que aparezca un
solo píxel.

> **Estado: Fase 7 — ámbito distrital.**
> Los cuatro ámbitos funcionan: Perú, departamento, provincia y distrito. El distrital
> identifica cada centro con un número y una tabla de nombre, tipo y dirección. Falta el
> control de calidad y el cierre (Fase 8).

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
| `npm run muestras` | Genera y verifica los PDF de `muestras/`, y compara la descarga de la web con ellos |

## Cómo está organizado

```
scripts/      build: descarga, verificación y construcción de la cartografía
src/motor/    composición del mapa y exportación a PDF (Fase 1)
src/ui/       interfaz: configuración, panel y vista previa
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
falta una hoja mayor para verlo completo. El criterio vale para cualquier hoja y
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
coordenada real. El ícono se ancla por su punta, como un alfiler, de modo que lo que
señala es el punto y no el dibujo.

Los recuadros de zoom dibujan **lo mismo** que el mapa principal: si éste pinta cada
centro en su sitio, el recuadro también. Un zoom que agregara lo que el mapa desagrega
estaría contando dos cosas distintas del mismo lugar en la misma lámina.

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

### Coordenadas que el directorio no da por verificadas

De los 704 centros publicados, 43 tienen la coordenada en otro distrito y 2 son
referenciales. Un asterisco tras el número —en el mapa y en la tabla— los marca, y la
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

Los distritos se eligen desde la **cartografía**, no desde `centros.json`: el catálogo
del buscador sólo lista los que tienen algún centro, y precisamente los que no lo tienen
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

**Los rótulos van debajo de los símbolos, y los ceden sólo si no hay más remedio.** El
grupo de íconos de una provincia se ancla en su polo de inaccesibilidad, que es
justamente el mejor sitio para su nombre. Tratarlo como obstáculo insalvable empujaba
cada rótulo hacia el borde de su provincia o lo dejaba fuera del todo —Huancavelica
desaparecía y LA LIBERTAD acababa arrinconada en un extremo en vez de en el centro—,
pero permitirlo sin más escondía el nombre bajo las insignias, porque los rótulos se
dibujan por debajo: la cifra de sedes es un dato del mapa y el nombre casi siempre se
deduce de la posición.

Se resuelve en dos pasadas. En la primera los íconos sí estorban, de modo que el nombre
busca un hueco limpio dentro de su propia unidad; sólo si no encuentra ninguno se admite
montarlo, que es preferible a omitirlo. Y en esa segunda pasada **no vale la primera
posición que encaje**: se prueban todas y se elige la que menos tape. Valía la primera,
que por el orden de búsqueda es la del polo, y el polo es justamente donde está el grupo
de íconos; en un mapa provincial eso dejaba tapados tres de cada cinco nombres teniendo
sitio mejor a un milímetro. Cada punto interior se prueba además a tres distancias
crecientes, porque con una sola un nombre no lograba apartarse del grupo aunque su
unidad tuviera sitio de sobra unos milímetros más allá.

**Y se prueban antes todas las posiciones interiores.** Se recorrían mezcladas, punto
por punto, así que una posición que se salía del distrito se probaba antes que otra
interior del punto siguiente, y muchos nombres acababan fuera de su área teniendo sitio
dentro. Se recorren ahora en dos bloques: primero las que caen dentro del polígono y
sólo después las que asoman. La separación entre el nombre y su punto baja además de
0,55 a 0,3 interlineados: cuanto más aire, más fácil es salirse, y el halo ya separa el
nombre de lo que tiene debajo.

| | antes | ahora |
|---|---|---|
| Provincia de Lima en A2 | 59 % tapados | **12 %** |
| Perú en A1 | 31 % | **16 %** |
| Departamento de Cusco en A3 | 8 % | 9 % | La leyenda, los recuadros y la cabecera
siguen siendo intocables: los símbolos no se sacan del índice de colisiones, se ignoran
al preguntar.

Cada rótulo prueba hasta diez puntos interiores de su polígono y, en cada uno, la
posición centrada más las ocho de alrededor, primero en una línea y luego partido en dos. Se mide con las
métricas reales de la tipografía incrustada y se comprueba el choque con **rectángulos
exactos**, no con la rejilla de ocupación: su celda de 2 mm sirve para decidir si un
bloque cabe en una esquina, pero no para garantizar que dos rótulos no se tocan.

El orden es determinista —prioridad, luego superficie, luego ubigeo— porque la Fase 8
compara PDF contra PDF.

| Hoja | Departamentos | Provincias |
|---|---:|---:|
| A0 vertical | 25/25 | 196/196 |
| A1 vertical | 25/25 | 195/196 |
| A3 vertical | 24/24 | 177/195 |
| A4 vertical | 24/24 | 146/195 |

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
y en grosor a la vez: 0,5 mm casi negro frente a 0,15 mm de gris claro. Con los dos en
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

## La interfaz

El panel construye sus controles a partir de los datos publicados: los veinte tipos de
servicio salen de `centros.json` con su recuento, no de una lista escrita a mano, así
que al cambiar `DATOS_TAG` la interfaz se actualiza sola. Todo son controles nativos
—`select`, `input`, `fieldset`— porque un panel hecho de `div` con `role="button"`
obliga a reimplementar el foco, las flechas y el anuncio del estado, y casi siempre se
reimplementa peor.

**La vista previa es el PDF.** No se dibuja una versión de pantalla: se inserta en la
página la misma cadena SVG que `svg2pdf` convertirá en PDF. El zoom y el desplazamiento
son una transformación CSS por encima, así que mirar el mapa de cerca no puede cambiar
lo que se exporta.

**La configuración vive en la URL.** Cada ajuste que se aparta de lo normal se escribe
en la barra de direcciones con nombres legibles —`?hoja=A2&tipos=CEM&sinCapas=grilla`—,
nunca con índices que se desplacen al añadir un tipo ni con JSON en base64. Una
configuración por omisión deja la dirección limpia, de modo que cada parámetro que
aparece señala una decisión que alguien tomó, y el enlace se puede corregir a mano,
mandar por correo y volver a abrir meses después.

El parámetro opcional `fecha=AAAA-MM-DD` fija la fecha de generación: con él, repetir
un enlace produce el **mismo PDF byte a byte**, incluida la línea «Generado el» del pie.

La composición tiene freno: escribir un título dispararía un mapa nacional por cada
tecla, y en A0 cada uno tarda trece segundos. Se espera a que la escritura se detenga y,
si ya hay una composición en marcha, se encola **una sola**, porque lo que importa es el
último estado y no los intermedios.

Al pie de la vista hay un resumen en una línea —escala, nivel de detalle, centros
dibujados, rótulos colocados y recuadros—, y los avisos viven en un diálogo que se abre
desde la barra. La regla de los avisos es señalar lo que el mapa **no** está diciendo:
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

## Despliegue

Cada push a `main` publica en GitHub Pages
(`.github/workflows/deploy.yml`). El trabajo por fases va en ramas `fase-N-...` y `main`
sólo recibe fusiones revisadas, porque cualquier cosa que llegue a `main` se publica.

## Licencias

Poppins y Source Sans 3 se distribuyen bajo SIL Open Font License 1.1; su texto viaja
junto a los archivos en `public/fonts/`. La cartografía procede del INEI y de Natural
Earth (dominio público).
