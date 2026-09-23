/**
 * Leyenda generada a partir de lo que el mapa realmente dibuja.
 *
 * No hay lista fija de tipos ni de clases: se compone con los tipos que quedan tras
 * el filtro y con las clases del coropletas que alguna provincia llega a usar. Al
 * dejar un solo tipo activo, ninguna provincia alcanza «10 servicios o más» y esa
 * entrada desaparece sola. Una leyenda que anuncia categorías que no están en el mapa
 * es peor que no tener leyenda: obliga a buscar algo que no existe.
 *
 * La altura manda sobre todo lo demás. Veinte tipos en una columna no caben en un A4,
 * así que la leyenda prueba una columna, luego dos, y si aún no cabe recorta los
 * nombres a su sigla antes de renunciar a nada.
 */
import { color, trazoMm, tipografia, layoutMm, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, rect, num } from './svg.js';
import { dibujarIcono, ICONOS } from '../iconos/index.js';
import { CLASES_POR_DEFECTO } from './servicios.js';

export function bloqueLeyenda({
  agregado, clasesUsadas, clases = CLASES_POR_DEFECTO, iconos, medidor, factor,
  rampa, tamanoIconoMm, altoMaximoMm, anchoMaximoMm,
}) {
  const tipos = agregado.tipos;
  if (!tipos.length) return null;

  /**
   * Se busca la composición MENOS agresiva que quepa en la caja disponible. Para cada
   * disposición —una columna con el nombre completo, dos, la sigla, tres— se agotan
   * los cuerpos de mayor a menor antes de pasar a la siguiente. El orden importa:
   * así un A0 compone los nombres completos en cuerpo algo menor en vez de poner
   * «CARPAM» en cuerpo grande, que es más difícil de leer para quien no maneja las
   * siglas del ministerio a diario.
   *
   * Sin este ajuste la leyenda de veinte tipos llegaba a tapar la mitad del país en un
   * A4, o no cabía y se omitía entera, que es peor: un mapa temático sin leyenda no se
   * puede leer.
   */
  const intentos = [];
  for (const [columnas, abreviar] of [[1, false], [2, false], [2, true], [3, true]]) {
    for (const escala of [1, 0.9, 0.8, 0.7, 0.62, 0.55]) {
      intentos.push({ columnas, abreviar, escala });
    }
  }

  const componer = ({ columnas, abreviar, escala }) => {
    const esc = factor * escala;
    const relleno = layoutMm.relleneBloque * esc * 0.8;
    const eTitulo = { familia: 'Poppins', variante: 'SemiBold', pt: tipografia.leyendaTitulo.pt * esc };
    const eItem = { familia: 'Poppins', variante: 'Regular', pt: tipografia.leyendaItem.pt * esc };
    const eSub = { familia: 'Poppins', variante: 'SemiBold', pt: tipografia.leyendaItem.pt * esc };
    const icono = tamanoIconoMm * Math.max(0.72, escala);

    const altoFila = Math.max(icono, medidor.alto(eItem)) * 1.15;
    const altoTituloBloque = medidor.alto(eTitulo) * 1.6;
    const altoSubBloque = medidor.alto(eSub) * 1.9;
    const altoMuestra = medidor.alto(eItem) * 0.95;
    const altoFilaClase = Math.max(altoMuestra, medidor.alto(eItem)) * 1.15;
    const filasTipos = Math.ceil(tipos.length / columnas);

    const etiquetaDe = (t) => (abreviar ? (ICONOS[t]?.sigla || t) : t);
    const anchoColumna = icono * 1.5 + Math.max(
      ...tipos.map((t) => medidor.ancho(`${etiquetaDe(t)} (${agregado.porTipo.get(t)})`, eItem)),
    );
    const anchoClases = altoMuestra * 2.4 + Math.max(
      ...clasesUsadas.map((i) => medidor.ancho(clases[i].etiqueta, eItem)),
      medidor.ancho('Presencia de servicios por provincia', eSub),
    );

    return {
      columnas,
      abreviar,
      escala,
      relleno,
      eTitulo,
      eItem,
      eSub,
      icono,
      altoFila,
      altoTituloBloque,
      altoSubBloque,
      altoMuestra,
      altoFilaClase,
      filasTipos,
      etiquetaDe,
      anchoColumna,
      ancho: relleno * 2 + Math.max(anchoColumna * columnas, anchoClases),
      alto: relleno * 2 + altoTituloBloque + filasTipos * altoFila
        + altoSubBloque + clasesUsadas.length * altoFilaClase,
    };
  };

  let elegido = null;
  for (const intento of intentos) {
    const c = componer(intento);
    if (!elegido) elegido = c;
    const cabeAlto = !altoMaximoMm || c.alto <= altoMaximoMm;
    const cabeAncho = !anchoMaximoMm || c.ancho <= anchoMaximoMm;
    if (cabeAlto && cabeAncho) { elegido = c; break; }
    // Si nada cabe, se queda la más pequeña, que es la última probada.
    elegido = c;
  }

  const {
    relleno, eTitulo, eItem, eSub, icono, altoFila, altoTituloBloque, altoSubBloque,
    altoMuestra, altoFilaClase, filasTipos, etiquetaDe, anchoColumna, ancho,
  } = elegido;
  const tamanoIcono = icono;

  return {
    nombre: 'leyenda',
    ancho,
    alto: elegido.alto,
    columnas: elegido.columnas,
    abreviada: elegido.abreviar,
    escalaTexto: Number(elegido.escala.toFixed(2)),
    dibujar(x, y) {
      const piezas = [rect({ x, y, ancho, alto: elegido.alto }, {
        fill: color.fondoHoja, stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
      })];

      let cursor = y + relleno + medidor.ascenso(eTitulo);
      piezas.push(texto('LEYENDA', {
        x: x + relleno, y: cursor, fill: color.tinta,
        'font-family': eTitulo.familia, 'font-size': ptAmm(eTitulo.pt), 'font-weight': 600,
      }));
      cursor = y + relleno + altoTituloBloque;

      tipos.forEach((tipo, i) => {
        const col = Math.floor(i / filasTipos);
        const fila = i % filasTipos;
        const cx = x + relleno + col * anchoColumna;
        const cy = cursor + fila * altoFila;
        piezas.push(dibujarIcono({
          tipo,
          x: cx + tamanoIcono * 0.6,
          y: cy + altoFila * 0.85,
          tamanoMm: tamanoIcono,
          color: iconos.tipos[tipo]?.color || color.tintaSuave,
        }));
        piezas.push(texto(`${etiquetaDe(tipo)} (${agregado.porTipo.get(tipo)})`, {
          x: cx + tamanoIcono * 1.4,
          y: cy + altoFila * 0.85 - (altoFila - medidor.alto(eItem)) * 0.35,
          fill: color.tinta,
          'font-family': eItem.familia, 'font-size': ptAmm(eItem.pt),
        }));
      });

      cursor += filasTipos * altoFila + altoSubBloque * 0.22;
      piezas.push(texto('Presencia de servicios por provincia', {
        x: x + relleno, y: cursor + medidor.ascenso(eSub), fill: color.tinta,
        'font-family': eSub.familia, 'font-size': ptAmm(eSub.pt), 'font-weight': 600,
      }));
      cursor += altoSubBloque;

      clasesUsadas.forEach((indice, k) => {
        const cy = cursor + k * altoFilaClase;
        piezas.push(rect(
          { x: x + relleno, y: cy + (altoFilaClase - altoMuestra) / 2, ancho: altoMuestra * 1.8, alto: altoMuestra },
          { fill: rampa[indice], stroke: color.limiteProvincial, 'stroke-width': trazoMm.grilla * 1.5 },
        ));
        piezas.push(texto(clases[indice].etiqueta, {
          x: x + relleno + altoMuestra * 2.4,
          y: cy + altoFilaClase / 2 + medidor.alto(eItem) * 0.32,
          fill: color.tinta, 'font-family': eItem.familia, 'font-size': ptAmm(eItem.pt),
        }));
      });

      return grupo({ id: 'bloque-leyenda' }, piezas);
    },
  };
}
