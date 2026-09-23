/**
 * Mapa de ubicación: el Perú en miniatura con el ámbito impreso resaltado.
 *
 * Un mapa de la provincia de Yungay no dice dónde está Yungay. Quien lo mira o ya lo
 * sabe, o no tiene manera de averiguarlo: el encuadre ha eliminado justamente la
 * referencia que haría falta. Ésa es la razón de que cualquier lámina de ámbito
 * reducido lleve un localizador, y de que aquí no sea opcional salvo en el nacional,
 * donde no tendría nada que localizar.
 *
 * Se dibuja con su propia proyección, independiente de la del mapa principal: tiene que
 * caber en unos centímetros y mostrar el país entero, no un trozo ampliado del encuadre.
 * Y con el contorno más ligero, porque a cuatro centímetros de ancho la diferencia entre
 * niveles de detalle no se ve y el pesado multiplicaría por veinte el tamaño del PDF.
 */
import { geoTransverseMercator, geoPath } from 'd3-geo';
import { color, trazoMm } from '../estilo/tokens.js';
import { el, grupo, rect, num } from './svg.js';
import { MERIDIANO_CENTRAL } from './proyeccion.js';

/** Ancho de la miniatura en A4; crece con la hoja como el resto del layout. */
const ANCHO_BASE_MM = 22;

/** Aire entre el país y el borde de la caja. */
const RELLENO_MM = 1.6;

/**
 * @param {object} opciones
 * @param {object} opciones.pais        departamentos del Perú (nivel ligero)
 * @param {string[]} opciones.resaltar  ubigeos de departamento que se tiñen de contexto
 * @param {object} [opciones.ambito]    geometría exacta del ámbito, en rojo encima
 * @param {number} opciones.factor      factor de formato de la hoja
 */
export function mapaDeUbicacion({ pais, resaltar, ambito, factor }) {
  const destacados = new Set(resaltar);
  const anchoInterior = ANCHO_BASE_MM * factor;

  /* La caja se ajusta a la FORMA del Perú en vez de ser un cuadrado: el país es mucho
     más alto que ancho, y un cuadrado dejaría a los lados dos franjas vacías que el
     motor de colocación tendría que tratar como ocupadas. */
  const tanteo = geoTransverseMercator().rotate([-MERIDIANO_CENTRAL, 0])
    .fitWidth(anchoInterior, pais);
  const [[, y0], [, y1]] = geoPath(tanteo).bounds(pais);
  const altoInterior = y1 - y0;

  const ancho = anchoInterior + RELLENO_MM * 2;
  const alto = altoInterior + RELLENO_MM * 2;

  return {
    nombre: 'ubicacion',
    ancho,
    alto,
    dibujar(x, y) {
      const proyeccion = geoTransverseMercator().rotate([-MERIDIANO_CENTRAL, 0])
        .fitExtent([
          [x + RELLENO_MM, y + RELLENO_MM],
          [x + ancho - RELLENO_MM, y + alto - RELLENO_MM],
        ], pais);
      const ruta = geoPath(proyeccion);

      /* Trazo fino y constante: la miniatura no se lee, se reconoce por su silueta.
         Un borde grueso a este tamaño cerraría los valles del contorno. */
      const limites = pais.features.map((f) => el('path', {
        d: ruta(f.geometry),
        fill: destacados.has(f.properties.ubigeo)
          ? color.localizadorDepartamento : color.localizadorRelleno,
        stroke: color.localizadorBorde,
        'stroke-width': num(trazoMm.limiteDistrital, 3),
        'stroke-linejoin': 'round',
      }));

      /* El ámbito exacto va en rojo ENCIMA del departamento teñido. Con sólo el
         departamento, un mapa de la provincia de Yungay y otro de todo Áncash llevaban
         el mismo localizador; con sólo la provincia, muchas son a esta escala una
         mancha de dos milímetros que no se encuentra. Los dos juntos dan la pieza del
         rompecabezas y, dentro de ella, el punto exacto. */
      const resalte = ambito ? ambito.features.map((f) => el('path', {
        d: ruta(f.geometry),
        fill: color.localizadorResalte,
        stroke: color.localizadorResalte,
        'stroke-width': num(trazoMm.limiteDistrital, 3),
        'stroke-linejoin': 'round',
      })) : [];

      return grupo({ id: 'bloque-ubicacion' }, [
        rect({ x, y, ancho, alto }, {
          fill: color.fondoHoja,
          stroke: color.limiteProvincial,
          'stroke-width': trazoMm.limiteDistrital,
        }),
        ...limites,
        ...resalte,
      ]);
    },
  };
}

/**
 * Ubigeos de departamento que hay que resaltar para un ámbito.
 *
 * Se resalta el DEPARTAMENTO aunque el ámbito sea una provincia. A escala de miniatura
 * una provincia es una mancha de dos milímetros que no se distingue del contorno; lo
 * que sí se reconoce es la pieza del rompecabezas, y para situarse basta con eso.
 */
export function resaltePara(ambito) {
  if (ambito.nivel === 'nacional') return [];
  return [ambito.id.slice(0, 2)];
}
