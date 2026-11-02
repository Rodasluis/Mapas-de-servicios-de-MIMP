/**
 * Quién compone el mapa: el trabajador en segundo plano (src/trabajador.js) o, si el
 * navegador no lo admite, la propia página, como hasta la Fase 21.
 *
 * Gana siempre la ÚLTIMA petición. Si llega una nueva mientras otra está en marcha, la
 * vieja se descarta deteniendo el trabajador: su resultado ya no le sirve a nadie, y
 * esperar a que termine costaba, en A0, doce segundos por cada clic intermedio. El
 * trabajador nuevo arranca sin la cartografía en memoria, pero la vuelve a leer de la
 * caché del navegador en mucho menos de lo que tardaría el mapa viejo en terminar.
 *
 * La petición descartada se rechaza con un error marcado `cancelada`, que quien llama
 * ignora: no es un fallo, es que alguien cambió de idea.
 */
export function crearCompositor({ crearTrabajador, componerAqui }) {
  let trabajador = null;
  let enCurso = null;
  let enSegundoPlano = typeof Worker === 'function';

  const cancelada = () => Object.assign(new Error('Composición sustituida por otra más reciente'), { cancelada: true });

  /** Pasa a componer en la página, para siempre: el trabajador no arrancó o se cayó. */
  const renunciar = () => {
    enSegundoPlano = false;
    if (trabajador) trabajador.terminate();
    trabajador = null;
  };

  const arrancar = () => {
    const w = crearTrabajador();
    w.addEventListener('message', ({ data }) => {
      const tarea = enCurso;
      enCurso = null;
      if (!tarea) return;
      if (data.error) tarea.rechazar(new Error(data.error));
      else tarea.resolver(data);
    });
    /* Un error aquí no es del mapa, es del trabajador —no cargó su módulo, o el
       navegador no admite trabajadores de tipo módulo—: la tarea se hace en la página
       y las siguientes también. */
    w.addEventListener('error', (evento) => {
      evento.preventDefault();
      const tarea = enCurso;
      enCurso = null;
      renunciar();
      if (tarea) componerAqui(tarea.hoja, tarea.composicion).then(tarea.resolver, tarea.rechazar);
    });
    return w;
  };

  return {
    /** Compone y resuelve con {svg, meta}; rechaza con `cancelada` si otra la sustituye. */
    componer(hoja, composicion) {
      if (enCurso) {
        const vieja = enCurso;
        enCurso = null;
        if (trabajador) trabajador.terminate();
        trabajador = null;
        vieja.rechazar(cancelada());
      }
      if (!enSegundoPlano) return componerAqui(hoja, composicion);
      try {
        if (!trabajador) trabajador = arrancar();
      } catch {
        renunciar();
        return componerAqui(hoja, composicion);
      }
      return new Promise((resolver, rechazar) => {
        enCurso = { resolver, rechazar, hoja, composicion };
        trabajador.postMessage({ hoja, composicion });
      });
    },

    /** ¿Se está componiendo en segundo plano? (para el informe y las pruebas) */
    enSegundoPlano: () => enSegundoPlano,
  };
}
