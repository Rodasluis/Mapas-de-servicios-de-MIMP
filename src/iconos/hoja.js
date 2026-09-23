/**
 * Hoja de referencia de los íconos: tipo → pictograma, color y sigla.
 *
 * Es la documentación de la correspondencia que pide la Fase 3, pero impresa y a
 * tamaño real, que es la única forma de comprobar lo que de verdad importa: que a
 * 3 mm —el tamaño al que aparecen en un mapa nacional apretado— cada tipo se sigue
 * distinguiendo de los otros diecinueve.
 */
import { crearHoja } from '../motor/hoja.js';
import { color, tipografia, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, rect, documento } from '../motor/svg.js';
import { dibujarIcono, ICONOS } from './index.js';

/** Los tres tamaños que se comprueban, en milímetros. */
const TAMANOS = [3, 4.5, 6];

export function componerHojaDeIconos({ iconos, centros, medidor }) {
  const hoja = crearHoja({ tamano: 'A4', orientacion: 'vertical', margenMm: 12 });
  const conteo = new Map();
  for (const c of centros.centros) conteo.set(c.tipo, (conteo.get(c.tipo) || 0) + 1);

  const tipos = Object.keys(ICONOS).sort(
    (a, b) => (conteo.get(b) || 0) - (conteo.get(a) || 0) || a.localeCompare(b, 'es'),
  );

  const eTitulo = { familia: 'Poppins', variante: 'Bold', pt: 12 };
  const eCab = { familia: 'Poppins', variante: 'SemiBold', pt: 6 };
  const eNombre = { familia: 'Poppins', variante: 'Regular', pt: 7 };
  const eDato = { familia: 'SourceSans3', variante: 'Regular', pt: 6.5 };

  const x0 = hoja.util.x;
  const filaAlto = (hoja.util.alto - 26) / tipos.length;
  const colIconos = x0 + 4;
  const colNombre = x0 + 46;
  const colSigla = x0 + hoja.util.ancho - 34;
  const colColor = x0 + hoja.util.ancho - 16;

  const piezas = [
    rect({ x: 0, y: 0, ancho: hoja.anchoMm, alto: hoja.altoMm }, { fill: color.fondoHoja }),
    texto('Íconos de los servicios del MIMP', {
      x: x0, y: hoja.util.y + ptAmm(eTitulo.pt), fill: color.tinta,
      'font-family': eTitulo.familia, 'font-size': ptAmm(eTitulo.pt), 'font-weight': 700,
    }),
    texto(`${tipos.length} tipos · insignia con forma de casa, color de iconos.json`
      + ' · tamaños reales de impresión', {
      x: x0, y: hoja.util.y + ptAmm(eTitulo.pt) + 4, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt),
    }),
  ];

  const yCabecera = hoja.util.y + 20;
  TAMANOS.forEach((t, i) => {
    piezas.push(texto(`${String(t).replace('.', ',')} mm`, {
      x: colIconos + i * 13 + t / 2, y: yCabecera, 'text-anchor': 'middle', fill: color.tintaSuave,
      'font-family': eCab.familia, 'font-size': ptAmm(eCab.pt), 'font-weight': 600,
    }));
  });
  for (const [etiqueta, x] of [['Tipo de servicio', colNombre], ['Sigla', colSigla], ['Color', colColor]]) {
    piezas.push(texto(etiqueta, {
      x, y: yCabecera, fill: color.tintaSuave,
      'font-family': eCab.familia, 'font-size': ptAmm(eCab.pt), 'font-weight': 600,
    }));
  }

  tipos.forEach((tipo, fila) => {
    const y = yCabecera + 5 + fila * filaAlto;
    const baseIcono = y + filaAlto * 0.62;
    const colorTipo = iconos.tipos[tipo]?.color || '#888888';

    TAMANOS.forEach((t, i) => {
      piezas.push(dibujarIcono({
        tipo, x: colIconos + i * 13 + 3, y: baseIcono, tamanoMm: t, color: colorTipo,
      }));
    });

    const n = conteo.get(tipo) || 0;
    piezas.push(texto(medidor.recortar(tipo, eNombre, colSigla - colNombre - 3), {
      x: colNombre, y: baseIcono - 0.6, fill: color.tinta,
      'font-family': eNombre.familia, 'font-size': ptAmm(eNombre.pt),
    }));
    piezas.push(texto(`${n} centro${n === 1 ? '' : 's'}`, {
      x: colNombre, y: baseIcono + 2.8, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt * 0.9),
    }));
    piezas.push(texto(ICONOS[tipo].sigla, {
      x: colSigla, y: baseIcono, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt),
    }));
    piezas.push(rect({ x: colColor, y: baseIcono - 3, ancho: 5, alto: 3.4 }, {
      fill: colorTipo, stroke: color.limiteProvincial, 'stroke-width': 0.1,
    }));
    piezas.push(texto(colorTipo, {
      x: colColor + 6.2, y: baseIcono - 0.2, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt * 0.8),
    }));
    piezas.push(el('line', {
      x1: x0, y1: y + filaAlto - 0.4, x2: x0 + hoja.util.ancho, y2: y + filaAlto - 0.4,
      stroke: '#e6e6e6', 'stroke-width': 0.1,
    }));
  });

  return { hoja, svg: documento(hoja, grupo({ id: 'hoja-iconos' }, piezas)) };
}

export { TAMANOS };
