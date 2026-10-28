import { CONFIG, supabaseConfigurado } from '/config.js';
import * as E from './engine.js';
import { getSupabase, RemoteStore, DemoStore } from './store.js';
import { UNIVERSIDADES, CARRERAS, aniosIngreso, universidadDesdeCorreo } from './data.js';

// ---------- Utilidades ----------

const $root = document.getElementById('root');
const $modal = document.getElementById('modal-root');
const $toasts = document.getElementById('toasts');
const $print = document.getElementById('print-report');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = E.fmtNota;
const ZLABEL = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', neutral: 'Sin datos' };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pill = (z, txt) => `<span class="pill z-${z}">${esc(txt ?? ZLABEL[z])}</span>`;
const num = (v) => {
  const s = String(v ?? '').trim().replace(',', '.');
  return s === '' ? null : Number(s);
};
const round1 = (x) => Math.round(x * 10) / 10;
const iniciales = (nombre, correo) => {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return String(correo || '?').slice(0, 2).toUpperCase();
};
const fechaLarga = (iso) => {
  const d = E.parseFecha(iso);
  return d ? `${d.getDate()} ${MESES_ABR[d.getMonth()].toLowerCase()} ${d.getFullYear()}` : '';
};

const params = new URLSearchParams(location.search);
const ES_RECUPERACION = params.has('recuperar') || location.hash.includes('type=recovery');

// ---------- Estado ----------

const S = {
  view: 'boot', // boot | auth | onboarding | app | error
  authMode: ES_RECUPERACION ? 'nueva-clave' : 'login',
  authErr: null,
  authInfo: null,
  pendingEmail: '',
  busy: false,
  store: null,
  data: null,
  activeRamoId: null,
  tab: 'detalle',
  calMes: null,
  alertsOpen: false,
  modal: null,
  undo: {},
  perfilGuardado: false,
  fatal: null,
};

const semActivo = () => S.data.semestres.find((s) => s.activo);
const ramosActivos = () => {
  const sem = semActivo();
  return sem ? S.data.ramos.filter((r) => r.semestre_id === sem.id) : [];
};
const evalsDe = (ramoId) => S.data.evaluaciones.filter((e) => e.ramo_id === ramoId);
const analisis = () =>
  ramosActivos().map((ramo) => {
    const evals = evalsDe(ramo.id);
    return { ramo, evals, calc: E.calcRamo(ramo, evals), asist: E.asistenciaActiva(ramo) ? E.calcAsistencia(ramo) : null };
  });

// ---------- Render ----------

let pointerDown = false;
let renderPendiente = false;
document.addEventListener('pointerdown', () => (pointerDown = true), true);
window.addEventListener('pointerup', () => {
  pointerDown = false;
  if (renderPendiente) setTimeout(render, 0);
}, true);

// Tras un "change" esperamos a que el foco o el clic terminen antes de redibujar,
// para no perder el clic ni el Tab del usuario.
function renderLuego() {
  if (pointerDown) renderPendiente = true;
  else setTimeout(render, 0);
}

function render() {
  renderPendiente = false;
  const focoId = document.activeElement?.id;
  const scrollTabla = document.querySelector('.table-wrap')?.scrollLeft;
  let html;
  if (S.view === 'auth') html = viewAuth();
  else if (S.view === 'onboarding') html = viewOnboarding();
  else if (S.view === 'app') html = viewApp();
  else if (S.view === 'error') html = viewError();
  else html = '<div class="boot">Cargando…</div>';
  $root.innerHTML = html;
  renderModal();
  if (scrollTabla) document.querySelector('.table-wrap')?.scrollTo(scrollTabla, 0);
  if (focoId) document.getElementById(focoId)?.focus({ preventScroll: true });
}

function viewError() {
  return `<div class="onb"><div class="onb-card">
    <a class="logo" href="/">Estudia<b>!</b></a>
    <h1>No pudimos cargar tus datos</h1>
    <p class="muted">${esc(S.fatal)}</p>
    <div class="onb-actions"><button class="btn" data-act="logout">Cerrar sesión</button><button class="btn btn-teal" data-act="reintentar">Reintentar</button></div>
  </div></div>`;
}

// ---------- Auth ----------

function viewAuth() {
  const ok = supabaseConfigurado();
  const dis = ok ? '' : 'disabled';
  const err = S.authErr ? `<div class="error-box" role="alert">${esc(S.authErr)}</div>` : '';
  const info = S.authInfo ? `<div class="info-box" role="status">${esc(S.authInfo)}</div>` : '';
  const noConfig = ok ? '' : '<div class="info-box">Las cuentas todavía no están habilitadas en este sitio. Mientras tanto puedes probar la demo.</div>';
  const demoBtn = `<div class="divider">o</div><button class="btn btn-block" data-act="demo">Probar la demo sin cuenta</button>`;
  const btnLbl = (txt) => (S.busy ? 'Un momento…' : txt);
  let form = '';

  if (S.authMode === 'login') {
    form = `
      <h1>Bienvenido de vuelta</h1>
      <p class="sub">Ingresa para ver tus ramos y tu zona de riesgo.</p>
      ${noConfig}${err}${info}
      <form data-form="login" novalidate>
        <div class="field"><label for="l-email">Correo institucional</label>
          <input class="input" id="l-email" name="email" type="email" autocomplete="email" required value="${esc(S.pendingEmail)}" ${dis}></div>
        <div class="field"><label for="l-pass">Contraseña</label>
          <input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" required ${dis}></div>
        <button class="btn btn-teal btn-block" ${dis || (S.busy ? 'disabled' : '')}>${btnLbl('Ingresar a mi cuenta')}</button>
      </form>
      ${S.reenviar ? '<p class="auth-links"><button class="linkbtn" data-act="reenviar">Reenviar correo de verificación</button></p>' : ''}
      <div class="auth-links">
        <button class="linkbtn" data-act="auth-mode" data-mode="recuperar" ${dis}>¿Olvidaste tu contraseña?</button>
        <span>¿No tienes cuenta? <button class="linkbtn" data-act="auth-mode" data-mode="registro" ${dis}>Regístrate gratis</button></span>
      </div>
      ${demoBtn}`;
  } else if (S.authMode === 'registro') {
    form = `
      <h1>Crea tu cuenta</h1>
      <p class="sub">Gratis durante la beta. Toma menos de un minuto.</p>
      ${err}
      <form data-form="registro" novalidate>
        <div class="field"><label for="r-nombre">Nombre</label>
          <input class="input" id="r-nombre" name="nombre" autocomplete="name" maxlength="120" required></div>
        <div class="field"><label for="r-email">Correo institucional</label>
          <input class="input" id="r-email" name="email" type="email" autocomplete="email" required value="${esc(S.pendingEmail)}">
          <span class="hint">Usa el correo de tu universidad: así completamos tu perfil.</span></div>
        <div class="field"><label for="r-pass">Contraseña</label>
          <input class="input" id="r-pass" name="password" type="password" autocomplete="new-password" minlength="8" required>
          <span class="hint">Mínimo 8 caracteres.</span></div>
        <label class="check"><input type="checkbox" name="acepto" required>
          <span>Acepto la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a> y los <a href="/terminos" target="_blank" rel="noopener">Términos de uso</a>.</span></label>
        <button class="btn btn-teal btn-block" ${S.busy ? 'disabled' : ''}>${btnLbl('Crear cuenta')}</button>
      </form>
      <div class="auth-links"><span>¿Ya tienes cuenta? <button class="linkbtn" data-act="auth-mode" data-mode="login">Ingresa</button></span></div>`;
  } else if (S.authMode === 'verificar') {
    form = `
      <h1>Revisa tu correo</h1>
      <p class="sub">Te enviamos un enlace a <strong>${esc(S.pendingEmail)}</strong> para verificar tu cuenta. Ábrelo para entrar a Estudia!</p>
      ${err}${info}
      <p class="muted" style="font-size:13px">¿No te llegó? Revisa la carpeta de spam o pide otro enlace.</p>
      <button class="btn btn-block" data-act="reenviar" ${S.busy ? 'disabled' : ''}>Reenviar correo</button>
      <div class="auth-links"><button class="linkbtn" data-act="auth-mode" data-mode="login">Volver a ingresar</button></div>`;
  } else if (S.authMode === 'recuperar') {
    form = `
      <h1>Recupera tu contraseña</h1>
      <p class="sub">Te enviaremos un enlace para crear una nueva.</p>
      ${err}${info}
      <form data-form="recuperar" novalidate>
        <div class="field"><label for="p-email">Correo institucional</label>
          <input class="input" id="p-email" name="email" type="email" autocomplete="email" required value="${esc(S.pendingEmail)}"></div>
        <button class="btn btn-teal btn-block" ${S.busy ? 'disabled' : ''}>${btnLbl('Enviar enlace')}</button>
      </form>
      <div class="auth-links"><button class="linkbtn" data-act="auth-mode" data-mode="login">Volver a ingresar</button></div>`;
  } else if (S.authMode === 'nueva-clave') {
    form = `
      <h1>Crea una nueva contraseña</h1>
      <p class="sub">Elige una contraseña de al menos 8 caracteres.</p>
      ${err}
      <form data-form="nueva-clave" novalidate>
        <div class="field"><label for="n-pass">Nueva contraseña</label>
          <input class="input" id="n-pass" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label for="n-pass2">Repite la contraseña</label>
          <input class="input" id="n-pass2" name="password2" type="password" autocomplete="new-password" minlength="8" required></div>
        <button class="btn btn-teal btn-block" ${S.busy ? 'disabled' : ''}>${btnLbl('Guardar contraseña')}</button>
      </form>`;
  }

  return `<div class="auth">
    <section class="auth-left">
      <a class="logo" href="/">Estudia<b>!</b></a>
      <p class="tagline">Optimización académica basada en riesgo</p>
      <div class="auth-facts">
        <div><div class="big">1.0–7.0</div><div class="cap">Hecho para la escala de notas chilena</div></div>
        <div><div class="big">3</div><div class="cap">zonas de riesgo para saber dónde poner tus horas</div></div>
      </div>
    </section>
    <section class="auth-right">${form}</section>
  </div>`;
}

function traducirError(err) {
  const m = String(err?.message || err || '');
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Tu correo aún no está verificado. Revisa tu bandeja de entrada.';
  if (/already registered|already exists/i.test(m)) return 'Ya existe una cuenta con ese correo.';
  if (/Password should be|password.*(short|least)/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Ese correo no es válido.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  if (/violates check constraint/i.test(m)) return 'Hay un valor fuera de rango. Revisa los datos.';
  return 'Ocurrió un error: ' + m;
}

async function conBusy(fn) {
  S.busy = true;
  S.authErr = null;
  S.authInfo = null;
  render();
  try {
    await fn();
  } catch (err) {
    console.error(err);
    S.authErr = traducirError(err);
  } finally {
    S.busy = false;
    if (S.view === 'auth') render();
  }
}

const authForms = {
  async login(f) {
    const email = f.email.value.trim();
    const password = f.password.value;
    S.pendingEmail = email;
    S.reenviar = false;
    if (!email || !password) return void ((S.authErr = 'Ingresa tu correo y contraseña.'), render());
    await conBusy(async () => {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        if (/Email not confirmed/i.test(error.message)) S.reenviar = true;
        throw error;
      }
      await entrar(new RemoteStore(sb, data.user));
    });
  },
  async registro(f) {
    const nombre = f.nombre.value.trim();
    const email = f.email.value.trim();
    const password = f.password.value;
    S.pendingEmail = email;
    if (!nombre || !email) return void ((S.authErr = 'Completa tu nombre y correo.'), render());
    if (password.length < 8) return void ((S.authErr = 'La contraseña debe tener al menos 8 caracteres.'), render());
    if (!f.acepto.checked) return void ((S.authErr = 'Para crear tu cuenta debes aceptar la Política de privacidad y los Términos de uso.'), render());
    await conBusy(async () => {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { nombre, acepto_terminos: true }, emailRedirectTo: location.origin + '/app/' },
      });
      if (error) throw error;
      if (data.session) await entrar(new RemoteStore(sb, data.user));
      else S.authMode = 'verificar';
    });
  },
  async recuperar(f) {
    const email = f.email.value.trim();
    S.pendingEmail = email;
    if (!email) return void ((S.authErr = 'Ingresa tu correo.'), render());
    await conBusy(async () => {
      const sb = await getSupabase();
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/app/?recuperar=1' });
      if (error) throw error;
      S.authInfo = 'Si existe una cuenta con ese correo, te llegará un enlace en unos minutos.';
    });
  },
  async 'nueva-clave'(f) {
    const p1 = f.password.value;
    if (p1.length < 8) return void ((S.authErr = 'La contraseña debe tener al menos 8 caracteres.'), render());
    if (p1 !== f.password2.value) return void ((S.authErr = 'Las contraseñas no coinciden.'), render());
    await conBusy(async () => {
      const sb = await getSupabase();
      const { data, error } = await sb.auth.updateUser({ password: p1 });
      if (error) throw error;
      history.replaceState(null, '', '/app/');
      toast({ zona: 'verde', titulo: '✓ Contraseña actualizada' });
      await entrar(new RemoteStore(sb, data.user));
    });
  },
};

// ---------- Entrar / salir ----------

async function entrar(store) {
  S.store = store;
  S.view = 'boot';
  render();
  try {
    S.data = await store.loadAll();
    if (!semActivo()) {
      const sem = await store.insert('semestres', { ...E.semestreDeFecha(), activo: true });
      S.data.semestres.push(sem);
    }
  } catch (err) {
    console.error(err);
    S.fatal = traducirError(err);
    S.view = 'error';
    return render();
  }
  S.activeRamoId = ramosActivos()[0]?.id ?? null;
  S.tab = 'hoy';
  S.data.tareas ||= [];
  S.view = S.data.profile.onboarded_at ? 'app' : 'onboarding';
  render();
  if (S.view === 'app') avisosIniciales();
}

async function salir() {
  try {
    await S.store?.signOut();
  } catch (err) {
    console.error(err);
  }
  Object.assign(S, { store: null, data: null, view: 'auth', authMode: 'login', modal: null, alertsOpen: false, undo: {}, authErr: null, authInfo: null });
  $toasts.innerHTML = '';
  render();
}

// ---------- Onboarding ----------

function selectConOtra(name, opciones, valor, label, placeholder) {
  const enLista = !valor || opciones.includes(valor);
  return `<div class="field"><label for="f-${name}">${label}</label>
    <select class="input" id="f-${name}" name="${name}" data-change="otra">
      <option value="">Selecciona…</option>
      ${opciones.map((o) => `<option value="${esc(o)}" ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      <option value="__otra__" ${enLista ? '' : 'selected'}>Otra…</option>
    </select>
    <input class="input ${enLista ? 'hidden' : ''}" id="f-${name}-otra" name="${name}_otra" placeholder="${esc(placeholder)}" maxlength="160" value="${enLista ? '' : esc(valor)}" aria-label="${esc(label)} (otra)">
  </div>`;
}

function camposPerfil(p, email) {
  const uni = p.universidad || universidadDesdeCorreo(email);
  const anios = aniosIngreso();
  return `
    ${selectConOtra('universidad', UNIVERSIDADES.map((u) => u[0]), uni, 'Universidad', 'Escribe tu universidad o instituto')}
    ${selectConOtra('carrera', CARRERAS, p.carrera || '', 'Carrera', 'Escribe tu carrera')}
    <div class="field"><label for="f-anio">Año de ingreso</label>
      <select class="input" id="f-anio" name="anio_ingreso">
        <option value="">Selecciona…</option>
        ${anios.map((a) => `<option value="${a}" ${Number(p.anio_ingreso) === a ? 'selected' : ''}>${a}</option>`).join('')}
        <option value="${anios.at(-1) - 1}" ${p.anio_ingreso && Number(p.anio_ingreso) < anios.at(-1) ? 'selected' : ''}>Antes de ${anios.at(-1)}</option>
      </select></div>`;
}

function leerPerfil(f) {
  const val = (name) => {
    const v = f[name].value;
    return (v === '__otra__' ? f[name + '_otra'].value : v).trim().slice(0, 160) || null;
  };
  return { universidad: val('universidad'), carrera: val('carrera'), anio_ingreso: f.anio_ingreso.value ? Number(f.anio_ingreso.value) : null };
}

function viewOnboarding() {
  const p = S.data.profile;
  const nombre = (p.nombre || '').split(' ')[0];
  const deducida = !p.universidad && universidadDesdeCorreo(S.data.email);
  return `<div class="onb"><form class="onb-card" data-form="onboarding" novalidate>
    <span class="logo">Estudia<b>!</b></span>
    <h1>¡Hola${nombre ? ', ' + esc(nombre) : ''}! Cuéntanos un poco de ti</h1>
    <p class="muted" style="margin-top:0">Todo es opcional y lo puedes cambiar después en tu perfil.${deducida ? ' Dedujimos tu universidad por tu correo.' : ''}</p>
    ${camposPerfil(p, S.data.email)}
    <div class="onb-actions">
      <button type="button" class="btn btn-ghost" data-act="omitir-onb">Omitir por ahora</button>
      <button class="btn btn-teal" ${S.busy ? 'disabled' : ''}>Continuar →</button>
    </div>
  </form></div>`;
}

async function terminarOnboarding(cambios) {
  S.busy = true;
  try {
    S.data.profile = await S.store.updateProfile({ ...cambios, onboarded_at: new Date().toISOString() });
    S.view = 'app';
    render();
    avisosIniciales();
  } catch (err) {
    toastError(err);
  } finally {
    S.busy = false;
  }
}

// ---------- App ----------

function viewApp() {
  const an = analisis();
  const p = S.data.profile;
  const alertas = alertasActuales(an);
  const noLeidas = alertas.filter((a) => !leidas().has(a.id)).length;
  const nombre = p.nombre || S.data.email;
  const demo = S.store.demo
    ? `<div class="demo-strip">Modo demo: nada se guarda al recargar.${supabaseConfigurado() ? ' <button data-act="demo-registro">Crear cuenta gratis</button>' : ''}</div>`
    : '';
  return `${demo}
  <header class="topbar">
    <a class="logo" href="/" aria-label="Estudia! inicio">Estudia<b>!</b></a>
    <div class="topbar-right">
      <button class="icon-btn" data-act="comentarios" aria-label="Enviar comentarios" title="Enviar comentarios">💬</button>
      <button class="icon-btn" data-act="toggle-alertas" aria-label="Alertas académicas${noLeidas ? `, ${noLeidas} sin leer` : ''}">🔔${noLeidas ? `<span class="badge">${noLeidas}</span>` : ''}</button>
      <button class="user-btn" data-act="tab" data-tab="perfil" aria-label="Ver perfil"><span class="avatar">${esc(iniciales(p.nombre, S.data.email))}</span><span class="nm">${esc(nombre)}</span></button>
      <button class="btn btn-sm btn-out" data-act="logout" aria-label="Cerrar sesión">↪<span class="lbl"> ${S.store.demo ? 'Salir de la demo' : 'Cerrar sesión'}</span></button>
    </div>
  </header>
  <div class="layout tab-${S.tab}">
    <aside class="sidebar">${viewSidebar(an)}</aside>
    <main class="main">
      <nav class="tabs" role="tablist">
        ${[['hoy', 'Hoy'], ['detalle', 'Detalle'], ['plan', 'Plan hrs'], ['calendario', 'Calendario'], ['historial', 'Historial'], ['perfil', 'Perfil']]
          .map(([k, l]) => `<button class="tab ${S.tab === k ? 'active' : ''}" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}
      </nav>
      ${{ hoy: viewHoy, detalle: viewDetalle, plan: viewPlan, calendario: viewCalendario, historial: viewHistorial, perfil: viewPerfil }[S.tab](an)}
    </main>
  </div>
  ${S.alertsOpen ? viewAlertas(alertas) : ''}`;
}

function viewSidebar(an) {
  const prom = E.promedioGlobal(an.map((x) => x.calc));
  const rojos = an.filter((x) => x.calc.zona === 'rojo').length;
  return `
    <div class="sem-badge"><small>Semestre activo</small><strong>${esc(semActivo()?.etiqueta)}</strong></div>
    <div class="stat-pair">
      <div class="stat z-${E.colorPromedio(prom)}"><small>Promedio</small><div class="val zc">${fmt(prom)}</div></div>
      <div class="stat ${rojos ? 'z-rojo' : 'z-neutral'}"><small>Zona roja</small><div class="val ${rojos ? 'zc' : ''}">${rojos}</div></div>
    </div>
    <div class="side-title">MIS RAMOS</div>
    <div class="ramo-list">
      ${an.map(({ ramo, calc }) => `
        <button class="ramo-card z-${calc.zona} ${ramo.id === S.activeRamoId && S.tab === 'detalle' ? 'active' : ''}" data-act="ramo" data-id="${esc(ramo.id)}">
          <div class="top"><span class="name">${esc(ramo.nombre)}</span>${pill(calc.zona)}</div>
          <div class="bar"><span style="width:${calc.prob ?? 0}%"></span></div>
          <div class="meta">${calc.prob === null ? 'Sin evaluaciones' : `Aprobación <span class="mono">${calc.prob}%</span>`}</div>
        </button>`).join('')}
    </div>
    <button class="btn-dashed" data-act="nuevo-ramo">+ Agregar ramo</button>`;
}

// ---------- Detalle ----------

function textoAlerta(c) {
  if (c.zona === 'neutral') return { ico: 'i', txt: 'Agrega evaluaciones con su ponderación para calcular tu riesgo.' };
  if (c.estadoMin === 'eximido') return { ico: '✓', txt: `Te eximiste del examen: tu nota final es ${fmt(c.notaActual)}.` };
  if (c.finalizado)
    return c.aprobado
      ? { ico: '✓', txt: `Ramo aprobado con un ${fmt(c.notaActual)}.` }
      : { ico: '!', txt: `Nota final ${fmt(c.notaActual)}: bajo la nota de aprobación (${fmt(c.aprob)}).` };
  if (c.estadoMin === 'sin-examen')
    return { ico: '!', txt: `Tu nota de presentación (${fmt(c.np.final)}) no alcanza el ${fmt(c.np.minExamen)} mínimo para dar examen.` };
  if (c.estadoMin === 'asegurado') return { ico: '✓', txt: `Ya aprobaste este ramo: aunque saques un 1.0 en lo pendiente llegas al ${fmt(c.aprob)}.` };
  if (c.estadoMin === 'imposible' && c.np?.necMin > 7 && c.necesita.presentacion === c.np.necMin)
    return { ico: '!', txt: `No alcanzas la nota de presentación mínima (${fmt(c.np.minExamen)}) para dar examen, ni con 7.0 en lo que queda.` };
  if (c.estadoMin === 'imposible') return { ico: '!', txt: 'No alcanza ni con un 7.0 en lo pendiente. Habla con tu profesor sobre alternativas.' };
  const pre = { verde: 'Vas bien.', amarillo: 'Atención.', rojo: 'Actúa ahora.' }[c.zona];
  const ico = { verde: '✓', amarillo: '⚠', rojo: '!' }[c.zona];
  const { presentacion: nPres, curso: nCurso } = c.necesitaMostrar;
  if (c.np && nPres !== null && nCurso !== null && nPres !== nCurso)
    return { ico, txt: `${pre} Necesitas ${fmt(nPres)} en lo que queda de la presentación y ${fmt(nCurso)} en el examen.` };
  return { ico, txt: `${pre} Necesitas ${fmt(c.notaMinMostrar)} en las evaluaciones pendientes.` };
}

function estadoEval(e, c) {
  const examen = c.np && !E.enPresentacion(e);
  if (examen && c.estadoMin === 'eximido') return pill('verde', 'Eximido');
  if (examen && c.estadoMin === 'sin-examen') return pill('rojo', 'Sin derecho');
  if (E.evalCompleta(e)) return E.notaEval(e) >= c.aprob - 1e-9 ? pill('verde', 'Aprobado') : pill('rojo', 'Bajo mínimo');
  if (!(Number(e.ponderacion) > 0)) return pill('neutral', 'Sin ponderación');
  const n = E.necesidadDe(c, e);
  if (n.estado === 'asegurado') return pill('verde', 'Asegurado');
  if (n.estado === 'imposible') return pill('rojo', 'No alcanza');
  return pill(c.zona, `Necesitas ${fmt(n.valor)}`);
}

function filaEvalDetalle(e, c) {
  const enPres = c.np && E.enPresentacion(e);
  const id = esc(e.id);
  const grupo = E.esGrupo(e);
  const prom = E.notaEval(e);
  const notaCell = grupo
    ? `<div class="nota-prom mono">${fmt(prom)}</div><small class="light">promedio</small>`
    : `<input class="cell-input nota" inputmode="decimal" id="ev-${id}-nota" data-change="ev" data-id="${id}" data-field="nota" value="${prom === null ? '' : esc(prom.toFixed(1))}" placeholder="Pend." aria-label="Nota de ${esc(e.nombre)}">`;
  const fila = `
    <tr class="${grupo ? 'grp' : ''}">
      <td><div class="cell-name">
        <input class="cell-input" id="ev-${id}-nombre" data-change="ev" data-id="${id}" data-field="nombre" value="${esc(e.nombre)}" maxlength="80" aria-label="Nombre de la evaluación">
        <input class="cell-input date" type="date" id="ev-${id}-fecha" data-change="ev" data-id="${id}" data-field="fecha" value="${esc(e.fecha ?? '')}" aria-label="Fecha de ${esc(e.nombre)}">
        ${grupo ? '' : `<button class="linkbtn split-btn" id="split-${id}" data-act="dividir" data-id="${id}">÷ Es un promedio de varias notas</button>`}
        ${c.np ? `<button class="linkbtn split-btn" id="mover-${id}" data-act="mover" data-id="${id}">${enPres ? '→ Sacar de la presentación' : '→ Mover a la presentación'}</button>` : ''}
      </div></td>
      <td><input class="cell-input num" inputmode="decimal" id="ev-${id}-ponderacion" data-change="ev" data-id="${id}" data-field="ponderacion" value="${esc(Number(e.ponderacion))}" aria-label="Ponderación en %"><span class="light">%</span></td>
      <td style="text-align:center">${notaCell}</td>
      <td>${estadoEval(e, c)}</td>
      <td><button class="x-btn" id="del-${id}" data-act="borrar-ev" data-id="${id}" aria-label="Borrar ${esc(e.nombre)}">✕</button></td>
    </tr>`;
  if (!grupo) return fila;
  const notas = E.subNotas(e);
  const cada = Math.round((Number(e.ponderacion) / notas.length) * 100) / 100;
  return fila + `
    <tr class="sub-row"><td colspan="5"><div class="subnotas">
      <div class="sub-head">
        <span>${notas.length} notas · cada una vale <span class="mono">${cada}%</span>${enPres ? ' de la presentación' : ''}</span>
        <span class="cant">
          <button class="cant-btn" id="cant-menos-${id}" data-act="cantidad" data-id="${id}" data-d="-1" aria-label="Quitar una nota">−</button>
          <button class="cant-btn" id="cant-mas-${id}" data-act="cantidad" data-id="${id}" data-d="1" aria-label="Agregar una nota" ${notas.length >= E.MAX_SUBNOTAS ? 'disabled' : ''}>+</button>
        </span>
      </div>
      <div class="subs">
        ${notas.map((n, i) => `<label class="sub"><span>${i + 1}</span><input class="cell-input nota" inputmode="decimal" id="ev-${id}-n${i}" data-change="sub" data-id="${id}" data-idx="${i}" value="${n === null ? '' : n.toFixed(1)}" placeholder="Pend." aria-label="${esc(e.nombre)}, nota ${i + 1}"></label>`).join('')}
      </div>
    </div></td></tr>`;
}

function tablaEvals(evals, c, colPond) {
  return `<div class="table-wrap">
    <table class="evals">
      <thead><tr><th>Evaluación</th><th>${colPond}</th><th style="text-align:center">Nota</th><th>Estado</th><th><span class="hidden">Borrar</span></th></tr></thead>
      <tbody>${evals.map((e) => filaEvalDetalle(e, c)).join('')}</tbody>
    </table>
  </div>`;
}

function reglasPresentacion(np) {
  const out = [];
  if (np.minExamen !== null) {
    let estado;
    if (np.cumpleMin === true) estado = pill('verde', 'Cumples el mínimo');
    else if (np.cumpleMin === false) estado = pill('rojo', 'Sin derecho a examen');
    else if (np.necMin <= 1) estado = pill('verde', 'Mínimo asegurado');
    else if (np.necMin > 7) estado = pill('rojo', 'No alcanzas el mínimo');
    else estado = pill(np.necMin > 5.5 ? 'rojo' : 'amarillo', `Necesitas ${fmt(E.ceil1(np.necMin))} para presentarte`);
    out.push(`<div class="regla"><span>Mínimo <span class="mono">${fmt(np.minExamen)}</span> para dar examen</span>${estado}</div>`);
  }
  if (np.eximicion !== null) {
    let estado;
    if (np.eximido) estado = pill('verde', 'Eximido');
    else if (np.completa) estado = pill('neutral', 'No te eximiste');
    else if (np.necExim <= 1) estado = pill('verde', 'Eximición asegurada');
    else if (np.necExim > 7) estado = pill('neutral', 'Fuera de alcance');
    else estado = pill('teal', `Necesitas ${fmt(E.ceil1(np.necExim))} para eximirte`);
    out.push(`<div class="regla"><span>Eximición con <span class="mono">${fmt(np.eximicion)}</span></span>${estado}</div>`);
  } else out.push('<div class="regla"><span class="light">Examen obligatorio</span></div>');
  return out.join('');
}

function bloquesEvals({ calc: c, evals }) {
  const agregar = (sec, txt) => `<button class="btn-dashed" id="add-ev-${sec}" data-act="nueva-ev" data-sec="${sec}">${txt}</button>`;
  if (!c.np) {
    const warn = c.pondOk ? '' : `<div class="warn-pond">⚠ Las ponderaciones suman <span class="mono">${round1(c.totalPond)}%</span>; deberían sumar 100%. El cálculo puede no reflejar tu nota real.</div>`;
    return tablaEvals(evals, c, 'Pond.') + warn + agregar('curso', '+ Agregar evaluación');
  }
  const np = c.np;
  const pres = evals.filter(E.enPresentacion);
  const curso = evals.filter((e) => !E.enPresentacion(e));
  const sumaCurso = curso.reduce((a, e) => a + (Number(e.ponderacion) || 0), 0);
  const npVal = np.final ?? np.actual;
  const zNp = npVal === null ? 'neutral' : np.minExamen !== null && npVal < np.minExamen ? 'rojo' : npVal >= c.aprob ? 'verde' : 'amarillo';
  const warnPres = pres.length && Math.abs(np.total - 100) >= 0.01 ? `<div class="warn-pond">⚠ Los % de la presentación suman <span class="mono">${round1(np.total)}%</span>; deberían sumar 100%.</div>` : '';
  const warnCurso = Math.abs(sumaCurso - (100 - np.peso)) >= 0.01 ? `<div class="warn-pond">⚠ Estas evaluaciones suman <span class="mono">${round1(sumaCurso)}%</span>; deberían sumar <span class="mono">${round1(100 - np.peso)}%</span> de la nota final.</div>` : '';
  return `
    <div class="sec-block">
      <div class="sec-head z-${zNp}">
        <div><strong>Nota de presentación</strong><div class="sec-sub"><span class="mono">${round1(np.peso)}%</span> de la nota final${np.completa ? '' : ' · parcial'}</div></div>
        <div class="np-val mono zc">${fmt(npVal)}</div>
      </div>
      <div class="reglas">${reglasPresentacion(np)}</div>
      ${pres.length ? tablaEvals(pres, c, '% pres.') : '<p class="muted sec-vacia">Agrega las evaluaciones que forman tu nota de presentación (solemnes, controles, tareas…).</p>'}
      ${warnPres}${agregar('presentacion', '+ Agregar evaluación a la presentación')}
    </div>
    <div class="sec-block">
      <div class="sec-head"><div><strong>Examen y otras evaluaciones</strong><div class="sec-sub"><span class="mono">${round1(100 - np.peso)}%</span> de la nota final</div></div></div>
      ${curso.length ? tablaEvals(curso, c, '% final') : '<p class="muted sec-vacia">Agrega el examen.</p>'}
      ${warnCurso}${agregar('curso', '+ Agregar examen u otra evaluación')}
    </div>`;
}

function viewDetalle(an) {
  if (!an.length)
    return `<div class="card empty"><div class="big">📚</div><h2>Agrega tu primer ramo</h2>
      <p>Ingresa sus evaluaciones y ponderaciones: te diremos qué nota necesitas y cuánto estudiarlo.</p>
      <button class="btn btn-teal" data-act="nuevo-ramo">+ Agregar ramo</button></div>`;
  const x = an.find((a) => a.ramo.id === S.activeRamoId) || an[0];
  S.activeRamoId = x.ramo.id;
  const { ramo, calc: c, evals } = x;
  const al = textoAlerta(c);
  return `
    <div class="alert-strip z-${c.zona}">
      <div class="msg"><span class="ico">${al.ico}</span><span>${esc(al.txt)}</span></div>
      <button class="btn btn-navy" data-act="pdf">↓ PDF</button>
    </div>
    <section class="card z-${c.zona}">
      <div class="ramo-head">
        <div style="min-width:0">
          <h2>${esc(ramo.nombre)}</h2>
          <div class="card-sub"><span class="mono">${Number(ramo.horas_semana)}</span> hrs/semana · <span class="mono">${c.nRendidas}</span> de <span class="mono">${c.nEvals}</span> evaluaciones rendidas · aprueba con <span class="mono">${fmt(c.aprob)}</span></div>
          <div class="ramo-actions">
            <button class="btn btn-ghost btn-sm" data-act="editar-ramo">✏️ Editar ramo</button>
            <button class="btn btn-ghost btn-sm btn-danger" data-act="borrar-ramo">Borrar</button>
          </div>
        </div>
        <div class="nota-grande"><div class="n">${fmt(c.notaActual)}</div><small>nota actual</small></div>
      </div>
      <div class="gauge">
        <div class="lbl"><span>Probabilidad de aprobación</span><strong class="mono zc">${c.prob === null ? '—' : c.prob + '%'}</strong></div>
        <div class="bar"><span style="width:${c.prob ?? 0}%"></span></div>
      </div>
      ${bloquesEvals(x)}
    </section>
    ${viewAsistencia(x)}`;
}

function viewAsistencia({ ramo, asist: a }) {
  if (!a)
    return `<section class="card asist-off">
      <div><h2>Asistencia</h2><div class="card-sub">No estás llevando la asistencia de este ramo.</div></div>
      <button class="btn btn-sm" data-act="asist-activar">+ Llevar asistencia</button>
    </section>`;
  const pos = Math.min(100, Math.max(0, a.req));
  const pila = S.undo[ramo.id] || [];
  return `<section class="card z-${a.zona}">
    <div class="asist-top">
      <div><h2>Asistencia</h2>
        <div class="card-sub"><span class="mono">${a.asistidas}</span> de <span class="mono">${a.realizadas}</span> clases realizadas${a.conTotal ? ` · <span class="mono">${a.total}</span> en el semestre` : ''} · Mínimo: <span class="mono">${a.req}%</span></div></div>
      <div class="asist-pct">${a.realizadas ? a.pctActual + '%' : '—'}</div>
    </div>
    <div class="asist-bar">
      <div class="bar"><span style="width:${a.realizadas ? a.pctActual : 0}%"></span></div>
      <div class="mark" style="left:${pos}%"><span>${a.req}% requerido</span></div>
    </div>
    <div class="asist-scale"><span>0%</span><span>100%</span></div>
    <div class="asist-msg">${esc(E.mensajeAsistencia(a))}</div>
    <div class="mini-grid">
      ${a.conTotal
        ? `<div class="mini"><small>Restantes</small><div class="val">${a.restantes}</div></div>
      <div class="mini"><small>Debes asistir</small><div class="val">${a.debesAsistir}</div></div>
      <div class="mini"><small>Puedes faltar</small><div class="val">${a.puedeFaltar}</div></div>`
        : `<div class="mini"><small>Realizadas</small><div class="val">${a.realizadas}</div></div>
      <div class="mini"><small>Asistidas</small><div class="val">${a.asistidas}</div></div>
      <div class="mini"><small>Faltas</small><div class="val">${a.faltas}</div></div>`}
    </div>
    <div class="btn-row">
      <button class="btn btn-green btn-sm" data-act="asist" data-tipo="asisti">+ Asistí hoy</button>
      <button class="btn btn-sm" data-act="asist" data-tipo="falte">– Falté hoy</button>
      <button class="btn btn-sm" data-act="asist-deshacer" ${pila.length ? '' : 'disabled'}>↶ Deshacer</button>
      <button class="btn btn-sm btn-ghost" data-act="asist-editar">✏️ Editar</button>
    </div>
  </section>`;
}

// ---------- Hoy ----------

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaHumana = (d) => {
  const txt = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
  return txt[0].toUpperCase() + txt.slice(1);
};

function filaTarea(x, opts = {}) {
  const ramo = x.ramo_id ? S.data.ramos.find((r) => r.id === x.ramo_id) : null;
  const zona = ramo ? (analisis().find((a) => a.ramo.id === ramo.id)?.calc.zona ?? 'neutral') : null;
  const id = esc(x.id);
  return `<div class="tarea ${x.hecha ? 'hecha' : ''}">
    <button class="check" id="chk-${id}" data-act="tarea-toggle" data-id="${id}" role="checkbox" aria-checked="${x.hecha}" aria-label="${x.hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${esc(x.titulo)}">${x.hecha ? '✓' : ''}</button>
    <div class="t-main">
      <span class="t-tit">${esc(x.titulo)}</span>
      <span class="t-meta">${ramo ? `<span class="t-ramo z-${zona}"><i></i>${esc(ramo.nombre)}</span>` : ''}${opts.conFecha ? `<span>${esc(fechaHumana(E.parseFecha(x.fecha)))}</span>` : ''}</span>
    </div>
    ${opts.aHoy ? `<button class="btn btn-sm" id="ahoy-${id}" data-act="tarea-a-hoy" data-id="${id}">Pasar a hoy</button>` : ''}
    <button class="x-btn" id="del-t-${id}" data-act="tarea-borrar" data-id="${id}" aria-label="Borrar tarea ${esc(x.titulo)}">✕</button>
  </div>`;
}

function formTarea(fecha, idPre) {
  const ramos = ramosActivos();
  return `<form class="add-tarea" data-form="tarea" novalidate>
    <input type="hidden" name="fecha" value="${esc(fecha)}">
    <input class="input" id="${idPre}-tit" name="titulo" maxlength="160" placeholder="¿Qué tienes que hacer?" aria-label="Nueva tarea" autocomplete="off">
    <select class="input" id="${idPre}-ramo" name="ramo_id" aria-label="Ramo (opcional)">
      <option value="">Sin ramo</option>
      ${ramos.map((r) => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('')}
    </select>
    <button class="btn btn-teal" id="${idPre}-btn">Agregar</button>
  </form>`;
}

function viewHoy(an) {
  const hoy = new Date();
  const iso = E.isoFecha(hoy);
  const deHoy = E.tareasDelDia(S.data.tareas, iso);
  const hechas = deHoy.filter((x) => x.hecha).length;
  const atrasadas = E.tareasAtrasadas(S.data.tareas, iso);
  const sugerencias = E.sugerenciasDelDia(an, deHoy, hoy);
  const evalsHoy = eventosActivos().filter((x) => x.e.fecha === iso && !E.evalCompleta(x.e));
  const pct = deHoy.length ? Math.round((hechas / deHoy.length) * 100) : 0;
  return `
    <section class="card">
      <div class="card-head" style="margin-bottom:12px">
        <div><h2 class="hoy-tit">Hoy</h2><div class="card-sub">${esc(fechaHumana(hoy))}</div></div>
        ${deHoy.length ? `<div class="hoy-prog"><span class="mono">${hechas}/${deHoy.length}</span><div class="bar z-teal"><span style="width:${pct}%"></span></div></div>` : ''}
      </div>
      ${evalsHoy.map((x) => `<div class="hoy-eval z-${x.zona}" data-act="ramo" data-id="${esc(x.ramo.id)}" role="button" tabindex="0">📌 <strong>${esc(x.e.nombre)}</strong> de ${esc(x.ramo.nombre)} es hoy · <span class="mono">${Number(x.e.ponderacion)}%</span></div>`).join('')}
      ${formTarea(iso, 'hoy')}
      <div class="tareas">
        ${deHoy.length ? deHoy.map((x) => filaTarea(x)).join('') : '<p class="muted tareas-vacio">Nada por ahora. Agrega lo que quieres hacer hoy o elige una sugerencia.</p>'}
      </div>
      ${deHoy.length && hechas === deHoy.length ? '<div class="hoy-ok">🎉 ¡Terminaste todo lo de hoy!</div>' : ''}
    </section>
    ${sugerencias.length ? `<section class="card">
      <div class="card-head" style="margin-bottom:8px"><div><h2>Sugerencias para hoy</h2><div class="card-sub">Según tus evaluaciones y tu plan de horas</div></div></div>
      ${sugerencias.map((g, i) => `<div class="sug">
        <div class="t-main"><span class="t-tit">${esc(g.titulo)}</span><span class="t-meta">${pill(g.zona, g.motivo)}</span></div>
        <button class="btn btn-sm" id="sug-${i}" data-act="sugerencia" data-titulo="${esc(g.titulo)}" data-ramo="${esc(g.ramoId)}">+ Agregar</button>
      </div>`).join('')}
    </section>` : ''}
    ${atrasadas.length ? `<section class="card">
      <div class="card-head" style="margin-bottom:8px"><div><h2>Pendientes de otros días</h2><div class="card-sub">${atrasadas.length} ${atrasadas.length === 1 ? 'tarea quedó' : 'tareas quedaron'} sin hacer</div></div></div>
      <div class="tareas">${atrasadas.map((x) => filaTarea(x, { aHoy: true, conFecha: true })).join('')}</div>
    </section>` : ''}`;
}

async function crearTarea(titulo, fecha, ramoId) {
  try {
    const fila = await S.store.insert('tareas', { titulo: titulo.slice(0, 160), fecha, ramo_id: ramoId || null, hecha: false });
    S.data.tareas.push(fila);
    return true;
  } catch (err) {
    toastError(/tareas/.test(String(err?.message)) ? 'Las tareas aún no están activadas en la base de datos.' : err);
    return false;
  }
}

// El modal del día se redibuja tras cada cambio para mostrar el estado nuevo.
function refrescarModalDia() {
  if (S.modal?.tipo === 'dia') abrirModal({ tipo: 'dia', fecha: S.modal.fecha });
}

// ---------- Plan de horas ----------

function viewPlan(an) {
  if (!an.length) return `<div class="card empty"><div class="big">⏱</div><h2>Sin ramos todavía</h2><p>Agrega tus ramos para recibir un plan de horas.</p></div>`;
  const plan = E.planHoras(an.map(({ ramo, calc }) => ({ id: ramo.id, nombre: ramo.nombre, horas: ramo.horas_semana, zona: calc.zona })));
  const max = Math.max(...plan.filas.map((f) => f.asignadas), 1);
  return `<section class="card">
    <div class="card-head"><div><h2>Plan de horas recomendado</h2>
      <div class="card-sub">Distribución según riesgo · <span class="mono">${round1(plan.totalHoras)}</span> horas semanales</div></div></div>
    ${plan.filas.map((f) => `
      <div class="plan-row z-${f.zona}">
        <div class="nm"><span>${esc(f.nombre)}</span>${pill(f.zona)}</div>
        <div class="bar"><span style="width:${(f.asignadas / max) * 100}%"></span></div>
        <div class="h">${f.asignadas.toFixed(1)}</div>
      </div>`).join('')}
    <p class="foot-note">Ramos en zona roja reciben 60% más tiempo y en zona amarilla 30% más. Actualiza tus notas para recalcular.</p>
  </section>`;
}

// ---------- Calendario ----------

function eventosActivos() {
  const out = [];
  for (const { ramo, calc, evals } of analisis()) for (const e of evals) if (e.fecha) out.push({ e, ramo, zona: calc.zona === 'neutral' ? 'amarillo' : calc.zona });
  return out;
}

function viewCalendario() {
  const hoy = new Date();
  const mes = S.calMes || new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ev = eventosActivos();
  const porDia = {};
  for (const x of ev) (porDia[x.e.fecha] ||= []).push(x);
  const tareasPorDia = {};
  for (const x of S.data.tareas) (tareasPorDia[x.fecha] ||= []).push(x);
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1 - mes.getDay());
  const semanas = Math.ceil((mes.getDay() + new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()) / 7);
  const hoyIso = E.isoFecha(hoy);
  let celdas = '';
  for (let i = 0; i < semanas * 7; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const iso = E.isoFecha(d);
    const items = porDia[iso] || [];
    const cls = ['cal-day', 'has', d.getMonth() !== mes.getMonth() && 'other', iso === hoyIso && 'today'].filter(Boolean).join(' ');
    const chips = items.slice(0, 2).map((x) => `<span class="chip z-${x.zona}" title="${esc(x.ramo.nombre)}: ${esc(x.e.nombre)}">${esc(x.e.nombre)}</span>`).join('');
    const mas = items.length > 2 ? `<span class="chip-more">+${items.length - 2}</span>` : '';
    const tds = tareasPorDia[iso] || [];
    const pend = tds.filter((x) => !x.hecha).length;
    const tareasTxt = tds.length ? `<span class="cal-tareas ${pend ? '' : 'listo'}" title="${tds.length} tareas">${pend ? `☐ ${pend}` : '✓'}</span>` : '';
    celdas += `<button class="${cls}" data-act="dia" data-fecha="${iso}" aria-label="${d.getDate()} de ${MESES[d.getMonth()]}: ${items.length} evaluaciones, ${tds.length} tareas"><span class="d">${d.getDate()}</span>${chips}${mas}${tareasTxt}</button>`;
  }
  const proximas = ev
    .map((x) => ({ ...x, n: E.diasRestantes(x.e.fecha, hoy) }))
    .filter((x) => x.n >= 0 && x.n <= 45)
    .sort((a, b) => a.n - b.n);
  return `<section class="card">
    <div class="card-head" style="align-items:center"><h2>Calendario</h2>
      <div class="cal-nav">
        <button class="btn btn-sm" data-act="mes" data-d="-1" aria-label="Mes anterior">‹</button>
        <strong>${MESES[mes.getMonth()]} ${mes.getFullYear()}</strong>
        <button class="btn btn-sm" data-act="mes" data-d="1" aria-label="Mes siguiente">›</button>
      </div></div>
    <div class="cal-grid">
      ${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${celdas}
    </div>
    <div class="legend"><span class="z-verde">Verde</span><span class="z-amarillo">Amarillo</span><span class="z-rojo">Rojo</span><em>☐ tareas pendientes · toca un día para ver o agregar</em></div>
  </section>
  <section class="card">
    <div class="card-head"><div><h2>Próximas evaluaciones</h2><div class="card-sub">Próximos 45 días</div></div></div>
    ${proximas.length ? proximas.map((x) => {
      const d = E.parseFecha(x.e.fecha);
      return `<div class="prox" data-act="ramo" data-id="${esc(x.ramo.id)}" role="button" tabindex="0">
        <div class="datebox"><div class="dd">${d.getDate()}</div><div class="mm">${MESES_ABR[d.getMonth()]}</div></div>
        <div class="info"><strong>${esc(x.ramo.nombre)}</strong><span>${esc(x.e.nombre)} · <span class="mono">${Number(x.e.ponderacion)}%</span> de la nota</span></div>
        ${pill(E.zonaDias(x.n), E.etiquetaDias(x.n))}
      </div>`;
    }).join('') : '<p class="muted">No hay evaluaciones próximas con fecha asignada.</p>'}
  </section>`;
}

// ---------- Historial ----------

function semestresCerrados() {
  return S.data.semestres
    .filter((s) => !s.activo)
    .sort((a, b) => b.anio - a.anio || b.numero - a.numero)
    .map((s) => {
      const ramos = S.data.ramos.filter((r) => r.semestre_id === s.id);
      const notas = ramos.filter((r) => r.nota_final !== null && r.nota_final !== undefined);
      const aprob = notas.filter((r) => Number(r.nota_final) >= Number(r.nota_aprobacion || 4));
      const prom = notas.length ? notas.reduce((a, r) => a + Number(r.nota_final), 0) / notas.length : null;
      return { s, ramos, notas, aprobados: aprob.length, reprobados: notas.length - aprob.length, prom };
    });
}

function viewHistorial() {
  const hist = semestresCerrados();
  const todas = hist.flatMap((h) => h.notas);
  const promHist = todas.length ? todas.reduce((a, r) => a + Number(r.nota_final), 0) / todas.length : null;
  const aprob = hist.reduce((a, h) => a + h.aprobados, 0);
  const reprob = hist.reduce((a, h) => a + h.reprobados, 0);
  return `
    <div class="stat-grid">
      <div class="stat"><small>Semestres</small><div class="val">${hist.length}</div></div>
      <div class="stat z-${E.colorPromedio(promHist)}"><small>Promedio histórico</small><div class="val zc">${fmt(promHist)}</div></div>
      <div class="stat z-verde"><small>Aprobados</small><div class="val zc">${aprob}</div></div>
      <div class="stat z-rojo"><small>Reprobados</small><div class="val zc">${reprob}</div></div>
    </div>
    <div class="hist-head"><h2>Historial de semestres</h2>
      <button class="btn btn-teal" data-act="cerrar-semestre">↓ Guardar semestre actual</button></div>
    ${hist.length ? hist.map((h) => `
      <details class="sem">
        <summary class="z-${E.colorPromedio(h.prom)}">
          <div class="nm"><strong>${esc(h.s.etiqueta)}</strong><small>${h.ramos.length} ramos</small></div>
          ${h.aprobados ? pill('verde', `${h.aprobados} aprobados`) : ''}
          ${h.reprobados ? pill('rojo', `${h.reprobados} reprobados`) : ''}
          <span class="avg">${fmt(h.prom)}</span>
        </summary>
        <div class="sem-body">
          ${h.ramos.map((r) => {
            const tiene = r.nota_final !== null && r.nota_final !== undefined;
            const est = !tiene ? pill('neutral', 'En curso') : Number(r.nota_final) >= Number(r.nota_aprobacion || 4) ? pill('verde', 'Aprobado') : pill('rojo', 'Reprobado');
            return `<div class="sem-row"><span>${esc(r.nombre)}</span><span class="r">${est}<span class="mono">${tiene ? fmt(Number(r.nota_final)) : '—'}</span></span></div>`;
          }).join('') || '<p class="muted">Sin ramos.</p>'}
        </div>
      </details>`).join('') : `<div class="card empty"><div class="big">🗂</div><h2>Aún no cierras ningún semestre</h2><p>Cuando termine el semestre, guárdalo aquí para llevar tu historial.</p></div>`}`;
}

// ---------- Perfil ----------

function viewPerfil(an) {
  const p = S.data.profile;
  const prom = E.promedioGlobal(an.map((x) => x.calc));
  const rojos = an.filter((x) => x.calc.zona === 'rojo').length;
  return `<section class="card">
    <div class="profile-head">
      <span class="avatar lg">${esc(iniciales(p.nombre, S.data.email))}</span>
      <div style="min-width:0"><h2>${esc(p.nombre || 'Sin nombre')}</h2>
        <div class="muted" style="overflow-wrap:anywhere">${esc(S.data.email)}</div>
        <div style="margin-top:6px">${pill('teal', 'Plan Gratuito · Beta')}</div></div>
    </div>
    <form data-form="perfil" novalidate>
      <div class="grid-2">
        <div class="field"><label for="f-nombre">Nombre completo</label><input class="input" id="f-nombre" name="nombre" maxlength="120" value="${esc(p.nombre)}"></div>
        <div class="field"><label for="f-email">Correo institucional</label><input class="input" id="f-email" value="${esc(S.data.email)}" disabled></div>
      </div>
      <div class="grid-2">${camposPerfil(p, S.data.email)}</div>
      <div style="display:flex;gap:12px;align-items:center">
        <button class="btn btn-teal">Guardar cambios</button>
        ${S.perfilGuardado ? '<span class="saved-ok" role="status">✓ Guardado</span>' : ''}
      </div>
    </form>
  </section>
  <div class="stat-3">
    <div class="stat"><small>Ramos activos</small><div class="val">${an.length}</div></div>
    <div class="stat z-${E.colorPromedio(prom)}"><small>Promedio global</small><div class="val zc">${fmt(prom)}</div></div>
    <div class="stat ${rojos ? 'z-rojo' : ''}"><small>Zona roja</small><div class="val ${rojos ? 'zc' : ''}">${rojos}</div></div>
  </div>
  <p class="foot-note" style="text-align:center"><a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a> · <a href="/terminos" target="_blank" rel="noopener">Términos de uso</a></p>`;
}

// ---------- Alertas ----------

function alertasActuales(an) {
  return E.generarAlertas(an);
}
const claveLeidas = () => `estudia.alertas.${S.store?.demo ? 'demo' : S.store?.user?.id}`;
let cacheLeidas = null;
function leidas() {
  if (cacheLeidas?.k === claveLeidas()) return cacheLeidas.set;
  let set = new Set();
  try {
    set = new Set(JSON.parse(localStorage.getItem(claveLeidas()) || '[]'));
  } catch {}
  cacheLeidas = { k: claveLeidas(), set };
  return set;
}
function marcarLeidas(ids) {
  const set = leidas();
  ids.forEach((id) => set.add(id));
  try {
    localStorage.setItem(claveLeidas(), JSON.stringify([...set].slice(-300)));
  } catch {}
}

function viewAlertas(alertas) {
  const set = leidas();
  return `<div class="alerts-panel" role="dialog" aria-label="Alertas académicas">
    <header><strong>Alertas académicas</strong>${alertas.length ? '<button class="linkbtn" data-act="leer-todo">Marcar todo leído</button>' : ''}</header>
    <div class="alerts-list">
      ${alertas.length ? alertas.map((a) => `
        <button class="alert-item z-${a.zona} ${set.has(a.id) ? '' : 'unread'}" data-act="abrir-alerta" data-id="${esc(a.id)}" data-ramo="${esc(a.ramoId)}">
          <span class="dot"></span><span><div class="t">${esc(a.titulo)}</div><div class="d">${esc(a.detalle)}</div></span>
        </button>`).join('') : '<p class="muted" style="padding:16px;margin:0">Sin alertas por ahora. Agrega notas para recibirlas.</p>'}
    </div>
  </div>`;
}

function avisosIniciales() {
  const set = leidas();
  alertasActuales(analisis())
    .filter((a) => !set.has(a.id) && a.prioridad < 5)
    .slice(0, 2)
    .forEach((a, i) => setTimeout(() => toast({ zona: a.zona, titulo: a.titulo, detalle: a.detalle }), 400 + i * 700));
}

// ---------- Toasts ----------

function toast({ zona = 'teal', titulo, detalle = '', ms = 5000 }) {
  const el = document.createElement('div');
  el.className = `toast z-${zona}`;
  el.innerHTML = `<div class="t">${esc(titulo)}</div>${detalle ? `<div class="d">${esc(detalle)}</div>` : ''}<button class="x" aria-label="Cerrar aviso">✕</button>`;
  el.querySelector('.x').onclick = () => el.remove();
  $toasts.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
const toastError = (err) => {
  console.error(err);
  toast({ zona: 'rojo', titulo: 'No se pudo guardar', detalle: typeof err === 'string' ? err : traducirError(err) });
};

// ---------- Persistencia ----------

async function actualizar(tabla, id, cambios) {
  const lista = S.data[tabla];
  const fila = lista.find((x) => x.id === id);
  const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, fila[k]]));
  Object.assign(fila, cambios);
  renderLuego();
  try {
    await S.store.update(tabla, id, cambios);
  } catch (err) {
    Object.assign(fila, antes);
    toastError(err);
    renderLuego();
    return false;
  }
  return true;
}

// ---------- Modales ----------

function renderModal() {
  const m = S.modal;
  if (!m) return void ($modal.innerHTML = '');
  let inner = '';
  if (m.tipo === 'ramo') inner = modalRamo(m);
  else if (m.tipo === 'asist') inner = modalAsist(m);
  else if (m.tipo === 'confirm') inner = modalConfirm(m);
  else if (m.tipo === 'dia') inner = modalDia(m);
  else if (m.tipo === 'comentario') inner = modalComentario();
  if ($modal.dataset.k === m.k) return; // no redibujar un modal abierto (conserva lo escrito)
  $modal.dataset.k = m.k;
  $modal.innerHTML = `<div class="modal-bg" data-act="cerrar-modal-bg">${inner}</div>`;
  $modal.querySelector('[autofocus]')?.focus();
}
function abrirModal(m) {
  S.modal = { ...m, k: String(Date.now()) };
  renderModal();
}
function cerrarModal() {
  S.modal = null;
  delete $modal.dataset.k;
  $modal.innerHTML = '';
}

function filaEval(e = {}) {
  return `<div class="ev-row">
    <input class="input" name="ev_nombre" placeholder="Nombre" maxlength="80" value="${esc(e.nombre ?? '')}" aria-label="Nombre de la evaluación">
    <input class="input mono" name="ev_pond" inputmode="decimal" placeholder="%" value="${esc(e.ponderacion ?? '')}" aria-label="Ponderación %">
    <select class="input f-cant" name="ev_cant" aria-label="Cantidad de notas que se promedian">
      ${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${Number(e.cantidad || 1) === i + 1 ? 'selected' : ''}>${i === 0 ? '1 nota' : `${i + 1} notas`}</option>`).join('')}
    </select>
    <input class="input mono f-nota" name="ev_nota" inputmode="decimal" placeholder="Nota" value="${esc(e.nota ?? '')}" aria-label="Nota (opcional)">
    <input class="input fecha" name="ev_fecha" type="date" value="${esc(e.fecha ?? '')}" aria-label="Fecha (opcional)">
    <button type="button" class="x-btn" data-act="quitar-fila" aria-label="Quitar evaluación">✕</button>
  </div>`;
}

function modalRamo(m) {
  const r = m.ramo || {};
  const nuevo = !m.ramo;
  const v = (k, d) => esc(r[k] ?? d);
  return `<form class="modal" data-form="ramo" novalidate role="dialog" aria-modal="true" aria-labelledby="m-title">
    <header><h2 id="m-title">${nuevo ? 'Agregar nuevo ramo' : 'Editar ramo'}</h2><button type="button" class="x-btn" data-act="cerrar-modal" aria-label="Cerrar">✕</button></header>
    <div class="body">
      <div id="m-err"></div>
      <div class="field"><label for="m-nombre">Nombre del ramo</label><input class="input" id="m-nombre" name="nombre" maxlength="120" value="${v('nombre', '')}" placeholder="Ej: Cálculo Diferencial" autofocus></div>
      <div class="row">
        <div class="field"><label for="m-horas">Horas disponibles/semana</label><input class="input mono" id="m-horas" name="horas_semana" inputmode="decimal" value="${v('horas_semana', 6)}"></div>
        <div class="field"><label for="m-aprob">Nota de aprobación</label><input class="input mono" id="m-aprob" name="nota_aprobacion" inputmode="decimal" value="${esc(Number(r.nota_aprobacion ?? 4).toFixed(1))}"></div>
      </div>
      ${camposPresentacion(r)}
      ${camposAsistencia(r, nuevo)}
      ${nuevo ? `
        <div class="ev-sec hidden" data-sec="presentacion">
          <div class="section-label">Nota de presentación <span class="sec-hint">· los % suman 100% de la presentación</span></div>
          <div class="ev-row ev-row-head"><span>Nombre</span><span>% pres.</span><span>Cantidad</span><span>Nota</span><span>Fecha</span><span></span></div>
          <div class="ev-rows" data-sec="presentacion">${EVALS_PRESENTACION.map(filaEval).join('')}</div>
          <button type="button" class="btn-dashed" data-act="agregar-fila" data-sec="presentacion">+ Agregar evaluación a la presentación</button>
        </div>
        <div class="ev-sec" data-sec="curso">
          <div class="section-label" id="m-curso-label">Evaluaciones</div>
          <div class="ev-row ev-row-head"><span>Nombre</span><span>Pond. %</span><span>Cantidad</span><span>Nota</span><span>Fecha</span><span></span></div>
          <div class="ev-rows" data-sec="curso">${EVALS_SIMPLES.map(filaEval).join('')}</div>
          <button type="button" class="btn-dashed" data-act="agregar-fila" data-sec="curso">+ Agregar evaluación</button>
        </div>` : ''}
    </div>
    <footer>${nuevo ? '<span class="sum" id="m-sum"></span>' : ''}<button type="button" class="btn" data-act="cerrar-modal">Cancelar</button><button class="btn btn-teal">${nuevo ? 'Agregar ramo' : 'Guardar'}</button></footer>
  </form>`;
}

const EVALS_SIMPLES = [{ nombre: 'Control 1', ponderacion: 30 }, { nombre: 'Solemne', ponderacion: 30 }, { nombre: 'Examen', ponderacion: 40 }];
const EVALS_PRESENTACION = [{ nombre: 'Solemne 1', ponderacion: 35 }, { nombre: 'Solemne 2', ponderacion: 35 }, { nombre: 'Controles', ponderacion: 30, cantidad: 4 }];

function camposAsistencia(r, nuevo) {
  const activa = !nuevo && E.asistenciaActiva(r);
  return `<div class="np-box">
    <div class="field" style="margin-bottom:0"><span class="label">¿Este ramo exige asistencia mínima?</span>
      <div class="seg" role="radiogroup" aria-label="Asistencia">
        <label><input type="radio" name="asist_on" value="no" ${activa ? '' : 'checked'}><span>No</span></label>
        <label><input type="radio" name="asist_on" value="si" ${activa ? 'checked' : ''}><span>Sí</span></label>
      </div>
      <span class="hint">Si la activas, después de cada clase marcas "Asistí" o "Falté".</span></div>
    <div class="asist-campos ${activa ? '' : 'hidden'}">
      ${camposNumerosAsistencia(r, 'm', !nuevo)}
    </div>
  </div>`;
}

function camposNumerosAsistencia(r, pre, conContadores) {
  const total = r.asist_total === null || r.asist_total === undefined || Number(r.asist_total) === 0 ? '' : Number(r.asist_total);
  return `<div class="row">
      <div class="field"><label for="${pre}-req">% de asistencia mínima</label><input class="input mono" id="${pre}-req" name="asist_requerida" inputmode="numeric" value="${esc(r.asist_requerida ?? 75)}"></div>
      <div class="field"><label for="${pre}-total">Total de clases</label><input class="input mono" id="${pre}-total" name="asist_total" inputmode="numeric" placeholder="Opcional" value="${esc(total)}"></div>
    </div>
    <p class="asist-hint">¿No sabes cuántas clases hay? Deja el total vacío: igual verás tu % de asistencia.</p>
    ${conContadores ? `<div class="row">
      <div class="field"><label for="${pre}-real">Clases realizadas</label><input class="input mono" id="${pre}-real" name="asist_realizadas" inputmode="numeric" value="${esc(r.asist_realizadas ?? 0)}"><span class="hint">Las que ya pasaron.</span></div>
      <div class="field"><label for="${pre}-asis">Clases asistidas</label><input class="input mono" id="${pre}-asis" name="asist_asistidas" inputmode="numeric" value="${esc(r.asist_asistidas ?? 0)}"></div>
    </div>` : ''}`;
}

function camposPresentacion(r) {
  const tiene = E.usaPresentacion(r);
  const nota = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(1));
  return `<div class="np-box">
    <div class="field" style="margin-bottom:0"><span class="label">¿Este ramo tiene nota de presentación a examen?</span>
      <div class="seg" role="radiogroup" aria-label="Nota de presentación">
        <label><input type="radio" name="np_tiene" value="no" ${tiene ? '' : 'checked'}><span>No</span></label>
        <label><input type="radio" name="np_tiene" value="si" ${tiene ? 'checked' : ''}><span>Sí</span></label>
      </div>
      <span class="hint">Por ejemplo, si el programa dice "70% nota de presentación y 30% examen".</span></div>
    <div class="np-campos ${tiene ? '' : 'hidden'}">
      <div class="field"><label for="m-np-peso">La nota de presentación vale (% de la nota final)</label>
        <input class="input mono" id="m-np-peso" name="np_peso" inputmode="decimal" value="${esc(tiene ? Number(r.np_peso) : 70)}"></div>
      <div class="row">
        <div class="field"><label for="m-np-min">Nota mínima para dar examen</label>
          <input class="input mono" id="m-np-min" name="np_min_examen" inputmode="decimal" placeholder="Sin mínimo" value="${esc(nota(r.np_min_examen))}">
          <span class="hint">Déjalo vacío si no hay mínimo.</span></div>
        <div class="field"><label for="m-np-exim">Nota para eximirse del examen</label>
          <input class="input mono" id="m-np-exim" name="np_eximicion" inputmode="decimal" placeholder="No hay eximición" value="${esc(nota(r.np_eximicion))}">
          <span class="hint">Déjalo vacío si el examen es obligatorio.</span></div>
      </div>
    </div>
  </div>`;
}

// Cambia el formulario al responder "¿tiene nota de presentación?".
function alternarPresentacion(form) {
  const tiene = form.np_tiene.value === 'si';
  form.querySelector('.np-campos').classList.toggle('hidden', !tiene);
  const pres = form.querySelector('.ev-sec[data-sec=presentacion]');
  if (pres) {
    pres.classList.toggle('hidden', !tiene);
    const curso = form.querySelector('.ev-rows[data-sec=curso]');
    if (!curso.dataset.tocado) {
      const peso = num(form.np_peso.value) || 70;
      curso.innerHTML = (tiene ? [{ nombre: 'Examen', ponderacion: round1(100 - peso) }] : EVALS_SIMPLES).map(filaEval).join('');
    }
  }
  actualizarSuma();
}

function actualizarSuma() {
  const form = document.querySelector('form[data-form=ramo]');
  const out = document.getElementById('m-sum');
  if (!form || !out) return;
  const sumaDe = (sec) => [...form.querySelectorAll(`.ev-rows[data-sec=${sec}] .ev-row`)].reduce((a, f) => a + (num(f.querySelector('[name=ev_pond]').value) || 0), 0);
  const filas = (sec) => form.querySelectorAll(`.ev-rows[data-sec=${sec}] .ev-row`).length;
  const muestra = (txt, total, meta, hay) => {
    const ok = !hay || Math.abs(total - meta) < 0.01;
    return `${txt} <strong class="mono" style="color:var(--${ok ? 'green' : 'red'})">${round1(total)}%</strong>${ok ? '' : ` <span class="light">(debe ser ${round1(meta)}%)</span>`}`;
  };
  if (form.np_tiene.value !== 'si') {
    out.innerHTML = muestra('Suma:', sumaDe('curso'), 100, filas('curso'));
    document.getElementById('m-curso-label').textContent = 'Evaluaciones';
    return;
  }
  const peso = num(form.np_peso.value) || 0;
  document.getElementById('m-curso-label').innerHTML = `Examen y otras evaluaciones <span class="sec-hint">· suman el ${esc(round1(100 - peso))}% restante de la nota final</span>`;
  out.innerHTML = `${muestra('Presentación:', sumaDe('presentacion'), 100, filas('presentacion'))} · ${muestra('Resto:', sumaDe('curso'), 100 - peso, filas('curso'))}`;
}

function leerPresentacion(f) {
  if (f.np_tiene.value !== 'si') return { np_peso: null, np_min_examen: null, np_eximicion: null };
  const peso = num(f.np_peso.value);
  if (peso === null || Number.isNaN(peso) || peso <= 0 || peso >= 100) return 'El % de la nota de presentación debe estar entre 1 y 99.';
  const nota = (v, nombre) => {
    const n = num(v);
    if (n === null) return null;
    if (Number.isNaN(n) || n < 1 || n > 7) throw new Error(`La ${nombre} debe estar entre 1.0 y 7.0.`);
    return round1(n);
  };
  try {
    return { np_peso: round1(peso), np_min_examen: nota(f.np_min_examen.value, 'nota mínima para dar examen'), np_eximicion: nota(f.np_eximicion.value, 'nota para eximirse') };
  } catch (err) {
    return err.message;
  }
}

// Lee la asistencia de un formulario. Sin "¿exige asistencia?" (modal de asistencia) se asume activa.
// Si el formulario no trae contadores (ramo nuevo), parten en 0.
function leerAsistencia(f, base, nuevo = false) {
  const activa = f.asist_on ? f.asist_on.value === 'si' : true;
  if (!activa) return nuevo ? { ...base, asist_activa: false, asist_requerida: 75, asist_total: null, asist_realizadas: 0, asist_asistidas: 0 } : { ...base, asist_activa: false };
  const req = num(f.asist_requerida.value) ?? 75;
  const total = num(f.asist_total.value) || null;
  const asistidas = f.asist_asistidas ? num(f.asist_asistidas.value) ?? 0 : 0;
  const realizadas = f.asist_realizadas ? num(f.asist_realizadas.value) ?? asistidas : 0;
  const ints = [req, realizadas, asistidas, ...(total === null ? [] : [total])];
  if (ints.some((x) => !Number.isInteger(x) || x < 0)) return 'Los datos de asistencia deben ser números enteros positivos.';
  if (req > 100) return 'El % de asistencia mínima debe estar entre 0 y 100.';
  if (total !== null && total > 500) return 'El total de clases parece demasiado alto.';
  if (total !== null && realizadas > total) return 'Las clases realizadas no pueden superar el total de clases.';
  if (asistidas > realizadas) return 'Las clases asistidas no pueden superar las clases realizadas.';
  return { ...base, asist_activa: true, asist_requerida: req, asist_total: total, asist_realizadas: realizadas, asist_asistidas: asistidas };
}

function errModal(msg) {
  const box = document.getElementById('m-err');
  box.innerHTML = `<div class="error-box" role="alert">${esc(msg)}</div>`;
  box.scrollIntoView({ block: 'nearest' });
}

async function guardarRamo(f) {
  const m = S.modal;
  const nombre = f.nombre.value.trim();
  if (!nombre) return errModal('Escribe el nombre del ramo.');
  const horas = num(f.horas_semana.value) ?? 6;
  if (Number.isNaN(horas) || horas < 0 || horas > 80) return errModal('Las horas por semana deben estar entre 0 y 80.');
  const aprob = num(f.nota_aprobacion.value) ?? 4;
  if (Number.isNaN(aprob) || aprob < 1 || aprob > 7) return errModal('La nota de aprobación debe estar entre 1.0 y 7.0.');
  const npCampos = leerPresentacion(f);
  if (typeof npCampos === 'string') return errModal(npCampos);
  const ramo = leerAsistencia(f, { nombre: nombre.slice(0, 120), horas_semana: round1(horas), nota_aprobacion: round1(aprob), ...npCampos }, !m.ramo);
  if (typeof ramo === 'string') return errModal(ramo);

  if (m.ramo) {
    const antes = S.data.ramos.find((x) => x.id === m.ramo.id);
    const teniaNP = E.usaPresentacion(antes);
    const pesoAnterior = Number(antes.np_peso); // se lee antes de guardar: actualizar() modifica el ramo
    cerrarModal();
    if (!(await actualizar('ramos', m.ramo.id, ramo))) return;
    if (teniaNP && !ramo.np_peso) {
      // Sin nota de presentación, sus evaluaciones vuelven a ponderar directo sobre la nota final.
      const pres = evalsDe(m.ramo.id).filter(E.enPresentacion);
      const total = pres.reduce((a, e) => a + Number(e.ponderacion), 0) || 100;
      for (const e of pres) await actualizar('evaluaciones', e.id, { seccion: 'curso', ponderacion: Math.round((Number(e.ponderacion) / total) * pesoAnterior * 100) / 100 });
    } else if (!teniaNP && ramo.np_peso && evalsDe(m.ramo.id).length) {
      toast({ zona: 'teal', titulo: 'Ahora mueve a la presentación las evaluaciones que correspondan', detalle: 'Usa "→ Mover a la presentación" bajo cada una.', ms: 7000 });
    }
    return;
  }

  const evals = [];
  for (const fila of f.querySelectorAll('.ev-sec:not(.hidden) .ev-rows .ev-row')) {
    const seccion = fila.closest('.ev-rows').dataset.sec;
    const n = fila.querySelector('[name=ev_nombre]').value.trim();
    const p = num(fila.querySelector('[name=ev_pond]').value);
    const nota = num(fila.querySelector('[name=ev_nota]').value);
    const fecha = fila.querySelector('[name=ev_fecha]').value || null;
    const cant = Number(fila.querySelector('[name=ev_cant]').value) || 1;
    if (!n && p === null && nota === null && !fecha) continue;
    if (!n) return errModal('Cada evaluación necesita un nombre.');
    if (p === null || Number.isNaN(p) || p < 0 || p > 100) return errModal(`La ponderación de "${n}" debe estar entre 0 y 100.`);
    if (nota !== null && (Number.isNaN(nota) || nota < 1 || nota > 7)) return errModal(`La nota de "${n}" debe estar entre 1.0 y 7.0.`);
    const base = cant > 1
      ? { nombre: n.slice(0, 80), ponderacion: p, nota: null, fecha, cantidad: cant, notas: Array(cant).fill(null) }
      : { nombre: n.slice(0, 80), ponderacion: p, nota: nota === null ? null : round1(nota), fecha };
    evals.push(seccion === 'presentacion' ? { ...base, seccion } : base);
  }
  const suma = (pres) => evals.filter((e) => (e.seccion === 'presentacion') === pres).reduce((a, e) => a + e.ponderacion, 0);
  const hay = (pres) => evals.some((e) => (e.seccion === 'presentacion') === pres);
  if (ramo.np_peso) {
    if (hay(true) && Math.abs(suma(true) - 100) >= 0.01) return errModal(`Los % de la nota de presentación suman ${round1(suma(true))}%. Deben sumar 100%.`);
    if (hay(false) && Math.abs(suma(false) - (100 - ramo.np_peso)) >= 0.01)
      return errModal(`El examen y las otras evaluaciones suman ${round1(suma(false))}%. Deben sumar ${round1(100 - ramo.np_peso)}% (el resto de la nota final).`);
  } else if (evals.length && Math.abs(suma(false) - 100) >= 0.01) return errModal(`Las ponderaciones suman ${round1(suma(false))}%. Deben sumar 100%.`);

  const btn = f.querySelector('.btn-teal');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const creado = await S.store.insert('ramos', { ...ramo, semestre_id: semActivo().id });
    S.data.ramos.push(creado);
    if (evals.length) S.data.evaluaciones.push(...(await S.store.insert('evaluaciones', evals.map((e) => ({ ...e, ramo_id: creado.id })))));
    S.activeRamoId = creado.id;
    S.tab = 'detalle';
    cerrarModal();
    render();
    toast({ zona: 'verde', titulo: `✓ ${creado.nombre} agregado` });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Agregar ramo';
    errModal(traducirError(err));
  }
}

function modalAsist(m) {
  const r = m.ramo;
  return `<form class="modal sm" data-form="asist" novalidate role="dialog" aria-modal="true" aria-labelledby="m-title">
    <header><h2 id="m-title">Editar asistencia</h2><button type="button" class="x-btn" data-act="cerrar-modal" aria-label="Cerrar">✕</button></header>
    <div class="body">
      <div id="m-err"></div>
      <p class="muted" style="margin-top:0">${esc(r.nombre)}</p>
      ${camposNumerosAsistencia(r, 'a', true)}
    </div>
    <footer><button type="button" class="linkbtn btn-danger" style="margin-right:auto;font-size:13px" data-act="asist-desactivar">Dejar de llevar asistencia</button><button type="button" class="btn" data-act="cerrar-modal">Cancelar</button><button class="btn btn-teal">Guardar</button></footer>
  </form>`;
}

function modalConfirm(m) {
  return `<div class="modal sm" role="alertdialog" aria-modal="true" aria-labelledby="m-title">
    <header><h2 id="m-title">${esc(m.titulo)}</h2><button type="button" class="x-btn" data-act="cerrar-modal" aria-label="Cerrar">✕</button></header>
    <div class="body"><p style="margin:0">${esc(m.texto)}</p></div>
    <footer><button type="button" class="btn" data-act="cerrar-modal" autofocus>Cancelar</button><button type="button" class="btn ${m.peligro ? 'btn-navy' : 'btn-teal'}" data-act="confirmar">${esc(m.ok)}</button></footer>
  </div>`;
}

function modalDia(m) {
  const d = E.parseFecha(m.fecha);
  const items = eventosActivos().filter((x) => x.e.fecha === m.fecha);
  const tareas = E.tareasDelDia(S.data.tareas, m.fecha);
  return `<div class="modal sm" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <header><h2 id="m-title">${esc(fechaHumana(d))}</h2><button type="button" class="x-btn" data-act="cerrar-modal" aria-label="Cerrar">✕</button></header>
    <div class="body">
      ${items.length ? '<div class="section-label" style="margin-top:0">Evaluaciones</div>' : ''}
      ${items.map((x) => `<div class="prox" data-act="ramo" data-id="${esc(x.ramo.id)}" role="button" tabindex="0">
        <div class="info"><strong>${esc(x.e.nombre)}</strong><span>${esc(x.ramo.nombre)} · <span class="mono">${Number(x.e.ponderacion)}%</span> de la nota${E.notaEval(x.e) !== null ? ` · ${E.esGrupo(x.e) ? 'promedio' : 'nota'} <span class="mono">${fmt(E.notaEval(x.e))}</span>` : ''}</span></div>
        ${pill(x.zona)}
      </div>`).join('')}
      <div class="section-label"${items.length ? '' : ' style="margin-top:0"'}>Tareas</div>
      <div class="tareas">${tareas.length ? tareas.map((x) => filaTarea(x)).join('') : '<p class="muted tareas-vacio">Sin tareas para este día.</p>'}</div>
      ${formTarea(m.fecha, 'dia')}
    </div>
  </div>`;
}

function modalComentario() {
  const demo = S.store.demo;
  return `<form class="modal sm" data-form="comentario" novalidate role="dialog" aria-modal="true" aria-labelledby="m-title">
    <header><h2 id="m-title">Enviar comentarios</h2><button type="button" class="x-btn" data-act="cerrar-modal" aria-label="Cerrar">✕</button></header>
    <div class="body">
      <div id="m-err"></div>
      ${demo ? '<div class="info-box">Estás en la demo: para enviar comentarios necesitas crear una cuenta gratis.</div>' : ''}
      <p class="muted" style="margin-top:0">Estudia! está en beta. ¿Qué te gustaría mejorar, qué falló o qué te gustó? Lo leemos todo.</p>
      <div class="field"><span class="label">Tipo</span>
        <div class="seg" role="radiogroup" aria-label="Tipo de comentario">
          <label><input type="radio" name="tipo" value="idea" checked ${demo ? 'disabled' : ''}><span>💡 Idea</span></label>
          <label><input type="radio" name="tipo" value="error" ${demo ? 'disabled' : ''}><span>🐞 Error</span></label>
          <label><input type="radio" name="tipo" value="otro" ${demo ? 'disabled' : ''}><span>💬 Otro</span></label>
        </div></div>
      <div class="field"><label for="c-msg">Mensaje</label>
        <textarea class="input" id="c-msg" name="mensaje" rows="5" maxlength="2000" placeholder="Ej: me gustaría poder… / al guardar una nota pasó…" ${demo ? 'disabled' : 'autofocus'}></textarea>
        <span class="hint">Si es un error, cuéntanos qué estabas haciendo. No incluyas contraseñas ni datos sensibles.</span></div>
    </div>
    <footer><button type="button" class="btn" data-act="cerrar-modal">Cancelar</button>
      ${demo ? (supabaseConfigurado() ? '<button type="button" class="btn btn-teal" data-act="demo-registro">Crear cuenta gratis</button>' : '') : '<button class="btn btn-teal">Enviar</button>'}</footer>
  </form>`;
}

async function enviarComentario(f) {
  const mensaje = f.mensaje.value.trim();
  if (mensaje.length < 3) return errModal('Escribe tu comentario antes de enviarlo.');
  const btn = f.querySelector('.btn-teal');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    await S.store.insert('comentarios', {
      tipo: f.tipo.value,
      mensaje: mensaje.slice(0, 2000),
      pantalla: S.tab,
      user_agent: navigator.userAgent.slice(0, 300),
    });
    cerrarModal();
    toast({ zona: 'verde', titulo: '✓ ¡Gracias! Recibimos tu comentario' });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Enviar';
    errModal(traducirError(err));
  }
}

// ---------- PDF ----------

function notaPDF(e) {
  if (!E.esGrupo(e)) return E.notaEval(e) === null ? 'Pend.' : fmt(E.notaEval(e));
  const notas = E.subNotas(e);
  const hechas = notas.filter((n) => n !== null);
  return `${notas.map((n) => (n === null ? '—' : fmt(n))).join(' · ')}${hechas.length ? ` (prom. ${fmt(E.notaEval(e))})` : ''}`;
}

function generarPDF() {
  const an = analisis();
  const p = S.data.profile;
  const prom = E.promedioGlobal(an.map((x) => x.calc));
  const cuenta = (z) => an.filter((x) => x.calc.zona === z).length;
  const hoy = new Date();
  const necesita = (c) => {
    if (c.finalizado) return c.aprobado ? `Ramo aprobado con un ${fmt(c.notaActual)}.` : `Nota final ${fmt(c.notaActual)}, bajo la nota de aprobación.`;
    if (c.estadoMin === 'asegurado') return 'Ya aseguraste la aprobación de este ramo.';
    if (c.estadoMin === 'imposible') return 'No alcanza ni con un 7.0 en las evaluaciones pendientes.';
    if (c.notaMinPend === null) return 'Agrega evaluaciones para calcular la nota que necesitas.';
    return `Necesitas ${fmt(c.notaMinMostrar)} en las evaluaciones pendientes para aprobar.`;
  };
  $print.innerHTML = `<div class="rep">
    <div class="rep-head">
      <div><div class="logo">Estudia<b>!</b></div><div class="sub">Reporte académico semestral · ${esc(semActivo()?.etiqueta)}</div></div>
      <div class="who"><strong>${esc(p.nombre || S.data.email)}</strong><br>${esc([p.carrera, p.universidad].filter(Boolean).join(' · '))}<br>${hoy.toLocaleDateString('es-CL')}</div>
    </div>
    <div class="rep-stats">
      <div class="stat z-${E.colorPromedio(prom)}"><small>Promedio global</small><div class="val zc">${fmt(prom)}</div></div>
      <div class="stat z-rojo"><small>Zona roja</small><div class="val zc">${cuenta('rojo')}</div></div>
      <div class="stat z-amarillo"><small>Zona amarilla</small><div class="val zc">${cuenta('amarillo')}</div></div>
      <div class="stat z-verde"><small>Zona verde</small><div class="val zc">${cuenta('verde')}</div></div>
    </div>
    ${an.map(({ ramo, calc: c, evals }) => `
      <div class="rep-ramo z-${c.zona}">
        <div class="top">
          <div><h3>${esc(ramo.nombre)}</h3><span class="muted">${Number(ramo.horas_semana)} hrs/semana · nota actual <span class="mono">${fmt(c.notaActual)}</span></span></div>
          <div>${pill(c.zona)} <span class="mono">${c.prob === null ? '—' : c.prob + '%'}</span></div>
        </div>
        <div class="bar" style="margin-top:8px"><span style="width:${c.prob ?? 0}%"></span></div>
        ${c.np ? `<p class="muted" style="margin:8px 0 0">Nota de presentación: <span class="mono">${fmt(c.np.final ?? c.np.actual)}</span> (${round1(c.np.peso)}% de la nota final${c.np.minExamen !== null ? ` · mínimo ${fmt(c.np.minExamen)} para dar examen` : ''}${c.np.eximicion !== null ? ` · eximición con ${fmt(c.np.eximicion)}` : ''})</p>` : ''}
        <table><thead><tr><th>Evaluación</th><th>Fecha</th><th>Pond.</th><th>Nota</th></tr></thead><tbody>
          ${evals.map((e) => `<tr><td>${esc(e.nombre)}</td><td>${esc(fechaLarga(e.fecha))}</td><td class="mono">${Number(e.ponderacion)}%${c.np && E.enPresentacion(e) ? ' pres.' : ''}</td><td class="mono">${notaPDF(e)}</td></tr>`).join('')}
        </tbody></table>
        <div class="rep-need">${esc(necesita(c))}</div>
      </div>`).join('') || '<p>Sin ramos en el semestre activo.</p>'}
    <div class="rep-foot">Generado por Estudia! · ${hoy.toLocaleDateString('es-CL')}</div>
  </div>`;
  window.print();
}

// ---------- Acciones ----------

const acciones = {
  'auth-mode'(el) {
    S.authMode = el.dataset.mode;
    S.authErr = null;
    S.authInfo = null;
    render();
  },
  demo() {
    entrar(new DemoStore());
  },
  'demo-registro'() {
    Object.assign(S, { store: null, data: null, view: 'auth', authMode: 'registro', modal: null, alertsOpen: false });
    render();
  },
  async reenviar() {
    await conBusy(async () => {
      const sb = await getSupabase();
      const { error } = await sb.auth.resend({ type: 'signup', email: S.pendingEmail, options: { emailRedirectTo: location.origin + '/app/' } });
      if (error) throw error;
      S.authInfo = 'Te enviamos un nuevo correo de verificación.';
    });
  },
  logout: salir,
  reintentar() {
    entrar(S.store);
  },
  'omitir-onb'() {
    terminarOnboarding({});
  },
  tab(el) {
    S.tab = el.dataset.tab;
    S.alertsOpen = false;
    S.perfilGuardado = false;
    render();
    window.scrollTo({ top: 0 });
  },
  ramo(el) {
    S.activeRamoId = el.dataset.id;
    S.tab = 'detalle';
    S.alertsOpen = false;
    cerrarModal();
    render();
    if (matchMedia('(max-width: 768px)').matches) document.querySelector('.tabs')?.scrollIntoView({ behavior: 'smooth' });
  },
  'nuevo-ramo'() {
    abrirModal({ tipo: 'ramo' });
    actualizarSuma();
  },
  'editar-ramo'() {
    abrirModal({ tipo: 'ramo', ramo: S.data.ramos.find((r) => r.id === S.activeRamoId) });
  },
  'borrar-ramo'() {
    const r = S.data.ramos.find((x) => x.id === S.activeRamoId);
    abrirModal({
      tipo: 'confirm', titulo: 'Borrar ramo', ok: 'Borrar ramo', peligro: true,
      texto: `Se borrará "${r.nombre}" con todas sus evaluaciones. Esta acción no se puede deshacer.`,
      async onOk() {
        try {
          await S.store.remove('ramos', r.id);
          S.data.ramos = S.data.ramos.filter((x) => x.id !== r.id);
          S.data.evaluaciones = S.data.evaluaciones.filter((e) => e.ramo_id !== r.id);
          for (const x of S.data.tareas) if (x.ramo_id === r.id) x.ramo_id = null;
          S.activeRamoId = ramosActivos()[0]?.id ?? null;
          render();
        } catch (err) {
          toastError(err);
        }
      },
    });
  },
  'agregar-fila'(el) {
    const lista = document.querySelector(`.ev-rows[data-sec=${el.dataset.sec || 'curso'}]`);
    lista.dataset.tocado = '1';
    lista.insertAdjacentHTML('beforeend', filaEval());
    lista.querySelector('.ev-row:last-child input')?.focus();
    actualizarSuma();
  },
  'quitar-fila'(el) {
    el.closest('.ev-rows').dataset.tocado = '1';
    el.closest('.ev-row').remove();
    actualizarSuma();
  },
  async 'nueva-ev'(el) {
    const ramo = S.data.ramos.find((r) => r.id === S.activeRamoId);
    const np = E.usaPresentacion(ramo);
    const pres = np && el.dataset.sec === 'presentacion';
    const evals = evalsDe(S.activeRamoId);
    const delGrupo = np ? evals.filter((e) => E.enPresentacion(e) === pres) : evals;
    const usado = delGrupo.reduce((a, e) => a + (Number(e.ponderacion) || 0), 0);
    const meta = !np || pres ? 100 : 100 - Number(ramo.np_peso);
    const fila = { ramo_id: S.activeRamoId, nombre: `Evaluación ${evals.length + 1}`, ponderacion: Math.max(0, round1(meta - usado)), nota: null, fecha: null };
    try {
      const e = await S.store.insert('evaluaciones', pres ? { ...fila, seccion: 'presentacion' } : fila);
      S.data.evaluaciones.push(e);
      render();
      const inp = document.getElementById(`ev-${e.id}-nombre`);
      inp?.focus();
      inp?.select();
    } catch (err) {
      toastError(err);
    }
  },
  mover(el) {
    const e = S.data.evaluaciones.find((x) => x.id === el.dataset.id);
    const ramo = S.data.ramos.find((r) => r.id === e.ramo_id);
    const peso = Number(ramo.np_peso);
    const pond = Number(e.ponderacion) || 0;
    const aPres = !E.enPresentacion(e);
    // 24.5% de la nota final con NP de 70% equivale a 35% de la presentación, y viceversa.
    const nueva = aPres ? (pond / peso) * 100 : (pond * peso) / 100;
    actualizar('evaluaciones', e.id, { seccion: aPres ? 'presentacion' : 'curso', ponderacion: Math.round(Math.min(100, nueva) * 100) / 100 });
  },
  dividir(el) {
    const e = S.data.evaluaciones.find((x) => x.id === el.dataset.id);
    const nota = E.notaEval(e);
    actualizar('evaluaciones', e.id, { cantidad: 2, notas: [nota, null], nota: null });
  },
  cantidad(el) {
    const e = S.data.evaluaciones.find((x) => x.id === el.dataset.id);
    const notas = E.subNotas(e);
    const n = notas.length + Number(el.dataset.d);
    if (n > E.MAX_SUBNOTAS) return;
    if (n < notas.length && notas.at(-1) !== null)
      return toast({ zona: 'amarillo', titulo: `Primero borra la nota ${notas.length}`, detalle: 'Así no pierdes una nota por error.' });
    if (n <= 1) return actualizar('evaluaciones', e.id, { cantidad: 1, notas: null, nota: notas[0] });
    actualizar('evaluaciones', e.id, { cantidad: n, notas: n > notas.length ? [...notas, null] : notas.slice(0, n) });
  },
  async 'borrar-ev'(el) {
    const id = el.dataset.id;
    const idx = S.data.evaluaciones.findIndex((e) => e.id === id);
    const [quitada] = S.data.evaluaciones.splice(idx, 1);
    render();
    try {
      await S.store.remove('evaluaciones', id);
      toast({ zona: 'neutral', titulo: `Evaluación "${quitada.nombre}" borrada`, ms: 3000 });
    } catch (err) {
      S.data.evaluaciones.splice(idx, 0, quitada);
      toastError(err);
      render();
    }
  },
  async asist(el) {
    const r = S.data.ramos.find((x) => x.id === S.activeRamoId);
    if (r.asist_total > 0 && r.asist_realizadas >= r.asist_total)
      return toast({ zona: 'amarillo', titulo: 'Ya registraste todas las clases', detalle: 'Si el ramo tiene más clases, edita el total.' });
    const previo = { asist_realizadas: r.asist_realizadas, asist_asistidas: r.asist_asistidas };
    const cambios = { asist_realizadas: r.asist_realizadas + 1, asist_asistidas: r.asist_asistidas + (el.dataset.tipo === 'asisti' ? 1 : 0) };
    (S.undo[r.id] ||= []).push(previo);
    if (!(await actualizar('ramos', r.id, cambios))) S.undo[r.id].pop();
  },
  async 'asist-deshacer'() {
    const r = S.data.ramos.find((x) => x.id === S.activeRamoId);
    const previo = S.undo[r.id]?.pop();
    if (previo) await actualizar('ramos', r.id, previo);
  },
  async 'asist-activar'() {
    const r = S.data.ramos.find((x) => x.id === S.activeRamoId);
    if (await actualizar('ramos', r.id, { asist_activa: true })) abrirModal({ tipo: 'asist', ramo: r });
  },
  'asist-desactivar'() {
    const r = S.modal.ramo;
    cerrarModal();
    actualizar('ramos', r.id, { asist_activa: false });
    toast({ zona: 'neutral', titulo: 'Asistencia desactivada', detalle: 'Tus registros se guardan por si la vuelves a activar.', ms: 4000 });
  },
  'asist-editar'() {
    abrirModal({ tipo: 'asist', ramo: S.data.ramos.find((x) => x.id === S.activeRamoId) });
  },
  mes(el) {
    const hoy = new Date();
    const base = S.calMes || new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    S.calMes = new Date(base.getFullYear(), base.getMonth() + Number(el.dataset.d), 1);
    render();
  },
  async 'tarea-toggle'(el) {
    const x = S.data.tareas.find((t) => t.id === el.dataset.id);
    const hecha = !x.hecha;
    await actualizar('tareas', x.id, { hecha, hecha_at: hecha ? new Date().toISOString() : null });
    refrescarModalDia();
  },
  async 'tarea-borrar'(el) {
    const idx = S.data.tareas.findIndex((t) => t.id === el.dataset.id);
    const [quitada] = S.data.tareas.splice(idx, 1);
    render();
    refrescarModalDia();
    try {
      await S.store.remove('tareas', quitada.id);
    } catch (err) {
      S.data.tareas.splice(idx, 0, quitada);
      toastError(err);
      render();
      refrescarModalDia();
    }
  },
  'tarea-a-hoy'(el) {
    actualizar('tareas', el.dataset.id, { fecha: E.isoFecha(new Date()) });
  },
  async sugerencia(el) {
    if (await crearTarea(el.dataset.titulo, E.isoFecha(new Date()), el.dataset.ramo)) {
      render();
      toast({ zona: 'verde', titulo: '✓ Agregada a tu día', ms: 2500 });
    }
  },
  dia(el) {
    abrirModal({ tipo: 'dia', fecha: el.dataset.fecha });
  },
  'cerrar-semestre'() {
    const sem = semActivo();
    const sig = E.semestreSiguiente(sem.anio, sem.numero);
    const an = analisis();
    const enCurso = an.filter((x) => !x.calc.finalizado).length;
    abrirModal({
      tipo: 'confirm', titulo: `Guardar ${sem.etiqueta}`, ok: 'Guardar y cerrar semestre',
      texto: `${sem.etiqueta} pasará a tu historial con sus ${an.length} ramos y se abrirá el ${sig.etiqueta} vacío.` +
        (enCurso ? ` ${enCurso} ${enCurso === 1 ? 'ramo tiene' : 'ramos tienen'} evaluaciones sin nota y quedará${enCurso === 1 ? '' : 'n'} como "En curso".` : '') +
        ' Los ramos cerrados ya no se pueden editar.',
      onOk: () => cerrarSemestre(an, sem, sig),
    });
  },
  comentarios() {
    S.alertsOpen = false;
    render();
    abrirModal({ tipo: 'comentario' });
  },
  'toggle-alertas'() {
    S.alertsOpen = !S.alertsOpen;
    render();
  },
  'leer-todo'() {
    marcarLeidas(alertasActuales(analisis()).map((a) => a.id));
    render();
  },
  'abrir-alerta'(el) {
    marcarLeidas([el.dataset.id]);
    acciones.ramo({ dataset: { id: el.dataset.ramo } });
  },
  pdf: generarPDF,
  'cerrar-modal': cerrarModal,
  'cerrar-modal-bg'(el, ev) {
    if (ev.target === el) cerrarModal();
  },
  async confirmar() {
    const fn = S.modal?.onOk;
    cerrarModal();
    await fn?.();
  },
};

async function cerrarSemestre(an, sem, sig) {
  try {
    const finales = [];
    for (const { ramo, calc } of an) {
      const nota_final = calc.finalizado ? round1(calc.notaActual) : null;
      await S.store.update('ramos', ramo.id, { nota_final });
      ramo.nota_final = nota_final;
      if (nota_final !== null) finales.push(nota_final);
    }
    const promedio = finales.length ? Math.round((finales.reduce((a, b) => a + b, 0) / finales.length) * 100) / 100 : null;
    Object.assign(sem, await S.store.update('semestres', sem.id, { activo: false, cerrado_at: new Date().toISOString(), promedio }));
    S.data.semestres.push(await S.store.insert('semestres', { ...sig, activo: true }));
    S.activeRamoId = null;
    S.undo = {};
    render();
    toast({ zona: 'verde', titulo: `✓ ${sem.etiqueta} guardado`, detalle: `Ya puedes agregar los ramos del ${sig.etiqueta}.` });
  } catch (err) {
    toastError(err);
    entrar(S.store); // recarga para quedar consistente con la base de datos
  }
}

// ---------- Eventos ----------

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (S.alertsOpen && !ev.target.closest('.alerts-panel') && el?.dataset.act !== 'toggle-alertas') {
    S.alertsOpen = false;
    render();
  }
  if (!el) return;
  const fn = acciones[el.dataset.act];
  if (fn) {
    if (el.tagName === 'A') ev.preventDefault();
    fn(el, ev);
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (S.modal) cerrarModal();
    else if (S.alertsOpen) (S.alertsOpen = false), render();
  }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[role=button][data-act]')) {
    ev.preventDefault();
    ev.target.click();
  }
});

document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();
  const tipo = f.dataset.form;
  if (authForms[tipo]) return authForms[tipo](f);
  if (tipo === 'onboarding') return terminarOnboarding(leerPerfil(f));
  if (tipo === 'ramo') return guardarRamo(f);
  if (tipo === 'asist') {
    const r = S.modal.ramo;
    const cambios = leerAsistencia(f, {});
    if (typeof cambios === 'string') return errModal(cambios);
    cerrarModal();
    S.undo[r.id] = [];
    return actualizar('ramos', r.id, cambios);
  }
  if (tipo === 'comentario') return enviarComentario(f);
  if (tipo === 'tarea') {
    const titulo = f.titulo.value.trim();
    if (!titulo) return f.titulo.focus();
    const focoId = f.titulo.id;
    if (await crearTarea(titulo, f.fecha.value, f.ramo_id.value)) {
      const ramo = f.ramo_id.value;
      render();
      if (S.modal?.tipo === 'dia') refrescarModalDia();
      // Deja el campo listo para la siguiente tarea, con el mismo ramo elegido.
      const nuevo = document.getElementById(focoId);
      nuevo?.focus();
      const sel = nuevo?.form?.ramo_id;
      if (sel) sel.value = ramo;
    }
    return;
  }
  if (tipo === 'perfil') {
    const cambios = { nombre: f.nombre.value.trim().slice(0, 120), ...leerPerfil(f) };
    try {
      S.data.profile = await S.store.updateProfile(cambios);
      S.perfilGuardado = true;
      render();
      setTimeout(() => {
        if (S.perfilGuardado) {
          S.perfilGuardado = false;
          document.querySelector('.saved-ok')?.remove();
        }
      }, 2500);
    } catch (err) {
      toastError(err);
    }
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.change === 'otra') {
    const otra = document.getElementById(`${el.id}-otra`);
    otra.classList.toggle('hidden', el.value !== '__otra__');
    if (el.value === '__otra__') otra.focus();
    return;
  }
  if (el.dataset.change === 'ev') cambiarEval(el);
  if (el.dataset.change === 'sub') cambiarSubNota(el);
  if (el.name === 'np_tiene') alternarPresentacion(el.form);
  if (el.name === 'asist_on') el.form.querySelector('.asist-campos').classList.toggle('hidden', el.value !== 'si');
  if (el.name === 'ev_cant') {
    const nota = el.closest('.ev-row').querySelector('[name=ev_nota]');
    nota.disabled = Number(el.value) > 1;
    nota.placeholder = nota.disabled ? 'Después' : 'Nota';
    if (nota.disabled) nota.value = '';
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.closest?.('.ev-rows')) t.closest('.ev-rows').dataset.tocado = '1';
  if (t.name === 'ev_pond') actualizarSuma();
  if (t.name === 'np_peso') {
    const curso = t.form.querySelector('.ev-rows[data-sec=curso]');
    if (curso && !curso.dataset.tocado && t.form.np_tiene.value === 'si') alternarPresentacion(t.form);
    else actualizarSuma();
  }
});

function cambiarEval(el) {
  const e = S.data.evaluaciones.find((x) => x.id === el.dataset.id);
  if (!e) return;
  const campo = el.dataset.field;
  const raw = el.value.trim();
  const revertir = (msg) => {
    toast({ zona: 'rojo', titulo: msg });
    el.classList.add('invalid');
    el.value = campo === 'nota' ? (e.nota === null || e.nota === undefined ? '' : Number(e.nota).toFixed(1)) : e[campo] ?? '';
    setTimeout(() => el.classList.remove('invalid'), 1500);
  };
  let valor;
  if (campo === 'nota') {
    const n = num(raw);
    if (n !== null && (Number.isNaN(n) || n < 1 || n > 7)) return revertir('La nota debe estar entre 1.0 y 7.0.');
    valor = n === null ? null : round1(n);
  } else if (campo === 'ponderacion') {
    const n = num(raw);
    if (n === null || Number.isNaN(n) || n < 0 || n > 100) return revertir('La ponderación debe estar entre 0 y 100.');
    valor = Math.round(n * 100) / 100;
  } else if (campo === 'nombre') {
    if (!raw) return revertir('La evaluación necesita un nombre.');
    valor = raw.slice(0, 80);
  } else if (campo === 'fecha') {
    valor = raw || null;
  }
  const actual = campo === 'nota' || campo === 'ponderacion' ? (e[campo] === null || e[campo] === undefined ? null : Number(e[campo])) : e[campo] ?? null;
  if (valor === actual) return;
  actualizar('evaluaciones', e.id, { [campo]: valor });
}

function cambiarSubNota(el) {
  const e = S.data.evaluaciones.find((x) => x.id === el.dataset.id);
  if (!e) return;
  const idx = Number(el.dataset.idx);
  const notas = E.subNotas(e);
  const n = num(el.value);
  if (n !== null && (Number.isNaN(n) || n < 1 || n > 7)) {
    toast({ zona: 'rojo', titulo: 'La nota debe estar entre 1.0 y 7.0.' });
    el.classList.add('invalid');
    el.value = notas[idx] === null ? '' : notas[idx].toFixed(1);
    setTimeout(() => el.classList.remove('invalid'), 1500);
    return;
  }
  const valor = n === null ? null : round1(n);
  if (valor === notas[idx]) return;
  notas[idx] = valor;
  actualizar('evaluaciones', e.id, { notas });
}

// ---------- Inicio ----------

async function iniciar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (params.has('demo')) return entrar(new DemoStore());
  if (!supabaseConfigurado()) {
    S.view = 'auth';
    return render();
  }
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    if (data.session && !ES_RECUPERACION) {
      if (params.has('registro')) history.replaceState(null, '', '/app/');
      return entrar(new RemoteStore(sb, data.session.user));
    }
    if (!ES_RECUPERACION && params.has('registro')) S.authMode = 'registro';
    if (ES_RECUPERACION && !data.session) {
      S.authMode = 'recuperar';
      S.authErr = 'El enlace para cambiar tu contraseña expiró o no es válido. Pide uno nuevo.';
    }
  } catch (err) {
    console.error(err);
    S.authErr = traducirError(err);
  }
  S.view = 'auth';
  render();
}

iniciar();
