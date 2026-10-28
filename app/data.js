// Listas para el onboarding y datos semilla del modo demo.
import { isoFecha, semestreDeFecha } from './engine.js';

// [nombre, dominios de correo institucional]
export const UNIVERSIDADES = [
  ['Pontificia Universidad Católica de Chile', ['uc.cl', 'puc.cl']],
  ['Universidad de Chile', ['uchile.cl', 'ug.uchile.cl']],
  ['Universidad de Santiago de Chile', ['usach.cl']],
  ['Universidad de Concepción', ['udec.cl']],
  ['Universidad Técnica Federico Santa María', ['usm.cl', 'sansano.usm.cl']],
  ['Pontificia Universidad Católica de Valparaíso', ['pucv.cl', 'mail.pucv.cl']],
  ['Universidad de Valparaíso', ['uv.cl', 'alumnos.uv.cl']],
  ['Universidad Adolfo Ibáñez', ['uai.cl', 'alumnos.uai.cl']],
  ['Universidad Diego Portales', ['udp.cl', 'mail.udp.cl']],
  ['Universidad de los Andes', ['uandes.cl', 'miuandes.cl']],
  ['Universidad del Desarrollo', ['udd.cl']],
  ['Universidad Andrés Bello', ['unab.cl', 'uandresbello.edu']],
  ['Universidad Austral de Chile', ['uach.cl', 'alumnos.uach.cl']],
  ['Universidad de La Frontera', ['ufrontera.cl', 'ufromail.cl']],
  ['Universidad Católica del Norte', ['ucn.cl', 'alumnos.ucn.cl']],
  ['Universidad de Talca', ['utalca.cl', 'alumnos.utalca.cl']],
  ['Universidad Católica de Temuco', ['uct.cl', 'alu.uct.cl']],
  ['Universidad Católica de la Santísima Concepción', ['ucsc.cl']],
  ['Universidad del Bío-Bío', ['ubiobio.cl', 'alumnos.ubiobio.cl']],
  ['Universidad de Antofagasta', ['uantof.cl']],
  ['Universidad de La Serena', ['userena.cl']],
  ['Universidad de Tarapacá', ['uta.cl']],
  ['Universidad Arturo Prat', ['unap.cl']],
  ['Universidad de Atacama', ['uda.cl']],
  ['Universidad de Los Lagos', ['ulagos.cl']],
  ['Universidad de Magallanes', ['umag.cl']],
  ['Universidad Católica del Maule', ['ucm.cl', 'alu.ucm.cl']],
  ['Universidad Autónoma de Chile', ['uautonoma.cl']],
  ['Universidad Central de Chile', ['ucentral.cl', 'alumnos.ucentral.cl']],
  ['Universidad Mayor', ['umayor.cl', 'mayor.cl']],
  ['Universidad San Sebastián', ['uss.cl', 'correo.uss.cl']],
  ['Universidad Santo Tomás', ['santotomas.cl']],
  ['Universidad de Las Américas', ['udla.cl', 'edu.udla.cl']],
  ['Universidad Finis Terrae', ['uft.cl', 'uft.edu']],
  ['Universidad Alberto Hurtado', ['uahurtado.cl', 'alumnos.uahurtado.cl']],
  ['Universidad Tecnológica Metropolitana', ['utem.cl']],
  ['Universidad de O’Higgins', ['uoh.cl', 'pregrado.uoh.cl']],
  ['Universidad de Aysén', ['uaysen.cl']],
  ['Universidad Bernardo O’Higgins', ['ubo.cl']],
  ['Universidad Católica Silva Henríquez', ['ucsh.cl']],
];

export function universidadDesdeCorreo(correo) {
  const dominio = String(correo || '').split('@')[1]?.toLowerCase().trim();
  if (!dominio) return '';
  for (const [nombre, dominios] of UNIVERSIDADES) {
    if (dominios.some((d) => dominio === d || dominio.endsWith('.' + d))) return nombre;
  }
  return '';
}

export const CARRERAS = [
  'Ingeniería Civil (Plan Común)', 'Ingeniería Civil Industrial', 'Ingeniería Civil Informática',
  'Ingeniería Comercial', 'Ingeniería en Computación', 'Arquitectura', 'Derecho', 'Medicina',
  'Enfermería', 'Odontología', 'Kinesiología', 'Nutrición y Dietética', 'Química y Farmacia',
  'Tecnología Médica', 'Psicología', 'Pedagogía', 'Educación Parvularia', 'Contador Auditor',
  'Administración Pública', 'Economía', 'Periodismo', 'Diseño', 'Trabajo Social',
  'Bachillerato / College', 'Ciencias (Biología, Química, Física)', 'Matemáticas / Estadística',
  'Agronomía', 'Medicina Veterinaria', 'Sociología', 'Ciencia Política',
];

export const aniosIngreso = (hoy = new Date()) => Array.from({ length: 9 }, (_, i) => hoy.getFullYear() - i);

// Semilla del modo demo (spec §7, "Datos de ejemplo del prototipo").
export function semillaDemo(hoy = new Date()) {
  const en = (dias) => isoFecha(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias));
  const hace = (dias) => en(-dias);
  const sem = semestreDeFecha(hoy);
  const semId = 'sem-activo';
  const ramos = [
    { id: 'r1', nombre: 'Cálculo Diferencial', horas_semana: 10, asist_requerida: 75, asist_total: 30, asist_realizadas: 25, asist_asistidas: 24 },
    { id: 'r2', nombre: 'Física II', horas_semana: 8, asist_requerida: 75, asist_total: null, asist_realizadas: 22, asist_asistidas: 18 },
    { id: 'r3', nombre: 'Termodinámica', horas_semana: 6, asist_requerida: 80, asist_total: 28, asist_realizadas: 20, asist_asistidas: 16 },
    { id: 'r4', nombre: 'Programación', horas_semana: 7, asist_requerida: 75, asist_total: 25, asist_realizadas: 23, asist_asistidas: 23, np_peso: 70, np_min_examen: 3.5 },
  ].map((r) => ({ ...r, user_id: 'demo', semestre_id: semId, nota_aprobacion: 4.0, nota_final: null }));
  const e = (id, ramo_id, nombre, ponderacion, nota, fecha) => ({ id, user_id: 'demo', ramo_id, nombre, ponderacion, nota, fecha });
  const evaluaciones = [
    e('e1', 'r1', 'Control 1', 30, 6.0, hace(40)), e('e2', 'r1', 'Control 2', 30, 5.8, hace(12)), e('e3', 'r1', 'Examen', 40, null, en(21)),
    { ...e('e4', 'r2', 'Controles', 25, null, hace(6)), cantidad: 4, notas: [3.5, 4.2, null, null] }, e('e5', 'r2', 'Solemne', 35, 4.1, hace(2)), e('e6', 'r2', 'Examen', 40, null, en(30)),
    e('e7', 'r3', 'Control 1', 20, 2.0, hace(30)), e('e8', 'r3', 'Solemne 1', 30, 2.5, hace(9)), e('e9', 'r3', 'Examen', 50, null, en(14)),
    { ...e('e10', 'r4', 'Proyecto 1', 50, 6.5, hace(25)), seccion: 'presentacion' }, { ...e('e11', 'r4', 'Proyecto 2', 50, null, en(5)), seccion: 'presentacion' }, e('e12', 'r4', 'Examen', 30, null, en(25)),
  ];
  // Un semestre cerrado de ejemplo para que el Historial no se vea vacío.
  const prev = sem.numero === 1 ? { anio: sem.anio - 1, numero: 2 } : { anio: sem.anio, numero: 1 };
  const semPrev = { id: 'sem-prev', user_id: 'demo', anio: prev.anio, numero: prev.numero, etiqueta: `${prev.numero}° Semestre ${prev.anio}`, activo: false, promedio: 5.0, cerrado_at: hace(90) };
  const cerrados = [
    ['h1', 'Álgebra', 5.6], ['h2', 'Introducción a la Ingeniería', 6.1], ['h3', 'Química General', 3.6], ['h4', 'Física I', 4.6],
  ].map(([id, nombre, nota_final]) => ({ id, user_id: 'demo', semestre_id: 'sem-prev', nombre, nota_final, nota_aprobacion: 4.0, horas_semana: 6, asist_requerida: 75, asist_total: 30, asist_realizadas: 30, asist_asistidas: 27 }));
  const hoyIso = en(0);
  const t = (id, titulo, fecha, ramo_id, hecha = false) => ({ id, user_id: 'demo', titulo, fecha, ramo_id, hecha, created_at: hoyIso + 'T0' + id.slice(1) + ':00:00Z' });
  const tareas = [
    t('t1', 'Ver clase grabada de Cálculo', hoyIso, 'r1', true),
    t('t2', 'Leer apunte de Termodinámica (cap. 3)', hoyIso, 'r3'),
    t('t3', 'Avanzar Proyecto 2', hoyIso, 'r4'),
    t('t4', 'Imprimir guía de ejercicios', hoyIso, null),
    t('t5', 'Resolver guía 4 de Física', hace(1), 'r2'),
    t('t6', 'Repasar Control 2 de Termo', en(2), 'r3'),
  ];
  return {
    tareas,
    profile: { id: 'demo', nombre: 'Estudiante Demo', universidad: 'Universidad de Chile', carrera: 'Ingeniería Civil (Plan Común)', anio_ingreso: hoy.getFullYear() - 1, onboarded_at: hace(100) },
    email: 'demo@estudia.cl',
    semestres: [semPrev, { id: semId, user_id: 'demo', ...sem, activo: true, promedio: null, cerrado_at: null }],
    ramos: [...cerrados, ...ramos],
    evaluaciones,
  };
}
