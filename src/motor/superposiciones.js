/**
 * Capas que se superponen al mapa (Fase 23): ríos y vías, el ámbito del VRAEM y los
 * datos propios de quien hace el mapa.
 *
 * Ninguna existe en un mapa por omisión, que sale igual que antes de la Fase 23: el
 * motor sólo llama a esto cuando alguna está pedida. Cada una trae su muestra para la
 * leyenda y su fuente para el pie, porque una capa que se dibuja sin decir qué es ni de
 * dónde sale no se puede leer ni citar.
 */
import { geoPath } from 'd3-geo';
import { color, trazoMm, discontinuoMm } from '../estilo/tokens.js';
import { el, num } from './svg.js';
import { NORMA_VRAEM } from './vraem.js';

/* ----------------------------- ríos y vías ------------------------------- */

const ESTILO_RIO = (rango) => ({
  stroke: color.rio, 'stroke-width': trazoMm.rio[Math.min(Math.max(rango, 1), 4) - 1],
});
const ESTILO_VIA = (red, pavimentada) => ({
  stroke: red === 'nacional' ? color.viaNacional : color.viaDepartamental,
  'stroke-width': red === 'nacional' ? trazoMm.viaNacional : trazoMm.viaDepartamental,
  ...(pavimentada ? {} : { 'stroke-dasharray': discontinuoMm.viaSinPavimentar.map((v) => num(v)).join(' ') }),
});

/** ¿Cae la caja proyectada del rasgo dentro del marco? */
function filtroDeMarco(proyeccion, marco) {
  const limites = geoPath(proyeccion);
  return (f) => {
    const [[x0, y0], [x1, y1]] = limites.bounds(f);
    return !(x1 < marco.x || x0 > marco.x + marco.ancho || y1 < marco.y || y0 > marco.y + marco.alto);
  };
}

/**
 * Caja geográfica [oeste, sur, este, norte] de lo que se ve en el marco, para pedir
 * sólo las teselas de ríos y vías que hacen falta. Se invierten el contorno del marco y
 * su centro; la transversa de Mercator apenas curva a estas latitudes, y se deja un
 * margen de un cuarto de grado por si acaso.
 */
export function cajaGeografica(proyeccion, marco) {
  const puntos = [];
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const lonLat = proyeccion.invert([marco.x + (marco.ancho * i) / 4, marco.y + (marco.alto * j) / 4]);
      if (lonLat && lonLat.every(Number.isFinite)) puntos.push(lonLat);
    }
  }
  const lons = puntos.map((p) => p[0]);
  const lats = puntos.map((p) => p[1]);
  return [Math.min(...lons) - 0.25, Math.min(...lats) - 0.25, Math.max(...lons) + 0.25, Math.max(...lats) + 0.25];
}

/**
 * Ríos y vías, cada grupo como unos pocos trazados: uno por estilo, con todas sus
 * líneas. Un trazado por tramo eran miles de objetos en el PDF para lo que a la vista
 * son seis tipos de línea. Las vías departamentales van debajo de las nacionales.
 *
 * @returns {{rios: string[], vias: string[], dibujados: {rios, viasNacional, viasDepartamental, sinPavimentar}}}
 */
export function dibujarRedes({ rasgos, ruta, proyeccion, marco }) {
  const seVe = filtroDeMarco(proyeccion, marco);
  const grupos = new Map();
  const dibujados = { rios: 0, viasNacional: 0, viasDepartamental: 0, sinPavimentar: 0 };
  for (const f of rasgos) {
    if (!seVe(f)) continue;
    const p = f.properties;
    const esRio = p.capa === 'rio';
    const clave = esRio ? `rio|${p.rango}` : `via|${p.red}|${p.pavimentada ? 1 : 0}`;
    const d = ruta(f.geometry);
    if (!d) continue;
    if (!grupos.has(clave)) grupos.set(clave, { esRio, p, d: [] });
    grupos.get(clave).d.push(d);
    if (esRio) dibujados.rios++;
    else {
      dibujados[p.red === 'nacional' ? 'viasNacional' : 'viasDepartamental']++;
      if (!p.pavimentada) dibujados.sinPavimentar++;
    }
  }
  const orden = (clave) => {
    const [capa, a, b] = clave.split('|');
    /* Ríos de menos a más importantes; vías, la departamental debajo y lo pavimentado
       encima de lo que no lo está. */
    return capa === 'rio' ? 4 - Number(a) : (a === 'nacional' ? 20 : 10) + Number(b);
  };
  const claves = [...grupos.keys()].sort((a, b) => orden(a) - orden(b) || a.localeCompare(b));
  const trazado = ({ esRio, p, d }) => el('path', {
    d: d.join(''),
    fill: 'none',
    ...(esRio ? ESTILO_RIO(p.rango) : ESTILO_VIA(p.red, p.pavimentada)),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  return {
    rios: claves.filter((k) => k.startsWith('rio')).map((k) => trazado(grupos.get(k))),
    vias: claves.filter((k) => k.startsWith('via')).map((k) => trazado(grupos.get(k))),
    dibujados,
  };
}

/* -------------------------------- VRAEM ---------------------------------- */

/**
 * Contorno del VRAEM y, discontinuo, el de su ámbito de intervención directa. Sin
 * relleno: el color del mapa sigue siendo el de la variable elegida, y un velo sobre el
 * VRAEM lo cambiaría de clase a la vista.
 */
export function dibujarVraem({ rasgos, ruta, conTodo = true }) {
  const de = (ambito) => rasgos.find((f) => f.properties.ambito === ambito);
  const piezas = [];
  const directa = de('directa');
  if (directa) {
    piezas.push(el('path', {
      d: ruta(directa.geometry), fill: 'none', stroke: color.vraem, 'stroke-width': trazoMm.vraemDirecta,
      'stroke-dasharray': discontinuoMm.vraemDirecta.map((v) => num(v)).join(' '), 'stroke-linejoin': 'round',
    }));
  }
  const todo = de('vraem');
  if (conTodo && todo) {
    piezas.push(el('path', {
      d: ruta(todo.geometry), fill: 'none', stroke: color.vraem, 'stroke-width': trazoMm.vraem,
      'stroke-linejoin': 'round',
    }));
  }
  return piezas;
}

/* ----------------------------- datos propios ----------------------------- */

/** Rombo de los puntos propios: una forma que ningún servicio del MIMP usa. */
const rombo = (x, y, lado) => {
  const r = lado / 2;
  return `M${num(x)} ${num(y - r)}L${num(x + r)} ${num(y)}L${num(x)} ${num(y + r)}L${num(x - r)} ${num(y)}Z`;
};

/**
 * Los puntos de los datos propios, en su coordenada. Sólo los que caen dentro del
 * ámbito: los de fuera no se dibujan, igual que los servicios de fuera.
 */
export function dibujarPuntosPropios({ puntos, proyeccion, marco, lado, dentroDelAmbito }) {
  const d = [];
  const posiciones = [];
  for (const p of puntos) {
    if (!dentroDelAmbito([p.lon, p.lat])) continue;
    const xy = proyeccion([p.lon, p.lat]);
    if (!xy) continue;
    const [x, y] = xy;
    if (x < marco.x || x > marco.x + marco.ancho || y < marco.y || y > marco.y + marco.alto) continue;
    d.push(rombo(x, y, lado));
    posiciones.push([x, y]);
  }
  return {
    svg: d.length ? [el('path', {
      d: d.join(''), fill: color.datoPropio, stroke: color.fondoHoja, 'stroke-width': lado * 0.12,
      'stroke-linejoin': 'round',
    })] : [],
    dibujados: posiciones.length,
    posiciones,
  };
}

/* ------------------------------- leyenda --------------------------------- */

/** Una línea de muestra para la leyenda, a la altura de la fila. */
const muestraLinea = (atributos) => ({
  dibujar: (x, y, lado) => el('path', {
    d: `M${num(x)} ${num(y)}L${num(x + lado * 1.15)} ${num(y)}`, fill: 'none', 'stroke-linecap': 'butt', ...atributos,
  }),
});

/**
 * Filas de la leyenda para lo que de verdad se dibujó: si a esta escala no cabe la
 * red departamental, la leyenda no la anuncia.
 *
 * @returns {Array<{etiqueta: string, dibujar: (x, y, lado) => string}>}
 */
export function filasDeLeyenda({ redes = null, vraem = null, puntos = null }) {
  const filas = [];
  if (vraem) {
    /* En el mapa del propio VRAEM su contorno es el del ámbito y no se anuncia. */
    if (vraem.todo) {
      filas.push({ etiqueta: 'Ámbito del VRAEM', ...muestraLinea({ stroke: color.vraem, 'stroke-width': trazoMm.vraem }) });
    }
    if (vraem.directa) {
      filas.push({
        etiqueta: 'Intervención directa del VRAEM',
        ...muestraLinea({
          stroke: color.vraem, 'stroke-width': trazoMm.vraemDirecta,
          'stroke-dasharray': discontinuoMm.vraemDirecta.map((v) => num(v)).join(' '),
        }),
      });
    }
  }
  if (redes?.rios) filas.push({ etiqueta: 'Río', ...muestraLinea(ESTILO_RIO(1)) });
  if (redes?.viasNacional) filas.push({ etiqueta: 'Red vial nacional', ...muestraLinea(ESTILO_VIA('nacional', true)) });
  if (redes?.viasDepartamental) {
    filas.push({ etiqueta: 'Red vial departamental', ...muestraLinea(ESTILO_VIA('departamental', true)) });
  }
  if (redes?.sinPavimentar) {
    filas.push({ etiqueta: 'Vía sin pavimentar', ...muestraLinea(ESTILO_VIA('departamental', false)) });
  }
  if (puntos?.dibujados) {
    filas.push({
      etiqueta: `${puntos.nombre} (${puntos.dibujados})`,
      dibujar: (x, y, lado) => el('path', {
        d: rombo(x + lado * 0.55, y, lado * 0.85), fill: color.datoPropio,
        stroke: color.fondoHoja, 'stroke-width': lado * 0.1,
      }),
    });
  }
  return filas;
}

/* --------------------------------- pie ----------------------------------- */

const fechaCorta = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * La fuente de cada capa pedida, para el pie. Se cita la capa pedida aunque a esta
 * escala no se vea entera: el pie tiene que saberse antes de encajar el mapa, que es
 * lo que decide la escala.
 */
export function fuentesDeCapas({ rios, vias, vraem, propios, manifiesto }) {
  const fuentes = [];
  const de = (red) => (manifiesto?.redes?.fuentes || []).find((f) => f.red === red);
  if (rios) fuentes.push('Ríos: ANA (red hidrográfica, 2018).');
  if (vias) {
    fuentes.push(`Vías: MTC (Red Vial Nacional al ${fechaCorta(de('nacional')?.corte)}`
      + ` y Departamental al ${fechaCorta(de('departamental')?.corte)}; sin los tramos proyectados).`);
  }
  if (vraem) fuentes.push(`Ámbito del VRAEM: ${NORMA_VRAEM}.`);
  if (propios) fuentes.push(`Datos propios: ${propios}.`);
  return fuentes;
}
