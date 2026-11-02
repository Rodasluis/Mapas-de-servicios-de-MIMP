/**
 * Acceso a los datos publicados, independiente del entorno.
 *
 * El motor no sabe si corre en el navegador o en Node: recibe una función que lee un
 * JSON por su ruta relativa dentro de public/ y se ocupa del resto. Así el mismo
 * motor alimenta la vista previa de la interfaz y la generación de muestras.
 *
 * Cachea lo leído porque componer un mapa pide el mismo archivo varias veces —una para
 * medir la escala y otra para dibujar— y porque un ámbito departamental vuelve sobre
 * la misma capa al recorrer los vecinos.
 */
import { feature } from 'topojson-client';

export function crearCargador(leerJson) {
  const cache = new Map();

  const unaVez = (clave, fn) => {
    if (!cache.has(clave)) cache.set(clave, fn());
    return cache.get(clave);
  };

  const topo = async (ruta, objeto) => {
    const t = await leerJson(ruta);
    if (!t.objects?.[objeto]) {
      throw new Error(`«${ruta}» no contiene el objeto «${objeto}».`);
    }
    return feature(t, objeto);
  };

  return {
    indice: () => unaVez('indice', () => leerJson('data/geo/indice.json')),
    version: () => unaVez('version', () => leerJson('data/version.json')),
    centros: () => unaVez('centros', () => leerJson('data/centros.json')),
    logos: () => unaVez('logos', () => leerJson('data/logos.json')),
    metricas: () => unaVez('metricas', () => leerJson('data/metricas.json')),
    /* Población y pobreza del INEI (Fase 22, scripts/fetch-indicadores.mjs). Sólo se pide
       cuando el color del mapa las usa. */
    indicadores: () => unaVez('indicadores', () => leerJson('data/indicadores.json')),

    departamentos: (nivel) => unaVez(`dep:${nivel}`,
      () => topo(`data/geo/departamentos.${nivel}.topojson`, 'departamentos')),

    provincias: (nivel) => unaVez(`prov:${nivel}`,
      () => topo(`data/geo/provincias.${nivel}.topojson`, 'provincias')),

    provinciasDe: (ccdd, nivel) => unaVez(`prov:${ccdd}:${nivel}`,
      () => topo(`data/geo/provincias/${ccdd}.${nivel}.topojson`, 'provincias')),

    distritosDe: (ccdd, nivel) => unaVez(`dist:${ccdd}:${nivel}`,
      () => topo(`data/geo/distritos/${ccdd}.${nivel}.topojson`, 'distritos')),

    contexto: () => unaVez('contexto', () => topo('data/geo/contexto.topojson', 'contexto')),

    /* Fase 23 (scripts/build-capas.mjs): manifiesto de las capas, lugares del buscador,
       contorno del VRAEM y ríos y vías. */
    capas: () => unaVez('capas', () => leerJson('data/capas.json')),
    lugares: () => unaVez('lugares', () => leerJson('data/lugares.json')),
    vraem: (nivel) => unaVez(`vraem:${nivel}`, () => topo(`data/geo/vraem.${nivel}.topojson`, 'vraem')),

    /**
     * Ríos y vías que tocan la caja [oeste, sur, este, norte]. Los niveles medio y alto
     * van en teselas y sólo se piden las que toca la caja; un rasgo que cruza dos
     * teselas está en las dos con el mismo id, y se queda una vez.
     */
    async redes(nivel, caja) {
      const manifiesto = (await unaVez('capas', () => leerJson('data/capas.json'))).redes.niveles[nivel];
      if (manifiesto.archivo) {
        return unaVez(`redes:${nivel}`, () => topo(`data/geo/${manifiesto.archivo}`, 'redes'));
      }
      const tocan = manifiesto.teselas.filter(({ caja: t }) => !(t[2] < caja[0] || t[0] > caja[2]
        || t[3] < caja[1] || t[1] > caja[3]));
      const partes = await Promise.all(tocan.map((t) => unaVez(`redes:${t.archivo}`, () => topo(`data/geo/${t.archivo}`, 'redes'))));
      const vistos = new Set();
      const features = [];
      for (const parte of partes) {
        for (const f of parte.features) {
          if (vistos.has(f.id)) continue;
          vistos.add(f.id);
          features.push(f);
        }
      }
      /* En el orden de publicación, no en el de las teselas: el mismo mapa tiene que
         dibujar sus vías en el mismo orden pida las teselas que pida. */
      features.sort((a, b) => a.id - b.id);
      return { type: 'FeatureCollection', features };
    },
  };
}

/** Lector para el navegador: resuelve contra la base del sitio. */
export function lectorNavegador(base = '/') {
  return async (ruta) => {
    const res = await fetch(`${base}${ruta}`);
    if (!res.ok) throw new Error(`No se pudo leer ${ruta}: HTTP ${res.status}`);
    return res.json();
  };
}
