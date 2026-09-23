/**
 * Retícula UTM rotulada en los cuatro bordes del marco.
 *
 * El mapa se DIBUJA con la Mercator transversa esférica de d3, pero se ROTULA con
 * coordenadas UTM 18S (EPSG:32718), que es el sistema en el que trabaja quien use
 * estos mapas en el Perú. Los dos comparten meridiano central (75° O), así que las
 * líneas salen casi rectas, pero no del todo: UTM va sobre el elipsoide WGS84 y con
 * factor de escala 0,9996, mientras que d3 proyecta sobre una esfera. Por eso cada
 * línea se calcula punto a punto en vez de trazarse recta de borde a borde; así encaja
 * con el dibujo aunque las dos proyecciones no sean la misma.
 *
 * Los valores de este que salen negativos no son un error: el Perú desborda el huso 18
 * por ambos lados, y al forzar todo el país a un solo huso el este cae por debajo del
 * falso origen de 500 000 m en el extremo occidental. El mapa de referencia de 2020
 * rotula exactamente igual.
 */
import proj4 from 'proj4';

const UTM_18S = '+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs';

export const aUtm = (lon, lat) => proj4(proj4.WGS84, UTM_18S, [lon, lat]);
export const aLonLat = (este, norte) => proj4(UTM_18S, proj4.WGS84, [este, norte]);

/** Separación buscada entre líneas sobre el papel. */
const SEPARACION_OBJETIVO_MM = 42;

/** Pasos «redondos» admitidos, en metros, dentro de cada orden de magnitud. */
const PASOS = [1, 2, 2.5, 5, 10];

/** Elige el paso redondo cuya separación en papel más se acerca a la buscada. */
export function pasoRedondo(metrosPorMm) {
  const bruto = metrosPorMm * SEPARACION_OBJETIVO_MM;
  const orden = 10 ** Math.floor(Math.log10(bruto));
  let mejor = PASOS[0] * orden;
  let dif = Infinity;
  for (const p of PASOS) {
    for (const o of [orden / 10, orden, orden * 10]) {
      const v = p * o;
      const d = Math.abs(Math.log(v / bruto));
      if (d < dif) { dif = d; mejor = v; }
    }
  }
  return mejor;
}

/**
 * Calcula la retícula visible dentro del marco.
 *
 * @param {Function} proyeccion  proyección de d3 ya encajada
 * @param {object} marco         {x, y, ancho, alto} en milímetros
 * @param {number} denominador   escala 1:N, para elegir el paso
 * @returns {{paso: number, lineas: Array, desviacionMaximaMm: number}}
 */
export function construirGrilla(proyeccion, marco, denominador) {
  const caja = cajaUtmDelMarco(proyeccion, marco);
  if (!caja) return { paso: 0, lineas: [], desviacionMaximaMm: 0 };

  const paso = pasoRedondo(denominador / 1000);
  const lineas = [];
  let desviacionMaxima = 0;

  const dentro = (p) => p
    && p[0] >= marco.x - 0.01 && p[0] <= marco.x + marco.ancho + 0.01
    && p[1] >= marco.y - 0.01 && p[1] <= marco.y + marco.alto + 0.01;

  /* Cada línea se muestrea a lo largo del otro eje y se proyecta punto a punto. Con
     unas decenas de muestras la curva es suave y el error frente a la línea exacta
     queda muy por debajo del grosor del trazo. */
  const MUESTRAS = 80;

  const construir = (valor, eje) => {
    const [desde, hasta] = eje === 'este'
      ? [caja.norteMin, caja.norteMax]
      : [caja.esteMin, caja.esteMax];
    const puntos = [];
    for (let i = 0; i <= MUESTRAS; i++) {
      const t = desde + ((hasta - desde) * i) / MUESTRAS;
      const [lon, lat] = eje === 'este' ? aLonLat(valor, t) : aLonLat(t, valor);
      const p = proyeccion([lon, lat]);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) puntos.push(p);
    }
    const visibles = puntos.filter(dentro);
    if (visibles.length < 2) return;

    desviacionMaxima = Math.max(desviacionMaxima, desviacionDeRecta(visibles));
    lineas.push({ eje, valor, puntos: recortarAlMarco(puntos, marco) });
  };

  for (let e = Math.ceil(caja.esteMin / paso) * paso; e <= caja.esteMax; e += paso) construir(e, 'este');
  for (let n = Math.ceil(caja.norteMin / paso) * paso; n <= caja.norteMax; n += paso) construir(n, 'norte');

  /* Rótulos: donde cada línea corta el borde del marco. */
  for (const linea of lineas) {
    linea.extremos = extremosEnBorde(linea.puntos, marco);
  }

  return { paso, lineas, desviacionMaximaMm: desviacionMaxima, caja };
}

/** Caja UTM que cubre el marco, muestreando su borde (la frontera no es recta en UTM). */
function cajaUtmDelMarco(proyeccion, marco) {
  const bordes = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    bordes.push([marco.x + marco.ancho * t, marco.y]);
    bordes.push([marco.x + marco.ancho * t, marco.y + marco.alto]);
    bordes.push([marco.x, marco.y + marco.alto * t]);
    bordes.push([marco.x + marco.ancho, marco.y + marco.alto * t]);
  }
  let esteMin = Infinity; let esteMax = -Infinity;
  let norteMin = Infinity; let norteMax = -Infinity;
  let alguno = false;
  for (const p of bordes) {
    const ll = proyeccion.invert(p);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) continue;
    const [e, n] = aUtm(ll[0], ll[1]);
    if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
    alguno = true;
    esteMin = Math.min(esteMin, e); esteMax = Math.max(esteMax, e);
    norteMin = Math.min(norteMin, n); norteMax = Math.max(norteMax, n);
  }
  return alguno ? { esteMin, esteMax, norteMin, norteMax } : null;
}

/** Cuánto se aparta la línea muestreada de la recta entre sus extremos, en milímetros. */
function desviacionDeRecta(puntos) {
  const [a] = puntos;
  const b = puntos[puntos.length - 1];
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const largo = Math.hypot(dx, dy);
  if (largo < 1e-6) return 0;
  let max = 0;
  for (const p of puntos) {
    max = Math.max(max, Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / largo);
  }
  return max;
}

/**
 * Recorta la polilínea al rectángulo del marco.
 *
 * En cada cruce se añade el punto exacto del borde, de modo que la línea llega hasta
 * el filo del marco y el rótulo se puede colgar justo ahí. Una línea puede entrar y
 * salir varias veces, así que devuelve una lista de tramos.
 */
function recortarAlMarco(puntos, marco) {
  const x0 = marco.x; const y0 = marco.y;
  const x1 = marco.x + marco.ancho; const y1 = marco.y + marco.alto;
  const dentro = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;

  const tramos = [];
  let actual = null;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    const anterior = i > 0 ? puntos[i - 1] : null;
    if (dentro(p)) {
      if (!actual) {
        actual = [];
        tramos.push(actual);
        if (anterior) {
          const corte = cortarSegmento(p, anterior, marco);
          if (corte) actual.push(corte);
        }
      }
      actual.push(p);
    } else if (actual) {
      const corte = cortarSegmento(anterior, p, marco);
      if (corte) actual.push(corte);
      actual = null;
    }
  }
  return tramos.filter((t) => t.length > 1);
}

/** Punto en que el segmento dentro→fuera cruza el borde del marco. */
function cortarSegmento(dentroP, fueraP, marco) {
  let lo = 0; let hi = 1;
  const x0 = marco.x; const y0 = marco.y;
  const x1 = marco.x + marco.ancho; const y1 = marco.y + marco.alto;
  const esta = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const p = [dentroP[0] + (fueraP[0] - dentroP[0]) * t, dentroP[1] + (fueraP[1] - dentroP[1]) * t];
    if (esta(p)) lo = t; else hi = t;
  }
  const t = lo;
  return [dentroP[0] + (fueraP[0] - dentroP[0]) * t, dentroP[1] + (fueraP[1] - dentroP[1]) * t];
}

/** Dónde toca cada línea los bordes del marco, para colgar ahí su rótulo. */
function extremosEnBorde(tramos, marco) {
  const tol = 0.15;
  const salida = [];
  for (const tramo of tramos) {
    for (const p of [tramo[0], tramo[tramo.length - 1]]) {
      if (Math.abs(p[1] - marco.y) < tol) salida.push({ borde: 'arriba', p });
      else if (Math.abs(p[1] - (marco.y + marco.alto)) < tol) salida.push({ borde: 'abajo', p });
      else if (Math.abs(p[0] - marco.x) < tol) salida.push({ borde: 'izquierda', p });
      else if (Math.abs(p[0] - (marco.x + marco.ancho)) < tol) salida.push({ borde: 'derecha', p });
    }
  }
  return salida;
}

/**
 * Dirección del norte geográfico sobre el papel, en grados desde la vertical.
 *
 * En una Mercator transversa el norte sólo coincide con el «arriba» de la hoja sobre
 * el meridiano central; al alejarse se inclina. La rosa de los vientos se gira con este
 * valor para no mentir.
 */
export function anguloDelNorte(proyeccion, puntoMm) {
  const ll = proyeccion.invert(puntoMm);
  if (!ll) return 0;
  const a = proyeccion(ll);
  const b = proyeccion([ll[0], Math.min(ll[1] + 0.25, 89)]);
  if (!a || !b) return 0;
  return (Math.atan2(b[0] - a[0], a[1] - b[1]) * 180) / Math.PI;
}
