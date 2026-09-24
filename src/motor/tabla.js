/**
 * Tabla de centros del ámbito distrital.
 *
 * A escala de distrito el mapa ya no responde «dónde hay servicios» sino «cuáles son»,
 * y eso no cabe en un ícono. Un pictograma sobre una manzana dice que ahí hay un Centro
 * Emergencia Mujer; no dice cuál, ni en qué calle, ni si la coordenada es de fiar. La
 * tabla lleva ese resto, y el número de referencia es lo que une las dos mitades: el
 * mismo número junto al ícono y en la primera columna.
 *
 * Se compone como el resto del layout —primero declara cuánto mide, después sabe
 * dibujarse—, así que compite por el sitio con la leyenda y los recuadros en las mismas
 * condiciones. Cuando no cabe entera no se deja fuera en silencio: se reduce el cuerpo,
 * luego se recortan las direcciones y por último se corta la lista, y en todos los
 * casos el informe dice qué se hizo para que la interfaz lo pueda avisar.
 */
import { color, trazoMm, tipografia, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, rect, num } from './svg.js';

/** Cuerpos que se prueban, de mayor a menor, antes de recortar nada. */
const REDUCCIONES = [1, 0.9, 0.82, 0.75, 0.68];

/** Proporción del ancho de la tabla que se lleva cada columna. */
const COLUMNAS = { numero: 0.06, nombre: 0.4, tipo: 0.2, direccion: 0.34 };

/** Coordenadas que el buscador no da por verificadas. */
export const CALIDAD_DUDOSA = {
  otro_distrito: 'la coordenada cae en otro distrito',
  referencial: 'coordenada referencial, no exacta',
};

export const esDudosa = (centro) => Boolean(CALIDAD_DUDOSA[centro.calidad]);

/**
 * Prepara la tabla y la mide.
 *
 * @param {object} opciones
 * @param {Array}  opciones.filas     centros ya numerados: {n, centro}
 * @param {object} opciones.medidor   de crearMedidor()
 * @param {number} opciones.factor    factor de formato de la hoja
 * @param {number} opciones.anchoMm   ancho disponible
 * @param {number} opciones.altoMaximoMm  alto disponible
 * @returns {{nombre, ancho, alto, dibujar, reduccion, mostradas, total, recortada}}
 */
export function bloqueTabla({
  filas, medidor, factor, anchoMm, altoMaximoMm, sinServicios = false, enElMapa = null,
}) {
  if (!filas.length) return null;

  for (const reduccion of REDUCCIONES) {
    for (const conDireccion of [true, false]) {
      const compuesta = componer({
        filas, medidor, factor, anchoMm, reduccion, conDireccion, sinServicios, enElMapa,
      });
      if (compuesta.alto <= altoMaximoMm) return compuesta;

      /* Si ni siquiera con el cuerpo más pequeño y sin direcciones cabe la lista
         entera, se corta por el número de filas que quepan. Cortar es lo último: una
         tabla incompleta obliga a mirar el mapa para saber que faltan centros, así que
         el informe lo dice y la interfaz lo avisa. */
      if (reduccion === REDUCCIONES[REDUCCIONES.length - 1] && !conDireccion) {
        const cabe = Math.max(1, Math.floor((altoMaximoMm - compuesta.altoCabecera)
          / compuesta.altoFila));
        if (cabe >= filas.length) return compuesta;
        return componer({
          filas: filas.slice(0, cabe),
          medidor,
          factor,
          anchoMm,
          reduccion,
          conDireccion,
          sinServicios,
          enElMapa,
          total: filas.length,
        });
      }
    }
  }
  return null;
}

function componer({
  filas, medidor, factor, anchoMm, reduccion, conDireccion, sinServicios = false,
  enElMapa = null, total = filas.length,
}) {
  const escala = Math.sqrt(factor) * reduccion;
  const eCabecera = { familia: 'Poppins', variante: 'SemiBold', pt: tipografia.tabla.pt * escala };
  const eFila = { familia: 'Poppins', variante: 'Regular', pt: tipografia.tabla.pt * escala * 0.94 };
  const relleno = 1.6 * escala;
  const altoFila = medidor.alto(eFila) * 1.55;
  /* Dos líneas completas: el título de la tabla y, debajo, los títulos de columna.
     Con 2,2 interlineados se tocaban y «Centros del distrito (11)» quedaba escrito
     sobre «Nombre». */
  const altoCabecera = medidor.alto(eCabecera) * 1.35 + medidor.alto(eFila) * 1.8;

  const anchoUtil = anchoMm - relleno * 2;
  const anchos = repartirColumnas(anchoUtil, conDireccion);
  const alto = altoCabecera + altoFila * filas.length + relleno;

  return {
    nombre: 'tabla',
    ancho: anchoMm,
    alto,
    altoFila,
    altoCabecera,
    reduccion,
    conDireccion,
    mostradas: filas.length,
    total,
    recortada: filas.length < total,
    dibujar(x, y) {
      const piezas = [
        rect({ x, y, ancho: anchoMm, alto }, {
          fill: color.fondoHoja,
          stroke: color.limiteProvincial,
          'stroke-width': trazoMm.limiteDistrital,
        }),
      ];

      /* El título es la respuesta del mapa. En un distrito sin centros, «Centros del
         distrito (0)» sería una tabla vacía sin explicación; decir que no hay ninguno y
         ofrecer los más cercanos es lo que alguien necesita para decidir a dónde ir. */
      const titulo = sinServicios
        ? 'Sin servicios del MIMP en el distrito'
        : `Centros del distrito (${total})`;
      piezas.push(texto(titulo, {
        x: x + relleno,
        y: y + relleno + medidor.ascenso(eCabecera),
        fill: sinServicios ? color.mimpRojo : color.tinta,
        'font-family': eCabecera.familia,
        'font-size': ptAmm(eCabecera.pt),
        'font-weight': 600,
      }));

      /* Línea bajo la cabecera: separa el encabezado de los datos sin necesidad de
         pintar el fondo de una fila, que en una tabla vectorial es tinta de más. */
      const yLinea = y + altoCabecera - altoFila * 0.25;
      piezas.push(el('line', {
        x1: num(x + relleno), y1: num(yLinea), x2: num(x + anchoMm - relleno), y2: num(yLinea),
        stroke: color.limiteProvincial, 'stroke-width': trazoMm.limiteDistrital,
      }));

      const columnas = posicionesDeColumna(x + relleno, anchos);
      const ultima = sinServicios ? 'Distancia' : 'Dirección';
      const cabeceras = conDireccion
        ? ['N.º', 'Nombre', 'Tipo', ultima] : ['N.º', 'Nombre', 'Tipo'];
      cabeceras.forEach((t, i) => piezas.push(texto(t, {
        x: columnas[i],
        y: yLinea - medidor.alto(eFila) * 0.35,
        fill: color.tintaSuave,
        'font-family': eCabecera.familia,
        'font-size': ptAmm(eFila.pt * 0.92),
        'font-weight': 600,
      })));

      filas.forEach((fila, i) => {
        const yFila = y + altoCabecera + altoFila * i + medidor.ascenso(eFila);
        const ultimaCelda = sinServicios
          ? `${fila.km < 10 ? fila.km.toFixed(1) : Math.round(fila.km)} km`
          : (fila.centro.direccion || '—');
        const celdas = conDireccion
          ? [String(fila.n), fila.centro.nombre, fila.centro.tipo, ultimaCelda]
          : [String(fila.n), fila.centro.nombre, fila.centro.tipo];

        celdas.forEach((valor, c) => {
          const recortado = recortar(valor, anchos[c] - 1 * escala, medidor, eFila);
          piezas.push(texto(recortado, {
            x: columnas[c],
            y: yFila,
            fill: c === 0 ? color.mimpRojo : color.tinta,
            'font-family': eFila.familia,
            'font-size': ptAmm(eFila.pt),
            ...(c === 0 ? { 'font-weight': 600 } : {}),
          }));
        });

        /* Un asterisco tras el número marca las coordenadas que el buscador no da por
           verificadas. No es un adorno: quien vaya a esa dirección tiene que saber que
           el punto del mapa puede no ser exacto. */
        if (esDudosa(fila.centro)) {
          piezas.push(texto('*', {
            x: columnas[0] + medidor.ancho(String(fila.n), eFila) + 0.3 * escala,
            y: yFila,
            fill: color.mimpRojo,
            'font-family': eFila.familia,
            'font-size': ptAmm(eFila.pt),
            'font-weight': 700,
          }));
        }
      });

      const avisos = [];
      if (sinServicios) avisos.push('Distancia en línea recta desde el centro del distrito.');
      /* Un número de referencia que no está en el mapa es un cabo suelto: quien lo
         busque no lo va a encontrar. */
      const fuera = enElMapa ? filas.filter((f) => !enElMapa.has(f.centro.id)).length : 0;
      if (fuera === filas.length) avisos.push('Ninguno cae dentro del encuadre.');
      else if (fuera) avisos.push(`${fuera} quedan fuera del encuadre.`);
      if (filas.some((f) => esDudosa(f.centro))) {
        avisos.push('* Coordenada no verificada por el directorio.');
      }
      if (filas.length < total) {
        avisos.push(`Se listan ${filas.length} de ${total}; usa una hoja mayor.`);
      }
      if (avisos.length) {
        piezas.push(texto(avisos.join('  '), {
          x: x + relleno,
          y: y + alto - relleno * 0.4,
          fill: color.tintaSuave,
          'font-family': eFila.familia,
          'font-size': ptAmm(eFila.pt * 0.88),
        }));
      }

      return grupo({ id: 'bloque-tabla' }, piezas);
    },
  };
}

function repartirColumnas(anchoUtil, conDireccion) {
  if (conDireccion) {
    return [COLUMNAS.numero, COLUMNAS.nombre, COLUMNAS.tipo, COLUMNAS.direccion]
      .map((p) => p * anchoUtil);
  }
  /* Sin dirección, su espacio se reparte entre nombre y tipo en vez de dejar la tabla
     estrecha con una franja vacía a la derecha. */
  const resto = COLUMNAS.direccion;
  return [
    COLUMNAS.numero * anchoUtil,
    (COLUMNAS.nombre + resto * 0.6) * anchoUtil,
    (COLUMNAS.tipo + resto * 0.4) * anchoUtil,
  ];
}

const posicionesDeColumna = (x0, anchos) => {
  const salida = [];
  let x = x0;
  for (const a of anchos) { salida.push(x); x += a; }
  return salida;
};

/** Corta un texto que no cabe y lo cierra con puntos suspensivos. */
function recortar(valor, anchoMm, medidor, estilo) {
  const texto0 = String(valor);
  if (medidor.ancho(texto0, estilo) <= anchoMm) return texto0;
  const puntos = medidor.ancho('…', estilo);
  let corte = texto0.length;
  while (corte > 1 && medidor.ancho(texto0.slice(0, corte), estilo) + puntos > anchoMm) corte--;
  return `${texto0.slice(0, corte).trimEnd()}…`;
}

/**
 * Dibuja el número de referencia junto a su ícono.
 *
 * Va en una cápsula blanca y no suelto sobre el mapa: en un distrito urbano el número
 * cae sobre manzanas de cualquier color y sin fondo se pierde.
 */
export function numeroDeCentro({ n, x, y, tamanoMm, medidor, estilo, dudosa }) {
  const etiqueta = dudosa ? `${n}*` : String(n);
  const ancho = medidor.ancho(etiqueta, estilo) + tamanoMm * 0.22;
  const alto = medidor.alto(estilo) * 1.05;
  const cx = x + tamanoMm * 0.52;
  const cy = y - tamanoMm * 0.78;
  return grupo({}, [
    rect({ x: cx - ancho / 2, y: cy - alto / 2, ancho, alto }, {
      fill: color.fondoHoja,
      stroke: color.mimpRojo,
      'stroke-width': trazoMm.limiteDistrital,
      rx: num(alto / 2),
    }),
    texto(etiqueta, {
      x: cx,
      y: cy + medidor.alto(estilo) * 0.33,
      'text-anchor': 'middle',
      fill: color.mimpRojo,
      'font-family': estilo.familia,
      'font-size': ptAmm(estilo.pt),
      'font-weight': 700,
    }),
  ]);
}
