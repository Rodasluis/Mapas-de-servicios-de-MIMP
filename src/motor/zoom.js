/**
 * Recuadros de zoom: el mismo mapa, ampliado donde hace falta.
 *
 * Dos decisiones gobiernan este módulo.
 *
 * QUÉ SE AMPLÍA. En modo automático no hay una lista de «amplía Lima y Cusco»: el
 * motor mide, provincia a provincia, qué fracción del grupo de íconos pisa la del
 * vecino (servicios.js → medirApinamiento), agrupa las que pasan del umbral y las
 * amplía. El criterio vale para cualquier hoja y cualquier filtro: al dejar un solo
 * tipo activo los símbolos dejan de estorbarse y los recuadros desaparecen solos. En
 * modo manual se eligen las provincias a mano y el motor avisa si la selección abarca
 * demasiado para que ampliarla signifique algo.
 *
 * CUÁNTO MIDE Y DÓNDE VA. No se colocan en anclajes con un tamaño fijo: cada recuadro
 * le pregunta a la rejilla de ocupación por el MAYOR HUECO LIBRE CON SU PROPORCIÓN.
 * De ahí salen dos cosas a la vez. El tamaño se adapta al formato —en A0 el Pacífico
 * deja una franja enorme y el recuadro crece, en A4 apenas cabe uno pequeño— y la
 * forma de la zona decide la ubicación: una provincia alargada en vertical encaja en
 * el mar, que es alto y estrecho, y una alargada en horizontal sobre Brasil, que es
 * ancho. Cuando ya no queda hueco se dejan de dibujar, y ése es el máximo dinámico.
 *
 * Cada recuadro lleva su rectángulo de referencia en el mapa principal, con el mismo
 * número, porque un detalle ampliado sin decir de dónde sale no es un zoom: es otro
 * mapa suelto.
 */
import { geoBounds } from 'd3-geo';
import { crearProyeccion, crearRuta } from './proyeccion.js';
import { claseDe, repartirIconos } from './servicios.js';
import { dibujarIcono } from '../iconos/index.js';
import { mayorRectanguloLibre, rectangulo } from './ocupacion.js';
import { color, trazoMm, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, textoConHalo, rect } from './svg.js';

/** Más provincias que esto dentro de un recuadro y deja de ser una ampliación. */
export const LIMITE_PROVINCIAS = 22;

/** Por debajo de este lado el recuadro no aporta nada legible. */
export const LADO_MINIMO_MM = 34;

/**
 * Cuántos recuadros caben como mucho según el formato.
 *
 * Es un tope duro por encima del que no se intenta nada; el número REAL lo decide el
 * hueco libre, que es lo que se agota primero. A4 admite uno, A0 hasta cuatro.
 */
export function maximoPorFormato(factor) {
  return Math.max(1, Math.min(4, Math.round(factor * 1.15)));
}

/** Separación entre el recuadro y lo que lo rodea. */
const AIRE_MM = 2.5;

/**
 * Agrupa las provincias apiñadas en regiones contiguas.
 *
 * Lima y Callao se estorban la una a la otra y son vecinas: ampliarlas por separado
 * daría dos recuadros que muestran casi lo mismo. Se fusionan las que se tocan.
 */
export function agruparApinadas(grupos, umbral, margenMm, maxLadoMm = Infinity) {
  const seeds = grupos
    .filter((g) => g.apinamiento > umbral)
    .sort((a, b) => b.apinamiento - a.apinamiento);

  const conMargen = (g) => ({
    x: g.x - margenMm,
    y: g.y - margenMm,
    ancho: g.ancho + margenMm * 2,
    alto: g.alto + margenMm * 2,
  });

  const regiones = [];
  const usadas = new Set();
  for (const seed of seeds) {
    if (usadas.has(seed.ccpp)) continue;
    const region = { ...conMargen(seed), miembros: [seed], apinamiento: seed.apinamiento };
    usadas.add(seed.ccpp);

    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const otro of seeds) {
        if (usadas.has(otro.ccpp)) continue;
        const caja = conMargen(otro);
        if (!rectangulo.seSolapan(region, caja)) continue;
        const nx = Math.min(region.x, caja.x);
        const ny = Math.min(region.y, caja.y);
        const x1 = Math.max(region.x + region.ancho, caja.x + caja.ancho);
        const y1 = Math.max(region.y + region.alto, caja.y + caja.alto);
        /* La región no puede crecer sin límite. En una hoja pequeña casi todas las
           provincias se estorban, y sin este tope la fusión encadenaba el país entero
           en un solo «zoom» de 196 provincias: es decir, el mismo mapa otra vez. */
        if (x1 - nx > maxLadoMm || y1 - ny > maxLadoMm) continue;
        region.x = nx; region.y = ny;
        region.ancho = x1 - nx; region.alto = y1 - ny;
        region.miembros.push(otro);
        region.apinamiento = Math.max(region.apinamiento, otro.apinamiento);
        usadas.add(otro.ccpp);
        crecio = true;
      }
    }
    regiones.push(region);
  }

  /* Por gravedad y, a igualdad, por número de provincias implicadas: un apiñamiento
     del 100 % en una provincia suelta importa menos que uno del 80 % en una
     conurbación entera. */
  return regiones.sort(
    (a, b) => b.apinamiento - a.apinamiento || b.miembros.length - a.miembros.length,
  );
}

/**
 * Regiones a partir de una selección manual.
 *
 * Admite ubigeos de provincia (cuatro dígitos) o de departamento (dos). Las
 * seleccionadas que se tocan se fusionan en un solo recuadro, igual que en automático.
 */
function regionesManuales(seleccion, provincias, anillos, margenMm) {
  const pedidas = new Set(seleccion.map(String));
  const coincide = (ubigeo) => pedidas.has(ubigeo) || pedidas.has(ubigeo.slice(0, 2));

  const cajas = provincias.features
    .filter((f) => coincide(f.properties.ubigeo))
    .map((f) => {
      const c = cajaDe(anillos.get(f));
      return c && {
        ccpp: f.properties.ubigeo,
        nombre: f.properties.nombre,
        x: c.x,
        y: c.y,
        ancho: c.ancho,
        alto: c.alto,
        apinamiento: 1,
      };
    })
    .filter(Boolean);

  return agruparApinadas(cajas, 0, margenMm);
}

/**
 * Construye los recuadros de zoom, ya dimensionados y colocados.
 *
 * @returns {{colocados, referencias, regiones, avisos, capacidad}}
 */
export function construirRecuadros({
  modo = 'auto', seleccion = [], grupos, umbral, provincias, anillos, agregado,
  clases, rampa, iconos, medidor, factor, tamanoIcono, marco, ocupacion, maximo,
}) {
  const tope = maximo ?? maximoPorFormato(factor);
  const vacio = {
    colocados: [],
    referencias: '',
    regiones: [],
    avisos: [],
    capacidad: { tope, colocados: 0, cabeOtro: false },
  };
  if (modo === 'ninguno') return vacio;

  const margen = tamanoIcono * 0.8;
  const maxLadoRegion = Math.min(marco.ancho, marco.alto) * 0.28;
  const candidatas = modo === 'manual'
    ? regionesManuales(seleccion, provincias, anillos, margen)
    : agruparApinadas(grupos, umbral, margen, maxLadoRegion);
  if (!candidatas.length) return vacio;

  const eTitulo = { familia: 'Poppins', variante: 'SemiBold', pt: 7 * Math.sqrt(factor) };
  const eCifra = { familia: 'SourceSans3', variante: 'Semibold', pt: 5.2 * Math.sqrt(factor) };
  const altoCifra = medidor.alto(eCifra) * 0.95;
  const cabecera = medidor.alto(eTitulo) * 1.5;
  const borde = trazoMm.recuadroZoom;

  /* Tope por recuadro para que el primero no se quede con todo el hueco libre. */
  const ladoMaximo = Math.min(marco.ancho, marco.alto) * 0.48;

  const colocados = [];
  const referencias = [];
  const resumen = [];
  const avisos = [];

  for (const region of candidatas) {
    if (colocados.length >= tope) {
      avisos.push(`Quedaron ${candidatas.length - colocados.length} zona(s) sin ampliar:`
        + ` en esta hoja caben ${tope} recuadro(s).`);
      break;
    }

    /* Los miembros son las provincias que tocan el rectángulo de la región, para que
       el detalle no salga flotando sin contexto. */
    const porCaja = provincias.features.filter((f) => {
      const caja = cajaDe(anillos.get(f));
      return caja && rectangulo.seSolapan(region, caja);
    });

    /* En modo manual, si ese contexto se desborda, se recorta a lo que el usuario
       pidió. Seleccionar un departamento entero arrastraba por caja a sus vecinos
       —Áncash acababa en 43 provincias y saltaba el aviso—, cuando lo que se ha
       pedido es, precisamente, ese departamento. */
    const pedidas = new Set(region.miembros.map((m) => m.ccpp));
    const miembros = modo === 'manual' && porCaja.length > LIMITE_PROVINCIAS
      ? porCaja.filter((f) => pedidas.has(f.properties.ubigeo))
      : porCaja;

    if (!miembros.length) continue;
    if (miembros.length > LIMITE_PROVINCIAS) {
      avisos.push(`La zona de ${nombresDe(region)} abarca ${miembros.length} provincias:`
        + ' es demasiado grande para que ampliarla signifique algo.'
        + ' Usa una hoja mayor o selecciona una zona más pequeña.');
      continue;
    }

    const sub = { type: 'FeatureCollection', features: miembros };
    const [[lon0, lat0], [lon1, lat1]] = geoBounds(sub);
    const proporcionZona = Math.abs((lon1 - lon0) * Math.cos(((lat0 + lat1) / 2) * (Math.PI / 180)))
      / Math.max(1e-6, Math.abs(lat1 - lat0));

    /* Se pregunta por el hueco con la proporción del RECUADRO COMPLETO —cabecera y
       bordes incluidos—, no con la de la zona: es la caja que de verdad hay que
       encajar, y con zonas pequeñas la cabecera pesa lo suyo.

       La proporción de la caja depende de su altura (la cabecera es fija y pesa más
       cuanto menor sea el recuadro), y la altura depende del hueco que se encuentre:
       es circular. Se resuelve con dos pasadas —una con una altura de tanteo y otra
       con la que devolvió la primera—, que basta para que el mapa llene la caja en
       vez de quedarse con franjas vacías arriba y abajo. */
    const aspectoDe = (alturaMapa) => (alturaMapa * proporcionZona + borde * 2)
      / (alturaMapa + cabecera + borde * 2);

    let hueco = null;
    let alturaMapa = Math.max(LADO_MINIMO_MM, LADO_MINIMO_MM / Math.max(0.3, proporcionZona));
    for (let pasada = 0; pasada < 2; pasada++) {
      const encontrado = mayorRectanguloLibre(ocupacion, {
        aspecto: aspectoDe(alturaMapa),
        region: marco,
        minLadoMm: LADO_MINIMO_MM,
        maxLadoMm: ladoMaximo,
      });
      if (!encontrado) break;
      hueco = encontrado;
      alturaMapa = encontrado.alto - AIRE_MM - cabecera - borde * 2;
      if (alturaMapa <= 0) { hueco = null; break; }
    }
    if (!hueco) {
      avisos.push(`No queda hueco libre para ampliar ${nombresDe(region)}`
        + ' sin tapar territorio peruano.');
      continue;
    }

    const ancho = hueco.ancho - AIRE_MM;
    const alto = hueco.alto - AIRE_MM;
    const anchoMapa = ancho - borde * 2;
    const altoMapa = alto - cabecera - borde * 2;
    if (anchoMapa <= 0 || altoMapa <= 0) continue;

    const etiqueta = `Zoom ${colocados.length + 1}`;
    const x = hueco.x + AIRE_MM / 2;
    const y = hueco.y + AIRE_MM / 2;

    colocados.push({
      nombre: `zoom${colocados.length + 1}`,
      x,
      y,
      ancho,
      alto,
      svg: dibujarRecuadro({
        x,
        y,
        ancho,
        alto,
        anchoMapa,
        altoMapa,
        cabecera,
        borde,
        etiqueta,
        sub,
        miembros,
        agregado,
        clases,
        rampa,
        iconos,
        tamanoIcono,
        altoCifra,
        eTitulo,
        eCifra,
        medidor,
        factor,
      }),
    });
    ocupacion.marcarBloque(rectangulo.expandir({ x, y, ancho, alto }, AIRE_MM / 2));

    referencias.push(grupo({}, [
      rect(region, {
        fill: 'none', stroke: color.mimpRojo, 'stroke-width': trazoMm.recuadroZoom * 0.7,
      }),
      texto(etiqueta, {
        x: region.x,
        y: region.y - medidor.alto(eTitulo) * 0.25,
        fill: color.mimpRojo,
        'font-family': eTitulo.familia,
        'font-size': ptAmm(eTitulo.pt * 0.8),
        'font-weight': 600,
      }),
    ]));

    resumen.push({
      etiqueta,
      provincias: miembros.length,
      anchoMm: Number(ancho.toFixed(1)),
      altoMm: Number(alto.toFixed(1)),
      apinamientoPct: Number((region.apinamiento * 100).toFixed(0)),
      motivo: region.miembros.map((m) => m.nombre).slice(0, 4),
    });
  }

  /* ¿Cabría uno más? Es lo que la interfaz necesita para decir cuántos se pueden
     pedir en esta hoja, en vez de ofrecer un número fijo que a veces no se cumple. */
  const cabeOtro = colocados.length < tope && Boolean(mayorRectanguloLibre(ocupacion, {
    aspecto: 1,
    region: marco,
    minLadoMm: LADO_MINIMO_MM,
    maxLadoMm: ladoMaximo,
  }));

  return {
    colocados,
    referencias: referencias.join('\n'),
    regiones: resumen,
    avisos,
    capacidad: { tope, colocados: colocados.length, cabeOtro },
  };
}

const nombresDe = (region) => region.miembros.map((m) => m.nombre).slice(0, 3).join(', ');

/** Dibuja un recuadro ya dimensionado. */
function dibujarRecuadro({
  x, y, ancho, alto, anchoMapa, altoMapa, cabecera, borde, etiqueta,
  sub, miembros, agregado, clases, rampa, iconos, tamanoIcono, altoCifra,
  eTitulo, eCifra, medidor, factor,
}) {
  const marcoInterno = { x: x + borde, y: y + cabecera, ancho: anchoMapa, alto: altoMapa };
  const proy = crearProyeccion(sub, marcoInterno, 1.2);
  const ruta = crearRuta(proy);
  const idRecorte = `recorte-${etiqueta.replace(/\s+/g, '-').toLowerCase()}`;

  const relleno = miembros.map((f) => {
    const datos = agregado.porProvincia.get(f.properties.ubigeo);
    const clase = claseDe(datos ? datos.tiposDistintos : 0, clases);
    return el('path', { d: ruta(f.geometry), fill: clase >= 0 ? rampa[clase] : color.sinDato });
  });
  const limites = miembros.map((f) => el('path', {
    d: ruta(f.geometry),
    fill: 'none',
    stroke: color.limiteProvincial,
    'stroke-width': trazoMm.limiteProvincial,
    'stroke-linejoin': 'round',
  }));

  const simbolos = [];
  for (const f of miembros) {
    const datos = agregado.porProvincia.get(f.properties.ubigeo);
    if (!datos) continue;
    const [[lon0, lat0], [lon1, lat1]] = geoBounds(f);
    const centro = proy([(lon0 + lon1) / 2, (lat0 + lat1) / 2]);
    if (!centro) continue;
    const tipos = [...datos.tipos.keys()].sort(
      (a, b) => agregado.porTipo.get(b) - agregado.porTipo.get(a) || a.localeCompare(b, 'es'),
    );
    const { posiciones } = repartirIconos(
      tipos.length, { x: centro[0], y: centro[1] }, tamanoIcono, altoCifra,
    );
    tipos.forEach((tipo, i) => {
      simbolos.push(dibujarIcono({
        tipo,
        x: posiciones[i].x,
        y: posiciones[i].y,
        tamanoMm: tamanoIcono,
        color: iconos.tipos[tipo]?.color || color.tintaSuave,
      }));
      simbolos.push(textoConHalo(String(datos.tipos.get(tipo)), {
        x: posiciones[i].x,
        y: posiciones[i].y + altoCifra * 0.82,
        'text-anchor': 'middle',
        fill: color.tinta,
        'font-family': eCifra.familia,
        'font-size': ptAmm(eCifra.pt),
        'font-weight': 600,
      }, { colorHalo: color.halo, grosorMm: trazoMm.haloRotulo * factor * 0.7 }));
    });
  }

  return grupo({ id: `bloque-${etiqueta.replace(/\s+/g, '-').toLowerCase()}` }, [
    el('defs', {}, el('clipPath', { id: idRecorte }, rect(marcoInterno))),
    rect({ x, y, ancho, alto }, {
      fill: color.fondoHoja, stroke: color.mimpRojo, 'stroke-width': borde,
    }),
    texto(etiqueta, {
      x: x + borde + 1,
      y: y + medidor.ascenso(eTitulo) + borde,
      fill: color.mimpRojo,
      'font-family': eTitulo.familia,
      'font-size': ptAmm(eTitulo.pt),
      'font-weight': 600,
    }),
    grupo({ 'clip-path': `url(#${idRecorte})` }, [
      rect(marcoInterno, { fill: color.oceano }),
      ...relleno, ...limites, ...simbolos,
    ]),
    rect(marcoInterno, {
      fill: 'none', stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
    }),
  ]);
}

/** Caja envolvente de unos anillos ya proyectados. */
function cajaDe(anillosRasgo) {
  if (!anillosRasgo || !anillosRasgo.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const anillo of anillosRasgo) {
    for (const [x, y] of anillo) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, ancho: maxX - minX, alto: maxY - minY } : null;
}
