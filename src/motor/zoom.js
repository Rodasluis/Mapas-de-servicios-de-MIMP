/**
 * Recuadros de zoom: el mismo mapa, ampliado donde los símbolos no caben.
 *
 * No se fijan a mano «Lima» y «Cusco». El motor ya mide, provincia a provincia, qué
 * fracción del grupo de íconos pisa la del vecino (servicios.js → medirApinamiento);
 * lo que hace este módulo es agrupar las que pasan del umbral y ampliarlas. Así el
 * criterio vale para cualquier hoja y cualquier filtro: al dejar un solo tipo activo
 * los símbolos dejan de estorbarse y los recuadros desaparecen solos, sin tener que
 * acordarse de quitarlos.
 *
 * Cada recuadro lleva su rectángulo de referencia en el mapa principal, con el mismo
 * número, porque un detalle ampliado sin decir de dónde sale no es un zoom: es otro
 * mapa suelto.
 */
import { geoBounds } from 'd3-geo';
import { crearProyeccion, crearRuta } from './proyeccion.js';
import { claseDe, repartirIconos } from './servicios.js';
import { dibujarIcono } from '../iconos/index.js';
import { color, trazoMm, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, textoConHalo, rect, num } from './svg.js';

/** Cuántos recuadros como mucho: más de dos y el mapa principal se queda sin sitio. */
export const MAXIMO_RECUADROS = 2;

/** Más provincias que esto dentro de un recuadro y deja de ser una ampliación. */
export const LIMITE_PROVINCIAS = 22;

/** Lado objetivo del recuadro, en milímetros, antes de ajustarlo a la proporción. */
const LADO_OBJETIVO_MM = 46;

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

  const regiones = [];
  const usadas = new Set();
  for (const seed of seeds) {
    if (usadas.has(seed.ccpp)) continue;
    const region = {
      x: seed.x - margenMm,
      y: seed.y - margenMm,
      ancho: seed.ancho + margenMm * 2,
      alto: seed.alto + margenMm * 2,
      miembros: [seed],
      apinamiento: seed.apinamiento,
    };
    usadas.add(seed.ccpp);

    let creció = true;
    while (creció) {
      creció = false;
      for (const otro of seeds) {
        if (usadas.has(otro.ccpp)) continue;
        if (!seSolapan(region, { ...otro, x: otro.x - margenMm, y: otro.y - margenMm, ancho: otro.ancho + margenMm * 2, alto: otro.alto + margenMm * 2 })) continue;
        const nx = Math.min(region.x, otro.x - margenMm);
        const ny = Math.min(region.y, otro.y - margenMm);
        const x1 = Math.max(region.x + region.ancho, otro.x + otro.ancho + margenMm);
        const y1 = Math.max(region.y + region.alto, otro.y + otro.alto + margenMm);
        /* La región no puede crecer sin límite. En una hoja pequeña casi todas las
           provincias se estorban, y sin este tope la fusión encadenaba el país entero
           en un solo «zoom» de 196 provincias: es decir, el mismo mapa otra vez. */
        if (x1 - nx > maxLadoMm || y1 - ny > maxLadoMm) continue;
        region.x = nx;
        region.y = ny;
        region.ancho = x1 - region.x;
        region.alto = y1 - region.y;
        region.miembros.push(otro);
        region.apinamiento = Math.max(region.apinamiento, otro.apinamiento);
        usadas.add(otro.ccpp);
        creció = true;
      }
    }
    regiones.push(region);
  }

  /* Se ordenan por gravedad y, a igualdad, por número de provincias implicadas: un
     apiñamiento del 100 % en una provincia suelta importa menos que uno del 80 % en
     una conurbación entera. */
  return regiones.sort(
    (a, b) => b.apinamiento - a.apinamiento || b.miembros.length - a.miembros.length,
  );
}

const seSolapan = (a, b) => !(a.x + a.ancho <= b.x || b.x + b.ancho <= a.x
  || a.y + a.alto <= b.y || b.y + b.alto <= a.y);

/**
 * Construye los recuadros de zoom.
 *
 * @returns {{piezas: Array, referencias: string, regiones: Array}}
 */
export function construirRecuadros({
  grupos, umbral, provincias, anillos, agregado, clases, rampa, iconos,
  medidor, factor, tamanoIcono, marco, maximo = MAXIMO_RECUADROS,
}) {
  const maxLado = Math.min(marco.ancho, marco.alto) * 0.28;
  const regiones = agruparApinadas(grupos, umbral, tamanoIcono * 0.8, maxLado).slice(0, maximo);
  if (!regiones.length) return { piezas: [], referencias: '', regiones: [], descartados: 0 };
  let descartados = 0;

  const eNumero = { familia: 'Poppins', variante: 'SemiBold', pt: 7 * Math.sqrt(factor) };
  const eCifra = { familia: 'SourceSans3', variante: 'Semibold', pt: 5.2 * Math.sqrt(factor) };
  const altoCifra = medidor.alto(eCifra) * 0.95;

  const piezas = [];
  const referencias = [];
  const resumen = [];

  /* Primero se decide QUÉ regiones valen y sólo después se numeran: descartar una a
     medio camino dejaba un mapa con «Zoom 2» y sin «Zoom 1». */
  const validas = [];
  for (const region of regiones) {
    /* Provincias que entran en el recuadro: las que se estorban y las que tocan su
       rectángulo, para que el detalle no salga flotando sin contexto. */
    const miembros = provincias.features.filter((f) => {
      const caja = cajaDe(anillos.get(f));
      return caja && seSolapan(region, caja);
    });
    if (!miembros.length) continue;
    /* Un recuadro con medio país dentro no amplía nada. Si la zona apiñada es tan
       grande, el problema no se arregla con un zoom sino con una hoja mayor, y eso lo
       dice el informe. */
    if (miembros.length > LIMITE_PROVINCIAS) { descartados++; continue; }
    validas.push({ region, miembros });
  }

  validas.forEach(({ region, miembros }, indice) => {
    const sub = { type: 'FeatureCollection', features: miembros };
    const [[lon0, lat0], [lon1, lat1]] = geoBounds(sub);
    const proporcion = Math.abs((lon1 - lon0) * Math.cos((lat0 + lat1) / 2 * Math.PI / 180))
      / Math.max(1e-6, Math.abs(lat1 - lat0));
    const lado = LADO_OBJETIVO_MM * Math.sqrt(factor);
    const anchoMapa = proporcion >= 1 ? lado : lado * Math.max(0.55, proporcion);
    const altoMapa = proporcion >= 1 ? lado / Math.max(1, proporcion) : lado;

    const eTitulo = eNumero;
    const cabecera = medidor.alto(eTitulo) * 1.5;
    const borde = trazoMm.recuadroZoom;
    const ancho = anchoMapa + borde * 2;
    const alto = altoMapa + cabecera + borde * 2;
    const etiqueta = `Zoom ${indice + 1}`;

    piezas.push({
      nombre: `zoom${indice + 1}`,
      ancho,
      alto,
      dibujar(x, y) {
        const marcoInterno = {
          x: x + borde, y: y + cabecera, ancho: anchoMapa, alto: altoMapa,
        };
        const proy = crearProyeccion(sub, marcoInterno, 1.2);
        const ruta = crearRuta(proy);
        const idRecorte = `recorte-${etiqueta.replace(/\s+/g, '-').toLowerCase()}`;

        const relleno = miembros.map((f) => {
          const datos = agregado.porProvincia.get(f.properties.ubigeo);
          const clase = claseDe(datos ? datos.tiposDistintos : 0, clases);
          return el('path', {
            d: ruta(f.geometry), fill: clase >= 0 ? rampa[clase] : color.sinDato,
          });
        });
        const limites = miembros.map((f) => el('path', {
          d: ruta(f.geometry), fill: 'none', stroke: color.limiteProvincial,
          'stroke-width': trazoMm.limiteProvincial, 'stroke-linejoin': 'round',
        }));

        const simbolos = [];
        for (const f of miembros) {
          const datos = agregado.porProvincia.get(f.properties.ubigeo);
          if (!datos) continue;
          const centro = proy(centroDe(f));
          if (!centro) continue;
          const tipos = [...datos.tipos.keys()].sort(
            (a, b) => agregado.porTipo.get(b) - agregado.porTipo.get(a) || a.localeCompare(b, 'es'),
          );
          const { posiciones } = repartirIconos(
            tipos.length, { x: centro[0], y: centro[1] }, tamanoIcono, altoCifra,
          );
          tipos.forEach((tipo, i) => {
            simbolos.push(dibujarIcono({
              tipo, x: posiciones[i].x, y: posiciones[i].y, tamanoMm: tamanoIcono,
              color: iconos.tipos[tipo]?.color || color.tintaSuave,
            }));
            simbolos.push(textoConHalo(String(datos.tipos.get(tipo)), {
              x: posiciones[i].x, y: posiciones[i].y + altoCifra * 0.82,
              'text-anchor': 'middle', fill: color.tinta,
              'font-family': eCifra.familia, 'font-size': ptAmm(eCifra.pt), 'font-weight': 600,
            }, { colorHalo: color.halo, grosorMm: trazoMm.haloRotulo * factor * 0.7 }));
          });
        }

        return grupo({ id: `bloque-${etiqueta.replace(/\s+/g, '-').toLowerCase()}` }, [
          el('defs', {}, el('clipPath', { id: idRecorte }, rect(marcoInterno))),
          rect({ x, y, ancho, alto }, {
            fill: color.fondoHoja, stroke: color.mimpRojo, 'stroke-width': borde,
          }),
          texto(etiqueta, {
            x: x + borde + 1, y: y + medidor.ascenso(eTitulo) + borde,
            fill: color.mimpRojo, 'font-family': eTitulo.familia,
            'font-size': ptAmm(eTitulo.pt), 'font-weight': 600,
          }),
          grupo({ 'clip-path': `url(#${idRecorte})` }, [
            rect(marcoInterno, { fill: color.oceano }),
            ...relleno, ...limites, ...simbolos,
          ]),
          rect(marcoInterno, {
            fill: 'none', stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
          }),
        ]);
      },
    });

    referencias.push(grupo({}, [
      rect(region, {
        fill: 'none', stroke: color.mimpRojo, 'stroke-width': trazoMm.recuadroZoom * 0.7,
      }),
      texto(etiqueta, {
        x: region.x, y: region.y - medidor.alto(eNumero) * 0.25,
        fill: color.mimpRojo, 'font-family': eNumero.familia,
        'font-size': ptAmm(eNumero.pt * 0.8), 'font-weight': 600,
      }),
    ]));

    resumen.push({
      etiqueta,
      provincias: miembros.length,
      apinamientoPct: Number((region.apinamiento * 100).toFixed(0)),
      motivo: region.miembros.map((m) => m.nombre).slice(0, 4),
    });
  });

  return { piezas, referencias: referencias.join('\n'), regiones: resumen };
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

/** Punto interior aproximado de un rasgo, en lon/lat, para anclar su grupo de íconos. */
function centroDe(f) {
  const [[lon0, lat0], [lon1, lat1]] = geoBounds(f);
  return [(lon0 + lon1) / 2, (lat0 + lat1) / 2];
}
