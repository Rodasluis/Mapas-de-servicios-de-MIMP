/**
 * Normaliza los logotipos institucionales para poder incrustarlos en el PDF.
 *
 * Los SVG de referencia vienen de dos sitios muy distintos: el del MIMP está
 * vectorizado de un PNG con VTracer y el del Gobierno del Perú es una exportación
 * limpia con grupos anidados, transformaciones y un recorte. Inlinearlos tal cual en
 * el mapa traería identificadores que chocan con los del documento, transformaciones
 * que svg2pdf tendría que resolver y coordenadas con más decimales de los que cualquier
 * imprenta puede distinguir.
 *
 * Este script los deja en lo esencial: una lista plana de trazados con su color y su
 * regla de relleno, en un sistema de coordenadas propio que empieza en (0,0). El motor
 * sólo tiene que escalar y trasladar.
 *
 * Uso:  npm run logos
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, PUBLICO, abortar, titulo, peso, escribirJson } from './lib/comun.mjs';

const ORIGEN = path.join(RAIZ, 'referencias', 'logos');
const DESTINO = path.join(PUBLICO, 'data', 'logos.json');

/** Decimales de las coordenadas del logotipo, en su propio sistema de unidades. */
const DECIMALES = 2;

/* --------------------------- lectura del SVG ---------------------------- */

/**
 * Recorre el SVG acumulando transformaciones y estilos heredados.
 * No pretende ser un analizador de XML completo: cubre lo que estos dos archivos usan
 * (grupos anidados, translate, matrix, fill por atributo o por style) y avisa si
 * aparece algo que no entiende, en vez de dibujarlo mal en silencio.
 */
function leerSvg(archivo) {
  const texto = fs.readFileSync(archivo, 'utf8');
  const trazados = [];
  const pila = [{ m: [1, 0, 0, 1, 0, 0], fill: null, regla: null, trazo: null, grosor: 1 }];
  const avisos = new Set();

  /* Estos elementos DEFINEN formas para que otras las usen (recortes, máscaras,
     patrones); no se dibujan. El SVG del Gobierno del Perú encierra en un clipPath un
     rectángulo del tamaño del lienzo: tomarlo por contenido lo pinta de negro encima
     de todo el logotipo y además desbarata la caja del dibujo. */
  const NO_DIBUJABLES = new Set(['defs', 'clipPath', 'mask', 'pattern', 'marker', 'symbol']);
  let oculto = 0;

  const etiquetas = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  let m;
  while ((m = etiquetas.exec(texto)) !== null) {
    const [, cierre, nombre, atributosTexto, autocierre] = m;

    if (cierre) {
      if (NO_DIBUJABLES.has(nombre)) oculto = Math.max(0, oculto - 1);
      else if (nombre === 'g' || nombre === 'svg') pila.pop();
      continue;
    }

    if (NO_DIBUJABLES.has(nombre)) {
      if (!autocierre) oculto++;
      continue;
    }
    if (oculto) continue;

    const atributos = leerAtributos(atributosTexto);
    const estilo = leerEstilo(atributos.style);
    const fill = estilo.fill ?? atributos.fill ?? null;
    const regla = estilo['fill-rule'] ?? atributos['fill-rule'] ?? null;
    const trazo = estilo.stroke ?? atributos.stroke ?? null;
    const grosor = estilo['stroke-width'] ?? atributos['stroke-width'] ?? null;
    const cima = pila[pila.length - 1];
    const estado = {
      m: atributos.transform ? multiplicar(cima.m, leerTransform(atributos.transform, avisos)) : cima.m,
      fill: fill ?? cima.fill,
      regla: regla ?? cima.regla,
      trazo: trazo ?? cima.trazo,
      grosor: grosor !== null ? parseFloat(grosor) : cima.grosor,
    };

    if (nombre === 'path') {
      const relleno = estado.fill === 'none' ? null : normalizarColor(estado.fill ?? '#000000');
      const trazo = estado.trazo && estado.trazo !== 'none' ? normalizarColor(estado.trazo) : null;
      /* Buena parte del escudo son contornos sin relleno: si sólo se conservaran los
         trazados rellenos se perdería todo el dibujo de línea. */
      if (atributos.d && (relleno || trazo)) {
        trazados.push({
          puntos: transformarRuta(atributos.d, estado.m, avisos),
          fill: relleno,
          trazo,
          // El grosor viaja en las unidades del original y hay que escalarlo con él.
          grosor: trazo ? (estado.grosor ?? 1) * factorEscala(estado.m) : 0,
          regla: estado.regla === 'evenodd' ? 'evenodd' : null,
        });
      }
    } else if ((nombre === 'g' || nombre === 'svg') && !autocierre) {
      pila.push(estado);
    }
  }
  return { trazados, avisos: [...avisos] };
}

function leerAtributos(texto) {
  const out = {};
  for (const m of texto.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function leerEstilo(style) {
  if (!style) return {};
  return Object.fromEntries(
    style.split(';').filter(Boolean).map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    }),
  );
}

/* ----------------------------- transformaciones ------------------------- */

/** Matrices afines como [a, b, c, d, e, f], igual que SVG. */
function multiplicar(p, q) {
  return [
    p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

function leerTransform(texto, avisos) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const t of texto.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const n = t[2].trim().split(/[\s,]+/).map(Number);
    switch (t[1]) {
      case 'translate': m = multiplicar(m, [1, 0, 0, 1, n[0] || 0, n[1] || 0]); break;
      case 'matrix': m = multiplicar(m, n.slice(0, 6)); break;
      case 'scale': m = multiplicar(m, [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0]); break;
      default: avisos.add(`transformación no admitida: ${t[1]}()`);
    }
  }
  return m;
}

const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Cuánto agranda una matriz afín: la raíz de su determinante, que sirve para grosores. */
const factorEscala = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

/* ------------------------------ rutas ----------------------------------- */

/**
 * Convierte la cadena `d` en una lista de subrutas de puntos absolutos ya
 * transformados. H y V se convierten en L porque una transformación puede inclinarlos
 * y entonces dejan de ser horizontales o verticales.
 */
function transformarRuta(d, m, avisos) {
  const piezas = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const subrutas = [];
  let actual = null;
  let x = 0; let y = 0; let x0 = 0; let y0 = 0;
  let orden = '';
  let i = 0;

  const nuevo = () => { actual = []; subrutas.push(actual); };
  const punto = (px, py) => { if (!actual) nuevo(); actual.push(aplicar(m, px, py)); };
  const n = () => Number(piezas[i++]);

  while (i < piezas.length) {
    const pieza = piezas[i];
    if (/^[A-Za-z]$/.test(pieza)) { orden = pieza; i++; } else if (!orden) { i++; continue; }
    const rel = orden === orden.toLowerCase();
    switch (orden.toUpperCase()) {
      case 'M': {
        const nx = n(); const ny = n();
        x = rel ? x + nx : nx; y = rel ? y + ny : ny;
        x0 = x; y0 = y;
        nuevo(); punto(x, y);
        orden = rel ? 'l' : 'L'; // un M seguido de más pares son líneas
        break;
      }
      case 'L': { const nx = n(); const ny = n(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; punto(x, y); break; }
      case 'H': { const nx = n(); x = rel ? x + nx : nx; punto(x, y); break; }
      case 'V': { const ny = n(); y = rel ? y + ny : ny; punto(x, y); break; }
      case 'C': {
        const c = [n(), n(), n(), n(), n(), n()];
        const p1 = rel ? [x + c[0], y + c[1]] : [c[0], c[1]];
        const p2 = rel ? [x + c[2], y + c[3]] : [c[2], c[3]];
        const p3 = rel ? [x + c[4], y + c[5]] : [c[4], c[5]];
        /* Las curvas se conservan como curvas: convertirlas en segmentos engordaría
           el archivo y dejaría los bordes del escudo con facetas visibles en A0. */
        punto(p1[0], p1[1]); punto(p2[0], p2[1]); punto(p3[0], p3[1]);
        if (actual) actual.curvas = (actual.curvas || []).concat([actual.length - 3]);
        x = p3[0]; y = p3[1];
        break;
      }
      case 'Z': { if (actual) actual.cerrada = true; x = x0; y = y0; i++; continue; }
      default:
        avisos.add(`orden de ruta no admitida: ${orden}`);
        i++;
    }
  }
  return subrutas;
}

/** Vuelve a escribir las subrutas como cadena `d`, con precisión controlada. */
function escribirRuta(subrutas, dx, dy, escala) {
  const c = (v) => {
    const r = Number((v * escala).toFixed(DECIMALES));
    return Object.is(r, -0) ? 0 : r;
  };
  const partes = [];
  for (const sub of subrutas) {
    if (!sub.length) continue;
    const curvas = new Set(sub.curvas || []);
    partes.push(`M${c(sub[0][0] - dx)} ${c(sub[0][1] - dy)}`);
    let i = 1;
    while (i < sub.length) {
      if (curvas.has(i)) {
        const [a, b, d] = [sub[i], sub[i + 1], sub[i + 2]];
        partes.push(`C${c(a[0] - dx)} ${c(a[1] - dy)} ${c(b[0] - dx)} ${c(b[1] - dy)} ${c(d[0] - dx)} ${c(d[1] - dy)}`);
        i += 3;
      } else {
        partes.push(`L${c(sub[i][0] - dx)} ${c(sub[i][1] - dy)}`);
        i += 1;
      }
    }
    if (sub.cerrada) partes.push('Z');
  }
  return partes.join('');
}

/* ------------------------------- color ---------------------------------- */

const NOMBRES = { black: '#000000', white: '#ffffff', none: 'none' };

/**
 * Unifica los casi-blancos y casi-negros.
 *
 * La vectorización automática deja decenas de tonos a un paso del blanco (#FAFAFA,
 * #F9F9F9, #F8F8F8…) que son el borde suavizado del texto original, no colores del
 * logotipo. Al imprimir se ven como una aureola sucia alrededor de las letras.
 */
function normalizarColor(c) {
  if (!c) return '#000000';
  let v = String(c).trim().toLowerCase();
  if (NOMBRES[v]) v = NOMBRES[v];
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  if (!/^#[0-9a-f]{6}$/.test(v)) return v;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  if (min >= 0xf2 && max - min <= 10) return '#ffffff';
  if (max <= 0x12 && max - min <= 10) return '#000000';
  return v.toUpperCase();
}

/* ---------------------------- cuantización ------------------------------ */

/** Distancia máxima en RGB para considerar que dos colores son el mismo. */
const UMBRAL_COLOR = 34;

const aRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Reduce la paleta a los colores que de verdad componen el logotipo.
 *
 * Vectorizar un PNG deja un color ligeramente distinto por cada trazado —aquí llegaban
 * 599 para un logotipo de una docena de tintas—, porque cada borde suavizado del
 * original se convierte en su propio tono. En pantalla no se nota; impreso en A0 el
 * escudo aparece moteado y la banda roja deja de ser un plano uniforme.
 *
 * Se construye la paleta por AREA, no por número de trazados: la banda gris es un solo
 * trazado y tiene que entrar antes que cien motas del mismo tono. Después cada color se
 * ajusta al de la paleta más próximo, y los que no se parecen a ninguno sobreviven
 * intactos, de modo que un color legítimo poco frecuente no se pierde.
 */
function cuantizarColores(trazados) {
  const area = new Map();
  for (const t of trazados) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const sub of t.puntos) {
      for (const [x, y] of sub) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const a = Math.max((maxX - minX) * (maxY - minY), 1e-6);
    for (const c of [t.fill, t.trazo]) {
      if (c && /^#[0-9A-F]{6}$/i.test(c)) area.set(c, (area.get(c) || 0) + a);
    }
  }

  const ordenados = [...area.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const paleta = [];
  for (const c of ordenados) {
    const rgb = aRgb(c);
    if (!paleta.some((p) => distancia(aRgb(p), rgb) <= UMBRAL_COLOR)) paleta.push(c);
  }

  const mapa = new Map();
  for (const c of ordenados) {
    const rgb = aRgb(c);
    let mejor = paleta[0];
    let d = Infinity;
    for (const p of paleta) {
      const dp = distancia(aRgb(p), rgb);
      if (dp < d) { d = dp; mejor = p; }
    }
    mapa.set(c, mejor);
  }
  // Los valores que no son un hexadecimal reconocible se dejan tal cual.
  for (const t of trazados) {
    for (const c of [t.fill, t.trazo]) if (c && !mapa.has(c)) mapa.set(c, c);
  }
  return { mapa, antes: ordenados.length, despues: paleta.length };
}

/* ------------------------------ construcción ---------------------------- */

titulo('Logotipos institucionales');

const LOGOS = {
  mimp: { archivo: 'mimp.svg', nombre: 'Ministerio de la Mujer y Poblaciones Vulnerables' },
  gobiernoPeru: { archivo: 'gobierno_peru.svg', nombre: 'Gobierno del Perú' },
};

const salida = { generado: new Date().toISOString().slice(0, 10), logos: {} };

for (const [clave, info] of Object.entries(LOGOS)) {
  const archivo = path.join(ORIGEN, info.archivo);
  if (!fs.existsSync(archivo)) abortar(`Falta el logotipo ${info.archivo} en referencias/logos.`);

  const { trazados, avisos } = leerSvg(archivo);
  if (!trazados.length) abortar(`${info.archivo} no produjo ningún trazado.`);

  /* Caja real del contenido: el lienzo declarado suele traer aire alrededor, y en el
     bloque institucional lo que hay que alinear es el dibujo, no el lienzo. */
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const t of trazados) {
    for (const sub of t.puntos) {
      for (const [x, y] of sub) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  /* Se normaliza a 100 unidades de alto: así el motor escala por un solo factor y las
     coordenadas guardadas no dependen del tamaño del original. */
  const escala = 100 / (maxY - minY);
  const ancho = Number(((maxX - minX) * escala).toFixed(DECIMALES));

  const { mapa: paleta, antes, despues } = cuantizarColores(trazados);
  const piezas = trazados.map((t) => ({
    d: escribirRuta(t.puntos, minX, minY, escala),
    ...(t.fill ? { f: paleta.get(t.fill) } : { f: 'none' }),
    ...(t.trazo ? { s: paleta.get(t.trazo), w: Number((t.grosor * escala).toFixed(3)) } : {}),
    ...(t.regla ? { r: t.regla } : {}),
  })).filter((p) => p.d.length > 0);
  const colores = new Set(piezas.flatMap((p) => [p.f, p.s]).filter((c) => c && c !== 'none'));

  salida.logos[clave] = {
    nombre: info.nombre,
    origen: info.archivo,
    ancho,
    alto: 100,
    trazados: piezas,
  };

  const bytes = JSON.stringify(salida.logos[clave]).length;
  console.log(`  ✓ ${clave.padEnd(13)} ${String(piezas.length).padStart(4)} trazados`
    + ` · ${antes} colores → ${colores.size} · proporción ${(ancho / 100).toFixed(2)}:1 · ${peso(bytes)}`);
  if (avisos.length) for (const a of avisos) console.log(`    ! ${a}`);
}

const tam = escribirJson(DESTINO, salida);
console.log(`\n✓ logos.json ${peso(tam)} en public/data.\n`);
