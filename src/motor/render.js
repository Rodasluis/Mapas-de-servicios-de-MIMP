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
  colocarPiezas, posicionEnAnclaje, PLANTILLAS, PRIORIDAD, CABECERA, ANTES_DE_ROTULOS,
  SITIO_FIJO,
} from './layout.js';
import {
  agregarCentros, claseDe, clasesUsadas, repartirIconos, medirApinamiento,
  CLASES_POR_DEFECTO,
} from './servicios.js';
import { normalizarAmbito, encajeDeTanteo, cargarAmbito } from './ambito.js';
import { mapaDeUbicacion, resaltePara } from './localizador.js';
import { bloqueLeyenda } from './leyenda.js';
import { construirRecuadros, maximoPorFormato, UMBRAL_APINAMIENTO } from './zoom.js';
import { dibujarIcono, comprobarCobertura } from '../iconos/index.js';
import { poloDeInaccesibilidad, polosDeInaccesibilidad, puntoEnAnillos } from './ocupacion.js';
import { crearIndice } from './colisiones.js';
import { colocarEtiquetas, crearSolicitud } from './etiquetas.js';
import { color, trazoMm, tipografia, layoutMm, rampaNaranjas, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, textoConHalo, rect, documento, num } from './svg.js';

/** Holgura entre el ámbito y el borde del marco, para que el país no toque el filo. */
export const HOLGURA_MM = 3;

/** Orden de dibujo dentro del marco. Las vacías quedan reservadas a fases posteriores. */
/** Capas que la interfaz puede apagar, y su estado por omisión. */
export const CAPAS_POR_DEFECTO = {
  coropleta: true,
  simbolos: true,
  grilla: true,
  rotulos: true,
  contexto: true,
};

/** Piezas del layout que la interfaz puede apagar. */
export const PIEZAS_POR_DEFECTO = {
  institucional: true,
  titulo: true,
  leyenda: true,
  escala: true,
  norte: true,
  ubicacion: true,
};

export const CAPAS = [
  'agua',          // fondo del marco y lagos
  'paises',        // países vecinos
  'exterior',      // territorio peruano fuera del ámbito, atenuado (Fase 6)
  'coropleta',     // Fase 3
  'territorio',    // relleno del ámbito
  'limites',       // límites administrativos
  'grilla',        // retícula UTM
  /* Los nombres de departamento y provincia van DEBAJO de los símbolos. Encima, un
     rótulo tapaba el ícono y la cifra de sedes que tiene al lado, y esa cifra es un
     dato del mapa mientras que el nombre casi siempre se deduce de la posición. Debajo,
     el halo blanco del rótulo sigue separándolo del relleno y lo que se pierde es sólo
     el trozo de letra que queda bajo una insignia. */
  'rotulos',       // nombres de departamentos y provincias
  'simbolos',      // Fase 3
  'recuadros',     // Fase 3: rectángulos de los zooms
  'etiquetas',     // países, océano y lagos: por encima de todo, orientan la lectura
];

/** Compone el mapa nacional. Atajo histórico de `componer` sin ámbito. */
export function componerNacional(opciones) {
  return componer({ ...opciones, ambito: 'nacional' });
}

/**
 * Compone un mapa de cualquier ámbito: el país, un departamento o una provincia.
 *
 * Lo que cambia entre ellos —qué unidad colorea el coropletas, qué representa cada
 * símbolo y qué nombres se escriben— lo resuelve `cargarAmbito`, y el resto del
 * proceso es el mismo. Que sea el mismo no es economía de código: es lo que garantiza
 * que un mapa de Cusco se mida, se rotule y se imprima con el mismo criterio que el
 * del país, y no con una variante que se le parezca.
 */
export async function componer({ hoja, cargador, ambito, textos = {}, opciones = {} }) {
  const inicio = Date.now();
  const elAmbito = normalizarAmbito(ambito);
  const [indice, version, logos, metricas, centrosJson, iconos] = await Promise.all([
    cargador.indice(), cargador.version(), cargador.logos(), cargador.metricas(),
    cargador.centros(), cargador.iconos(),
  ]);

  /* Filtro de tipos. null es «todos»; un conjunto vacío no dibujaría nada, así que se
     trata como todos y se anota, en vez de devolver un mapa en blanco sin explicación. */
  const tiposActivos = opciones.tipos && opciones.tipos.length
    ? new Set(opciones.tipos) : null;
  const clases = opciones.clases || CLASES_POR_DEFECTO;

  /* Capas y piezas que la interfaz puede apagar. Por omisión todas encendidas: el
     motor no debe comportarse distinto según quién lo llame. */
  const capasVisibles = { ...CAPAS_POR_DEFECTO, ...(opciones.capas || {}) };
  const piezasVisibles = { ...PIEZAS_POR_DEFECTO, ...(opciones.piezas || {}) };

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
     es de metros frente a los cientos de kilómetros del ámbito, así que no cambia la
     elección— y después se rehace con el nivel definitivo, que es el que se dibuja. */
  const tanteo = await encajeDeTanteo(elAmbito, cargador);
  const escalaTanteo = medirEscala(crearProyeccion(tanteo, marco, HOLGURA_MM), marco);
  const nivel = nivelPara(escalaTanteo.denominador, indice.niveles);

  const plan = await cargarAmbito({ ambito: elAmbito, cargador, nivel });
  const contexto = await cargador.contexto();
  const proyeccion = crearProyeccion(plan.encaje, marco, HOLGURA_MM);
  const escala = medirEscala(proyeccion, marco);
  const ruta = crearRuta(proyeccion);

  /* La agregación depende del ámbito: el país cuenta por provincia y un departamento,
     por distrito. Se recorta además a lo que cae DENTRO del ámbito, o el pie de un
     mapa de Cusco anunciaría los 704 centros del país. */
  const agregado = agregarCentros(centrosJson, {
    clave: plan.claveCentro,
    tiposActivos,
    pertenece: plan.perteneceAlAmbito,
  });
  const clasesVisibles = clasesUsadas(agregado, clases);

  /* Un tipo en los datos sin ícono en el catálogo se dibujaría como un hueco, así que
     se detiene aquí con el nombre exacto que falta. */
  const cobertura = comprobarCobertura(agregado.tipos);
  if (cobertura.sinIcono.length) {
    throw new Error(
      `Sin ícono para: ${cobertura.sinIcono.join(', ')}. Añádelos a src/iconos/catalogo.js.`,
    );
  }

  /* Geometría proyectada a milímetros, que sirve a la vez para dibujar y para saber
     qué partes de la hoja están ocupadas por tierra. */
  const anillos = anillosPorRasgo(proyeccion, [
    ...plan.unidades.features, ...plan.intermedios.features, ...plan.contorno.features,
    ...plan.exterior.features, ...contexto.features,
  ]);
  const ocupacion = crearOcupacion(hoja.anchoMm, hoja.altoMm);
  /* «Territorio» es lo que un bloque del layout no debe tapar, y eso es el ÁMBITO, no
     todo el Perú: en un mapa de Cusco, poner la leyenda sobre Madre de Dios no estorba
     a nadie, y prohibirlo dejaría la lámina sin ningún sitio donde colocarla. «Tierra»
     sí es todo lo que no es mar, que es lo que decide dónde cabe el rótulo del océano. */
  for (const f of plan.contorno.features) {
    ocupacion.marcarTerritorio(anillos.get(f));
    ocupacion.marcarTierra(anillos.get(f));
  }
  for (const f of plan.exterior.features) ocupacion.marcarTierra(anillos.get(f));
  for (const f of contexto.features) {
    if (f.properties.capa === 'pais') ocupacion.marcarTierra(anillos.get(f));
  }

  /* Tamaño del ícono. Crece algo con la hoja pero acotado: por debajo de 3 mm el
     pictograma deja de leerse y por encima de 6 mm los grupos se comen las provincias
     pequeñas. Lo que no cabe se refleja en el apiñamiento, que es lo que decide si
     hace falta un recuadro de zoom. */
  const tamanoIcono = Math.min(6, Math.max(3, 3.4 * Math.sqrt(factor)));
  const vacioSimbolos = { svg: '', grupos: [], apinados: [], apinamientoMaximoPct: 0 };
  let simbolos = vacioSimbolos;
  if (capasVisibles.simbolos) {
    simbolos = plan.simbolos === 'individual'
      ? dibujarCentros({
        centros: agregado.centros, proyeccion, iconos, marco, medidor, factor, tamanoIcono,
      })
      : dibujarSimbolos({
        unidades: plan.unidades, agregado, anillos, iconos, marco, medidor, factor, tamanoIcono,
      });
  }

  /* Los grupos de íconos se reservan en la rejilla antes de colocar nada del layout.
     Se salen de su provincia —el de Lima se adentra en el mar— así que un bloque
     puesto sobre «espacio libre» podía caer encima: la leyenda y un recuadro de zoom
     acabaron sobre los símbolos de Lima, y la escala sobre los de Arequipa. */
  for (const g of simbolos.grupos) {
    ocupacion.marcarBloque({ x: g.x, y: g.y, ancho: g.ancho, alto: g.alto });
  }

  const grilla = capasVisibles.grilla
    ? construirGrilla(proyeccion, marco, escala.denominador)
    : { paso: 0, lineas: [], desviacionMaximaMm: 0 };
  const dibujoGrilla = capasVisibles.grilla
    ? dibujarGrilla({ grilla, marco, medidor, factor, banda })
    : { svgLineas: '', svgMarcas: '', rotulos: 0 };

  /* ------------------------------ layout ------------------------------- */

  const plantilla = PLANTILLAS[hoja.orientacion] || PLANTILLAS.vertical;
  const norte = anguloDelNorte(proyeccion, [marco.x + marco.ancho / 2, marco.y + marco.alto / 2]);

  /* Logotipo y título comparten margen al marco para que el aire de las dos esquinas
     superiores se vea igual. */
  const margenCabecera = layoutMm.margenCabecera * factor;

  const titulo = ajustarTitulo({
    textos: {
      titulo: textos.titulo ?? 'Servicios que brinda el MIMP',
      /* El subtítulo dice de qué ámbito es el mapa cuando nadie lo ha escrito. Dejar
         «Ámbito nacional» en una lámina de Cusco sería peor que no poner nada. */
      subtitulo: textos.subtitulo ?? plan.descripcion,
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
    leyenda: ajustarLeyenda({
      agregado,
      unidad: plan.agregacion,
      clasesUsadas: clasesVisibles,
      clases,
      iconos,
      medidor,
      factor,
      rampa: opciones.rampa || rampaNaranjas,
      tamanoIconoMm: Math.min(5, tamanoIcono),
      marco,
      ocupacion,
    }),
    /* El localizador sólo existe fuera del nacional: un mapa del Perú con una miniatura
       del Perú al lado no localiza nada. */
    ubicacion: elAmbito.nivel === 'nacional' ? null : mapaDeUbicacion({
      pais: await cargador.departamentos('bajo'),
      resaltar: resaltePara(elAmbito),
      ambito: plan.contorno,
      factor,
    }),
  };

  const solicitud = (n) => ({
    pieza: piezas[n],
    anclajes: plantilla[n] || [],
    // Cabecera de sitio fijo: el logotipo y el título no se mudan de esquina.
    soloPreferidos: SITIO_FIJO.includes(n),
    ...(CABECERA.includes(n) ? { margen: margenCabecera } : {}),
  });

  /* Una pieza entra si existe para este ámbito Y la interfaz no la ha apagado. */
  const entra = (n) => Boolean(piezas[n]) && piezasVisibles[n] !== false;

  /* La cabecera reserva su sitio ANTES que los rótulos del mapa. Al revés, el rótulo
     «COLOMBIA» ocupaba la esquina superior derecha y el título, al no poder pisarlo,
     se deslizaba hacia abajo hasta acabar sobre Loreto: medía cero territorio en la
     esquina que le tocaba y tapaba un 25 % en la que terminaba. */
  const colocacionCabecera = colocarPiezas(
    ANTES_DE_ROTULOS.filter(entra).map(solicitud), marco, ocupacion,
  );

  /* Los recuadros van justo detrás de la leyenda y ANTES de los rótulos del mapa: se
     dimensionan por el hueco que quede, así que necesitan la ocupación con la cabecera
     y la leyenda ya dentro, pero no pueden esperar a los rótulos, que son pequeños y
     se acomodan en cualquier sitio mientras que un recuadro necesita una superficie
     grande y con una forma concreta. No pasan por colocarPiezas porque eligen ellos
     mismos tamaño y ubicación. */
  const recuadros = construirRecuadros({
    modo: opciones.zoom === false ? 'ninguno' : (opciones.zoom?.modo || 'auto'),
    seleccion: opciones.zoom?.seleccion || [],
    grupos: simbolos.grupos,
    umbral: UMBRAL_APINAMIENTO,
    unidades: plan.unidades,
    /* Cómo se agrupan las unidades en zonas ampliables y cómo se llama cada una. En
       el mapa del país las provincias se agrupan por departamento; en el de un
       departamento, los distritos por provincia. */
    zonas: plan.zonas,
    /* El recuadro dibuja lo mismo que el mapa principal: si éste pinta cada centro en
       su sitio, el zoom también. */
    modoSimbolos: plan.simbolos,
    centros: agregado.centros,
    anillos,
    agregado,
    clases,
    rampa: opciones.rampa || rampaNaranjas,
    iconos,
    medidor,
    factor,
    tamanoIcono,
    marco,
    ocupacion,
    maximo: opciones.maximoRecuadros,
  });

  const etiquetas = capasVisibles.contexto
    ? rotulosDeContexto({ contexto, anillosPorRasgo: anillos, marco, ocupacion, medidor, factor })
    : { svg: '', colocados: [], omitidos: [], cajas: [] };

  const colocacionResto = colocarPiezas(
    PRIORIDAD.filter((n) => entra(n) && !ANTES_DE_ROTULOS.includes(n)).map(solicitud),
    marco, ocupacion,
  );

  const colocacion = {
    colocadas: [...colocacionCabecera.colocadas, ...colocacionResto.colocadas],
    omitidas: [...colocacionCabecera.omitidas, ...colocacionResto.omitidas],
    forzadas: [...colocacionCabecera.forzadas, ...colocacionResto.forzadas],
  };

  /* --------------------------- rótulos del país ------------------------- */

  /* Los nombres de departamentos y provincias van los ÚLTIMOS: son muchos y flexibles,
     mientras que la leyenda, los recuadros o la escala necesitan una superficie
     concreta. Colocarlos antes dejaría a esas piezas sin sitio por un topónimo.
     El índice se siembra con todo lo ya dibujado —bloques, recuadros, grupos de
     íconos y rótulos de contexto— para que ningún rótulo caiga encima. */
  const indiceRotulos = crearIndice();
  for (const c of colocacion.colocadas) {
    indiceRotulos.agregar({ x: c.x, y: c.y, ancho: c.ancho, alto: c.alto, etiqueta: c.pieza.nombre });
  }
  for (const z of recuadros.colocados) {
    indiceRotulos.agregar({ x: z.x, y: z.y, ancho: z.ancho, alto: z.alto, etiqueta: z.nombre });
  }
  for (const g of simbolos.grupos) {
    indiceRotulos.agregar({
      x: g.x, y: g.y, ancho: g.ancho, alto: g.alto,
      etiqueta: `símbolos ${g.nombre}`, nivel: 'simbolos',
    });
  }
  for (const c of etiquetas.cajas || []) indiceRotulos.agregar(c);

  const rotulos = capasVisibles.rotulos
    ? colocarEtiquetas({
      solicitudes: solicitudesDeRotulos({
        niveles: plan.rotulos, anillos, simbolos, factor, marco,
      }),
      indice: indiceRotulos,
      medidor,
      marco,
      factor,
    })
    : { svg: '', colocados: [], omitidos: [], porNivel: {} };

  /* La barra de escala se comprueba sobre el dibujo terminado: se invierten sus dos
     extremos por la proyección y se mide la distancia real entre ellos. Si la barra
     dijera 500 km y cubriera 480, este número lo delata. */
  const comprobacionEscala = medirBarraDeEscala(proyeccion, colocacion, piezas.escala);

  /* ----------------------------- ensamblado ---------------------------- */

  const capas = dibujarCapas({
    plan,
    agregado,
    clases,
    rampa: opciones.rampa || rampaNaranjas,
    contexto,
    ruta,
    marco,
    conColor: capasVisibles.coropleta,
    grilla: dibujoGrilla.svgLineas,
    /* Dos capas distintas y a distinta altura: los nombres de departamento y provincia
       van bajo los símbolos, y los de contexto —países, mar, lagos— por encima de todo,
       porque son los que orientan la lectura antes de mirar el detalle. */
    rotulos: rotulos.svg,
    etiquetas: etiquetas.svg,
    simbolos: simbolos.svg,
    recuadros: recuadros.referencias,
  });

  const idRecorte = 'recorte-marco';
  const defs = el('clipPath', { id: idRecorte }, rect(marco));

  const contenido = [
    rect({ x: 0, y: 0, ancho: hoja.anchoMm, alto: hoja.altoMm }, { fill: color.fondoHoja, id: 'hoja' }),
    grupo({ id: 'mapa', 'clip-path': `url(#${idRecorte})` }, capas.svg),
    dibujarMarco(marco),
    dibujoGrilla.svgMarcas,
    grupo({ id: 'capa-layout' }, [
      ...colocacion.colocadas.map((c) => c.pieza.dibujar(c.x, c.y)),
      ...recuadros.colocados.map((z) => z.svg),
    ]),
    dibujarPie({ marco, pie, banda, version, escala, nivel, textos, medidor }),
  ].join('\n');

  return {
    svg: documento(hoja, contenido, { defs }),
    meta: {
      hoja: hoja.nombre,
      anchoMm: hoja.anchoMm,
      altoMm: hoja.altoMm,
      ambito: {
        nivel: elAmbito.nivel,
        id: elAmbito.id,
        nombre: plan.nombre,
        descripcion: plan.descripcion,
        agregacion: plan.agregacion,
        simbolos: plan.simbolos,
      },
      nivel,
      escala: escala.texto,
      denominador: Math.round(escala.denominador),
      variacionEscalaPct: Number(escala.variacionPct.toFixed(2)),
      centro: escala.centro.map((v) => Number(v.toFixed(4))),
      marco,
      factorFormato: Number(factor.toFixed(3)),
      capas: capasVisibles,
      piezas: piezasVisibles,
      titulo: {
        reduccion: titulo.reduccion,
        tapadoPct: titulo.tapadoPct,
        tapadoMm2: titulo.tapadoMm2,
        lineas: titulo.lineas,
      },
      anguloNorteGrados: Number(norte.toFixed(2)),
      rasgos: capas.rasgos,
      servicios: {
        totalDibujado: agregado.total,
        totalEnDatos: centrosJson.centros.length,
        tipos: agregado.tipos.map((t) => ({ tipo: t, n: agregado.porTipo.get(t) })),
        unidadesConServicio: agregado.porUnidad.size,
        unidadesDibujadas: plan.unidades.features.length,
        clasesUsadas: clasesVisibles.map((i) => clases[i].etiqueta),
        filtro: tiposActivos ? [...tiposActivos] : null,
        tamanoIconoMm: Number(tamanoIcono.toFixed(2)),
        gruposApinados: simbolos.apinados,
        recuadros: recuadros.regiones,
        capacidadRecuadros: recuadros.capacidad,
        avisosRecuadros: recuadros.avisos,
        apinamientoMaximoPct: simbolos.apinamientoMaximoPct,
        iconosSinUso: cobertura.sinUso,
      },
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
      rotulos: { colocados: etiquetas.colocados, omitidos: etiquetas.omitidos, motivos: etiquetas.motivos },
      etiquetas: {
        porNivel: rotulos.porNivel,
        omitidos: rotulos.omitidos.map((o) => o.texto),
        cajas: indiceRotulos.lista().map((c) => ({
          etiqueta: c.etiqueta || c.id || '',
          nivel: c.nivel || 'bloque',
          x: Number(c.x.toFixed(2)),
          y: Number(c.y.toFixed(2)),
          ancho: Number(c.ancho.toFixed(2)),
          alto: Number(c.alto.toFixed(2)),
        })),
      },
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
 * Busca la composición mayor con la que la leyenda cabe abajo a la izquierda sin
 * tapar el país.
 *
 * Tiene sitio fijo, igual que el título, así que cuando no entra la variable es su
 * tamaño y no su posición: se prueban cajas cada vez más ceñidas —que la leyenda
 * traduce en más columnas, siglas en vez de nombres y cuerpos menores— y se elige la
 * que menos territorio tape. Se compara el área ABSOLUTA tapada y no la fracción,
 * porque una caja grande reparte el mismo estorbo sobre más superficie y saldría
 * ganando siempre.
 */
function ajustarLeyenda({ marco, ocupacion, ...resto }) {
  let mejor = null;
  for (const ceñido of [1, 0.85, 0.72, 0.6, 0.5, 0.42]) {
    const pieza = bloqueLeyenda({
      ...resto,
      /* Acotada en las dos dimensiones: sin el límite de ancho, los nombres largos
         («Centro de Atención Residencial para Personas Adultas Mayores - CARPAM»)
         estiraban la leyenda hasta media hoja. */
      altoMaximoMm: marco.alto * 0.45 * ceñido,
      anchoMaximoMm: marco.ancho * 0.33 * ceñido,
    });
    if (!pieza) return null;
    const r = posicionEnAnclaje('abajo-izquierda', marco, pieza.ancho, pieza.alto);
    const tapado = ocupacion.sobreTerritorio(r);
    const tapadoMm2 = tapado * pieza.ancho * pieza.alto;
    if (!mejor || tapadoMm2 < mejor.tapadoMm2 - 1e-6) mejor = { pieza, tapado, tapadoMm2 };
    /* Se acepta que la leyenda pise algo de territorio antes que encogerla hasta
       hacerla ilegible. En el nacional su esquina cae sobre el Pacífico y no tapa
       nada, pero en un ámbito departamental puede tocar tierra, y exigir cero dejaría
       una leyenda diminuta con media hoja libre al lado. Lleva fondo opaco, así que
       lo que tapa se entiende como bloque y no como un hueco en el mapa. */
    if (tapado <= TERRITORIO_TOLERADO_LEYENDA) break;
  }
  return mejor.pieza;
}

/** Cuánto territorio puede pisar la leyenda antes de que valga la pena encogerla. */
const TERRITORIO_TOLERADO_LEYENDA = 0.08;

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

/**
 * Puntos interiores que se ofrecen a cada rótulo.
 *
 * Con uno solo —el polo— no se coloca casi nada: el grupo de íconos de la provincia
 * ocupa justamente ese punto. Con diez, el nombre tiene dónde ir sin salirse de su
 * polígono ni pisar los símbolos.
 */
const PUNTOS_POR_ROTULO = 10;

/* ---------------------------- rótulos del país -------------------------- */

/**
 * Prepara los rótulos de departamentos y provincias.
 *
 * Los departamentos van en mayúsculas y con mayor cuerpo, como en el mapa de
 * referencia: son el nivel de lectura gruesa y tienen que verse antes que el detalle.
 * Las provincias van debajo en la jerarquía, así que ceden el sitio cuando compiten.
 *
 * El punto preferido de cada rótulo es el polo de inaccesibilidad de su polígono, que
 * para las provincias ya viene calculado por la capa de símbolos. Como el grupo de
 * íconos ocupa justo ese punto, el motor acabará colocando casi todos los nombres
 * desplazados alrededor; ése es exactamente su trabajo.
 */
/**
 * Estilo de cada nivel de rótulo.
 *
 * El nivel SUPERIOR de cada mapa va en mayúsculas y con más cuerpo, como en la lámina
 * de referencia, y el de debajo en minúsculas y más pequeño. Lo que importa es que eso
 * depende del ámbito y no de la entidad: en el mapa del país el nivel grueso son los
 * departamentos y en el de un departamento, las provincias. Un rótulo de provincia no
 * tiene un tamaño propio, tiene el que le toca según lo que el mapa retrate.
 */
const ESTILOS_ROTULO = {
  departamento: { tipo: 'rotuloDepartamento', color: 'tinta' },
  provincia: { tipo: 'rotuloProvincia', color: 'tintaSuave' },
  distrito: { tipo: 'rotuloDistrito', color: 'tintaSuave' },
  // Fuera del ámbito: mismo cuerpo que una provincia, pero en gris de fondo.
  exterior: { tipo: 'rotuloProvincia', color: 'rotuloExterior' },
};

/** Finura del campo de distancias según el nivel: más fino, más lento y más preciso. */
const CELDA_POR_PRIORIDAD = [2, 1.5, 1.2];

function solicitudesDeRotulos({ niveles, anillos, simbolos, factor, marco }) {
  const solicitudes = [];
  const polosDe = new Map(simbolos.grupos.map((g) => [g.unidad, g.polos]));

  const estiloDe = (nivel) => {
    const def = ESTILOS_ROTULO[nivel] || ESTILOS_ROTULO.provincia;
    const t = tipografia[def.tipo];
    return {
      estilo: { familia: t.familia, variante: t.peso, pt: t.pt * Math.sqrt(factor) },
      tinta: color[def.color],
    };
  };

  for (const capa of niveles) {
    const { estilo, tinta } = estiloDe(capa.nivel);
    const celda = CELDA_POR_PRIORIDAD[Math.min(capa.prioridad - 1, CELDA_POR_PRIORIDAD.length - 1)];

    for (const f of capa.rasgos) {
      const anillosRasgo = anillos.get(f);
      if (!anillosRasgo || !anillosRasgo.length) continue;

      /* Los polos de las unidades ya los calculó la capa de símbolos. Reaprovecharlos
         ahorra rehacer el campo de distancias y, sobre todo, garantiza que el nombre
         busque sitio alrededor del MISMO punto donde están los íconos. */
      let polos = capa.exterior ? null : polosDe.get(f.properties.ubigeo);
      if (!polos || !polos.length) {
        const caja = cajaDeAnillos(anillosRasgo, marco);
        polos = caja ? polosDeInaccesibilidad(anillosRasgo, caja, celda, PUNTOS_POR_ROTULO) : [];
      }
      if (!polos.length) continue;

      solicitudes.push(crearSolicitud({
        id: f.properties.ubigeo,
        texto: capa.mayusculas ? f.properties.nombre.toLocaleUpperCase('es') : f.properties.nombre,
        nivel: capa.nivel,
        prioridad: capa.prioridad,
        peso: polos[0].radioMm,
        puntos: polos,
        estilo,
        color: tinta,
        dentro: (x, y) => puntoEnAnillos(x, y, anillosRasgo),
      }));
    }
  }

  return solicitudes;
}

/* -------------------------------- símbolos ------------------------------ */

/**
 * Un ícono por TIPO presente en cada provincia, con el número de centros debajo.
 *
 * No se dibuja un ícono por centro: en Lima serían ciento y pico alfileres sobre unos
 * pocos milímetros. Lo que el mapa de referencia comunica —y lo que se reproduce— es
 * qué SERVICIOS llegan a cada provincia y cuántas sedes hay de cada uno.
 *
 * El grupo se ancla en el polo de inaccesibilidad de la provincia, no en su centroide:
 * en una provincia cóncava o partida en islas el centroide cae fuera y el grupo se
 * dibujaría sobre la vecina.
 */
function dibujarSimbolos({
  unidades, agregado, anillos, iconos, marco, medidor, factor, tamanoIcono,
}) {
  const eCifra = { familia: 'SourceSans3', variante: 'Semibold', pt: 5.2 * Math.sqrt(factor) };
  const altoCifra = medidor.alto(eCifra) * 0.95;
  const piezas = [];
  const grupos = [];

  for (const f of unidades.features) {
    const datos = agregado.porUnidad.get(f.properties.ubigeo);
    if (!datos || !datos.tipos.size) continue;

    const anillosProv = anillos.get(f);
    if (!anillosProv || !anillosProv.length) continue;
    const caja = cajaDeAnillos(anillosProv, marco);
    /* Se piden varios de una vez: el primero ancla el grupo de íconos y los demás
       quedan guardados para que el motor de rótulos tenga dónde probar el nombre sin
       repetir el cálculo del campo de distancias. */
    const polos = caja ? polosDeInaccesibilidad(anillosProv, caja, 1.2, PUNTOS_POR_ROTULO) : [];
    const polo = polos[0];
    if (!polo) continue;

    /* Orden estable: el mismo tipo ocupa siempre el mismo sitio dentro del grupo, de
       modo que dos ejecuciones dan el mismo dibujo y comparar mapas tiene sentido. */
    const tipos = [...datos.tipos.keys()].sort(
      (a, b) => agregado.porTipo.get(b) - agregado.porTipo.get(a) || a.localeCompare(b, 'es'),
    );
    const { posiciones, ancho, alto } = repartirIconos(tipos.length, polo, tamanoIcono, altoCifra);

    tipos.forEach((tipo, i) => {
      const p = posiciones[i];
      piezas.push(dibujarIcono({
        tipo,
        x: p.x,
        y: p.y,
        tamanoMm: tamanoIcono,
        color: iconos.tipos[tipo]?.color || color.tintaSuave,
      }));
      piezas.push(textoConHalo(String(datos.tipos.get(tipo)), {
        x: p.x,
        y: p.y + altoCifra * 0.82,
        'text-anchor': 'middle',
        fill: color.tinta,
        'font-family': eCifra.familia,
        'font-size': ptAmm(eCifra.pt),
        'font-weight': 600,
      }, { colorHalo: color.halo, grosorMm: trazoMm.haloRotulo * factor * 0.7 }));
    });

    grupos.push({
      unidad: f.properties.ubigeo,
      nombre: f.properties.nombre,
      x: polo.x - ancho / 2,
      y: polo.y - alto / 2,
      ancho,
      alto,
      // Los polos ya están calculados; los rótulos los reutilizan en vez de rehacerlos.
      polo: { x: polo.x, y: polo.y, radioMm: polo.radioMm },
      polos: polos.map((p) => ({ x: p.x, y: p.y, radioMm: p.radioMm })),
      tipos: tipos.length,
      centros: datos.total,
    });
  }

  const medidos = medirApinamiento(grupos);
  const apinados = medidos.filter((g) => g.apinamiento > UMBRAL_APINAMIENTO);

  return {
    svg: piezas.join('\n'),
    grupos: medidos,
    apinados: apinados.map((g) => ({
      nombre: g.nombre,
      unidad: g.unidad,
      apinamientoPct: Number((g.apinamiento * 100).toFixed(0)),
    })).sort((a, b) => b.apinamientoPct - a.apinamientoPct),
    apinamientoMaximoPct: Number((Math.max(0, ...medidos.map((g) => g.apinamiento)) * 100).toFixed(0)),
  };
}

/**
 * Cada centro en su coordenada real, con el ícono de su tipo.
 *
 * Es lo que se dibuja en ámbito provincial, y la diferencia con el mapa nacional no es
 * de detalle sino de pregunta. El nacional responde «qué servicios llegan a esta
 * provincia»; a escala de provincia esa pregunta ya está contestada y la que queda es
 * «dónde está cada uno», que sólo se responde poniendo cada centro en su sitio.
 *
 * El ícono se ancla por su punta, no por su centro: la insignia se dibuja encima del
 * punto, como un alfiler, de modo que lo que señala es la coordenada y no el dibujo.
 *
 * No se rotulan aquí. A esta escala varios centros comparten manzana y el nombre de
 * cada uno multiplicaría por cuatro la tinta sobre la misma superficie; la
 * identificación uno a uno es la tabla numerada de la Fase 7.
 */
function dibujarCentros({ centros, proyeccion, iconos, marco, tamanoIcono }) {
  const piezas = [];
  const grupos = [];

  /* Orden estable por id: dos ejecuciones dibujan los íconos en el mismo orden, que es
     lo que hace comparables dos PDF con la misma configuración. */
  const ordenados = [...centros].sort((a, b) => a.id - b.id);

  for (const c of ordenados) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    const punto = proyeccion([c.lon, c.lat]);
    if (!punto) continue;
    const [x, y] = punto;
    /* Fuera del marco no se dibuja: un centro con la coordenada mal puesta arrastraría
       el símbolo al pie de la lámina en vez de quedarse sobre el mapa. */
    if (x < marco.x || x > marco.x + marco.ancho || y < marco.y || y > marco.y + marco.alto) continue;

    piezas.push(dibujarIcono({
      tipo: c.tipo,
      x,
      y,
      tamanoMm: tamanoIcono,
      color: iconos.tipos[c.tipo]?.color || color.tintaSuave,
    }));
    grupos.push({
      unidad: c.ubigeo,
      nombre: c.dist,
      x: x - tamanoIcono / 2,
      y: y - tamanoIcono,
      ancho: tamanoIcono,
      alto: tamanoIcono,
      polo: { x, y: y - tamanoIcono / 2, radioMm: tamanoIcono / 2 },
      polos: [{ x, y: y - tamanoIcono / 2, radioMm: tamanoIcono / 2 }],
      tipos: 1,
      centros: 1,
    });
  }

  const medidos = medirApinamiento(grupos);
  const apinados = medidos.filter((g) => g.apinamiento > UMBRAL_APINAMIENTO);

  return {
    svg: piezas.join('\n'),
    grupos: medidos,
    /* El apiñamiento se informa por DISTRITO, no centro a centro: «hay 14 centros que
       se pisan» no ayuda a decidir nada, y «se pisan en Breña» sí. */
    apinados: resumirApinadosPorUnidad(apinados),
    apinamientoMaximoPct: Number((Math.max(0, ...medidos.map((g) => g.apinamiento)) * 100).toFixed(0)),
  };
}

function resumirApinadosPorUnidad(apinados) {
  const porUnidad = new Map();
  for (const g of apinados) {
    const previo = porUnidad.get(g.unidad);
    const pct = Number((g.apinamiento * 100).toFixed(0));
    if (!previo) porUnidad.set(g.unidad, { nombre: g.nombre, unidad: g.unidad, apinamientoPct: pct, centros: 1 });
    else {
      previo.centros++;
      previo.apinamientoPct = Math.max(previo.apinamientoPct, pct);
    }
  }
  return [...porUnidad.values()].sort((a, b) => b.apinamientoPct - a.apinamientoPct);
}

/* El umbral de apiñamiento vive en zoom.js, que es quien decide qué se amplía; aquí
   se reexporta porque el informe lo usa para marcar los grupos que se estorban. */
export { UMBRAL_APINAMIENTO };

/** Caja envolvente de unos anillos, recortada al marco. */
function cajaDeAnillos(anillosRasgo, marco) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const anillo of anillosRasgo) {
    for (const [x, y] of anillo) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  const x0 = Math.max(minX, marco.x);
  const y0 = Math.max(minY, marco.y);
  const x1 = Math.min(maxX, marco.x + marco.ancho);
  const y1 = Math.min(maxY, marco.y + marco.alto);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 };
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

function dibujarCapas({
  plan, agregado, clases, rampa, contexto, ruta, marco,
  grilla, etiquetas, rotulos, simbolos, recuadros, conColor = true,
}) {
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

  rasgos.unidades = plan.unidades.features.length;
  rasgos.intermedios = plan.intermedios.features.length;
  rasgos.exterior = plan.exterior.features.length;

  /* Territorio peruano fuera del ámbito. Se dibuja para que el ámbito no parezca una
     isla —un mapa de Cusco que acabara en su límite no diría por dónde se llega—, pero
     sin color de clase: ahí no se está midiendo nada y pintarlo como si sí invitaría a
     compararlo con lo que el mapa sí mide. */
  const exterior = plan.exterior.features.map((f) => el('path', {
    d: ruta(f.geometry),
    fill: color.territorioExterior,
    stroke: color.territorioExteriorBorde,
    'stroke-width': trazoMm.limiteProvincial,
    'stroke-linejoin': 'round',
  }));

  /* El ámbito se rellena por UNIDAD con el color de su clase. Las que no tienen ningún
     servicio quedan en blanco, como en el mapa de referencia: «sin servicio» y «con
     uno» son cosas distintas y no pueden compartir tono. */
  let conServicio = 0;
  const coropleta = plan.unidades.features.map((f) => {
    const datos = agregado.porUnidad.get(f.properties.ubigeo);
    const indice = claseDe(datos ? datos.tiposDistintos : 0, clases);
    if (indice >= 0) conServicio++;
    return el('path', {
      d: ruta(f.geometry),
      fill: conColor && indice >= 0 ? rampa[indice] : color.sinDato,
      id: `u-${f.properties.ubigeo}`,
    });
  });
  rasgos.unidadesConServicio = conServicio;

  /* Los límites van en capas aparte y por encima de todos los rellenos: si cada
     polígono llevara su propio trazo, el borde compartido se dibujaría dos veces y en
     papel saldría el doble de grueso que un borde exterior.

     Se dibujan de fino a grueso —unidad, nivel intermedio, contorno del ámbito— para
     que la jerarquía quede legible: sin el trazo grueso del contorno, cien distritos
     forman una retícula en la que no se ve dónde empieza y acaba lo que se retrata. */
  const trazar = (rasgos, token) => (token ? rasgos.map((f) => el('path', {
    d: ruta(f.geometry), fill: 'none', stroke: color[token],
    'stroke-width': trazoMm[token], 'stroke-linejoin': 'round',
  })) : []);

  const limites = [
    ...trazar(plan.unidades.features, plan.trazos.unidad),
    ...trazar(plan.intermedios.features, plan.trazos.intermedio),
    ...trazar(plan.contorno.features, plan.trazos.contorno),
  ];

  const contenido = {
    agua,
    paises: capaPaises,
    exterior,
    coropleta,
    territorio: [],
    limites,
    grilla: [grilla],
    rotulos: [rotulos],
    simbolos: [simbolos],
    recuadros: [recuadros],
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
