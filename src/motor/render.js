/**
 * Composición del mapa: de los datos al SVG que se imprime.
 *
 * El SVG que sale de aquí es EL documento final. No es una vista previa que luego se
 * vuelva a dibujar de otra manera para el PDF: la exportación (motor/pdf.js) lo
 * traduce trazo por trazo. Un solo camino de dibujo significa que lo que se ve en
 * pantalla y lo que sale de la imprenta no pueden diferir.
 *
 * El orden de trabajo importa y no es arbitrario:
 *   1. se mide el pie y la banda de la retícula, porque comen sitio al mapa;
 *   2. se encaja el ámbito en lo que queda y se mide la escala real;
 *   3. se proyecta la geometría y se marca en una rejilla qué es territorio peruano;
 *   4. se colocan los rótulos de contexto y los bloques del layout sobre lo que NO es
 *      territorio, usando esa rejilla;
 *   5. se ensambla todo en capas.
 *
 * Las capas se crean aunque queden vacías, cada una en su sitio del orden de dibujo,
 * para que las fases siguientes se limiten a rellenarlas sin recolocar nada.
 */
import { geoPath, geoDistance } from 'd3-geo';
import { marcoDelMapa } from './hoja.js';
import { crearProyeccion, medirEscala, nivelPara, crearRuta, RADIO_TERRESTRE_M } from './proyeccion.js';
import { construirGrilla, anguloDelNorte } from './grilla.js';
import { crearOcupacion, recolectorDeAnillos } from './ocupacion.js';
import { crearMedidor } from './texto.js';
import { rotulosDeContexto, dibujarGrilla, bandaDeGrilla } from './rotulos.js';
import {
  factorFormato, bloqueInstitucional, bloqueTitulo, rosaDeLosVientos, escalaGrafica,
} from './piezas.js';
import {
  colocarPiezas, posicionEnAnclaje, PLANTILLAS, PRIORIDAD, CABECERA,
} from './layout.js';
import { color, trazoMm, tipografia, layoutMm, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, rect, documento, num } from './svg.js';

/** Holgura entre el ámbito y el borde del marco, para que el país no toque el filo. */
export const HOLGURA_MM = 3;

/** Orden de dibujo dentro del marco. Las vacías quedan reservadas a fases posteriores. */
export const CAPAS = [
  'agua',          // fondo del marco y lagos
  'paises',        // países vecinos
  'coropleta',     // Fase 3
  'territorio',    // relleno del ámbito
  'limites',       // límites administrativos
  'grilla',        // retícula UTM
  'simbolos',      // Fase 3
  'recuadros',     // Fase 3: rectángulos de los zooms
  'etiquetas',     // rótulos de contexto; la Fase 4 añade los del país
];

export async function componerNacional({ hoja, cargador, textos = {} }) {
  const inicio = Date.now();
  const [indice, version, logos, metricas] = await Promise.all([
    cargador.indice(), cargador.version(), cargador.logos(), cargador.metricas(),
  ]);

  const medidor = crearMedidor(metricas);
  const factor = factorFormato(hoja);

  /* El pie es obligatorio en todo PDF y la retícula necesita una banda fuera del
     marco para sus números: los dos se descuentan antes de encajar el mapa. */
  const pie = medidasDelPie(medidor, factor);
  const banda = bandaDeGrilla(medidor, factor);
  const marco = marcoDelMapa(hoja, {
    arriba: banda.arriba,
    izquierda: banda.lateral,
    derecha: banda.lateral,
    abajo: pie.alturaMm + banda.arriba,
  });

  /* Para elegir el nivel de detalle hace falta la escala, y para la escala el encaje.
     Se encaja primero con el nivel más ligero —la diferencia de contorno entre niveles
     es de metros frente a los cientos de kilómetros del país, así que no cambia la
     elección— y después se rehace con el nivel definitivo, que es el que se dibuja. */
  const tanteo = await cargador.departamentos('bajo');
  const escalaTanteo = medirEscala(crearProyeccion(tanteo, marco, HOLGURA_MM), marco);
  const nivel = nivelPara(escalaTanteo.denominador, indice.niveles);

  const departamentos = await cargador.departamentos(nivel);
  const contexto = await cargador.contexto();
  const proyeccion = crearProyeccion(departamentos, marco, HOLGURA_MM);
  const escala = medirEscala(proyeccion, marco);
  const ruta = crearRuta(proyeccion);

  /* Geometría proyectada a milímetros, que sirve a la vez para dibujar y para saber
     qué partes de la hoja están ocupadas por tierra. */
  const anillos = anillosPorRasgo(proyeccion, [...departamentos.features, ...contexto.features]);
  const ocupacion = crearOcupacion(hoja.anchoMm, hoja.altoMm);
  for (const f of departamentos.features) {
    ocupacion.marcarTerritorio(anillos.get(f));
    ocupacion.marcarTierra(anillos.get(f));
  }
  for (const f of contexto.features) {
    if (f.properties.capa === 'pais') ocupacion.marcarTierra(anillos.get(f));
  }

  const grilla = construirGrilla(proyeccion, marco, escala.denominador);
  const dibujoGrilla = dibujarGrilla({ grilla, marco, medidor, factor, banda });

  /* ------------------------------ layout ------------------------------- */

  const plantilla = PLANTILLAS[hoja.orientacion] || PLANTILLAS.vertical;
  const norte = anguloDelNorte(proyeccion, [marco.x + marco.ancho / 2, marco.y + marco.alto / 2]);

  /* Logotipo y título comparten margen al marco para que el aire de las dos esquinas
     superiores se vea igual. */
  const margenCabecera = layoutMm.margenCabecera * factor;

  const titulo = ajustarTitulo({
    textos: {
      titulo: textos.titulo ?? 'Servicios que brinda el MIMP',
      subtitulo: textos.subtitulo ?? 'Ubicación a nivel nacional',
      periodo: textos.periodo ?? '',
    },
    medidor,
    factor,
    marco,
    ocupacion,
    margen: margenCabecera,
    /* En apaisado el marco es mucho más ancho y la misma fracción daba un título
       larguísimo que llegaba a rozar el país. Se estrecha, con lo que gana líneas
       pero deja de invadir el mapa. */
    anchoMaximo: marco.ancho * (hoja.orientacion === 'horizontal' ? 0.24 : 0.38),
  });

  const piezas = {
    institucional: bloqueInstitucional({ logos: logos.logos, factor }),
    titulo: titulo.pieza,
    escala: escalaGrafica({ denominador: escala.denominador, factor, medidor }),
    norte: rosaDeLosVientos({ factor, anguloNorte: norte, medidor }),
  };

  const solicitud = (n) => ({
    pieza: piezas[n],
    anclajes: plantilla[n] || [],
    // Cabecera de sitio fijo: el logotipo y el título no se mudan de esquina.
    soloPreferidos: CABECERA.includes(n),
    ...(CABECERA.includes(n) ? { margen: margenCabecera } : {}),
  });

  /* La cabecera reserva su sitio ANTES que los rótulos del mapa. Al revés, el rótulo
     «COLOMBIA» ocupaba la esquina superior derecha y el título, al no poder pisarlo,
     se deslizaba hacia abajo hasta acabar sobre Loreto: medía cero territorio en la
     esquina que le tocaba y tapaba un 25 % en la que terminaba. */
  const colocacionCabecera = colocarPiezas(
    CABECERA.filter((n) => piezas[n]).map(solicitud), marco, ocupacion,
  );

  const etiquetas = rotulosDeContexto({
    contexto, anillosPorRasgo: anillos, marco, ocupacion, medidor, factor,
  });

  const colocacionResto = colocarPiezas(
    PRIORIDAD.filter((n) => piezas[n] && !CABECERA.includes(n)).map(solicitud), marco, ocupacion,
  );

  const colocacion = {
    colocadas: [...colocacionCabecera.colocadas, ...colocacionResto.colocadas],
    omitidas: [...colocacionCabecera.omitidas, ...colocacionResto.omitidas],
    forzadas: [...colocacionCabecera.forzadas, ...colocacionResto.forzadas],
  };

  /* La barra de escala se comprueba sobre el dibujo terminado: se invierten sus dos
     extremos por la proyección y se mide la distancia real entre ellos. Si la barra
     dijera 500 km y cubriera 480, este número lo delata. */
  const comprobacionEscala = medirBarraDeEscala(proyeccion, colocacion, piezas.escala);

  /* ----------------------------- ensamblado ---------------------------- */

  const capas = dibujarCapas({
    departamentos, contexto, ruta, marco, grilla: dibujoGrilla.svgLineas, etiquetas: etiquetas.svg,
  });

  const idRecorte = 'recorte-marco';
  const defs = el('clipPath', { id: idRecorte }, rect(marco));

  const contenido = [
    rect({ x: 0, y: 0, ancho: hoja.anchoMm, alto: hoja.altoMm }, { fill: color.fondoHoja, id: 'hoja' }),
    grupo({ id: 'mapa', 'clip-path': `url(#${idRecorte})` }, capas.svg),
    dibujarMarco(marco),
    dibujoGrilla.svgMarcas,
    grupo({ id: 'capa-layout' }, colocacion.colocadas.map((c) => c.pieza.dibujar(c.x, c.y))),
    dibujarPie({ marco, pie, banda, version, escala, nivel, textos, medidor }),
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
      factorFormato: Number(factor.toFixed(3)),
      titulo: {
        reduccion: titulo.reduccion,
        tapadoPct: titulo.tapadoPct,
        tapadoMm2: titulo.tapadoMm2,
        lineas: titulo.lineas,
      },
      anguloNorteGrados: Number(norte.toFixed(2)),
      rasgos: capas.rasgos,
      grilla: {
        pasoM: grilla.paso,
        lineas: grilla.lineas.length,
        rotulos: dibujoGrilla.rotulos,
        curvaturaMaximaMm: Number((grilla.desviacionMaximaMm || 0).toFixed(3)),
      },
      escalaGrafica: { ...piezas.escala.medida, ...comprobacionEscala },
      layout: {
        colocadas: colocacion.colocadas.map((c) => ({
          nombre: c.pieza.nombre,
          anclaje: c.anclaje,
          x: Number(c.x.toFixed(2)),
          y: Number(c.y.toFixed(2)),
          ancho: Number(c.ancho.toFixed(2)),
          alto: Number(c.alto.toFixed(2)),
          territorioTapadoPct: Number((c.tapado * 100).toFixed(2)),
        })),
        omitidas: colocacion.omitidas,
        forzadas: colocacion.forzadas,
      },
      rotulos: { colocados: etiquetas.colocados, omitidos: etiquetas.omitidos },
      datosTag: version.datosTag,
      msComposicion: Date.now() - inicio,
    },
  };
}

/**
 * Busca el cuerpo más grande con el que el título cabe arriba a la derecha sin tapar
 * el país.
 *
 * El título tiene sitio fijo, así que cuando no cabe la variable que queda es su
 * tamaño, no su posición. Se prueba a cuerpo completo y se va reduciendo de a poco;
 * si ni el mínimo legible lo consigue, se queda en el mínimo y el informe dice cuánto
 * territorio tapa, en vez de encogerlo hasta lo ilegible o mandarlo al océano.
 */
const REDUCCION_MINIMA = 0.55;
const PASO_REDUCCION = 0.05;

function ajustarTitulo({ textos, medidor, factor, marco, ocupacion, margen, anchoMaximo }) {
  let mejor = null;
  for (let reduccion = 1; reduccion >= REDUCCION_MINIMA - 1e-9; reduccion -= PASO_REDUCCION) {
    const pieza = bloqueTitulo({ textos, medidor, factor, reduccion, anchoMaximo });
    const r = posicionEnAnclaje('arriba-derecha', marco, pieza.ancho, pieza.alto, margen);
    const tapado = ocupacion.sobreTerritorio(r);
    /* Se compara el área ABSOLUTA de territorio tapado, no la fracción de la caja:
       una caja grande puede tapar más milímetros cuadrados de país y aun así salir
       con una fracción menor, porque reparte el mismo estorbo sobre más superficie.
       Con la fracción como criterio, el ajuste elegía el cuerpo más grande. */
    const tapadoMm2 = tapado * pieza.ancho * pieza.alto;
    if (!mejor || tapadoMm2 < mejor.tapadoMm2 - 1e-6) {
      mejor = { pieza, reduccion, tapado, tapadoMm2, lineas: pieza.lineas };
    }
    if (tapado <= 0.02) break;
  }
  return {
    pieza: mejor.pieza,
    reduccion: Number(mejor.reduccion.toFixed(2)),
    tapadoPct: Number((mejor.tapado * 100).toFixed(2)),
    tapadoMm2: Number(mejor.tapadoMm2.toFixed(1)),
    lineas: mejor.lineas,
  };
}

/**
 * Mide sobre el terreno la distancia que cubre la barra de escala ya colocada.
 * Es la comprobación de que la escala gráfica no miente.
 */
function medirBarraDeEscala(proyeccion, colocacion, pieza) {
  const colocada = colocacion.colocadas.find((c) => c.pieza.nombre === 'escala');
  if (!colocada) return { comprobada: false };
  const { desplazamientoX, desplazamientoY, largoMm, km } = pieza.medida;
  const y = colocada.y + desplazamientoY;
  const a = proyeccion.invert([colocada.x + desplazamientoX, y]);
  const b = proyeccion.invert([colocada.x + desplazamientoX + largoMm, y]);
  if (!a || !b) return { comprobada: false };
  const kmMedidos = (geoDistance(a, b) * RADIO_TERRESTRE_M) / 1000;
  return {
    comprobada: true,
    kmMedidos: Number(kmMedidos.toFixed(3)),
    errorPct: Number((((kmMedidos - km) / km) * 100).toFixed(3)),
  };
}

/* --------------------------- geometría auxiliar ------------------------- */

/** Proyecta cada rasgo y guarda sus anillos en milímetros, sin pasar por la cadena `d`. */
function anillosPorRasgo(proyeccion, rasgos) {
  const mapa = new Map();
  for (const f of rasgos) {
    const recolector = recolectorDeAnillos();
    geoPath(proyeccion, recolector)(f);
    mapa.set(f, recolector.anillos);
  }
  return mapa;
}

/* ------------------------------- capas ---------------------------------- */

function dibujarCapas({ departamentos, contexto, ruta, marco, grilla, etiquetas }) {
  const porCapa = (nombre) => contexto.features.filter((f) => f.properties.capa === nombre);
  const rasgos = {};

  /* El agua se resuelve rellenando el marco entero de color de mar y dibujando la
     tierra encima. Recortar el polígono de océano y pintarlo sobre un fondo blanco
     deja un hilo claro allí donde la costa de Natural Earth y la del INEI no coinciden
     al milímetro; con el mar de fondo, ese desajuste queda debajo de la tierra. */
  const lagos = porCapa('lago');
  rasgos.lagos = lagos.length;
  const agua = [
    rect(marco, { fill: color.oceano }),
    ...lagos.map((f) => el('path', {
      d: ruta(f.geometry), fill: color.lago, stroke: color.oceanoRotulo,
      'stroke-width': trazoMm.paisVecino / 2,
    })),
  ];

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
     polígono llevara su propio trazo, el borde compartido se dibujaría dos veces y en
     papel saldría el doble de grueso que un borde exterior. */
  const limites = departamentos.features.map((f) => el('path', {
    d: ruta(f.geometry), fill: 'none', stroke: color.limiteDepartamental,
    'stroke-width': trazoMm.limiteDepartamental, 'stroke-linejoin': 'round',
  }));

  const contenido = {
    agua,
    paises: capaPaises,
    coropleta: [],
    territorio,
    limites,
    grilla: [grilla],
    simbolos: [],
    recuadros: [],
    etiquetas: [etiquetas],
  };

  return {
    rasgos,
    svg: CAPAS.map((nombre) => grupo({ id: `capa-${nombre}` }, contenido[nombre])).join('\n'),
  };
}

function dibujarMarco(marco) {
  return grupo({ id: 'capa-marco' }, [
    rect(marco, { fill: 'none', stroke: color.marco, 'stroke-width': trazoMm.marco }),
  ]);
}

/* -------------------------------- pie ----------------------------------- */

function medidasDelPie(medidor, factor) {
  const estilo = { familia: 'Poppins', variante: 'Regular', pt: tipografia.pie.pt * factor };
  const interlinea = medidor.alto(estilo) * 1.18;
  return { estilo, interlinea, lineas: 3, alturaMm: interlinea * 3 + 2.5 * factor };
}

/**
 * Pie obligatorio: de dónde salen los datos, con qué versión, cuándo se generó y el
 * aviso de que la escala sólo vale si se imprime sin reducir. Un mapa impreso sin esa
 * información no se puede auditar meses después.
 */
function dibujarPie({ marco, pie, banda, version, escala, nivel, textos, medidor }) {
  const x = marco.x;
  const derecha = marco.x + marco.ancho;
  /* Por debajo del marco va primero la banda con los números de la retícula; el pie
     empieza después, o se escribiría encima de ellos. */
  const base = marco.y + marco.alto + banda.arriba + pie.interlinea;
  const comun = {
    'font-family': pie.estilo.familia, 'font-size': ptAmm(pie.estilo.pt),
    fill: color.tintaSuave, 'font-weight': 400,
  };
  const destacado = { ...comun, 'text-anchor': 'end', 'font-weight': 600, fill: color.tinta };
  const eFuerte = { ...pie.estilo, variante: 'SemiBold' };

  const fecha = (textos.fecha ? new Date(textos.fecha) : new Date())
    .toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const elaborado = textos.elaboradoPor || 'el Ministerio de la Mujer y Poblaciones Vulnerables';

  /* Dos columnas: la procedencia a la izquierda y, a la derecha, la escala y el aviso
     de impresión. La izquierda se recorta al ancho libre para no montarse nunca. */
  const NOTA = 'Escala válida al imprimir al 100 %';
  const anchoDerecha = Math.max(
    medidor.ancho(NOTA, eFuerte),
    medidor.ancho(`Escala ${escala.texto}`, eFuerte),
  );
  const anchoIzquierda = marco.ancho - anchoDerecha - 6;

  const izquierda = [
    `Fuente: ${version.fuente} · Versión de datos ${version.datosTagCorto}`
    + ` (${version.generado}) · ${version.totalCentros} centros publicados`,
    'Límites: INEI · Contexto: Natural Earth 1:10 m'
    + ' · Proyección: Mercator transversa 75° O (UTM 18S) · Retícula UTM 18S',
    `Elaborado por ${elaborado} · Generado el ${fecha}`,
  ].map((t) => medidor.recortar(t, pie.estilo, anchoIzquierda));

  return grupo({ id: 'capa-pie' }, [
    ...izquierda.map((t, i) => texto(t, { ...comun, x, y: base + pie.interlinea * i })),
    texto(`Escala ${escala.texto}`, { ...destacado, x: derecha, y: base }),
    texto(NOTA, { ...destacado, x: derecha, y: base + pie.interlinea * 2 }),
    /* Rastro del nivel geométrico: permite explicar, ante un mapa impreso, por qué un
       contorno tiene el detalle que tiene. */
    el('metadata', { id: 'detalle-geometrico' }, `nivel=${nivel} escala=${num(escala.denominador, 0)}`),
  ]);
}
