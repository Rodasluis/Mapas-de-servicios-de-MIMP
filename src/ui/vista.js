/**
 * Vista previa del mapa.
 *
 * Muestra EL MISMO SVG que se va a convertir en PDF, no una versión de pantalla: se
 * inserta la cadena que compone el motor, tal cual. Cualquier atajo aquí —redibujar
 * con otro código, simplificar la geometría «porque es sólo una vista previa»— haría
 * que lo revisado y lo impreso pudieran diferir, que es precisamente lo que este
 * proyecto no puede permitirse.
 *
 * El zoom y el desplazamiento se hacen con una transformación CSS sobre el elemento,
 * sin tocar el SVG. Así lo que se exporta es idéntico se haya mirado como se haya
 * mirado.
 */

const ZOOM_MINIMO = 0.15;
const ZOOM_MAXIMO = 12;

export function crearVista({ contenedor, alCambiarZoom }) {
  const lienzo = document.createElement('div');
  lienzo.className = 'lienzo';
  contenedor.appendChild(lienzo);

  let escala = 1;
  let ajustada = true;
  let desplazamiento = { x: 0, y: 0 };
  let hoja = null;
  let arrastre = null;

  /* El lienzo se ancla por su centro al centro del contenedor con translate(-50%,-50%).
     Dejarlo al flujo normal parece equivalente y no lo es: cuando la hoja sin escalar
     es MAYOR que el contenedor —una A0 siempre lo es— el navegador deja de centrar el
     desbordamiento y alinea al borde, y la hoja se va fuera de la vista. Anclada por el
     centro, su posición ya no depende de su tamaño. */
  const aplicar = () => {
    lienzo.style.transform = 'translate(-50%, -50%)'
      + ` translate(${desplazamiento.x}px, ${desplazamiento.y}px) scale(${escala})`;
    if (alCambiarZoom) alCambiarZoom(escala);
  };

  /** Escala a la que la hoja entera cabe en el contenedor, con un poco de aire. */
  const escalaDeAjuste = () => {
    if (!hoja) return 1;
    const caja = contenedor.getBoundingClientRect();
    const margen = 24;
    const cabe = Math.min(
      (caja.width - margen) / hoja.anchoPx,
      (caja.height - margen) / hoja.altoPx,
    );
    return Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, cabe));
  };

  const ajustar = () => {
    escala = escalaDeAjuste();
    desplazamiento = { x: 0, y: 0 };
    ajustada = true;
    aplicar();
  };

  /** Zoom centrado en un punto de la pantalla, para que no se escape lo que se mira. */
  const zoomEn = (factor, clienteX, clienteY) => {
    const caja = contenedor.getBoundingClientRect();
    const cx = clienteX - caja.left - caja.width / 2 - desplazamiento.x;
    const cy = clienteY - caja.top - caja.height / 2 - desplazamiento.y;
    const nueva = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, escala * factor));
    const razon = nueva / escala;
    desplazamiento = {
      x: desplazamiento.x - cx * (razon - 1),
      y: desplazamiento.y - cy * (razon - 1),
    };
    escala = nueva;
    ajustada = false;
    aplicar();
  };

  contenedor.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomEn(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }, { passive: false });

  contenedor.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    arrastre = { x: e.clientX, y: e.clientY, dx: desplazamiento.x, dy: desplazamiento.y };
    contenedor.setPointerCapture(e.pointerId);
    contenedor.classList.add('arrastrando');
  });
  contenedor.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    desplazamiento = {
      x: arrastre.dx + (e.clientX - arrastre.x),
      y: arrastre.dy + (e.clientY - arrastre.y),
    };
    ajustada = false;
    aplicar();
  });
  const soltar = (e) => {
    if (!arrastre) return;
    arrastre = null;
    contenedor.classList.remove('arrastrando');
    if (e.pointerId !== undefined) contenedor.releasePointerCapture?.(e.pointerId);
  };
  contenedor.addEventListener('pointerup', soltar);
  contenedor.addEventListener('pointercancel', soltar);

  /* El teclado hace lo mismo que el ratón: sin esto, revisar un detalle exigiría un
     ratón, y el criterio de la fase es que todo se pueda hacer con el teclado. */
  contenedor.tabIndex = 0;
  contenedor.addEventListener('keydown', (e) => {
    const paso = e.shiftKey ? 120 : 40;
    const acciones = {
      ArrowLeft: () => { desplazamiento.x += paso; },
      ArrowRight: () => { desplazamiento.x -= paso; },
      ArrowUp: () => { desplazamiento.y += paso; },
      ArrowDown: () => { desplazamiento.y -= paso; },
    };
    if (acciones[e.key]) {
      e.preventDefault();
      acciones[e.key]();
      ajustada = false;
      aplicar();
      return;
    }
    const caja = contenedor.getBoundingClientRect();
    const centro = [caja.left + caja.width / 2, caja.top + caja.height / 2];
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomEn(1.25, ...centro); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomEn(1 / 1.25, ...centro); }
    if (e.key === '0') { e.preventDefault(); ajustar(); }
  });

  window.addEventListener('resize', () => { if (ajustada) ajustar(); });

  /* El contenedor cambia de alto sin que cambie la ventana: el bloque de avisos crece
     al terminar de componer y le roba sitio. Sin esto, «Ajustar» se calcularía contra
     una caja que un instante después es más pequeña y la hoja saldría cortada. */
  if (typeof ResizeObserver === 'function') {
    let previo = null;
    new ResizeObserver((entradas) => {
      const { width, height } = entradas[0].contentRect;
      const ahora = `${Math.round(width)}x${Math.round(height)}`;
      if (ahora === previo) return;
      previo = ahora;
      if (ajustada) ajustar();
    }).observe(contenedor);
  }

  return {
    /** Sustituye el contenido por el SVG recién compuesto. */
    mostrar(svg, { anchoMm, altoMm }) {
      const px = 96 / 25.4; // el navegador dibuja a 96 ppp
      hoja = { anchoPx: anchoMm * px, altoPx: altoMm * px };
      lienzo.style.width = `${hoja.anchoPx}px`;
      lienzo.style.height = `${hoja.altoPx}px`;
      lienzo.innerHTML = svg.replace(/^<\?xml[^>]*\?>\s*/, '');
      const elemento = lienzo.querySelector('svg');
      if (elemento) {
        /* La hoja se declara en milímetros; en pantalla tiene que ocupar la caja
           entera del lienzo y escalar con la transformación, no con sus atributos. */
        elemento.removeAttribute('width');
        elemento.removeAttribute('height');
        elemento.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        elemento.style.width = '100%';
        elemento.style.height = '100%';
      }
      if (ajustada) ajustar(); else aplicar();
    },
    ajustar,
    zoom: () => escala,
    acercar: () => {
      const caja = contenedor.getBoundingClientRect();
      zoomEn(1.25, caja.left + caja.width / 2, caja.top + caja.height / 2);
    },
    alejar: () => {
      const caja = contenedor.getBoundingClientRect();
      zoomEn(1 / 1.25, caja.left + caja.width / 2, caja.top + caja.height / 2);
    },
    ocupado(si) { contenedor.classList.toggle('ocupado', si); },
  };
}
