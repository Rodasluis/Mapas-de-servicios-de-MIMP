/**
 * Rótulos del propio mapa: países vecinos, océano y lagos.
 *
 * Son los pocos rótulos que la Fase 2 necesita. El motor general —con jerarquía de
 * prioridades, posiciones candidatas y detección de colisiones contra todo lo demás—
 * llega en la Fase 4; aquí se resuelve lo justo, pero ya con medidas reales de la
 * tipografía y apoyándose en la rejilla de ocupación, de modo que estos rótulos
 * participen después en el mismo reparto de sitio que los del país.
 */
import { color, trazoMm, tipografia, ptAmm } from '../estilo/tokens.js';
import { el, grupo, texto, textoConHalo, num, escapar } from './svg.js';
import { poloDeInaccesibilidad, puntoEnAnillos, rectangulo } from './ocupacion.js';

/**
 * Texto con las letras separadas, al modo de los rótulos de mar.
 *
 * svg2pdf no interpreta `letter-spacing`, así que un rótulo espaciado escrito de la
 * forma habitual saldría junto en el PDF y espaciado en pantalla. Se coloca cada letra
 * en su sitio con las métricas reales de la fuente: más verboso, pero sale igual en
 * los dos medios, que es la regla de este proyecto.
 */
export function textoEspaciado(cadena, {
  x, y, estilo, medidor, espaciadoEm = 0.35, anclaje = 'middle', atributos = {},
}) {
  const letras = [...String(cadena)];
  const cuerpoMm = ptAmm(estilo.pt);
  const anchos = letras.map((c) => medidor.ancho(c, estilo));
  const separacion = espaciadoEm * cuerpoMm;
  const total = anchos.reduce((s, a) => s + a, 0) + separacion * (letras.length - 1);

  let cursor = anclaje === 'middle' ? x - total / 2 : anclaje === 'end' ? x - total : x;
  const piezas = [];
  letras.forEach((c, i) => {
    if (c !== ' ') {
      piezas.push(`<text x="${num(cursor)}" y="${num(y)}">${escapar(c)}</text>`);
    }
    cursor += anchos[i] + separacion;
  });

  return {
    ancho: total,
    svg: grupo({
      'font-family': estilo.familia,
      'font-size': num(cuerpoMm),
      ...atributos,
    }, piezas),
  };
}

/**
 * Caja envolvente de unos anillos, recortada al marco.
 *
 * Buscar el polo de inaccesibilidad sobre la hoja entera cuesta una rejilla de cientos
 * de miles de celdas por rasgo, y en A0 eso se notaba en segundos de composición. El
 * polo de Ecuador sólo puede estar dentro de Ecuador, así que se busca en su caja.
 */
function cajaDeAnillos(anillos, marco) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const anillo of anillos) {
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

/**
 * Posiciones que se prueban para un rótulo de país, de la mejor a la peor.
 *
 * El polo de inaccesibilidad es el mejor sitio, pero no el único: cuando la cabecera o
 * un recuadro de zoom ya ocupan ese hueco, el rótulo tiene que buscarse la vida sin
 * salirse de su país. Todas las posiciones que se ofrecen tienen el punto DENTRO de los
 * anillos del país; quien llama comprueba además que la caja del texto quepa en el
 * marco, no pise un bloque y no toque territorio peruano.
 */
function* candidatos(polo, anillos, caja, alto) {
  yield [polo.x, polo.y];

  /* Rejilla sobre la parte VISIBLE del país. Antes se probaban tres anillos
     concéntricos alrededor del polo —diecinueve posiciones— y con un recuadro de zoom
     encima se agotaban sin encontrar sitio, de modo que un país tan grande como Brasil
     acababa sin nombre teniendo media lámina libre. El paso es el alto del rótulo, que
     es la distancia mínima con la que moverse cambia algo. */
  const paso = Math.max(alto, 4);
  const puntos = [];
  for (let y = caja.y + paso / 2; y < caja.y + caja.alto; y += paso) {
    for (let x = caja.x + paso / 2; x < caja.x + caja.ancho; x += paso) {
      if (!puntoEnAnillos(x, y, anillos)) continue;
      const dx = x - polo.x;
      const dy = y - polo.y;
      /* Se prefiere el desplazamiento VERTICAL. Cuando un recuadro ocupa el hueco de
         Brasil, moverse al oeste lleva hacia el Perú y moverse arriba o abajo sigue
         dentro de Brasil; penalizar lo horizontal hace que se prueben antes las
         posiciones que de verdad sirven. */
      puntos.push([x, y, Math.hypot(dx * 1.8, dy)]);
    }
  }
  puntos.sort((a, b) => a[2] - b[2]);
  for (const [x, y] of puntos) yield [x, y];
}

/** Caja de un texto centrado en (x, y), para reservar sitio en la rejilla. */
function cajaDe(ancho, alto, x, y) {
  return { x: x - ancho / 2, y: y - alto * 0.75, ancho, alto };
}

/**
 * Rótulos de los países vecinos, el océano y los lagos.
 *
 * @returns {{svg: string, colocados: string[], omitidos: string[]}}
 */
export function rotulosDeContexto({
  contexto, anillosPorRasgo, marco, ocupacion, medidor, factor,
}) {
  const piezas = [];
  const colocados = [];
  const omitidos = [];
  /* Por qué se descartó cada rótulo. Sin esto, «BRASIL omitido» no distingue entre
     «no cabía» y «habría caído sobre el Perú», que piden arreglos distintos. */
  const motivos = {};
  const descartar = (nombre, porque) => { omitidos.push(nombre); motivos[nombre] = porque; };
  /* Las cajas se devuelven para sembrar con ellas el índice de colisiones de los
     rótulos del país: la rejilla de ocupación es demasiado gruesa para garantizar
     que no se tocan. */
  const cajas = [];

  const ePais = { familia: 'SourceSans3', variante: 'Bold', pt: tipografia.rotuloPais.pt * factor };
  const eAgua = { familia: 'SourceSans3', variante: 'It', pt: tipografia.rotuloAgua.pt * factor };

  /* ------------------------------ países ------------------------------- */
  for (const f of contexto.features) {
    if (f.properties.capa !== 'pais' || !f.properties.rotular) continue;
    const nombre = f.properties.nombre.toUpperCase();
    const anillos = anillosPorRasgo.get(f);
    if (!anillos || !anillos.length) { descartar(nombre, 'sin geometría visible'); continue; }

    const caja = cajaDeAnillos(anillos, marco);
    const polo = caja && poloDeInaccesibilidad(anillos, caja, 2);
    if (!polo) { descartar(nombre, 'sin punto interior'); continue; }

    const ancho = medidor.ancho(nombre, ePais);
    const alto = medidor.alto(ePais);
    /* Si el nombre no cabe en el trozo de país que se ve, es preferible omitirlo a
       que se derrame sobre el Perú o sobre el mar. */
    if (polo.radioMm * 2 < Math.min(ancho, alto * 2) * 0.55) {
      descartar(nombre, `el trozo visible es menor que el nombre (radio ${polo.radioMm.toFixed(1)} mm, ancho ${ancho.toFixed(1)} mm)`);
      continue;
    }

    let sitioPais = null;
    const fallos = { marco: 0, bloque: 0, territorio: 0, probados: 0 };
    for (const [cx, cy] of candidatos(polo, anillos, caja, alto)) {
      fallos.probados++;
      const c = cajaDe(ancho, alto, cx, cy);
      if (!rectangulo.contiene(marco, c)) { fallos.marco++; continue; }
      if (ocupacion.chocaConBloque(c)) { fallos.bloque++; continue; }
      /* Ni un milímetro del nombre puede caer sobre el Perú. Comprobar sólo el punto
         de anclaje no basta: «BRASIL» mide unos treinta milímetros en A1, así que un
         ancla a dos milímetros de la frontera deja media palabra sobre territorio
         peruano, y un mapa que rotula el Perú como BRASIL dice algo falso. Es
         preferible omitir el nombre —el país sigue reconociéndose por su posición—
         antes que rotular mal. */
      if (ocupacion.sobreTerritorio(c) > 0) { fallos.territorio++; continue; }
      sitioPais = { x: cx, y: cy, caja: c };
      break;
    }
    if (!sitioPais) {
      descartar(nombre, `${fallos.probados} posiciones probadas:`
        + ` ${fallos.marco} fuera del marco, ${fallos.bloque} sobre un bloque,`
        + ` ${fallos.territorio} sobre el Perú`);
      continue;
    }

    piezas.push(textoConHalo(nombre, {
      x: sitioPais.x, y: sitioPais.y, 'text-anchor': 'middle', fill: color.tintaSuave,
      'font-family': ePais.familia, 'font-size': ptAmm(ePais.pt), 'font-weight': 700,
    }, { colorHalo: color.halo, grosorMm: trazoMm.haloRotulo * factor * 0.8 }));
    ocupacion.marcarBloque(sitioPais.caja);
    cajas.push({ ...sitioPais.caja, etiqueta: nombre, nivel: 'pais' });
    colocados.push(nombre);
  }

  /* ------------------------------ océano ------------------------------- */
  const nombreMar = 'OCÉANO PACÍFICO';
  const medida = textoEspaciado(nombreMar, { x: 0, y: 0, estilo: eAgua, medidor });
  const altoMar = medidor.alto(eAgua);
  const sitio = buscarHuecoDeAgua(marco, ocupacion, medida.ancho, altoMar);
  if (sitio) {
    /* Cada letra lleva su propia x, así que el anclaje lo resuelve textoEspaciado y
       no un atributo: con 'middle' por omisión el rótulo se corría media anchura a la
       izquierda y el marco se comía el principio. */
    const { svg } = textoEspaciado(nombreMar, {
      x: sitio.x, y: sitio.y, estilo: eAgua, medidor, anclaje: 'start',
      atributos: { fill: color.oceanoRotulo, id: 'rotulo-oceano' },
    });
    piezas.push(svg);
    const cajaMar = cajaDe(medida.ancho, altoMar, sitio.x, sitio.y);
    ocupacion.marcarBloque(cajaMar);
    cajas.push({ ...cajaMar, etiqueta: nombreMar, nivel: 'agua' });
    colocados.push(nombreMar);
  } else {
    descartar(nombreMar, 'sin agua libre del tamaño del rótulo');
  }

  /* ------------------------------- lagos -------------------------------- */
  for (const f of contexto.features) {
    if (f.properties.capa !== 'lago') continue;
    const anillos = anillosPorRasgo.get(f);
    if (!anillos || !anillos.length) continue;
    const cajaLago = cajaDeAnillos(anillos, marco);
    const polo = cajaLago && poloDeInaccesibilidad(anillos, cajaLago, 1);
    // Un lago que en papel mide menos que su nombre no se rotula dentro.
    if (!polo || polo.radioMm < 1.2 * factor) { omitidos.push(f.properties.nombre); continue; }
    const nombre = f.properties.nombre.toUpperCase();
    const estiloLago = { ...eAgua, pt: eAgua.pt * 0.72 };
    const { svg, ancho } = textoEspaciado(nombre, {
      x: polo.x, y: polo.y, estilo: estiloLago, medidor, espaciadoEm: 0.18,
      atributos: { fill: color.oceanoRotulo },
    });
    const caja = cajaDe(ancho, medidor.alto(estiloLago), polo.x, polo.y);
    /* El nombre tiene que caber DENTRO del lago. Titicaca en un A4 nacional mide unos
       pocos milímetros y su rótulo se derramaría sobre Bolivia. */
    if (polo.radioMm * 2 < ancho * 0.75
      || !rectangulo.contiene(marco, caja)
      || ocupacion.chocaConBloque(caja)) {
      omitidos.push(nombre);
      continue;
    }
    piezas.push(svg);
    ocupacion.marcarBloque(caja);
    colocados.push(nombre);
  }

  return { svg: piezas.join('\n'), colocados, omitidos, motivos };
}

/**
 * Busca sitio para el rótulo del mar: agua libre, sin tierra ni bloques debajo.
 *
 * Se recorre de izquierda a derecha y desde la mitad de la altura hacia los extremos,
 * porque el Pacífico queda al oeste y un rótulo a media altura es el que mejor se lee.
 */
function buscarHuecoDeAgua(marco, ocupacion, ancho, alto) {
  const paso = Math.max(4, Math.min(marco.ancho, marco.alto) / 28);
  const alturas = [];
  for (let d = 0; d <= marco.alto / 2; d += paso) {
    alturas.push(marco.y + marco.alto / 2 - d);
    if (d > 0) alturas.push(marco.y + marco.alto / 2 + d);
  }
  for (const x of rango(marco.x + paso, marco.x + marco.ancho - ancho - paso, paso)) {
    for (const y of alturas) {
      const caja = { x, y: y - alto * 0.75, ancho, alto };
      if (!rectangulo.contiene(marco, caja)) continue;
      if (ocupacion.sobreTierra(caja) > 0) continue;
      if (ocupacion.chocaConBloque(rectangulo.expandir(caja, 1))) continue;
      return { x, y };
    }
  }
  return null;
}

function rango(desde, hasta, paso) {
  const out = [];
  for (let v = desde; v <= hasta; v += paso) out.push(v);
  return out;
}

/** Dibuja la retícula UTM con sus rótulos en los cuatro bordes. */
export function dibujarGrilla({ grilla, marco, medidor, factor, banda }) {
  if (!grilla.lineas.length) return { svg: '', rotulos: 0 };

  const eCifra = { familia: 'SourceSans3', variante: 'Regular', pt: tipografia.grilla.pt * factor };
  const lineas = [];
  const marcas = [];
  const rotulos = [];
  const puestos = new Set();

  for (const linea of grilla.lineas) {
    for (const tramo of linea.puntos) {
      lineas.push(el('path', {
        d: `M${tramo.map((p) => `${num(p[0])} ${num(p[1])}`).join('L')}`,
        fill: 'none', stroke: color.grilla, 'stroke-width': trazoMm.grilla,
        'stroke-dasharray': `${num(1.2)} ${num(1.8)}`,
      }));
    }

    for (const { borde, p } of linea.extremos || []) {
      /* Una línea puede tocar el mismo borde dos veces si el marco la corta en
         diagonal; se rotula una sola vez por borde. */
      const clave = `${linea.eje}:${linea.valor}:${borde}`;
      if (puestos.has(clave)) continue;
      puestos.add(clave);

      const largoMarca = 1.1 * factor;
      const fuera = {
        arriba: [0, -largoMarca], abajo: [0, largoMarca],
        izquierda: [-largoMarca, 0], derecha: [largoMarca, 0],
      }[borde];
      marcas.push(el('line', {
        x1: p[0], y1: p[1], x2: p[0] + fuera[0], y2: p[1] + fuera[1],
        stroke: color.marco, 'stroke-width': trazoMm.marcoInterior,
      }));

      const etiqueta = String(Math.round(linea.valor));
      const hueco = 0.7 * factor;
      const comun = {
        fill: color.tintaSuave, 'font-family': eCifra.familia,
        'font-size': ptAmm(eCifra.pt), 'text-anchor': 'middle',
      };
      if (borde === 'arriba' || borde === 'abajo') {
        rotulos.push(texto(etiqueta, {
          ...comun,
          x: p[0],
          y: borde === 'arriba'
            ? p[1] - largoMarca - hueco
            : p[1] + largoMarca + hueco + medidor.ascenso(eCifra) * 0.85,
        }));
      } else {
        /* En los costados el número va girado, como en el mapa de referencia: de otro
           modo obligaría a una banda lateral mucho más ancha. */
        const x = borde === 'izquierda' ? p[0] - largoMarca - hueco : p[0] + largoMarca + hueco;
        rotulos.push(el('text', {
          x, y: p[1], fill: color.tintaSuave, 'font-family': eCifra.familia,
          'font-size': ptAmm(eCifra.pt), 'text-anchor': 'middle',
          transform: `rotate(-90 ${num(x)} ${num(p[1])})`,
          dy: medidor.ascenso(eCifra) * 0.36,
        }, escapar(etiqueta)));
      }
    }
  }

  /* Las líneas van recortadas al marco; las marcas y los números, no: viven fuera de
     él, en la banda reservada, y el recorte se los comería. */
  return {
    svgLineas: grupo({ id: 'capa-grilla' }, lineas),
    svgMarcas: grupo({ id: 'capa-grilla-marcas' }, marcas.concat(rotulos)),
    rotulos: rotulos.length,
  };
}

/** Anchura que hay que reservar fuera del marco para los números de la retícula. */
export function bandaDeGrilla(medidor, factor) {
  const eCifra = { familia: 'SourceSans3', variante: 'Regular', pt: tipografia.grilla.pt * factor };
  const maximo = medidor.ancho('10000000', eCifra);
  return { arriba: medidor.alto(eCifra) + 2 * factor, lateral: maximo * 0.42 + 2.4 * factor };
}
