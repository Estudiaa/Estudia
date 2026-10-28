import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcRamo, calcAsistencia, mensajeAsistencia, planHoras, promedioGlobal, fmtNota,
  diasRestantes, semestreDeFecha, semestreSiguiente, generarAlertas,
} from '../app/engine.js';

const ev = (ponderacion, nota = null, extra = {}) => ({ id: Math.random().toString(36), nombre: 'E', ponderacion, nota, ...extra });

test('Cálculo Diferencial (datos de ejemplo): zona verde', () => {
  const c = calcRamo({}, [ev(30, 6.0), ev(30, 5.8), ev(40)]);
  assert.equal(fmtNota(c.notaActual), '5.9');
  // (4*100 - (180+174)) / 40 = 1.15 → necesita 1.2
  assert.equal(c.notaMinMostrar, 1.2);
  assert.equal(c.prob, 88);
  assert.equal(c.zona, 'verde');
});

test('Termodinámica (datos de ejemplo): zona roja', () => {
  const c = calcRamo({}, [ev(20, 2.5), ev(30, 3.0), ev(50)]);
  // (400 - 50 - 90) / 50 = 5.2
  assert.equal(c.notaMinMostrar, 5.2);
  assert.equal(c.prob, 42);
  assert.equal(c.zona, 'amarillo');
  const c2 = calcRamo({}, [ev(30, 2.0), ev(30, 2.5), ev(40)]);
  // (400 - 60 - 75) / 40 = 6.625
  assert.equal(c2.notaMinMostrar, 6.7);
  assert.equal(c2.zona, 'rojo');
});

test('Bug 2: nota mínima acotada y estados especiales', () => {
  const asegurado = calcRamo({}, [ev(50, 7.0), ev(50)]);
  assert.ok(asegurado.notaMinPend <= 1.0);
  assert.equal(asegurado.estadoMin, 'asegurado');
  assert.equal(asegurado.notaMinMostrar, 1.0);
  assert.equal(asegurado.prob, 98);

  const imposible = calcRamo({}, [ev(60, 1.5), ev(40)]);
  assert.ok(imposible.notaMinPend > 7.0);
  assert.equal(imposible.estadoMin, 'imposible');
  assert.equal(imposible.notaMinMostrar, 7.0);
  assert.equal(imposible.prob, 0);
  assert.equal(imposible.zona, 'rojo');
});

test('Sin pendientes: tabla por tramos', () => {
  assert.equal(calcRamo({}, [ev(100, 4.0)]).prob, 95);
  assert.equal(calcRamo({}, [ev(100, 3.6)]).prob, 40);
  assert.equal(calcRamo({}, [ev(100, 3.0)]).prob, 10);
  assert.equal(calcRamo({}, [ev(100, 4.0)]).aprobado, true);
});

test('Nota de aprobación configurable por ramo', () => {
  const c = calcRamo({ nota_aprobacion: 5.0 }, [ev(50, 5.0), ev(50)]);
  assert.equal(c.notaMinMostrar, 5.0);
  assert.equal(calcRamo({ nota_aprobacion: 5.0 }, [ev(100, 4.5)]).aprobado, false);
});

test('Bug 3: detecta ponderaciones que no suman 100', () => {
  assert.equal(calcRamo({}, [ev(30, 5), ev(30)]).pondOk, false);
  assert.equal(calcRamo({}, [ev(30, 5), ev(70)]).pondOk, true);
});

test('Ramo sin evaluaciones queda neutral', () => {
  const c = calcRamo({}, []);
  assert.equal(c.prob, null);
  assert.equal(c.zona, 'neutral');
});

test('Bug 4: asistencia separa clases realizadas de futuras', () => {
  // 30 clases, 75% → necesita 23. Lleva 20 realizadas, 18 asistidas → 10 restantes.
  const a = calcAsistencia({ asist_requerida: 75, asist_total: 30, asist_realizadas: 20, asist_asistidas: 18 });
  assert.equal(a.restantes, 10);
  assert.equal(a.necesarias, 23);
  assert.equal(a.debesAsistir, 5);
  assert.equal(a.puedeFaltar, 5);
  assert.equal(a.pctActual, 90);
  assert.equal(a.zona, 'verde');
  assert.match(mensajeAsistencia(a), /Puedes faltar 5 clases/);

  const limite = calcAsistencia({ asist_requerida: 75, asist_total: 30, asist_realizadas: 25, asist_asistidas: 18 });
  assert.equal(limite.caso, 'limite');

  const imposible = calcAsistencia({ asist_requerida: 75, asist_total: 30, asist_realizadas: 26, asist_asistidas: 18 });
  assert.equal(imposible.caso, 'imposible');
  assert.equal(imposible.zona, 'rojo');

  const cumplido = calcAsistencia({ asist_requerida: 75, asist_total: 30, asist_realizadas: 25, asist_asistidas: 24 });
  assert.equal(cumplido.caso, 'cumplido');
});

test('Plan de horas pondera por zona y conserva el total', () => {
  const p = planHoras([
    { id: 1, horas: 10, zona: 'verde' },
    { id: 2, horas: 10, zona: 'rojo' },
  ]);
  assert.equal(p.totalHoras, 20);
  assert.equal(p.filas[0].id, 2);
  assert.ok(Math.abs(p.filas[0].asignadas - 20 * 1.6 / 2.6) < 1e-9);
  assert.ok(Math.abs(p.filas[0].asignadas + p.filas[1].asignadas - 20) < 1e-9);
});

test('Bug 1: el promedio global no queda topado en 4.0', () => {
  const calcs = [calcRamo({}, [ev(50, 6.5), ev(50)]), calcRamo({}, [ev(50, 6.0), ev(50)])];
  assert.equal(fmtNota(promedioGlobal(calcs)), '6.3');
  assert.equal(promedioGlobal([calcRamo({}, [])]), null);
});

test('Fechas y semestres', () => {
  const hoy = new Date(2026, 9, 21);
  assert.equal(diasRestantes('2026-10-21', hoy), 0);
  assert.equal(diasRestantes('2026-10-24', hoy), 3);
  assert.deepEqual(semestreDeFecha(hoy), { anio: 2026, numero: 2, etiqueta: '2° Semestre 2026' });
  assert.equal(semestreDeFecha(new Date(2026, 3, 1)).etiqueta, '1° Semestre 2026');
  assert.equal(semestreDeFecha(new Date(2027, 0, 10)).etiqueta, '2° Semestre 2026');
  assert.equal(semestreSiguiente(2026, 2).etiqueta, '1° Semestre 2027');
});

test('Alertas se generan con datos reales', () => {
  const hoy = new Date(2026, 9, 21);
  const mk = (id, nombre, evals) => ({ ramo: { id, nombre }, calc: calcRamo({}, evals), asist: null, evals });
  const alertas = generarAlertas([
    mk('a', 'Termo', [ev(30, 2.0), ev(30, 2.5), ev(40, null, { fecha: '2026-10-22' })]),
    mk('b', 'Cálculo', [ev(30, 6.0), ev(30, 5.8), ev(40)]),
  ], hoy);
  assert.equal(alertas[0].zona, 'rojo');
  assert.match(alertas[0].titulo, /Termo en zona crítica/);
  assert.match(alertas[0].detalle, /necesitas 6\.7/);
  assert.ok(alertas.some((a) => a.titulo.includes('Cálculo va muy bien')));
  assert.ok(alertas.some((a) => a.detalle.startsWith('Mañana')));
});

test('Evaluación agrupada: promedio de varias notas', async () => {
  const { notaEval, evalCompleta, subNotas } = await import('../app/engine.js');
  // Controles 20% (4 notas, 2 rendidas), Solemne 30% 5.0, Examen 50% pendiente.
  const controles = { id: 'g', nombre: 'Controles', ponderacion: 20, cantidad: 4, notas: [6.0, 4.0] };
  assert.deepEqual(subNotas(controles), [6.0, 4.0, null, null]);
  assert.equal(notaEval(controles), 5.0);
  assert.equal(evalCompleta(controles), false);
  const c = calcRamo({}, [controles, ev(30, 5.0), ev(50)]);
  assert.equal(c.nEvals, 6);
  assert.equal(c.nRendidas, 3);
  // Rendido: 5·6 + 5·4 + 30·5 = 200. Pendiente: 5 + 5 + 50 = 60. (400 − 200) / 60 = 3.33
  assert.equal(c.notaMinMostrar, 3.4);
  assert.equal(fmtNota(c.notaActual), '5.0');
  assert.equal(c.pondOk, true);

  // Grupo completo equivale a una sola evaluación con el promedio.
  const completo = calcRamo({}, [{ ponderacion: 20, cantidad: 4, notas: [6, 4, 5, 5] }, ev(80, 5.0)]);
  const simple = calcRamo({}, [ev(20, 5.0), ev(80, 5.0)]);
  assert.equal(completo.notaActual, simple.notaActual);
  assert.equal(completo.finalizado, true);

  // Sin cantidad (datos antiguos) se comporta como antes.
  assert.equal(notaEval({ nota: 4.5 }), 4.5);
  assert.equal(evalCompleta({ nota: null }), false);
});

test('Nota de presentación (70%) + Examen (30%) con mínimo 3.5 para dar examen', async () => {
  const { necesidadDe } = await import('../app/engine.js');
  const ramo = { np_peso: 70, np_min_examen: 3.5 };
  const p = (ponderacion, nota = null, extra = {}) => ev(ponderacion, nota, { seccion: 'presentacion', ...extra });
  const evals = [
    p(35, 5.0),                                              // Solemne 1: 35% de la NP
    p(35),                                                   // Solemne 2
    p(30, null, { cantidad: 4, notas: [4.0, 4.0] }),         // Controles: 4 notas, 30% de la NP
    ev(30),                                                  // Examen: 30% de la nota final
  ];
  const c = calcRamo(ramo, evals);
  assert.equal(c.pondOk, true);
  // NP actual: (5·35 + 4·7.5 + 4·7.5) / 50 = 4.7
  assert.equal(fmtNota(c.np.actual), '4.7');
  // Rendido sobre la nota final: 5·24.5 + 4·5.25·2 = 164.5; pendiente 65 → (400 − 164.5) / 65 = 3.62
  assert.equal(c.notaMinMostrar, 3.7);
  // Para la NP mínima basta con (350 − 235) / 50 = 2.3, así que no cambia nada.
  assert.equal(fmtNota(c.np.necMin), '2.3');
  assert.equal(necesidadDe(c, evals[3]).valor, 3.7);
  assert.equal(c.prob, 70);

  // Con un mínimo exigente (5.0) la presentación pide 5.3 y el examen solo 1.7.
  const exigente = calcRamo({ np_peso: 70, np_min_examen: 5.0 }, evals);
  assert.equal(necesidadDe(exigente, evals[1]).valor, 5.3);
  assert.equal(necesidadDe(exigente, evals[3]).valor, 1.7);
  assert.equal(exigente.prob, 42);
});

test('Sin derecho a examen y eximición', () => {
  const p = (ponderacion, nota) => ev(ponderacion, nota, { seccion: 'presentacion' });
  const bajo = calcRamo({ np_peso: 70, np_min_examen: 3.5 }, [p(50, 3.0), p(50, 3.0), ev(30)]);
  assert.equal(bajo.estadoMin, 'sin-examen');
  assert.equal(bajo.prob, 0);
  assert.equal(bajo.zona, 'rojo');

  const exim = calcRamo({ np_peso: 70, np_eximicion: 5.5 }, [p(50, 6.0), p(50, 6.0), ev(30)]);
  assert.equal(exim.estadoMin, 'eximido');
  assert.equal(fmtNota(exim.notaActual), '6.0');
  assert.equal(exim.finalizado, true);
  assert.equal(exim.aprobado, true);

  // Sin eximición configurada, una NP alta igual obliga a rendir el examen.
  const sinExim = calcRamo({ np_peso: 70 }, [p(50, 6.0), p(50, 6.0), ev(30)]);
  assert.equal(sinExim.finalizado, false);
  assert.equal(sinExim.estadoMin, 'asegurado');
});

test('Asistencia opcional y sin total de clases', async () => {
  const { asistenciaActiva } = await import('../app/engine.js');
  assert.equal(asistenciaActiva({}), true);                  // ramos antiguos siguen con asistencia
  assert.equal(asistenciaActiva({ asist_activa: false }), false);

  const vacia = calcAsistencia({ asist_requerida: 75, asist_total: null, asist_realizadas: 0, asist_asistidas: 0 });
  assert.equal(vacia.caso, 'sin-clases');
  assert.equal(vacia.zona, 'neutral');

  const ok = calcAsistencia({ asist_requerida: 75, asist_total: null, asist_realizadas: 8, asist_asistidas: 7 });
  assert.equal(ok.conTotal, false);
  assert.equal(ok.pctActual, 88);
  assert.equal(ok.caso, 'sin-total-ok');
  assert.equal(ok.faltas, 1);
  assert.match(mensajeAsistencia(ok), /Agrega el total de clases/);

  const bajo = calcAsistencia({ asist_requerida: 75, asist_total: '', asist_realizadas: 8, asist_asistidas: 5 });
  assert.equal(bajo.caso, 'sin-total-bajo');
  assert.equal(bajo.zona, 'amarillo');

  // Con total vuelve el cálculo completo.
  const con = calcAsistencia({ asist_requerida: 75, asist_total: 30, asist_realizadas: 8, asist_asistidas: 7 });
  assert.equal(con.conTotal, true);
  assert.equal(con.puedeFaltar, 6);
});
