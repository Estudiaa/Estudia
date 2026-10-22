// Configuración pública de Estudia!
// Solo van aquí valores PÚBLICOS: la URL del proyecto Supabase y su clave "anon".
// Nunca pongas la clave service_role ni otras claves privadas en este archivo.
// Mientras sigan los valores de ejemplo, la app funciona solo en modo demo.
export const CONFIG = {
  SUPABASE_URL: 'https://jepowcvkbenknrkmjqpq.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_1YEeFf2WbMZicBiJ4qN2IA_p1rALM10',
  // Correo de contacto del proyecto (footer y páginas legales). Vacío = se oculta.
  CONTACT_EMAIL: '',
};

export const supabaseConfigurado = () =>
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(CONFIG.SUPABASE_URL) &&
  !CONFIG.SUPABASE_URL.includes('TU-PROYECTO') &&
  CONFIG.SUPABASE_ANON_KEY.length > 30;
