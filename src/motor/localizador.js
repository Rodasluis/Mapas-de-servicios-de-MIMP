/**
 * Mapa de ubicación: dónde queda lo que la lámina retrata.
 *
 * Un mapa de la provincia de Yungay no dice dónde está Yungay. Quien lo mira o ya lo
 * sabe, o no tiene manera de averiguarlo: el encuadre ha eliminado justamente la
 * referencia que haría falta. Ésa es la razón de que cualquier lámina de ámbito
 * reducido lleve un localizador, y de que aquí no sea opcional salvo en el nacional,
 * donde no tendría nada que localizar.
 *
 * Debajo del departamento hacen falta DOS miniaturas, no una. Con sólo el Perú, una
 * provincia es una mancha de dos milímetros y un distrito ni se ve; con sólo el
 * departamento, se sabe en qué parte del departamento cae pero no en qué departamento.
 * Las dos juntas van de lo general a lo particular: el país con su departamento en
 * rojo, y al lado el departamento con la provincia o el distrito en rojo.
 *
 * Cada una se dibuja con su propia proyección, independiente de la del mapa principal:
 * tiene que caber en unos centímetros y mostrar su ámbito entero, no un trozo ampliado
 * del encuadre. Y con el contorno más ligero, porque a cuatro centímetros de ancho la
 * diferencia entre niveles de detalle no se ve y el pesado multiplicaría por veinte el
 * tamaño del PDF.
 */
import { geoTransverseMercator, geoPath } from 'd3-geo';
import { color, trazoMm, ptAmm, tipografia } from '../estilo/tokens.js';
import { el, grupo, texto, rect, num } from './svg.js';
import { MERIDIANO_CENTRAL } from './proyeccion.js';

/** Ancho de cada miniatura en A4; crece con la hoja como el resto del layout. */
const ANCHO_BASE_MM = 22;

/** Aire entre el contorno y el borde de su caja. */
const RELLENO_MM = 1.6;

/** Separación entre dos miniaturas contiguas. */
const SEPARACION_MM = 1.2;

/**
 * @param {object} opciones
 * @param {Array}  opciones.vistas  una o dos miniaturas, de lo general a lo particular:
 *                                  {base, resaltar, ambito, titulo}
 * @param {number} opciones.factor  factor de formato de la hoja
 */
export function mapaDeUbicacion({ vistas, factor }) {
  const utiles = (vistas || []).filter((v) => v && v.base && v.base.features.length);
  if (!utiles.length) return null;

  const anchoInterior = ANCHO_BASE_MM * factor;
  const eRotulo = { familia: 'Poppins', variante: 'Regular', pt: tipografia.pie.pt * factor * 0.8 };
  const altoRotulo = utiles.some((v) => v.titulo) ? ptAmm(eRotulo.pt) * 1.5 : 0;

  /* Cada miniatura se ajusta a la FORMA de su ámbito en vez de a un cuadrado: el Perú
     es mucho más alto que ancho, y un cuadrado dejaría a los lados dos franjas vacías
     que el motor de colocación tendría que tratar como ocupadas. Las dos comparten
     altura —la del más alto— para que el bloque salga rectangular. */
  const medidas = utiles.map((v) => {
    const tanteo = geoTransverseMercator().rotate([-MERIDIANO_CENTRAL, 0])
      .fitWidth(anchoInterior, v.base);
    const [[, y0], [, y1]] = geoPath(tanteo).bounds(v.base);
    return { vista: v, altoInterior: y1 - y0 };
  });

  const altoInterior = Math.max(...medidas.map((m) => m.altoInterior));
  const anchoCaja = anchoInterior + RELLENO_MM * 2;
  const altoCaja = altoInterior + RELLENO_MM * 2 + altoRotulo;
  const ancho = anchoCaja * medidas.length + SEPARACION_MM * (medidas.length - 1);

  return {
    nombre: 'ubicacion',
    ancho,
    alto: altoCaja,
    dibujar(x, y) {
      const piezas = [];
      medidas.forEach((m, i) => {
        const x0 = x + i * (anchoCaja + SEPARACION_MM);
        piezas.push(dibujarVista(m.vista, x0, y, anchoCaja, altoCaja, altoRotulo, eRotulo));
      });
      return grupo({ id: 'bloque-ubicacion' }, piezas);
    },
  };
}

function dibujarVista(vista, x, y, ancho, alto, altoRotulo, eRotulo) {
  const destacados = new Set(vista.resaltar || []);
  const proyeccion = geoTransverseMercator().rotate([-MERIDIANO_CENTRAL, 0])
    .fitExtent([
      [x + RELLENO_MM, y + RELLENO_MM],
      [x + ancho - RELLENO_MM, y + alto - RELLENO_MM - altoRotulo],
    ], vista.base);
  const ruta = geoPath(proyeccion);

  /* Trazo fino y constante: la miniatura no se lee, se reconoce por su silueta. Un
     borde grueso a este tamaño cerraría los valles del contorno. */
  const limites = vista.base.features.map((f) => el('path', {
    d: ruta(f.geometry),
    fill: destacados.has(f.properties.ubigeo)
      ? color.localizadorDepartamento : color.localizadorRelleno,
    stroke: color.localizadorBorde,
    'stroke-width': num(trazoMm.limiteDistrital, 3),
    'stroke-linejoin': 'round',
  }));

  /* El ámbito exacto, en rojo encima. En la miniatura del país es el departamento; en
     la del departamento, la provincia o el distrito. */
  const resalte = (vista.ambito ? vista.ambito.features : []).map((f) => el('path', {
    d: ruta(f.geometry),
    fill: color.localizadorResalte,
    stroke: color.localizadorResalte,
    'stroke-width': num(trazoMm.limiteDistrital, 3),
    'stroke-linejoin': 'round',
  }));

  const rotulo = vista.titulo ? [texto(vista.titulo, {
    x: x + ancho / 2,
    y: y + alto - RELLENO_MM * 0.4,
    'text-anchor': 'middle',
    fill: color.tintaSuave,
    'font-family': eRotulo.familia,
    'font-size': ptAmm(eRotulo.pt),
  })] : [];

  return grupo({}, [
    rect({ x, y, ancho, alto }, {
      fill: color.fondoHoja,
      stroke: color.limiteProvincial,
      'stroke-width': trazoMm.limiteDistrital,
    }),
    ...limites,
    ...resalte,
    ...rotulo,
  ]);
}

/**
 * Qué se tiñe de contexto en la miniatura del departamento.
 *
 * El tinte marca la pieza que CONTIENE al ámbito; el ámbito exacto va encima en rojo.
 * Para una provincia no hace falta —ella misma es la pieza—, y para un distrito es su
 * provincia, que a ese tamaño sí se distingue mientras que el distrito es una mota.
 */
export function resaltePara(ambito) {
  if (ambito.nivel === 'distrito') return [ambito.id.slice(0, 4)];
  return [];
}
