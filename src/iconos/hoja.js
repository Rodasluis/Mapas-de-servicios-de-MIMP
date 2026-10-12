/**
 * Hoja de referencia de los íconos: tipo → pictograma, sigla y color, en los dos
 * estilos.
 *
 * Es la documentación de la correspondencia, pero impresa y a tamaño real, que es la
 * única forma de comprobar lo que de verdad importa: que a 3 mm —el tamaño al que
 * aparecen en un mapa nacional apretado— cada tipo se sigue distinguiendo de los
 * demás, en un estilo y en el otro.
 */
import { crearHoja } from '../motor/hoja.js';
import { color, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, rect, documento } from '../motor/svg.js';
import { dibujarIcono, ICONOS, ESTILOS, NOMBRES_ESTILO } from './index.js';

/** Los tres tamaños que se comprueban, en milímetros. */
const TAMANOS = [3, 4.5, 6];

/** Separación entre los centros de dos tamaños consecutivos. */
const PASO_MM = 8.5;

export function componerHojaDeIconos({ centros, medidor }) {
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
  const filaAlto = (hoja.util.alto - 32) / tipos.length;
  const anchoEstilo = PASO_MM * TAMANOS.length + 2;
  const colEstilo = NOMBRES_ESTILO.map((_, i) => x0 + 2 + i * anchoEstilo);
  const colNombre = x0 + 2 + NOMBRES_ESTILO.length * anchoEstilo + 2;
  const colColor = NOMBRES_ESTILO.map((_, i) => x0 + hoja.util.ancho - 38 + i * 19);
  const colSigla = colColor[0] - 15;

  const piezas = [
    rect({ x: 0, y: 0, ancho: hoja.anchoMm, alto: hoja.altoMm }, { fill: color.fondoHoja }),
    texto('Íconos de los servicios del MIMP', {
      x: x0, y: hoja.util.y + ptAmm(eTitulo.pt), fill: color.tinta,
      'font-family': eTitulo.familia, 'font-size': ptAmm(eTitulo.pt), 'font-weight': 700,
    }),
    texto(`${tipos.length} tipos · ${NOMBRES_ESTILO.length} estilos a elegir en la interfaz`
      + ' · tamaños reales de impresión', {
      x: x0, y: hoja.util.y + ptAmm(eTitulo.pt) + 4, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt),
    }),
  ];

  /* Dos líneas de cabecera: el nombre del estilo sobre sus tres tamaños. */
  const yEstilo = hoja.util.y + 18;
  const yCabecera = yEstilo + 4;
  NOMBRES_ESTILO.forEach((nombre, i) => {
    piezas.push(texto(ESTILOS[nombre].nombre, {
      x: colEstilo[i], y: yEstilo, fill: color.tinta,
      'font-family': eCab.familia, 'font-size': ptAmm(eCab.pt * 1.1), 'font-weight': 600,
    }));
    TAMANOS.forEach((t, j) => {
      piezas.push(texto(`${String(t).replace('.', ',')} mm`, {
        x: colEstilo[i] + PASO_MM * (j + 0.5), y: yCabecera, 'text-anchor': 'middle',
        fill: color.tintaSuave, 'font-family': eCab.familia, 'font-size': ptAmm(eCab.pt * 0.9),
      }, { medidor, estilo: { ...eCab, pt: eCab.pt * 0.9 } }));
    });
    piezas.push(texto(`Color ${ESTILOS[nombre].nombre.toLowerCase()}`, {
      x: colColor[i], y: yCabecera, fill: color.tintaSuave,
      'font-family': eCab.familia, 'font-size': ptAmm(eCab.pt), 'font-weight': 600,
    }));
  });
  for (const [etiqueta, x] of [['Tipo de servicio', colNombre], ['Sigla', colSigla]]) {
    piezas.push(texto(etiqueta, {
      x, y: yCabecera, fill: color.tintaSuave,
      'font-family': eCab.familia, 'font-size': ptAmm(eCab.pt), 'font-weight': 600,
    }));
  }

  let hayProvisionales = false;
  tipos.forEach((tipo, fila) => {
    const y = yCabecera + 3 + fila * filaAlto;
    const baseIcono = y + filaAlto * 0.66;

    NOMBRES_ESTILO.forEach((nombre, i) => {
      TAMANOS.forEach((t, j) => {
        piezas.push(dibujarIcono({
          tipo, estilo: nombre, x: colEstilo[i] + PASO_MM * (j + 0.5), y: baseIcono, tamanoMm: t,
        }));
      });
      const colorTipo = ESTILOS[nombre].iconos[tipo]?.color || color.tintaSuave;
      piezas.push(rect({ x: colColor[i], y: baseIcono - 3, ancho: 4.5, alto: 3.2 }, {
        fill: colorTipo, stroke: color.limiteProvincial, 'stroke-width': 0.1,
      }));
      piezas.push(texto(colorTipo, {
        x: colColor[i] + 5.4, y: baseIcono - 0.4, fill: color.tintaSuave,
        'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt * 0.8),
      }));
    });

    const provisional = NOMBRES_ESTILO.some((e) => ESTILOS[e].iconos[tipo]?.provisional);
    hayProvisionales ||= provisional;
    const n = conteo.get(tipo) || 0;
    piezas.push(texto(medidor.recortar(tipo, eNombre, colSigla - colNombre - 2), {
      x: colNombre, y: baseIcono - 1.4, fill: color.tinta,
      'font-family': eNombre.familia, 'font-size': ptAmm(eNombre.pt),
    }));
    piezas.push(texto(`${n} centro${n === 1 ? '' : 's'}${provisional ? ' · ícono provisional' : ''}`, {
      x: colNombre, y: baseIcono + 1.6, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt * 0.9),
    }));
    piezas.push(texto(ICONOS[tipo].sigla, {
      x: colSigla, y: baseIcono - 0.4, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt),
    }));
    piezas.push(el('line', {
      x1: x0, y1: y + filaAlto - 0.4, x2: x0 + hoja.util.ancho, y2: y + filaAlto - 0.4,
      stroke: '#e6e6e6', 'stroke-width': 0.1,
    }));
  });

  if (hayProvisionales) {
    piezas.push(texto('Ícono provisional: adaptado al estilo hasta que diseño entregue el definitivo.', {
      x: x0, y: hoja.util.y + hoja.util.alto - 1, fill: color.tintaSuave,
      'font-family': eDato.familia, 'font-size': ptAmm(eDato.pt * 0.9),
    }));
  }

  return { hoja, svg: documento(hoja, grupo({ id: 'hoja-iconos' }, piezas)) };
}

export { TAMANOS };
