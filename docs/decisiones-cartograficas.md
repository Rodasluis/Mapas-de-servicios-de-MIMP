# Decisiones cartográficas

Por qué el mapa es como es. Cada entrada recoge la decisión, el motivo y —cuando lo
hubo— lo que se probó antes y no funcionó, que suele ser la parte que evita repetir el
error dentro de un año.

---

## Proyección: Mercator transversa con meridiano central en 75° O

Es el eje del huso UTM 18S (EPSG:32718), el de referencia para el Perú. Es conforme
—conserva los ángulos y, localmente, las formas—, que es lo que se espera de un mapa de
servicios; a cambio la escala crece al alejarse del meridiano central.

**Consecuencia medida:** en el nacional vertical la variación entre el centro del marco
y las esquinas es del 0,7 %, que se absorbe en el redondeo de la escala impresa. En A4
**horizontal** llega al 3,4 %, porque el marco abarca 26° de longitud.

De ahí sale una regla que parece de estilo y no lo es: **la barra de escala se coloca
antes que los recuadros de zoom**. Un recuadro le quitó el centro del ancho en A4
horizontal y la barra declaró 500 km cubriendo 489,6 — un 2,1 % de error en el único
elemento de la lámina que sirve para medir. Un recuadro puede ir a cualquier hueco; la
barra, no.

## Se dibuja en la esfera y se rotula en el elipsoide

El dibujo usa la Mercator transversa **esférica** de d3; la retícula se rotula en UTM
18S, que va sobre el elipsoide y con factor de escala 0,9996. Comparten meridiano
central, así que las líneas salen casi rectas —pero no del todo—. Cada línea se calcula
punto a punto con proj4 en vez de trazarse recta, y el informe dice cuánto se curva:
entre 0,01 y 0,14 mm según el formato.

**Los estes negativos no son un error.** El Perú desborda el huso 18 por ambos lados y,
al forzar el país a un solo huso, el extremo occidental cae por debajo del falso origen
de 500 000 m. El mapa de referencia de 2020 rotula igual.

## La escala se mide, no se deduce

Se compara una distancia sobre el terreno con la que ocupa en el papel, en el centro del
marco, en vez de leerla de `projection.scale()`. El número que se imprime sale así del
mismo dibujo que se imprime.

La barra se comprueba después sobre el dibujo terminado: se invierten sus dos extremos
por la proyección y se mide la distancia real entre ellos. En las quince muestras el
error queda por debajo del 0,09 %.

## Tres niveles de detalle, elegidos por un criterio de imprenta

En papel no se distinguen dos trazos separados por menos de unos 0,15 mm. Un nivel con
tolerancia *T* sobre el terreno es por tanto indistinguible del original desde la escala
1:(*T* / 0,15 mm) hacia escalas menos detalladas.

| Nivel | Tolerancia | Válido desde | Dónde se usa |
|---|---:|---|---|
| `bajo` | 1 200 m | 1:8 000 000 | mapas de ubicación |
| `medio` | 300 m | 1:2 000 000 | nacional en A4 y A3 |
| `alto` | 40 m | 1:266 000 | A0, departamento, provincia, distrito |

**Lo que se probó y falló:** simplificar con `quantile(topo, p)` interpretando *p* como
«fracción que se quita». Es la fracción que se **conserva**, así que los tres niveles
salieron invertidos —el «bajo» era el más pesado—. Por eso el criterio se expresa ahora
en metros de tolerancia sobre el terreno y no en un porcentaje.

**Dos detalles que evitan defectos visibles:**

- La simplificación va **sobre una topología común**, de modo que un límite compartido
  por dos distritos se simplifica igual en los dos. Simplificados por separado, aparecen
  hilos blancos a lo largo de las fronteras.
- Provincias y distritos se reparten en un archivo por departamento **conservando los
  mismos arcos**, así que el borde entre dos departamentos encaja aunque cada uno se
  cargue de un archivo distinto. El build lo comprueba.

## El sentido de giro de los anillos

d3-geo espera los anillos exteriores en sentido **horario**, que es el contrario del que
manda RFC 7946 y el que emite polygon-clipping. Con el giro invertido, d3 rellena la
esfera entera menos la forma: el mapa sale en negativo.

El build termina midiendo la superficie del Perú sobre la geometría ya publicada y
comparándola con los 1 285 216 km² oficiales del INEI: sale 1 291 717 km² (+0,51 %). Esa
sola comprobación valida a la vez el sentido de giro, la topología y las unidades.

## Cada mapa se agrega un nivel por debajo del que retrata

| Ámbito | Unidad de la coropleta | Símbolos |
|---|---|---|
| Perú | provincia | un ícono por tipo, con el número de sedes |
| Departamento | distrito | lo mismo |
| Provincia | distrito | **cada centro en su coordenada** |
| Distrito | ninguna | **cada centro numerado**, con tabla |

No es una regla de implementación sino de lectura. El mapa nacional responde «qué
servicios llegan a esta provincia»; a escala de provincia esa pregunta ya está
contestada, y agrupar escondería lo único que a esa escala se puede ver.

El distrito **no se colorea**: la coropleta compara unidades entre sí y ahí sólo hay
una, así que un tono de la rampa invitaría a leer una intensidad que no significa nada.

## Un ícono por tipo, no un alfiler por centro

En el ámbito nacional, dibujar un símbolo por centro pondría ciento y pico alfileres
sobre los pocos milímetros de Lima. Lo que el mapa de referencia comunica —y lo que se
reproduce— es **qué servicios llegan** a cada provincia y cuántas sedes hay de cada uno.

Los PNG que publica el buscador son de 22 × 22 px y a ese tamaño sólo distinguen por el
color; de los veinte tipos, **cinco son rojos casi idénticos** (CEM, UA, CAI, CARPAM y
SAR). A 3 mm serían el mismo punto. Se conservan la forma y el color de `iconos.json` y
se redibuja el interior con un pictograma propio por tipo.

El grupo se ancla en el **polo de inaccesibilidad** de la unidad y no en su centroide:
en una forma cóncava o partida en islas el centroide cae fuera y el grupo se dibujaría
sobre la vecina.

## Recuadros de zoom

**Qué se amplía:** los departamentos con más servicios, de mayor a menor. El criterio
anterior era el apiñamiento —cuánto se pisan los íconos—, que mide otra cosa: depende
del tamaño de la hoja y de la forma de la provincia, y hacía que una provincia diminuta
con tres servicios saliera por delante de un departamento con cuarenta.

**De quién es cada recuadro:** de una zona con nombre, que es siempre el nivel
inmediatamente superior a la unidad dibujada. En el nacional, un departamento; en el
departamental, una provincia; en el provincial, un distrito. Lima se parte en dos:
«Lima Metropolitana y Callao» juntos —dos ámbitos en el papel y una sola mancha urbana
en el mapa— y «Lima provincias» aparte.

**Lo que se probó y falló:** fusionar las cajas de las provincias apiñadas que se
tocaban. Salían conjuntos sin correspondencia con ninguna división real —tres provincias
de Áncash, una de La Libertad y media de Huánuco— que sólo se podían rotular «Zoom 1».
Un recuadro que hay que ir a buscar al mapa para saber de dónde sale no es un zoom.

**El recuadro es un recorte ampliado del mapa.** Antes se rellenaba de color de mar y
encima se dibujaban sólo las unidades de la zona, así que Cusco aparecía flotando en el
Pacífico. Ahora dibuja las mismas capas que el mapa y lo que rodea a la zona ampliada es
lo que de verdad la rodea; el asunto se distingue por su contorno destacado.

**Cuándo no cabe:** es geometría, no una decisión. Cusco ocupa 154 × 185 mm en un A1 y
el mayor hueco libre de la lámina son 131 × 156, porque el Perú está en medio y a los
lados sólo quedan dos franjas de unos 130 mm.

Y no se arregla con más papel: al agrandar la hoja crecen las dos cosas a la vez y la
ampliación se queda clavada en torno a ×1 de A4 a A0. Se arregla **girando la hoja**:
el Perú es alto y estrecho, así que en horizontal el marco se ensancha sin que crezca el
país. Medido sobre los 25 departamentos, 24 amplían ×1,5 o más en A2 horizontal; la
excepción es Loreto, que es casi un tercio del país y no cabe ampliado en ninguna hoja
ni orientación.

## Rótulos

Hay 25 departamentos y 196 provincias, y en A4 no entran ni la mitad. Un mapa con
rótulos superpuestos es ilegible y uno que los omita en silencio es engañoso, así que se
coloca lo que cabe **por prioridad** y se deja constancia de lo que no.

**Van debajo de los símbolos.** La cifra de sedes es un dato del mapa; el nombre casi
siempre se deduce de la posición.

**Pero ceden el sitio a los íconos sólo si no hay más remedio.** El grupo de íconos de
una provincia se ancla justo en el mejor sitio para su nombre. Tratarlo como obstáculo
insalvable dejaba a Huancavelica sin rótulo y a La Libertad arrinconada; permitirlo sin
más escondía el nombre bajo las insignias. Se resuelve en dos pasadas: en la primera los
íconos estorban, y sólo si no hay ningún hueco limpio se admite montarlo, eligiendo
entonces **la posición que menos tape**, no la primera que encaje.

**Las posiciones interiores se prueban todas primero.** Se recorrían mezcladas, punto
por punto, así que una posición que se salía del distrito se probaba antes que otra
interior del punto siguiente.

| Hoja | Departamentos | Provincias |
|---|---:|---:|
| A0 vertical | 25/25 | 196/196 |
| A1 vertical | 25/25 | 195/196 |
| A3 vertical | 24/24 | 177/195 |
| A4 vertical | 24/24 | 146/195 |

## Ningún nombre de país sobre el Perú

Cuando un recuadro ocupa el hueco de Brasil, «BRASIL» buscaba sitio al lado, y al oeste
de Brasil está el Perú: el nombre acababa sobre territorio peruano, y un mapa que rotula
el Perú como Brasil dice algo falso.

Comprobar el punto de anclaje no bastaba: el rótulo mide unos treinta milímetros en A1 y
un ancla a dos de la frontera deja media palabra al otro lado. Se comprueba la **caja
entera** contra la rejilla de territorio. Si aun así no hay sitio, el nombre se **omite**
y el informe dice por qué: un país sin su nombre se reconoce por su posición; uno mal
nombrado engaña.

## Jerarquía de los límites

El salto entre niveles es deliberado y grande, en color y en grosor a la vez.

| Contexto | Departamento | Provincia | Distrito |
|---|---|---|---|
| Nacional | 0,5 mm `#111111` | 0,15 mm `#8a8a8a` | — |
| Departamental | 0,5 mm negro (contorno) | 0,4 mm `#1f1f1f` | 0,1 mm `#9a9a9a` |

Con los dos primeros en grises parecidos no se distinguía a qué departamento pertenece
cada provincia, que es la primera lectura que se le pide al mapa nacional.

## Qué crece con la hoja y qué no

El trazo del mapa y sus rótulos se mantienen en **medidas reales de imprenta**: un
límite departamental mide 0,3 mm en A4 y en A0. Las piezas del layout sí crecen —A4 1,0
· A3 1,37 · A2 1,87 · A1 2,56 · A0 3,50—, porque un cartel se mira de lejos y con el
cuerpo de un A4 el título se perdería.

La retícula sigue la misma lógica que el mapa de referencia: en vez de una separación
fija en papel, que daba seis columnas en A4 y quince en A0 para el mismo mapa, se fija
el **número** de divisiones a lo ancho (seis) y de ahí sale el paso redondo.

## El territorio de alrededor se dibuja siempre

Un departamento que acabara en su propio límite parecería una isla y nadie sabría por
dónde se entra. Va en un gris algo más oscuro que un país vecino —para que no se confunda
con el extranjero— y **sin color de clase**: ahí no se está midiendo nada.

Eso cambia también qué puede tapar un bloque del layout. «Territorio» pasa a ser el
**ámbito**, no todo el Perú: en un mapa de Cusco, poner la leyenda sobre Madre de Dios no
le estorba a nadie, y prohibirlo dejaría la lámina sin ningún sitio donde colocarla.

## El localizador

Un mapa de la provincia de Yungay no dice dónde está Yungay: el encuadre ha eliminado
justamente la referencia que haría falta.

Debajo del departamento hacen falta **dos** miniaturas. Con sólo el Perú, una provincia
es una mancha de dos milímetros y un distrito ni se ve; con sólo el departamento, se
sabe en qué parte cae pero no en qué departamento.

## Lo que este proyecto no decide

El criterio de publicación lo fija el buscador, con una tabla de clasificación auditada.
Aquí **no se reclasifica nada**: si un tipo no está en `centros.json`, no existe para el
mapa. Los **Hogares de Refugio Temporal** quedan fuera en origen —su dirección está
reservada para proteger a las víctimas— y `npm run datos` se detiene si alguna vez
apareciera uno, incluso dentro de un recuento agregado.

Las coordenadas tampoco se corrigen. De los 704 centros publicados, 43 tienen la
coordenada en otro distrito y 2 son referenciales; en el ámbito distrital se marcan con
un asterisco en el mapa y en la tabla, y se dice lo que significa.
