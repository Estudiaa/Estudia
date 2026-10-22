// Capa de datos: Supabase (cuentas reales) o memoria (modo demo, no guarda nada).
import { CONFIG } from '/config.js';
import { semillaDemo } from './data.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.80.0/+esm';
const TABLAS = ['semestres', 'ramos', 'evaluaciones', 'comentarios'];

let cliente = null;
export async function getSupabase() {
  if (!cliente) {
    const { createClient } = await import(SUPABASE_ESM);
    cliente = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return cliente;
}

export class RemoteStore {
  constructor(sb, user) {
    this.sb = sb;
    this.user = user;
    this.demo = false;
  }

  async loadAll() {
    const uid = this.user.id;
    const [p, s, r, e] = await Promise.all([
      this.sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      this.sb.from('semestres').select('*').eq('user_id', uid).order('anio').order('numero'),
      this.sb.from('ramos').select('*').eq('user_id', uid).order('created_at'),
      this.sb.from('evaluaciones').select('*').eq('user_id', uid).order('created_at'),
    ]);
    for (const res of [p, s, r, e]) if (res.error) throw res.error;
    let profile = p.data;
    if (!profile) {
      // Respaldo por si el trigger handle_new_user no creó el perfil.
      const meta = this.user.user_metadata || {};
      const ins = await this.sb.from('profiles')
        .insert({ id: uid, nombre: meta.nombre || '', acepto_terminos_at: meta.acepto_terminos ? new Date().toISOString() : null })
        .select().single();
      if (ins.error) throw ins.error;
      profile = ins.data;
    }
    return { profile, email: this.user.email, semestres: s.data, ramos: r.data, evaluaciones: e.data };
  }

  async insert(tabla, filas) {
    check(tabla);
    const rows = (Array.isArray(filas) ? filas : [filas]).map((f) => ({ ...f, user_id: this.user.id }));
    if (tabla === 'comentarios') {
      // Solo escritura: el estudiante no puede leer comentarios, así que no se pide .select().
      const { error } = await this.sb.from(tabla).insert(rows);
      if (error) throw error;
      return Array.isArray(filas) ? rows : rows[0];
    }
    const { data, error } = await this.sb.from(tabla).insert(rows).select();
    if (error) throw error;
    return Array.isArray(filas) ? data : data[0];
  }

  async update(tabla, id, cambios) {
    check(tabla);
    const { data, error } = await this.sb.from(tabla).update(cambios).eq('id', id).eq('user_id', this.user.id).select().single();
    if (error) throw error;
    return data;
  }

  async remove(tabla, id) {
    check(tabla);
    const { error } = await this.sb.from(tabla).delete().eq('id', id).eq('user_id', this.user.id);
    if (error) throw error;
  }

  async updateProfile(cambios) {
    const { data, error } = await this.sb.from('profiles').update(cambios).eq('id', this.user.id).select().single();
    if (error) throw error;
    return data;
  }

  async signOut() {
    await this.sb.auth.signOut();
  }
}

export class DemoStore {
  constructor() {
    this.demo = true;
    this.db = semillaDemo();
  }

  async loadAll() {
    return structuredClone(this.db);
  }

  async insert(tabla, filas) {
    check(tabla);
    const now = new Date().toISOString();
    const rows = (Array.isArray(filas) ? filas : [filas]).map((f) => ({ id: crypto.randomUUID(), user_id: 'demo', created_at: now, ...f }));
    this.db[tabla].push(...structuredClone(rows));
    return Array.isArray(filas) ? rows : rows[0];
  }

  async update(tabla, id, cambios) {
    check(tabla);
    const fila = this.db[tabla].find((x) => x.id === id);
    Object.assign(fila, structuredClone(cambios));
    return structuredClone(fila);
  }

  async remove(tabla, id) {
    check(tabla);
    this.db[tabla] = this.db[tabla].filter((x) => x.id !== id);
    if (tabla === 'ramos') this.db.evaluaciones = this.db.evaluaciones.filter((e) => e.ramo_id !== id);
  }

  async updateProfile(cambios) {
    Object.assign(this.db.profile, cambios);
    return structuredClone(this.db.profile);
  }

  async signOut() {}
}

function check(tabla) {
  if (!TABLAS.includes(tabla)) throw new Error(`Tabla no permitida: ${tabla}`);
}
