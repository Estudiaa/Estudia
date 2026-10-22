import { CONFIG } from '/config.js';

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
