/**
 * Leyenda generada a partir de lo que el mapa realmente dibuja.
 *
 * Son dos cajas: la leyenda con los tipos (bloqueLeyenda) y, aparte, las clases del
 * coropletas (bloqueClases).
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

/**
 * Parte un texto en líneas que no pasen de `anchoMax`, por palabras. La cifra final
 * («(12)») va siempre con la palabra de antes: sola en una línea no diría de qué es.
 * Una palabra más ancha que el límite ocupa su línea entera y lo sobrepasa.
 */
function partirEnLineas(textoLargo, anchoMax, estilo, medidor) {
  if (!(anchoMax > 0) || medidor.ancho(textoLargo, estilo) <= anchoMax) return [textoLargo];
  const palabras = textoLargo.split(' ');
  if (palabras.length > 1 && /^\(.*\)$/.test(palabras.at(-1))) {
    palabras.splice(-2, 2, `${palabras.at(-2)} ${palabras.at(-1)}`);
  }
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && medidor.ancho(prueba, estilo) > anchoMax) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Lado del ícono de la leyenda en un A4. En las demás hojas crece con `factor`, igual
 * que el texto que tiene al lado.
 *
 * Antes se tomaba el ícono del mapa con un tope de 5 mm. El del mapa crece con la RAÍZ
 * del formato, porque tiene que caber en las provincias, y el texto de la leyenda con
 * el formato entero: en un A0 el nombre iba a 26 pt y su ícono medía 5 mm, la mitad de
 * la letra. La leyenda es un bloque de lectura, no un trozo del mapa, y se escala
 * entera con la hoja.
 */
const ICONO_LEYENDA_MM = 3.4;

/**
 * El nombre de un tipo en la leyenda, con su sigla: «Centro Emergencia Mujer y Familia
 * - CEM». Lo pidió el área usuaria después de la Fase 20, para que la leyenda sirva
 * también para leer las siglas que se usan a diario en el ministerio.
 *
 * Con el formato del propio directorio, que ya escribe así once tipos («Servicio de
 * Atención Rural - SAR»): a ésos no se les repite. La sigla es la del catálogo, la
 * misma de la hoja de íconos (catalogo.js).
 */
export function nombreConSigla(tipo) {
  const { nombre = tipo, sigla } = ICONOS[tipo] || {};
  if (!sigla || nombre === sigla || nombre.endsWith(` - ${sigla}`)) return nombre;
  return `${nombre} - ${sigla}`;
}

/**
 * Compone la leyenda: los tipos de servicio, cada uno con su ícono y su total.
 *
 * Desde la revisión de la Fase 20 la leyenda lleva sólo los tipos. Las clases del
 * coropletas («Presencia de servicios por …») van en una caja propia, más pequeña
 * (bloqueClases), que se pone a su lado: juntas eran una caja tan alta como la columna
 * de los tipos, y lo que sobraba de alto lo pagaba el recuadro de zoom, que va encima.
 *
 * Hasta esa revisión llevaba además al pie una nota sobre los centros dibujados en su
 * distrito y no en su sede («… ubicados en su distrito, no en su dirección»). El área
 * usuaria pidió quitarla. La marca de ubicación no exacta sigue en los datos
 * (`calidad: 'por_distrito'`) y en la tabla de los mapas distritales, con su asterisco.
 *
 * @param {number} [reduccion]       fracción a la que se dibuja la composición elegida
 *                                   (ver ajustarLeyenda en render.js)
 * @param {number} [cuerpoMinimoPt]  por debajo de esto el texto no se reduce
 * @param {object} [disposicion]     {columnas, escala}: compone ésa, con los nombres
 *                                   enteros y cada uno en una línea, en vez de buscar
 *                                   la que quepa en altoMaximoMm × anchoMaximoMm
 */
export function bloqueLeyenda({
  agregado, estiloIconos, medidor, factor, altoMaximoMm, anchoMaximoMm,
  reduccion = 1, cuerpoMinimoPt = 0, disposicion = null,
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
    for (const escala of ESCALAS_LEYENDA) {
      intentos.push({ columnas, abreviar, escala });
    }
  }

  /* `k` reduce la composición entera —letra, íconos, márgenes y el ancho al que se
     parten los nombres— sin cambiar cómo se reparte: la misma leyenda, más pequeña.
     Con `partir` en falso, cada nombre va en una línea por largo que sea. */
  const componer = ({
    columnas, abreviar, escala, partir = true,
  }, k = 1) => {
    const esc = factor * escala * k;
    const relleno = layoutMm.relleneBloque * esc * 0.8;
    const eTitulo = { familia: 'Poppins', variante: 'SemiBold', pt: tipografia.leyendaTitulo.pt * esc };
    const eItem = { familia: 'Poppins', variante: 'Regular', pt: tipografia.leyendaItem.pt * esc };
    const icono = ICONO_LEYENDA_MM * factor * Math.max(0.72, escala) * k;

    const altoFila = Math.max(icono, medidor.alto(eItem)) * 1.15;
    // Lo que añade cada línea más de un nombre partido.
    const altoLineaMas = medidor.alto(eItem) * 0.95;
    /* Lo que ocupa el título en negrita antes de su contenido. Iba a 1,6 veces el alto
       de la letra, y el área usuaria vio en ese aire una línea en blanco de más
       (revisión de la Fase 20). */
    const altoTituloBloque = medidor.alto(eTitulo) * 1.2;
    const filasTipos = Math.ceil(tipos.length / columnas);
    /* Entre una columna y la siguiente, el aire de un ícono. */
    const aireColumnas = icono;

    /* Al abreviar, la sigla sola; si no, el nombre con su sigla. Los que tienen nombre
       de leyenda (catalogo.js) no se abrevian nunca: son abreviaturas en el directorio
       y el área usuaria pidió verlos enteros. */
    const etiquetaDe = (t) => (abreviar && !ICONOS[t]?.nombre ? (ICONOS[t]?.sigla || t) : nombreConSigla(t));
    /* Un nombre más ancho que su columna se parte en líneas en vez de ensanchar la
       leyenda. Con los CAR y el SAIPD escritos enteros, una sola línea pedía más de un
       tercio del mapa y la leyenda no cabía en ninguna hoja. */
    const anchoTexto = partir && anchoMaximoMm
      ? (anchoMaximoMm * k - relleno * 2 - aireColumnas * (columnas - 1)) / columnas - icono * 1.5
      : Infinity;
    const filas = tipos.map((tipo, i) => {
      const lineas = partirEnLineas(`${etiquetaDe(tipo)} (${agregado.porTipo.get(tipo)})`, anchoTexto, eItem, medidor);
      return { tipo, lineas, columna: Math.floor(i / filasTipos), alto: altoFila + (lineas.length - 1) * altoLineaMas };
    });
    const usadas = Math.max(...filas.map((f) => f.columna)) + 1;
    // Cada fila empieza donde acaba la anterior de su columna.
    const altoColumnas = new Array(usadas).fill(0);
    for (const f of filas) { f.y = altoColumnas[f.columna]; altoColumnas[f.columna] += f.alto; }
    const altoTipos = Math.max(...altoColumnas);
    /* Cada columna, tan ancha como su nombre más largo. Medidas todas por el más largo
       de la leyenda —el del CARPAM—, las columnas de nombres cortos dejaban un hueco
       que el área usuaria vio de más (revisión de la Fase 20). */
    const anchos = new Array(usadas).fill(0);
    for (const f of filas) {
      for (const l of f.lineas) anchos[f.columna] = Math.max(anchos[f.columna], medidor.ancho(l, eItem));
    }
    const xColumnas = [];
    let acumulado = 0;
    for (let c = 0; c < usadas; c++) {
      xColumnas.push(acumulado);
      acumulado += icono * 1.5 + anchos[c] + (c < usadas - 1 ? aireColumnas : 0);
    }
    const anchoTitulo = medidor.ancho('LEYENDA', eTitulo);
    return {
      columnas: usadas,
      columnasPedidas: columnas,
      abreviar,
      escala,
      partir,
      k,
      relleno,
      eTitulo,
      eItem,
      icono,
      altoFila,
      altoTituloBloque,
      filas,
      xColumnas,
      ancho: relleno * 2 + Math.max(acumulado, anchoTitulo),
      alto: relleno * 2 + altoTituloBloque + altoTipos,
    };
  };

  let elegido = null;
  if (disposicion) {
    elegido = componer({ abreviar: false, partir: false, ...disposicion });
  } else {
    for (const intento of intentos) {
      const c = componer(intento);
      if (!elegido) elegido = c;
      const cabeAlto = !altoMaximoMm || c.alto <= altoMaximoMm;
      const cabeAncho = !anchoMaximoMm || c.ancho <= anchoMaximoMm;
      if (cabeAlto && cabeAncho) { elegido = c; break; }
      // Si nada cabe, se queda la más pequeña, que es la última probada.
      elegido = c;
    }
  }

  /* Y se reduce: la composición elegida, a `reduccion`, pero sin que el texto baje de
     `cuerpoMinimoPt`. En un A4 la leyenda ya va a 4 pt y apenas encoge; en las hojas
     mayores se reduce entera. */
  const k = Math.min(1, Math.max(
    reduccion, cuerpoMinimoPt / (tipografia.leyendaItem.pt * factor * elegido.escala),
  ));
  if (k < 1) elegido = componer({ ...elegido, columnas: elegido.columnasPedidas }, k);

  const {
    relleno, eTitulo, eItem, icono, altoFila, altoTituloBloque, filas, xColumnas, ancho,
  } = elegido;
  const tamanoIcono = icono;

  return {
    nombre: 'leyenda',
    ancho,
    alto: elegido.alto,
    columnas: elegido.columnas,
    abreviada: elegido.abreviar,
    // Si algún nombre quedó partido en más de una línea.
    nombresPartidos: filas.some((f) => f.lineas.length > 1),
    // Ya reducida: la fracción del cuerpo de calibración a la que sale el texto.
    escalaTexto: Number((elegido.escala * elegido.k).toFixed(2)),
    // Y antes de reducir, el escalón de cuerpo que se eligió.
    escalaBase: elegido.escala,
    // El factor exacto del texto, para que la caja de las clases use el mismo cuerpo.
    escalaExacta: elegido.escala * elegido.k,
    dibujar(x, y) {
      const piezas = [rect({ x, y, ancho, alto: elegido.alto }, {
        fill: color.fondoHoja, stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
      })];

      piezas.push(texto('LEYENDA', {
        x: x + relleno, y: y + relleno + medidor.ascenso(eTitulo), fill: color.tinta,
        'font-family': eTitulo.familia, 'font-size': ptAmm(eTitulo.pt), 'font-weight': 600,
      }));
      const cursor = y + relleno + altoTituloBloque;

      /* El ícono va a la altura de la primera línea del nombre; las demás, debajo. */
      const altoLineaMas = medidor.alto(eItem) * 0.95;
      for (const { tipo, lineas, columna, y: dy } of filas) {
        const cx = x + relleno + xColumnas[columna];
        const cy = cursor + dy;
        piezas.push(dibujarIcono({
          tipo,
          x: cx + tamanoIcono * 0.6,
          y: cy + altoFila * 0.85,
          tamanoMm: tamanoIcono,
          estilo: estiloIconos,
        }));
        lineas.forEach((linea, k2) => {
          piezas.push(texto(linea, {
            x: cx + tamanoIcono * 1.4,
            y: cy + altoFila * 0.85 - (altoFila - medidor.alto(eItem)) * 0.35 + k2 * altoLineaMas,
            fill: color.tinta,
            'font-family': eItem.familia, 'font-size': ptAmm(eItem.pt),
          }));
        });
      }

      return grupo({ id: 'bloque-leyenda' }, piezas);
    },
  };
}

/** Cuerpos que prueba la leyenda, en fracción de su calibración, antes de reducirse. */
export const ESCALAS_LEYENDA = [1, 0.9, 0.8, 0.7, 0.62, 0.55];

/**
 * La caja de las clases del coropletas: «Presencia de servicios por …» y una muestra
 * de color por clase.
 *
 * Va aparte de la leyenda desde la revisión de la Fase 20, y con el mismo cuerpo de
 * letra que ella (`escalaTexto`, la fracción de la calibración a la que salió la
 * leyenda), para que las dos se lean como un mismo bloque partido en dos.
 *
 * Sin clases que mostrar no hay caja: en un mapa de un solo distrito, «Presencia de
 * servicios por distrito» anuncia una comparación que no existe, porque no hay con qué
 * comparar.
 */
export function bloqueClases({
  clasesUsadas, clases = CLASES_POR_DEFECTO, rampa, medidor, factor, unidad = 'provincia', escalaTexto = 1,
}) {
  if (!clasesUsadas.length) return null;
  /* El coropletas no siempre cuenta por provincia: en un mapa departamental la unidad
     es el distrito. Anunciar la unidad equivocada convierte la leyenda en una fuente
     de error, porque es justamente ahí donde se va a mirar qué significa cada tono. */
  const titulo = `Presencia de servicios por ${unidad}`;
  const esc = factor * escalaTexto;
  const relleno = layoutMm.relleneBloque * esc * 0.8;
  const eSub = { familia: 'Poppins', variante: 'SemiBold', pt: tipografia.leyendaItem.pt * esc };
  const eItem = { familia: 'Poppins', variante: 'Regular', pt: tipografia.leyendaItem.pt * esc };
  // El título lleva sólo el aire de su línea, como el de la leyenda.
  const altoTitulo = medidor.alto(eSub) * 1.3;
  const altoMuestra = medidor.alto(eItem) * 0.95;
  const altoFila = Math.max(altoMuestra, medidor.alto(eItem)) * 1.15;
  const ancho = relleno * 2 + Math.max(
    medidor.ancho(titulo, eSub),
    altoMuestra * 2.4 + Math.max(...clasesUsadas.map((i) => medidor.ancho(clases[i].etiqueta, eItem))),
  );
  const alto = relleno * 2 + altoTitulo + clasesUsadas.length * altoFila;

  return {
    nombre: 'clases',
    ancho,
    alto,
    dibujar(x, y) {
      const piezas = [
        rect({ x, y, ancho, alto }, {
          fill: color.fondoHoja, stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
        }),
        texto(titulo, {
          x: x + relleno, y: y + relleno + medidor.ascenso(eSub), fill: color.tinta,
          'font-family': eSub.familia, 'font-size': ptAmm(eSub.pt), 'font-weight': 600,
        }),
      ];
      clasesUsadas.forEach((indice, k) => {
        const cy = y + relleno + altoTitulo + k * altoFila;
        piezas.push(rect(
          { x: x + relleno, y: cy + (altoFila - altoMuestra) / 2, ancho: altoMuestra * 1.8, alto: altoMuestra },
          { fill: rampa[indice], stroke: color.limiteProvincial, 'stroke-width': trazoMm.grilla * 1.5 },
        ));
        piezas.push(texto(clases[indice].etiqueta, {
          x: x + relleno + altoMuestra * 2.4,
          y: cy + altoFila / 2 + medidor.alto(eItem) * 0.32,
          fill: color.tinta, 'font-family': eItem.familia, 'font-size': ptAmm(eItem.pt),
        }));
      });
      return grupo({ id: 'bloque-clases' }, piezas);
    },
  };
}
