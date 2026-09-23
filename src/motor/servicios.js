/**
 * Capa temática: qué servicios hay y cómo se reparten.
 *
 * Aquí no se clasifica nada. El criterio de publicación lo aplica el buscador y este
 * módulo se limita a CONTAR lo que centros.json trae: cuántos centros de cada tipo
 * caen en cada provincia y cuántos tipos distintos tiene cada una. Si un tipo no está
 * en los datos, no existe para el mapa; si aparece uno nuevo, el conteo lo refleja y
 * la comprobación de cobertura de íconos avisa.
 */

/**
 * Clases del coropletas por número de TIPOS distintos, como el mapa de 2020.
 * Son el valor por defecto: la interfaz podrá cambiarlas (Fase 5).
 */
export const CLASES_POR_DEFECTO = [
  { desde: 1, hasta: 1, etiqueta: '1 servicio' },
  { desde: 2, hasta: 3, etiqueta: 'Entre 2 y 3 servicios' },
  { desde: 4, hasta: 6, etiqueta: 'Entre 4 y 6 servicios' },
  { desde: 7, hasta: 9, etiqueta: 'Entre 7 y 9 servicios' },
  { desde: 10, hasta: Infinity, etiqueta: '10 servicios o más' },
];

/**
 * Agrupa los centros por provincia.
 *
 * @param {object} centrosJson  el archivo completo del buscador
 * @param {Set<string>|null} tiposActivos  filtro; null es «todos»
 * @returns {{porProvincia: Map, porTipo: Map, total: number, tipos: string[]}}
 */
export function agregarPorProvincia(centrosJson, tiposActivos = null) {
  const porProvincia = new Map();
  const porTipo = new Map();
  let total = 0;

  for (const c of centrosJson.centros) {
    if (tiposActivos && !tiposActivos.has(c.tipo)) continue;
    total++;
    porTipo.set(c.tipo, (porTipo.get(c.tipo) || 0) + 1);

    let prov = porProvincia.get(c.ccpp);
    if (!prov) {
      prov = { ccpp: c.ccpp, tipos: new Map(), total: 0 };
      porProvincia.set(c.ccpp, prov);
    }
    prov.tipos.set(c.tipo, (prov.tipos.get(c.tipo) || 0) + 1);
    prov.total++;
  }

  for (const prov of porProvincia.values()) prov.tiposDistintos = prov.tipos.size;

  return {
    porProvincia,
    porTipo,
    total,
    // Orden estable: por frecuencia y, a igualdad, alfabético. La leyenda lo hereda.
    tipos: [...porTipo.keys()].sort(
      (a, b) => porTipo.get(b) - porTipo.get(a) || a.localeCompare(b, 'es'),
    ),
  };
}

/**
 * Índice de clase de un valor, o -1 si no tiene ninguna.
 * Las provincias sin ningún servicio quedan fuera de las clases y se dibujan en blanco,
 * como en el mapa de referencia: «sin dato» y «una unidad» no son lo mismo.
 */
export function claseDe(valor, clases = CLASES_POR_DEFECTO) {
  if (!(valor > 0)) return -1;
  for (let i = 0; i < clases.length; i++) {
    if (valor >= clases[i].desde && valor <= clases[i].hasta) return i;
  }
  return clases.length - 1;
}

/**
 * Clases realmente usadas, para que la leyenda no anuncie categorías vacías.
 * Se recalcula con el filtro de tipos activo: al dejar un solo tipo, ninguna provincia
 * llega a «10 o más» y esa entrada tiene que desaparecer de la leyenda.
 */
export function clasesUsadas(agregado, clases = CLASES_POR_DEFECTO) {
  const usadas = new Set();
  for (const prov of agregado.porProvincia.values()) {
    const i = claseDe(prov.tiposDistintos, clases);
    if (i >= 0) usadas.add(i);
  }
  return [...usadas].sort((a, b) => a - b);
}

/**
 * Reparte los íconos de una provincia en una cuadrícula compacta centrada en un punto.
 *
 * Se agrupan alrededor de un punto INTERIOR del polígono —el polo de inaccesibilidad,
 * que calcula el motor— y no del centroide: en una provincia cóncava o partida en
 * islas el centroide cae fuera y el grupo de íconos acabaría sobre la vecina.
 *
 * @param {number} n          cuántos íconos
 * @param {object} centro     {x, y} en milímetros
 * @param {number} tamanoMm   lado de cada ícono
 * @param {number} altoCifraMm altura del número bajo el ícono
 * @returns {Array<{x, y}>}   posición (centro horizontal, base) de cada ícono
 */
export function repartirIconos(n, centro, tamanoMm, altoCifraMm) {
  const columnas = Math.ceil(Math.sqrt(n));
  const filas = Math.ceil(n / columnas);
  const anchoCelda = tamanoMm * 1.12;
  const altoCelda = tamanoMm + altoCifraMm;
  const anchoTotal = columnas * anchoCelda;
  const altoTotal = filas * altoCelda;

  const salida = [];
  for (let i = 0; i < n; i++) {
    const fila = Math.floor(i / columnas);
    const col = i % columnas;
    /* La última fila se centra: con 5 íconos en 3 columnas, dejar los dos últimos
       alineados a la izquierda desequilibra el grupo sobre el punto que representa. */
    const enEstaFila = Math.min(columnas, n - fila * columnas);
    const sangria = ((columnas - enEstaFila) * anchoCelda) / 2;
    salida.push({
      x: centro.x - anchoTotal / 2 + sangria + anchoCelda * (col + 0.5),
      y: centro.y - altoTotal / 2 + altoCelda * (fila + 1) - altoCifraMm,
    });
  }
  return { posiciones: salida, ancho: anchoTotal, alto: altoTotal };
}

/**
 * Mide cuánto se estorban los grupos de íconos entre sí.
 *
 * Es el criterio que decide si hace falta un recuadro de zoom: no se fijan a mano
 * Lima o Cusco, se detecta dónde los símbolos no caben. Devuelve, para cada grupo, la
 * fracción de su área que pisa la de otro.
 */
export function medirApinamiento(grupos) {
  const solape = (a, b) => {
    const dx = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x);
    const dy = Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y);
    return dx > 0 && dy > 0 ? dx * dy : 0;
  };
  return grupos.map((g, i) => {
    const area = g.ancho * g.alto;
    let pisado = 0;
    for (let j = 0; j < grupos.length; j++) if (j !== i) pisado += solape(g, grupos[j]);
    return { ...g, apinamiento: area > 0 ? Math.min(1, pisado / area) : 0 };
  });
}
