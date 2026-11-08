import { CONFIG } from '/config.js';
import { calcRamo, fmtNota } from '/app/engine.js';

// Año del copyright siempre actualizado (bug §10.5).
document.querySelectorAll('#anio').forEach((el) => (el.textContent = new Date().getFullYear()));

// Enlace de contacto solo si hay un correo configurado.
const contacto = document.getElementById('contacto');
if (contacto && CONFIG.CONTACT_EMAIL) {
  contacto.href = `mailto:${CONFIG.CONTACT_EMAIL}`;
  contacto.hidden = false;
}
document.querySelectorAll('[data-contacto]').forEach((el) => {
  if (CONFIG.CONTACT_EMAIL) {
    el.textContent = CONFIG.CONTACT_EMAIL;
    el.href = `mailto:${CONFIG.CONTACT_EMAIL}`;
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// ---------- Calculadora sin cuenta (gancho de la portada) ----------
// Usa el mismo motor que la app. Al guardar, deja un borrador en este navegador
// y la app lo ofrece como ramo nuevo después de crear la cuenta.

const CLAVE_BORRADOR = 'estudia.borrador';
const $filas = document.getElementById('calc-filas');

if ($filas) {
  const $res = document.getElementById('calc-res');
  const $suma = document.getElementById('calc-suma');
  const $guardar = document.getElementById('calc-guardar');
  const $ramo = document.getElementById('calc-ramo');
  const $aprob = document.getElementById('calc-aprob');
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (v) => {
    const t = String(v ?? '').trim().replace(',', '.');
    return t === '' ? null : Number(t);
  };

  const fila = (nombre = '', pond = '', nota = '') => {
    const div = document.createElement('div');
    div.className = 'calc-fila';
    div.innerHTML = `<input class="calc-in" data-c="nombre" maxlength="80" placeholder="Evaluación" aria-label="Nombre de la evaluación" value="${esc(nombre)}">
      <input class="calc-in mono" data-c="pond" inputmode="decimal" placeholder="%" aria-label="Porcentaje" value="${esc(pond)}">
      <input class="calc-in mono" data-c="nota" inputmode="decimal" placeholder="—" aria-label="Nota (vacía si aún no la tienes)" value="${esc(nota)}">
      <button type="button" class="calc-x" aria-label="Quitar evaluación">✕</button>`;
    $filas.appendChild(div);
    return div;
  };
  [['Control 1', 30], ['Solemne', 30], ['Examen', 40]].forEach(([n, p]) => fila(n, p));

  // Lee las filas: devuelve las evaluaciones válidas y marca las casillas con errores.
  const leer = () => {
    const evals = [];
    for (const el of $filas.querySelectorAll('.calc-fila')) {
      const [n, p, v] = ['nombre', 'pond', 'nota'].map((c) => el.querySelector(`[data-c=${c}]`));
      const pond = num(p.value);
      const nota = num(v.value);
      const pondMal = pond !== null && (Number.isNaN(pond) || pond < 0 || pond > 100);
      const notaMal = nota !== null && (Number.isNaN(nota) || nota < 1 || nota > 7);
      p.classList.toggle('mal', pondMal);
      v.classList.toggle('mal', notaMal);
      if (pond === null || pondMal || pond === 0) continue;
      evals.push({ nombre: n.value.trim() || 'Evaluación', ponderacion: pond, nota: nota === null || notaMal ? null : Math.round(nota * 10) / 10 });
    }
    const aprob = num($aprob.value);
    const aprobOk = aprob !== null && !Number.isNaN(aprob) && aprob >= 1 && aprob <= 7;
    $aprob.classList.toggle('mal', !aprobOk);
    return { evals, aprob: aprobOk ? Math.round(aprob * 10) / 10 : 4 };
  };

  const pintar = (zona, big, titulo, detalle) => {
    $res.className = `calc-res ${zona}`;
    $res.innerHTML = `${big ? `<span class="big">${esc(big)}</span>` : ''}<span class="txt"><strong>${esc(titulo)}</strong>${esc(detalle)}</span>`;
  };

  const actualizar = () => {
    const { evals, aprob } = leer();
    const total = evals.reduce((a, e) => a + e.ponderacion, 0);
    const sumaOk = Math.abs(total - 100) < 0.01;
    $suma.textContent = evals.length ? (sumaOk ? 'Porcentajes: 100% ✓' : `Tus porcentajes suman ${Math.round(total * 10) / 10}%; deberían sumar 100%.`) : '';
    $suma.classList.toggle('mal', evals.length > 0 && !sumaOk);
    $guardar.disabled = !evals.length;
    if (!evals.length) return pintar('', '', 'Agrega tus evaluaciones', 'Escribe el porcentaje de cada una y las notas que ya tienes.');

    const c = calcRamo({ nota_aprobacion: aprob }, evals);
    const zonaTxt = { verde: 'Zona verde', amarillo: 'Zona amarilla', rojo: 'Zona roja' }[c.zona] ?? '';
    if (c.finalizado)
      return c.aprobado
        ? pintar('verde', fmtNota(c.notaActual), '¡Apruebas! 🎉', `Tu nota final queda en ${fmtNota(c.notaActual)}.`)
        : pintar('rojo', fmtNota(c.notaActual), 'Tu nota final queda bajo el mínimo', `Necesitabas un ${fmtNota(aprob)} para aprobar.`);
    if (c.estadoMin === 'asegurado') return pintar('verde', '✓', 'Ya aprobaste', `Aunque saques un 1.0 en lo que queda, llegas al ${fmtNota(aprob)}.`);
    if (c.estadoMin === 'imposible') return pintar('rojo', '7.0+', 'No alcanza ni con un 7.0', 'Habla con tu profesor sobre las alternativas que tengas.');
    const varias = c.nPendientes > 1;
    const dondeTxt = varias ? 'en promedio en lo que te queda' : `en ${evals.find((e) => e.nota === null).nombre}`;
    const actual = c.notaActual === null ? '' : ` Llevas un ${fmtNota(c.notaActual)}.`;
    pintar(c.zona, fmtNota(c.notaMinMostrar), `Necesitas ${fmtNota(c.notaMinMostrar)} ${dondeTxt}`, `${zonaTxt} · ${c.prob}% de probabilidad de aprobar.${actual}`);
  };

  $filas.addEventListener('input', actualizar);
  $filas.addEventListener('click', (ev) => {
    if (!ev.target.closest('.calc-x')) return;
    ev.target.closest('.calc-fila').remove();
    actualizar();
  });
  $aprob.addEventListener('input', actualizar);
  document.getElementById('calc-agregar').addEventListener('click', () => {
    fila().querySelector('input').focus();
    actualizar();
  });

  $guardar.addEventListener('click', () => {
    const { evals, aprob } = leer();
    if (!evals.length) return;
    const borrador = { nombre: $ramo.value.trim().slice(0, 80) || 'Mi ramo', nota_aprobacion: aprob, evals, creado: new Date().toISOString() };
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
    } catch {
      // Sin almacenamiento local igual seguimos al registro; solo no se precarga el ramo.
    }
    location.href = '/app/?registro=1';
  });

  actualizar();
}
