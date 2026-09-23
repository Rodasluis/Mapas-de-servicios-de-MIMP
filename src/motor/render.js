/**
 * Composición del mapa: de los datos al SVG que se imprime.
 *
 * El SVG que sale de aquí es EL documento final. No es una vista previa que luego se
 * vuelva a dibujar de otra manera para el PDF: la exportación (motor/pdf.js) lo
 * traduce trazo por trazo. Un solo camino de dibujo significa que lo que se ve en
 * pantalla y lo que sale de la imprenta no pueden diferir.
 *
 * Las capas se dejan creadas aunque estén vacías, cada una en su sitio del orden de
 * dibujo, para que las fases siguientes se limiten a rellenarlas sin recolocar nada.
 */
import { marcoDelMapa } from './hoja.js';
import { crearProyeccion, medirEscala, nivelPara, crearRuta } from './proyeccion.js';
import { color, trazoMm, tipografia, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, rect, documento, num } from './svg.js';

/** Holgura entre el ámbito y el borde del marco, para que el país no toque el filo. */
export const HOLGURA_MM = 3;

/** Orden de dibujo. Las vacías quedan reservadas para las fases indicadas. */
export const CAPAS = [
  'agua',          // fondo del marco y lagos
  'paises',        // países vecinos
  'coropleta',     // Fase 3
  'territorio',    // relleno del ámbito
  'limites',       // límites administrativos
  'simbolos',      // Fase 3
  'recuadros',     // Fase 3: rectángulos de los zooms
  'etiquetas',     // Fase 4
];

/**
 * Compone el mapa nacional.
 *
 * @param {object} opciones
 * @param {object} opciones.hoja       de crearHoja()
 * @param {object} opciones.cargador   de crearCargador()
 * @param {object} [opciones.textos]   {titulo, subtitulo, periodo, elaboradoPor}
 * @returns {Promise<{svg: string, meta: object}>}
 */
export async function componerNacional({ hoja, cargador, textos = {} }) {
  const inicio = Date.now();
  const [indice, version] = await Promise.all([cargador.indice(), cargador.version()]);

  /* El pie es obligatorio en todo PDF, así que se le reserva sitio antes de encajar
     el mapa: de lo contrario el mapa ocuparía la hoja entera y el pie caería encima. */
  const pie = medidasDelPie();
  const marco = marcoDelMapa(hoja, { abajo: pie.alturaMm });

  /* Para elegir el nivel de detalle hace falta la escala, y para la escala el encaje.
     Se encaja primero con el nivel más ligero —la diferencia de contorno entre niveles
     es de metros frente a los cientos de kilómetros del país, así que no cambia la
     elección— y después se rehace el encaje con el nivel definitivo, que es el que
     acaba dibujándose y midiéndose. */
  const tanteo = await cargador.departamentos('bajo');
  const escalaTanteo = medirEscala(crearProyeccion(tanteo, marco, HOLGURA_MM), marco);
  const nivel = nivelPara(escalaTanteo.denominador, indice.niveles);

  const departamentos = await cargador.departamentos(nivel);
  const contexto = await cargador.contexto();
  const proyeccion = crearProyeccion(departamentos, marco, HOLGURA_MM);
  const escala = medirEscala(proyeccion, marco);
  const ruta = crearRuta(proyeccion);

  const capas = dibujarCapas({ departamentos, contexto, ruta, marco });

  const idRecorte = 'recorte-marco';
  const defs = el('clipPath', { id: idRecorte }, rect(marco));

  const contenido = [
    rect({ x: 0, y: 0, ancho: hoja.anchoMm, alto: hoja.altoMm }, { fill: color.fondoHoja, id: 'hoja' }),
    grupo({ id: 'mapa', 'clip-path': `url(#${idRecorte})` }, capas.svg),
    dibujarMarco(marco),
    dibujarPie({ marco, pie, version, escala, nivel, textos }),
  ].join('\n');

  return {
    svg: documento(hoja, contenido, { defs }),
    meta: {
      hoja: hoja.nombre,
      anchoMm: hoja.anchoMm,
      altoMm: hoja.altoMm,
      ambito: 'Perú',
      nivel,
      escala: escala.texto,
      denominador: Math.round(escala.denominador),
      variacionEscalaPct: Number(escala.variacionPct.toFixed(2)),
      centro: escala.centro.map((v) => Number(v.toFixed(4))),
      marco,
      rasgos: capas.rasgos,
      datosTag: version.datosTag,
      msComposicion: Date.now() - inicio,
    },
  };
}

/* ------------------------------- capas ---------------------------------- */

function dibujarCapas({ departamentos, contexto, ruta, marco }) {
  const porCapa = (nombre) => contexto.features.filter((f) => f.properties.capa === nombre);
  const rasgos = {};

  /* El agua se resuelve rellenando el marco entero de color de mar y dibujando la
     tierra encima. Recortar el polígono de océano y pintarlo sobre un fondo blanco
     deja un hilo claro allí donde la costa de Natural Earth y la del INEI no coinciden
     al milímetro; con el mar de fondo, ese desajuste queda debajo de la tierra. */
  const agua = [
    rect(marco, { fill: color.oceano }),
    ...porCapa('lago').map((f) => el('path', {
      d: ruta(f.geometry), fill: color.lago, stroke: color.oceanoRotulo,
      'stroke-width': trazoMm.paisVecino / 2,
    })),
  ];
  rasgos.lagos = porCapa('lago').length;

  const paises = porCapa('pais');
  rasgos.paises = paises.length;
  const capaPaises = paises.map((f) => el('path', {
    d: ruta(f.geometry), fill: color.paisVecino,
    stroke: color.paisVecinoBorde, 'stroke-width': trazoMm.paisVecino,
    'stroke-linejoin': 'round',
  }));

  rasgos.departamentos = departamentos.features.length;
  const territorio = departamentos.features.map((f) => el('path', {
    d: ruta(f.geometry), fill: color.sinDato, id: `dep-${f.properties.ubigeo}`,
  }));

  /* Los límites van en una capa aparte y por encima de todos los rellenos: si cada
     polígono llevara su propio trazo, el borde compartido se dibujaría dos veces y
     en papel saldría el doble de grueso que un borde exterior. */
  const limites = departamentos.features.map((f) => el('path', {
    d: ruta(f.geometry), fill: 'none', stroke: color.limiteDepartamental,
    'stroke-width': trazoMm.limiteDepartamental, 'stroke-linejoin': 'round',
  }));

  const contenido = {
    agua, paises: capaPaises, coropleta: [], territorio, limites,
    simbolos: [], recuadros: [], etiquetas: [],
  };

  return {
    rasgos,
    svg: CAPAS.map((nombre) => grupo({ id: `capa-${nombre}` }, contenido[nombre])).join('\n'),
  };
}

function dibujarMarco(marco) {
  return grupo({ id: 'capa-marco' }, [
    rect(marco, {
      fill: 'none', stroke: color.marco, 'stroke-width': trazoMm.marco,
    }),
  ]);
}

/* -------------------------------- pie ----------------------------------- */

function medidasDelPie() {
  const cuerpoMm = ptAmm(tipografia.pie.pt);
  const interlinea = cuerpoMm * 1.35;
  return { cuerpoMm, interlinea, lineas: 3, alturaMm: interlinea * 3 + 3.5 };
}

/**
 * Ancho aproximado de un texto, en milímetros.
 *
 * Es una estimación por anchura media de carácter, suficiente para decidir si una
 * línea del pie cabe junto a la escala. La Fase 4 necesitará medidas exactas para
 * colocar rótulos sin colisiones y las sacará de la propia tipografía; aquí basta con
 * una cota prudente, y por eso el factor tira a ancho: más vale recortar de más que
 * dejar que dos textos se pisen en papel.
 */
const ANCHO_MEDIO_EM = 0.54;
const anchoAproximadoMm = (texto, cuerpoMm) => texto.length * cuerpoMm * ANCHO_MEDIO_EM;

/** Recorta un texto para que quepa en el ancho dado, con puntos suspensivos. */
function recortarATamano(texto, cuerpoMm, anchoMm) {
  if (anchoAproximadoMm(texto, cuerpoMm) <= anchoMm) return texto;
  const maximo = Math.max(3, Math.floor(anchoMm / (cuerpoMm * ANCHO_MEDIO_EM)) - 1);
  return `${texto.slice(0, maximo).trimEnd()}…`;
}

/**
 * Pie obligatorio: de dónde salen los datos, con qué versión, cuándo se generó y el
 * aviso de que la escala sólo vale si se imprime sin reducir. Un mapa impreso sin esa
 * información no se puede auditar meses después.
 */
function dibujarPie({ marco, pie, version, escala, nivel, textos }) {
  const x = marco.x;
  const derecha = marco.x + marco.ancho;
  const base = marco.y + marco.alto + pie.interlinea + 1;
  const comun = {
    'font-family': 'Poppins', 'font-size': pie.cuerpoMm,
    fill: color.tintaSuave, 'font-weight': 400,
  };
  const destacado = { ...comun, 'text-anchor': 'end', 'font-weight': 600, fill: color.tinta };

  const fecha = (textos.fecha ? new Date(textos.fecha) : new Date())
    .toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const elaborado = textos.elaboradoPor
    || 'el Ministerio de la Mujer y Poblaciones Vulnerables';

  /* El pie se reparte en dos columnas: la procedencia a la izquierda y, a la derecha,
     la escala y el aviso de impresión. El texto de la izquierda se recorta al ancho
     que le queda libre para que no llegue nunca a montarse sobre la derecha. */
  const NOTA = 'Escala válida al imprimir al 100 %';
  const anchoDerecha = Math.max(
    anchoAproximadoMm(NOTA, pie.cuerpoMm),
    anchoAproximadoMm(`Escala ${escala.texto}`, pie.cuerpoMm),
  );
  const anchoIzquierda = marco.ancho - anchoDerecha - 6;

  const izquierda = [
    `Fuente: ${version.fuente} · Versión de datos ${version.datosTagCorto}`
    + ` (${version.generado}) · ${version.totalCentros} centros publicados`,
    'Límites: INEI · Contexto: Natural Earth 1:10 m'
    + ' · Proyección: Mercator transversa 75° O (UTM 18S)',
    `Elaborado por ${elaborado} · Generado el ${fecha}`,
  ].map((t) => recortarATamano(t, pie.cuerpoMm, anchoIzquierda));

  return grupo({ id: 'capa-pie' }, [
    ...izquierda.map((t, i) => texto(t, { ...comun, x, y: base + pie.interlinea * i })),
    texto(`Escala ${escala.texto}`, { ...destacado, x: derecha, y: base }),
    texto(NOTA, { ...destacado, x: derecha, y: base + pie.interlinea * 2 }),
    /* Rastro del nivel geométrico: permite explicar, ante un mapa impreso, por qué
       un contorno tiene el detalle que tiene. */
    el('metadata', { id: 'detalle-geometrico' }, `nivel=${nivel} escala=${num(escala.denominador, 0)}`),
  ]);
}
