// Motor de cálculo de Estudia! (spec §7, con los bugs de §10 corregidos).
// Funciones puras: sin DOM ni red, para poder probarlas con `npm test`.

export const ESCALA_MIN = 1.0;
export const ESCALA_MAX = 7.0;
export const APROBACION_DEFAULT = 4.0;
const EPS = 1e-9;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const tieneNota = (e) => e.nota !== null && e.nota !== undefined && e.nota !== '';
export const MAX_SUBNOTAS = 20;

// ---------- Evaluaciones agrupadas ----------
// Una evaluación puede ser el promedio de varias notas (ej: "Controles", 20%, 4 notas).
// Cada nota vale ponderacion / cantidad y se calcula como una evaluación más.

export const esGrupo = (e) => Number(e.cantidad) > 1;

export function subNotas(e) {
  const n = Math.min(MAX_SUBNOTAS, Math.max(1, Math.round(Number(e.cantidad) || 1)));
  const notas = Array.isArray(e.notas) ? e.notas : [];
  return Array.from({ length: n }, (_, i) => {
    const v = notas[i];
    return v === null || v === undefined || v === '' ? null : Number(v);
  });
}

// Nota que representa a la evaluación: la propia o el promedio de las notas ingresadas.
export function notaEval(e) {
  if (!esGrupo(e)) return tieneNota(e) ? Number(e.nota) : null;
  const ingresadas = subNotas(e).filter((n) => n !== null);
  return ingresadas.length ? sum(ingresadas) / ingresadas.length : null;
}

export const evalCompleta = (e) => (esGrupo(e) ? subNotas(e).every((n) => n !== null) : tieneNota(e));

// Cada nota de un grupo tiene su propia fecha (columna fechas, paralela a notas).
export function subFechas(e) {
  const fechas = Array.isArray(e.fechas) ? e.fechas : [];
  return subNotas(e).map((_, i) => (fechas[i] ? String(fechas[i]).slice(0, 10) : null));
}

// Lo que se rinde en un día: una evaluación simple, o cada nota de un grupo ("Controles 3").
// idx = null para evaluaciones simples.
export function itemsEval(e) {
  if (!esGrupo(e))
    return [{ e, idx: null, nombre: e.nombre, fecha: e.fecha ? String(e.fecha).slice(0, 10) : null, nota: tieneNota(e) ? Number(e.nota) : null, ponderacion: Number(e.ponderacion) }];
  const notas = subNotas(e);
  const fechas = subFechas(e);
  return notas.map((nota, idx) => ({ e, idx, nombre: `${e.nombre} ${idx + 1}`, fecha: fechas[idx], nota, ponderacion: Number(e.ponderacion) / notas.length }));
}

export function expandirEvals(evaluaciones) {
  return evaluaciones.flatMap((e) =>
    esGrupo(e) ? subNotas(e).map((nota) => ({ ...e, ponderacion: Number(e.ponderacion) / subNotas(e).length, nota })) : [e],
  );
}

// ---------- Ramo ----------

// ---------- Nota de presentación a examen ----------
// Un ramo puede tener una "nota de presentación" (NP) que vale np_peso% de la nota final.
// Las evaluaciones con seccion = 'presentacion' tienen su ponderación como % de la NP
// (suman 100); el resto (ej: Examen) pondera directo sobre la nota final.
// Reglas opcionales: np_min_examen (NP mínima para dar examen) y np_eximicion (NP para eximirse).

export const usaPresentacion = (ramo) => Number(ramo?.np_peso) > 0 && Number(ramo?.np_peso) < 100;
export const enPresentacion = (e) => e.seccion === 'presentacion';
const numONull = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function probDeNecesaria(n) {
  if (n <= 1.0 + EPS) return 98;
  if (n <= 3.5 + EPS) return 88;
  if (n <= 4.5 + EPS) return 70;
  if (n <= 5.5 + EPS) return 42;
  if (n <= 6.5 + EPS) return 20;
  if (n <= ESCALA_MAX + EPS) return 5;
  return 0; // no alcanza ni con un 7.0
}

const mostrar = (n) => (n === null ? null : ceil1(Math.min(Math.max(n, ESCALA_MIN), ESCALA_MAX)));

// ---------- Ramo ----------

export function calcRamo(ramo, evaluaciones) {
  const aprob = Number(ramo.nota_aprobacion) || APROBACION_DEFAULT;
  const npPeso = usaPresentacion(ramo) ? Number(ramo.np_peso) : null;
  const items = expandirEvals(evaluaciones).filter((e) => Number(e.ponderacion) > 0);
  const pres = npPeso ? items.filter(enPresentacion) : [];
  const curso = npPeso ? items.filter((e) => !enPresentacion(e)) : items;
  const presTotal = sum(pres.map((e) => Number(e.ponderacion)));
  const cursoTotal = sum(curso.map((e) => Number(e.ponderacion)));

  // Todo se lleva a peso sobre la nota final. La NP siempre pesa np_peso%, aunque sus % no sumen 100.
  const evals = [
    ...curso.map((e) => ({ ...e, ponderacion: Number(e.ponderacion), _pres: false })),
    ...pres.map((e) => ({ ...e, _pp: Number(e.ponderacion), ponderacion: (Number(e.ponderacion) / presTotal) * npPeso, _pres: true })),
  ];
  const totalPond = sum(evals.map((e) => e.ponderacion));
  const notadas = evals.filter(tieneNota);
  const pendientes = evals.filter((e) => !tieneNota(e));

  const pondNotadas = sum(notadas.map((e) => e.ponderacion));
  const sumRendido = sum(notadas.map((e) => Number(e.nota) * e.ponderacion));
  let notaActual = pondNotadas > 0 ? sumRendido / pondNotadas : null;
  const pesoPend = sum(pendientes.map((e) => e.ponderacion));
  const notaMinPend = pesoPend > 0 ? (aprob * totalPond - sumRendido) / pesoPend : null;

  // Nota de presentación
  let np = null;
  if (npPeso) {
    const pN = pres.filter(tieneNota);
    const pPend = sum(pres.filter((e) => !tieneNota(e)).map((e) => Number(e.ponderacion)));
    const pSum = sum(pN.map((e) => Number(e.nota) * Number(e.ponderacion)));
    const pPondN = sum(pN.map((e) => Number(e.ponderacion)));
    const completa = pres.length > 0 && pPend === 0;
    const minExamen = numONull(ramo.np_min_examen);
    const eximicion = numONull(ramo.np_eximicion);
    const necPara = (meta) => (pPend > 0 ? (meta * presTotal - pSum) / pPend : null);
    const final = completa ? pSum / presTotal : null;
    np = {
      peso: npPeso,
      total: presTotal,
      cursoTotal,
      actual: pPondN > 0 ? pSum / pPondN : null,
      final,
      completa,
      minExamen,
      eximicion,
      necMin: minExamen !== null && !completa ? necPara(minExamen) : null,
      necExim: eximicion !== null && !completa ? necPara(eximicion) : null,
      cumpleMin: minExamen === null ? true : completa ? final >= minExamen - EPS : null,
      eximido: eximicion !== null && completa && final >= eximicion - EPS,
    };
  }

  // Lo que se necesita en cada sección. Sin reglas es la misma nota en todo lo pendiente;
  // si para llegar a la NP mínima hace falta más, la presentación exige eso y el examen menos.
  const pendPres = sum(pendientes.filter((e) => e._pres).map((e) => e.ponderacion));
  const pendCurso = sum(pendientes.filter((e) => !e._pres).map((e) => e.ponderacion));
  let necPres = pendPres > 0 ? notaMinPend : null;
  let necCurso = pendCurso > 0 ? notaMinPend : null;
  if (np && np.necMin !== null && pendPres > 0 && np.necMin > notaMinPend + EPS) {
    necPres = np.necMin;
    necCurso = pendCurso > 0 ? (aprob * totalPond - sumRendido - necPres * pendPres) / pendCurso : null;
  }
  const necesarias = [necPres, necCurso].filter((n) => n !== null);
  const necMax = necesarias.length ? Math.max(...necesarias) : null;

  let estadoMin = null;
  if (necMax !== null) {
    if (necMax <= ESCALA_MIN + EPS) estadoMin = 'asegurado';
    else if (necMax > ESCALA_MAX + EPS) estadoMin = 'imposible';
    else estadoMin = 'normal';
  }

  let finalizado = evals.length > 0 && pendientes.length === 0;
  let aprobado = finalizado ? notaActual >= aprob - EPS && np?.cumpleMin !== false : null;
  let prob = null;
  if (evals.length === 0) prob = null;
  else if (pendientes.length === 0) {
    if (aprobado) prob = 95;
    else if (notaActual >= aprob - 0.5 - EPS && np?.cumpleMin !== false) prob = 40;
    else prob = 10;
  } else prob = probDeNecesaria(necMax);

  if (np?.eximido) {
    // Eximido: la nota final es la NP y el examen ya no se rinde.
    estadoMin = 'eximido';
    notaActual = np.final;
    finalizado = true;
    aprobado = np.final >= aprob - EPS;
    prob = aprobado ? 95 : 10;
    necCurso = null;
  } else if (np && np.cumpleMin === false) {
    estadoMin = 'sin-examen';
    prob = 0;
  }

  return {
    aprob,
    evals,
    totalPond,
    pondOk: npPeso
      ? (pres.length === 0 || Math.abs(presTotal - 100) < 0.01) && Math.abs(cursoTotal - (100 - npPeso)) < 0.01
      : evaluaciones.length === 0 || Math.abs(totalPond - 100) < 0.01,
    nEvals: evals.length,
    nRendidas: notadas.length,
    nPendientes: pendientes.length,
    notaActual,
    notaMinPend,
    notaMinMostrar: mostrar(necMax),
    necesita: { presentacion: necPres, curso: necCurso },
    necesitaMostrar: { presentacion: mostrar(necPres), curso: mostrar(necCurso) },
    estadoMin,
    np,
    finalizado,
    aprobado,
    prob,
    zona: zonaDeProb(prob),
  };
}

// Nota que necesita una evaluación pendiente según su sección: { valor, estado }.
export function necesidadDe(c, e) {
  const raw = c.np && enPresentacion(e) ? c.necesita.presentacion : c.necesita.curso;
  if (raw === null || raw === undefined) return { valor: null, estado: null };
  const estado = raw <= ESCALA_MIN + EPS ? 'asegurado' : raw > ESCALA_MAX + EPS ? 'imposible' : 'normal';
  return { valor: mostrar(raw), estado };
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

// La asistencia es opcional por ramo (asist_activa = false la desactiva) y el total de
// clases también: sin total se muestra el % actual contra el mínimo, sin proyectar faltas.
export const asistenciaActiva = (ramo) => ramo?.asist_activa !== false;

export function calcAsistencia({ asist_requerida, asist_total, asist_realizadas, asist_asistidas }) {
  const req = clampNum(asist_requerida, 0, 100, 75);
  const total = Math.max(0, Math.round(Number(asist_total) || 0));
  const conTotal = total > 0;
  const realizadas = Math.max(0, Math.round(Number(asist_realizadas) || 0));
  const asistidas = Math.min(realizadas, Math.max(0, Math.round(Number(asist_asistidas) || 0)));
  const pctActual = realizadas > 0 ? Math.round((asistidas / realizadas) * 100) : 100;

  if (!conTotal) {
    const caso = realizadas === 0 ? 'sin-clases' : pctActual >= req ? 'sin-total-ok' : 'sin-total-bajo';
    const zona = { 'sin-clases': 'neutral', 'sin-total-ok': 'verde', 'sin-total-bajo': 'amarillo' }[caso];
    return { req, total: null, conTotal, realizadas, asistidas, faltas: realizadas - asistidas, restantes: null, necesarias: null, debesAsistir: null, puedeFaltar: null, puedeAlcanzar: true, pctActual, pctFinalMax: null, zona, caso };
  }

  const restantes = Math.max(0, total - realizadas);
  const necesarias = Math.ceil((total * req) / 100 - EPS);
  const debesAsistir = Math.max(0, necesarias - asistidas);
  const puedeFaltar = Math.max(0, restantes - debesAsistir);
  const puedeAlcanzar = asistidas + restantes >= necesarias;
  const pctFinalMax = total > 0 ? Math.round(((asistidas + restantes) / total) * 100) : 100;

  let zona, caso;
  if (!puedeAlcanzar) {
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

  return { req, total, conTotal, realizadas, asistidas, faltas: realizadas - asistidas, restantes, necesarias, debesAsistir, puedeFaltar, puedeAlcanzar, pctActual, pctFinalMax, zona, caso };
}

export function mensajeAsistencia(a) {
  switch (a.caso) {
    case 'sin-clases':
      return 'Después de cada clase marca "Asistí" o "Falté" y verás tu % de asistencia.';
    case 'sin-total-ok':
      return `Vas con ${a.pctActual}% de asistencia, sobre el mínimo de ${a.req}%. Agrega el total de clases para saber cuántas puedes faltar.`;
    case 'sin-total-bajo':
      return `Vas con ${a.pctActual}% de asistencia, bajo el mínimo de ${a.req}%. Asiste a las próximas clases para subirlo.`;
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
    } else if (asist && asist.caso === 'sin-total-bajo') {
      alertas.push({ id: `a:${ramo.id}:bajo:${asist.realizadas}`, zona: 'amarillo', prioridad: 3, ramoId: ramo.id, titulo: `⚠ Asistencia de ${ramo.nombre} bajo el mínimo`, detalle: `Vas con ${asist.pctActual}% y necesitas ${asist.req}%.` });
    } else if (asist && asist.caso === 'limite') {
      alertas.push({ id: `a:${ramo.id}:limite:${asist.realizadas}`, zona: 'amarillo', prioridad: 3, ramoId: ramo.id, titulo: `⚠ Asistencia al límite en ${ramo.nombre}`, detalle: 'No puedes faltar a más clases.' });
    }
  }
  for (const { ramo, calc, evals } of ramos) {
    for (const it of evals.flatMap(itemsEval)) {
      if (it.nota !== null || !it.fecha) continue;
      const n = diasRestantes(it.fecha, hoy);
      if (n === null || n < 0 || n > 3) continue;
      alertas.push({ id: `e:${it.e.id}:${it.idx ?? ''}:${it.fecha}:${n}`, zona: calc.zona === 'neutral' ? 'amarillo' : calc.zona, prioridad: 4, ramoId: ramo.id, titulo: `📅 ${it.nombre} de ${ramo.nombre}`, detalle: `${etiquetaDias(n)} · ${Math.round(it.ponderacion * 100) / 100}% de la nota.` });
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

// ---------- Tareas del día ----------
// Tareas simples: { id, titulo, fecha 'AAAA-MM-DD', hecha, ramo_id }.

export const tareasDelDia = (tareas, iso) =>
  tareas.filter((x) => x.fecha === iso).sort((a, b) => Number(a.hecha) - Number(b.hecha) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));

export const tareasAtrasadas = (tareas, hoyIso) =>
  tareas.filter((x) => !x.hecha && x.fecha && x.fecha < hoyIso).sort((a, b) => a.fecha.localeCompare(b.fecha));

// Sugerencias para hoy a partir de lo que la app ya sabe: evaluaciones de la próxima
// semana y ramos en riesgo según el plan de horas. No repite tareas que ya existen hoy.
export function sugerenciasDelDia(ramos, tareasHoy, hoy = new Date(), max = 4) {
  // ramos: [{ ramo, calc, evals }]
  const ya = new Set(tareasHoy.map((x) => x.titulo.trim().toLowerCase()));
  const out = [];
  const proximas = [];
  for (const { ramo, calc, evals } of ramos)
    for (const it of evals.flatMap(itemsEval)) {
      if (!it.fecha || it.nota !== null) continue;
      const n = diasRestantes(it.fecha, hoy);
      if (n !== null && n >= 0 && n <= 7) proximas.push({ ramo, calc, it, n });
    }
  proximas.sort((a, b) => a.n - b.n);
  for (const { ramo, it, n } of proximas)
    out.push({ titulo: `Estudiar para ${it.nombre} de ${ramo.nombre}`, ramoId: ramo.id, motivo: n === 0 ? 'Es hoy' : etiquetaDias(n), zona: zonaDias(n) });

  const plan = planHoras(ramos.map(({ ramo, calc }) => ({ id: ramo.id, nombre: ramo.nombre, horas: ramo.horas_semana, zona: calc.zona })));
  for (const f of plan.filas) {
    if (f.zona !== 'rojo' && f.zona !== 'amarillo') continue;
    if (out.some((s) => s.ramoId === f.id)) continue;
    const horas = Math.max(0.5, Math.round((f.asignadas / 7) * 2) / 2);
    out.push({ titulo: `Estudiar ${f.nombre} (${String(horas).replace('.', ',')} h)`, ramoId: f.id, motivo: f.zona === 'rojo' ? 'Zona roja' : 'Zona amarilla', zona: f.zona });
  }
  return out.filter((s) => !ya.has(s.titulo.toLowerCase())).slice(0, max);
}
