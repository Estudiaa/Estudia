// Motor de cálculo de Estudia! (spec §7, con los bugs de §10 corregidos).
// Funciones puras: sin DOM ni red, para poder probarlas con `npm test`.

export const ESCALA_MIN = 1.0;
export const ESCALA_MAX = 7.0;
export const APROBACION_DEFAULT = 4.0;
const EPS = 1e-9;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const tieneNota = (e) => e.nota !== null && e.nota !== undefined && e.nota !== '';

// ---------- Ramo ----------

export function calcRamo(ramo, evaluaciones) {
  const aprob = Number(ramo.nota_aprobacion) || APROBACION_DEFAULT;
  const evals = evaluaciones.filter((e) => Number(e.ponderacion) > 0);
  const totalPond = sum(evals.map((e) => Number(e.ponderacion)));
  const notadas = evals.filter(tieneNota);
  const pendientes = evals.filter((e) => !tieneNota(e));

  const pondNotadas = sum(notadas.map((e) => Number(e.ponderacion)));
  const sumRendido = sum(notadas.map((e) => Number(e.nota) * Number(e.ponderacion)));
  const notaActual = pondNotadas > 0 ? sumRendido / pondNotadas : null;
  const pesoPend = sum(pendientes.map((e) => Number(e.ponderacion)));
  const notaMinPend = pesoPend > 0 ? (aprob * totalPond - sumRendido) / pesoPend : null;

  // Bug §10.2: notaMinPend puede quedar bajo 1.0 (ya asegurado) o sobre 7.0 (imposible).
  let estadoMin = null;
  if (notaMinPend !== null) {
    if (notaMinPend <= ESCALA_MIN + EPS) estadoMin = 'asegurado';
    else if (notaMinPend > ESCALA_MAX + EPS) estadoMin = 'imposible';
    else estadoMin = 'normal';
  }

  let prob = null;
  if (evals.length === 0) prob = null;
  else if (pendientes.length === 0) {
    if (notaActual >= aprob - EPS) prob = 95;
    else if (notaActual >= aprob - 0.5 - EPS) prob = 40;
    else prob = 10;
  } else if (notaMinPend <= 1.0 + EPS) prob = 98;
  else if (notaMinPend <= 3.5 + EPS) prob = 88;
  else if (notaMinPend <= 4.5 + EPS) prob = 70;
  else if (notaMinPend <= 5.5 + EPS) prob = 42;
  else if (notaMinPend <= 6.5 + EPS) prob = 20;
  else if (notaMinPend <= ESCALA_MAX + EPS) prob = 5;
  else prob = 0; // no alcanza ni con un 7.0

  return {
    aprob,
    evals,
    totalPond,
    pondOk: evaluaciones.length === 0 || Math.abs(totalPond - 100) < 0.01,
    nEvals: evals.length,
    nRendidas: notadas.length,
    nPendientes: pendientes.length,
    notaActual,
    notaMinPend,
    notaMinMostrar: notaMinPend === null ? null : ceil1(Math.min(Math.max(notaMinPend, ESCALA_MIN), ESCALA_MAX)),
    estadoMin,
    finalizado: evals.length > 0 && pendientes.length === 0,
    aprobado: evals.length > 0 && pendientes.length === 0 ? notaActual >= aprob - EPS : null,
    prob,
    zona: zonaDeProb(prob),
  };
}

export function zonaDeProb(prob) {
  if (prob === null || prob === undefined) return 'neutral';
  if (prob >= 65) return 'verde';
  if (prob >= 40) return 'amarillo';
  return 'rojo';
}

// Redondea hacia arriba a un decimal: si necesitas 5.21, necesitas un 5.3.
export function ceil1(x) {
  return Math.ceil(x * 10 - EPS) / 10;
}

export function fmtNota(x) {
  return x === null || x === undefined || Number.isNaN(x) ? '—' : (Math.round(x * 10 + EPS) / 10).toFixed(1);
}

// ---------- Asistencia ----------
// Bug §10.4: se separan clases realizadas (ya pasaron) de clases totales del semestre.

export function calcAsistencia({ asist_requerida, asist_total, asist_realizadas, asist_asistidas }) {
  const req = clampNum(asist_requerida, 0, 100, 75);
  const total = Math.max(0, Math.round(Number(asist_total) || 0));
  const realizadas = Math.min(total, Math.max(0, Math.round(Number(asist_realizadas) || 0)));
  const asistidas = Math.min(realizadas, Math.max(0, Math.round(Number(asist_asistidas) || 0)));

  const restantes = total - realizadas;
  const necesarias = Math.ceil((total * req) / 100 - EPS);
  const debesAsistir = Math.max(0, necesarias - asistidas);
  const puedeFaltar = Math.max(0, restantes - debesAsistir);
  const puedeAlcanzar = asistidas + restantes >= necesarias;
  const pctActual = realizadas > 0 ? Math.round((asistidas / realizadas) * 100) : 100;
  const pctFinalMax = total > 0 ? Math.round(((asistidas + restantes) / total) * 100) : 100;

  let zona, caso;
  if (total === 0) {
    zona = 'neutral';
    caso = 'sin-datos';
  } else if (!puedeAlcanzar) {
    zona = 'rojo';
    caso = 'imposible';
  } else if (debesAsistir === 0) {
    zona = 'verde';
    caso = 'cumplido';
  } else if (puedeFaltar === 0) {
    zona = 'amarillo';
    caso = 'limite';
  } else if (pctActual >= req) {
    zona = 'verde';
    caso = 'puede-faltar';
  } else {
    zona = 'amarillo';
    caso = 'debe-asistir';
  }

  return { req, total, realizadas, asistidas, restantes, necesarias, debesAsistir, puedeFaltar, puedeAlcanzar, pctActual, pctFinalMax, zona, caso };
}

export function mensajeAsistencia(a) {
  switch (a.caso) {
    case 'sin-datos':
      return 'Ingresa el total de clases del semestre para calcular tu asistencia.';
    case 'imposible':
      return `Ya no es posible alcanzar el ${a.req}% requerido. Habla con tu profesor.`;
    case 'cumplido':
      return a.restantes > 0
        ? `Ya cumpliste el mínimo. Puedes faltar a las ${a.restantes} clases restantes y seguir cumpliendo.`
        : 'Cumpliste la asistencia mínima del ramo.';
    case 'limite':
      return `Justo en el límite: no puedes faltar más. Debes asistir a las ${a.debesAsistir} clases restantes.`;
    case 'puede-faltar':
      return `Puedes faltar ${a.puedeFaltar} ${a.puedeFaltar === 1 ? 'clase' : 'clases'} más y seguir cumpliendo.`;
    default:
      return `Debes asistir al menos a ${a.debesAsistir} de las ${a.restantes} clases restantes para cumplir el mínimo.`;
  }
}

// ---------- Plan de horas ----------

const PESO_ZONA = { rojo: 1.6, amarillo: 1.3, verde: 1.0, neutral: 1.0 };

export function planHoras(items) {
  // items: [{ id, nombre, horas, zona }]
  const pesos = items.map((r) => (Number(r.horas) || 0) * PESO_ZONA[r.zona]);
  const totalPesos = sum(pesos);
  const totalHoras = sum(items.map((r) => Number(r.horas) || 0));
  return {
    totalHoras,
    filas: items
      .map((r, i) => ({ ...r, asignadas: totalPesos > 0 ? (pesos[i] / totalPesos) * totalHoras : 0 }))
      .sort((a, b) => b.asignadas - a.asignadas),
  };
}

// ---------- Agregados ----------
// Bug §10.1: el promedio ya no usa min(notaMinPend, 4.0). Se muestra el promedio
// simple de las notas actuales de los ramos que tienen al menos una nota.

export function promedioGlobal(calcs) {
  const notas = calcs.map((c) => c.notaActual).filter((n) => n !== null);
  return notas.length ? sum(notas) / notas.length : null;
}

export function colorPromedio(p, aprob = APROBACION_DEFAULT) {
  if (p === null) return 'neutral';
  if (p >= 5.5) return 'verde';
  if (p >= aprob) return 'teal';
  return 'rojo';
}

// ---------- Fechas y semestres ----------

export function parseFecha(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function isoFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diasRestantes(fecha, hoy = new Date()) {
  const f = typeof fecha === 'string' ? parseFecha(fecha) : fecha;
  if (!f) return null;
  const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const f0 = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  return Math.round((f0 - h0) / 86400000);
}

export function etiquetaDias(n) {
  if (n === 0) return '¡Hoy!';
  if (n === 1) return 'Mañana';
  return `En ${n} días`;
}

export function zonaDias(n) {
  if (n <= 3) return 'rojo';
  if (n <= 7) return 'amarillo';
  return 'verde';
}

// Bug §10.5: el semestre activo se deduce de la fecha (marzo–julio = 1°, agosto–febrero = 2°).
export function semestreDeFecha(date = new Date()) {
  const m = date.getMonth(); // 0 = enero
  if (m <= 1) return semestre(date.getFullYear() - 1, 2); // ene–feb: cierre del 2° semestre anterior
  return semestre(date.getFullYear(), m <= 6 ? 1 : 2);
}

export function semestreSiguiente(anio, numero) {
  return numero === 1 ? semestre(anio, 2) : semestre(anio + 1, 1);
}

function semestre(anio, numero) {
  return { anio, numero, etiqueta: `${numero}° Semestre ${anio}` };
}

// ---------- Alertas (§6.11, generadas con datos reales) ----------

export function generarAlertas(ramos, hoy = new Date()) {
  // ramos: [{ ramo, calc, asist, evals }]
  const alertas = [];
  for (const { ramo, calc } of ramos) {
    if (calc.zona === 'rojo') {
      const detalle =
        calc.estadoMin === 'imposible'
          ? `Probabilidad ${calc.prob}%: no alcanza ni con un 7.0 en lo pendiente.`
          : calc.notaMinPend === null
            ? `Probabilidad ${calc.prob}%: nota final ${fmtNota(calc.notaActual)}.`
            : `Probabilidad ${calc.prob}%, necesitas ${fmtNota(calc.notaMinMostrar)} en lo pendiente.`;
      alertas.push({ id: `z:${ramo.id}:rojo:${calc.prob}:${fmtNota(calc.notaMinMostrar)}`, zona: 'rojo', prioridad: 0, ramoId: ramo.id, titulo: `🚨 ${ramo.nombre} en zona crítica`, detalle });
    } else if (calc.zona === 'amarillo') {
      alertas.push({ id: `z:${ramo.id}:amarillo:${calc.prob}`, zona: 'amarillo', prioridad: 2, ramoId: ramo.id, titulo: `⚠ ${ramo.nombre} requiere atención`, detalle: `${calc.prob}% de probabilidad de aprobación.` });
    }
  }
  for (const { ramo, asist } of ramos) {
    if (asist && asist.zona === 'rojo') {
      alertas.push({ id: `a:${ramo.id}:imposible`, zona: 'rojo', prioridad: 1, ramoId: ramo.id, titulo: `🚨 Asistencia de ${ramo.nombre}`, detalle: `Ya no es posible alcanzar el ${asist.req}% requerido.` });
    } else if (asist && asist.caso === 'limite') {
      alertas.push({ id: `a:${ramo.id}:limite:${asist.realizadas}`, zona: 'amarillo', prioridad: 3, ramoId: ramo.id, titulo: `⚠ Asistencia al límite en ${ramo.nombre}`, detalle: 'No puedes faltar a más clases.' });
    }
  }
  for (const { ramo, calc, evals } of ramos) {
    for (const e of evals) {
      if (tieneNota(e) || !e.fecha) continue;
      const n = diasRestantes(e.fecha, hoy);
      if (n === null || n < 0 || n > 3) continue;
      alertas.push({ id: `e:${e.id}:${e.fecha}:${n}`, zona: calc.zona === 'neutral' ? 'amarillo' : calc.zona, prioridad: 4, ramoId: ramo.id, titulo: `📅 ${e.nombre} de ${ramo.nombre}`, detalle: `${etiquetaDias(n)} · ${Number(e.ponderacion)}% de la nota.` });
    }
  }
  const verdes = ramos.filter((r) => r.calc.zona === 'verde').sort((a, b) => b.calc.prob - a.calc.prob);
  if (verdes.length) {
    const { ramo, calc } = verdes[0];
    alertas.push({ id: `z:${ramo.id}:verde`, zona: 'verde', prioridad: 5, ramoId: ramo.id, titulo: `✓ ${ramo.nombre} va muy bien`, detalle: `${calc.prob}% de probabilidad de aprobación.` });
  }
  return alertas.sort((a, b) => a.prioridad - b.prioridad);
}

function clampNum(v, min, max, def) {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
