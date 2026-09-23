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
    iconos: () => unaVez('iconos', () => leerJson('data/iconos.json')),

    departamentos: (nivel) => unaVez(`dep:${nivel}`,
      () => topo(`data/geo/departamentos.${nivel}.topojson`, 'departamentos')),

    provincias: (nivel) => unaVez(`prov:${nivel}`,
      () => topo(`data/geo/provincias.${nivel}.topojson`, 'provincias')),

    provinciasDe: (ccdd, nivel) => unaVez(`prov:${ccdd}:${nivel}`,
      () => topo(`data/geo/provincias/${ccdd}.${nivel}.topojson`, 'provincias')),

    distritosDe: (ccdd, nivel) => unaVez(`dist:${ccdd}:${nivel}`,
      () => topo(`data/geo/distritos/${ccdd}.${nivel}.topojson`, 'distritos')),

    contexto: () => unaVez('contexto', () => topo('data/geo/contexto.topojson', 'contexto')),
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
