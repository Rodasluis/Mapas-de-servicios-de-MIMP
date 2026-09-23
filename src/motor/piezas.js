/**
 * Piezas del layout: bloque institucional, título, rosa de los vientos, escala
 * gráfica y leyenda.
 *
 * Cada pieza se construye en dos tiempos: primero declara cuánto MIDE y después sabe
 * DIBUJARSE en una posición. El motor de colocación necesita las medidas antes de
 * decidir dónde va cada cosa, y así una pieza no puede acabar dibujándose con un
 * tamaño distinto del que se reservó.
 *
 * Las medidas de estas piezas sí crecen con la hoja, al contrario que el trazo del
 * mapa y sus rótulos, que se mantienen en tamaños reales de imprenta. Un A0 se mira
 * de lejos y con el cuerpo de un A4 el título no se leería; un límite departamental,
 * en cambio, tiene que medir lo mismo en las dos hojas para que la lectura del mapa
 * no cambie. Ese reparto es deliberado.
 */
import { color, trazoMm, tipografia, layoutMm, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, rect, num } from './svg.js';

/** Diagonal de un A4 en milímetros, referencia del factor de formato. */
const DIAGONAL_A4 = Math.hypot(210, 297);

/**
 * Cuánto crecen las piezas del layout al crecer la hoja.
 *
 * Se usa la raíz de la proporción de diagonales, no la proporción entera: de A4 a A0
 * el lado se multiplica por 4, y un título cuatro veces mayor se comería la hoja.
 * Con la raíz queda el doble, que es lo que pide un cartel visto de lejos.
 */
export function factorFormato(hoja) {
  return Math.sqrt(hoja.diagonalMm / DIAGONAL_A4);
}

const estilo = (t, factor) => ({ familia: t.familia, variante: t.peso, pt: t.pt * factor });

/* --------------------------- bloque institucional ----------------------- */

/** Dibuja un logotipo normalizado de logos.json a la altura pedida. */
export function dibujarLogo(logo, x, y, alturaMm) {
  const k = alturaMm / logo.alto;
  const piezas = logo.trazados.map((p) => el('path', {
    d: p.d,
    fill: p.f && p.f !== 'none' ? p.f : 'none',
    ...(p.r ? { 'fill-rule': p.r } : {}),
    ...(p.s ? { stroke: p.s, 'stroke-width': num(p.w ?? 0.1, 4) } : {}),
  }));
  return grupo({ transform: `translate(${num(x)} ${num(y)}) scale(${num(k, 6)})` }, piezas);
}

export function bloqueInstitucional({ logos, factor }) {
  const alturaLogo = 9 * factor;
  const separacion = 2.2 * factor;
  const relleno = layoutMm.relleneBloque * factor;

  const lista = [logos.mimp, logos.gobiernoPeru].filter(Boolean);
  const anchos = lista.map((l) => (l.ancho / l.alto) * alturaLogo);
  const ancho = Math.max(...anchos) + relleno * 2;
  const alto = lista.length * alturaLogo + (lista.length - 1) * separacion + relleno * 2;

  return {
    nombre: 'institucional',
    ancho,
    alto,
    dibujar(x, y) {
      const fondo = rect({ x, y, ancho, alto }, {
        fill: color.fondoHoja, stroke: color.mimpGris,
        'stroke-width': trazoMm.marcoInterior, rx: 0.8 * factor,
      });
      const dibujos = lista.map((logo, i) => dibujarLogo(
        logo,
        x + relleno + (ancho - relleno * 2 - anchos[i]) / 2,
        y + relleno + i * (alturaLogo + separacion),
        alturaLogo,
      ));
      return grupo({ id: 'bloque-institucional' }, [fondo, ...dibujos]);
    },
  };
}

/* -------------------------------- título -------------------------------- */

export function bloqueTitulo({ textos, medidor, factor, anchoMaximo }) {
  const relleno = layoutMm.relleneBloque * factor;
  const eTitulo = estilo(tipografia.titular, factor);
  const eSub = estilo(tipografia.subtitulo, factor);
  const ePeriodo = estilo(tipografia.periodo, factor);

  const anchoTexto = anchoMaximo - relleno * 2;
  const lineasTitulo = medidor.partir(textos.titulo || 'Servicios del MIMP', eTitulo, anchoTexto);
  const lineasSub = textos.subtitulo ? medidor.partir(textos.subtitulo, eSub, anchoTexto) : [];
  const periodo = textos.periodo ? String(textos.periodo) : '';

  const altoTitulo = medidor.alto(eTitulo) * 1.12;
  const altoSub = medidor.alto(eSub) * 1.15;
  const altoPeriodo = periodo ? medidor.alto(ePeriodo) * 1.3 : 0;

  const ancho = relleno * 2 + Math.max(
    ...lineasTitulo.map((l) => medidor.ancho(l, eTitulo)),
    ...lineasSub.map((l) => medidor.ancho(l, eSub)),
    periodo ? medidor.ancho(periodo, ePeriodo) : 0,
  );
  const alto = relleno * 2 + lineasTitulo.length * altoTitulo
    + lineasSub.length * altoSub + altoPeriodo;

  return {
    nombre: 'titulo',
    ancho,
    alto,
    dibujar(x, y) {
      const hijos = [rect({ x, y, ancho, alto }, {
        fill: color.fondoHoja, stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
      })];
      const cx = x + ancho / 2;
      let linea = y + relleno + medidor.ascenso(eTitulo);
      for (const l of lineasTitulo) {
        hijos.push(texto(l, {
          x: cx, y: linea, 'text-anchor': 'middle', fill: color.tinta,
          'font-family': eTitulo.familia, 'font-size': ptAmm(eTitulo.pt), 'font-weight': 700,
        }));
        linea += altoTitulo;
      }
      linea += medidor.ascenso(eSub) - medidor.ascenso(eTitulo);
      for (const l of lineasSub) {
        hijos.push(texto(l, {
          x: cx, y: linea, 'text-anchor': 'middle', fill: color.tinta,
          'font-family': eSub.familia, 'font-size': ptAmm(eSub.pt), 'font-weight': 600,
        }));
        linea += altoSub;
      }
      if (periodo) {
        hijos.push(texto(periodo, {
          x: cx, y: linea + medidor.ascenso(ePeriodo) * 0.9, 'text-anchor': 'middle',
          fill: color.mimpRojo, 'font-family': ePeriodo.familia,
          'font-size': ptAmm(ePeriodo.pt), 'font-weight': 500,
        }));
      }
      return grupo({ id: 'bloque-titulo' }, hijos);
    },
  };
}

/* --------------------------- rosa de los vientos ------------------------ */

/**
 * Rosa de cuatro puntas. Se gira con el ángulo real del norte: en una Mercator
 * transversa el norte sólo apunta «arriba» sobre el meridiano central, y una flecha
 * que siempre señale arriba estaría mintiendo fuera de él.
 */
export function rosaDeLosVientos({ factor, anguloNorte, medidor }) {
  const radio = 6 * factor;
  const eLetra = { familia: 'SourceSans3', variante: 'Bold', pt: 8 * factor };
  const alto = radio * 2 + medidor.alto(eLetra) * 1.1;
  const ancho = radio * 2;

  return {
    nombre: 'norte',
    ancho,
    alto,
    dibujar(x, y) {
      const cx = x + ancho / 2;
      const cy = y + medidor.alto(eLetra) * 1.1 + radio;
      const p = (dx, dy) => `${num(cx + dx)} ${num(cy + dy)}`;
      const punta = radio;
      const cintura = radio * 0.22;
      const aguja = [
        `M${p(0, -punta)}`, `L${p(cintura, -cintura)}`, `L${p(punta, 0)}`, `L${p(cintura, cintura)}`,
        `L${p(0, punta)}`, `L${p(-cintura, cintura)}`, `L${p(-punta, 0)}`, `L${p(-cintura, -cintura)}`, 'Z',
      ].join('');
      const mitadNorte = [
        `M${p(0, -punta)}`, `L${p(cintura, -cintura)}`, `L${p(0, 0)}`, `L${p(-cintura, -cintura)}`, 'Z',
      ].join('');

      return grupo({
        id: 'rosa-vientos',
        transform: `rotate(${num(anguloNorte, 3)} ${num(cx)} ${num(cy)})`,
      }, [
        el('circle', {
          cx, cy, r: radio * 1.18, fill: 'none',
          stroke: color.tintaSuave, 'stroke-width': trazoMm.grilla * 2,
        }),
        el('path', { d: aguja, fill: color.fondoHoja, stroke: color.tinta, 'stroke-width': trazoMm.marcoInterior }),
        el('path', { d: mitadNorte, fill: color.tinta }),
        texto('N', {
          x: cx, y: cy - radio * 1.18 - medidor.alto(eLetra) * 0.18,
          'text-anchor': 'middle', fill: color.tinta,
          'font-family': eLetra.familia, 'font-size': ptAmm(eLetra.pt), 'font-weight': 700,
        }),
      ]);
    },
  };
}

/* ----------------------------- escala gráfica --------------------------- */

const PASOS_BONITOS = [1, 2, 2.5, 5, 10];

/** Elige una longitud redonda en kilómetros cercana a la longitud buscada en papel. */
export function kilometrosRedondos(denominador, largoObjetivoMm) {
  const bruto = (largoObjetivoMm * denominador) / 1e6;
  const orden = 10 ** Math.floor(Math.log10(bruto));
  let mejor = orden;
  let dif = Infinity;
  for (const p of PASOS_BONITOS) {
    for (const o of [orden / 10, orden, orden * 10]) {
      const v = p * o;
      const d = Math.abs(Math.log(v / bruto));
      if (d < dif) { dif = d; mejor = v; }
    }
  }
  return mejor;
}

/**
 * Barra de escala con divisiones alternas y la escala numérica debajo.
 *
 * El largo sale de la escala medida sobre el propio dibujo, de modo que la barra mide
 * de verdad lo que dice. La Fase 8 lo comprueba invirtiendo sus extremos por la
 * proyección y midiendo la distancia sobre el terreno.
 */
export function escalaGrafica({ denominador, factor, medidor }) {
  const largoObjetivo = 46 * factor;
  const km = kilometrosRedondos(denominador, largoObjetivo);
  const largo = (km * 1e6) / denominador;
  const divisiones = 4;
  const altoBarra = 1.7 * factor;
  const eCifra = { familia: 'SourceSans3', variante: 'Regular', pt: 6.5 * factor };
  const eEscala = { familia: 'Poppins', variante: 'SemiBold', pt: 7.5 * factor };
  const relleno = layoutMm.relleneBloque * factor * 0.8;

  const etiquetas = [];
  for (let i = 0; i <= divisiones; i++) {
    const v = (km / divisiones) * i;
    etiquetas.push(Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
  }
  const textoEscala = `1:${Math.round(denominador).toLocaleString('es-PE')}`;
  const unidad = 'km';

  const anchoCifras = medidor.ancho(etiquetas[etiquetas.length - 1], eCifra)
    + medidor.ancho(` ${unidad}`, eCifra);
  const ancho = Math.max(largo + anchoCifras, medidor.ancho(textoEscala, eEscala)) + relleno * 2;
  const alto = relleno * 2 + medidor.alto(eCifra) * 1.05 + altoBarra
    + medidor.alto(eEscala) * 1.25;

  return {
    nombre: 'escala',
    ancho,
    alto,
    /**
     * Dónde queda exactamente la barra dentro del bloque. Con esto el motor puede
     * invertir sus dos extremos por la proyección y comprobar que la distancia que
     * cubren sobre el terreno es la que dice el rótulo.
     */
    medida: {
      km,
      largoMm: largo,
      divisiones,
      desplazamientoX: relleno,
      desplazamientoY: relleno + medidor.alto(eCifra) * 1.05 + altoBarra / 2,
    },
    dibujar(x, y) {
      const hijos = [rect({ x, y, ancho, alto }, {
        fill: color.fondoHoja, stroke: color.marco,
        'stroke-width': trazoMm.marcoInterior, 'fill-opacity': 0.9,
      })];
      const x0 = x + relleno;
      const yCifras = y + relleno + medidor.ascenso(eCifra);
      const yBarra = y + relleno + medidor.alto(eCifra) * 1.05;
      const paso = largo / divisiones;

      for (let i = 0; i < divisiones; i++) {
        hijos.push(rect(
          { x: x0 + paso * i, y: yBarra, ancho: paso, alto: altoBarra },
          {
            fill: i % 2 ? color.fondoHoja : color.tinta,
            stroke: color.tinta,
            'stroke-width': trazoMm.grilla * 2,
          },
        ));
      }
      for (let i = 0; i <= divisiones; i++) {
        hijos.push(texto(etiquetas[i], {
          x: x0 + paso * i, y: yCifras, 'text-anchor': 'middle', fill: color.tinta,
          'font-family': eCifra.familia, 'font-size': ptAmm(eCifra.pt),
        }));
      }
      hijos.push(texto(unidad, {
        x: x0 + largo + medidor.ancho(' ', eCifra), y: yCifras, fill: color.tinta,
        'font-family': eCifra.familia, 'font-size': ptAmm(eCifra.pt),
      }));
      hijos.push(texto(textoEscala, {
        x: x0, y: yBarra + altoBarra + medidor.ascenso(eEscala) * 1.05, fill: color.tinta,
        'font-family': eEscala.familia, 'font-size': ptAmm(eEscala.pt), 'font-weight': 600,
      }));
      return grupo({ id: 'escala-grafica' }, hijos);
    },
  };
}
