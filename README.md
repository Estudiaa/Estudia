# Estudia! — micro app (beta)

App web mobile-first e instalable (PWA) para universitarios chilenos. Calcula la nota mínima que necesitas en lo pendiente, clasifica cada ramo en zona verde, amarilla o roja, redistribuye tus horas de estudio y controla tu asistencia. Beta gratuita y sin consejero IA.

Es un sitio estático: no hay paso de build. Supabase entrega la base de datos y la autenticación.

```
index.html            Landing
landing.js            Año del copyright, enlace de contacto y service worker
privacidad.html       Política de privacidad (borrador para revisión legal)
terminos.html         Términos de uso (borrador para revisión legal)
config.js             URL y clave pública (anon) de Supabase  ← editar
app/index.html        App (/app)
app/app.js            Pantallas, eventos, alertas y PDF
app/engine.js         Motor de cálculo puro (nota mínima, zonas, asistencia, plan de horas)
app/store.js          Datos: Supabase o memoria (demo)
app/data.js           Universidades, carreras y semilla de la demo
supabase/schema.sql   Tablas, Row Level Security y trigger de perfil
sw.js, manifest.webmanifest, icons/   PWA
vercel.json           URLs limpias y encabezados de seguridad (CSP)
tests/                Pruebas del motor (npm test)
```

## Puesta en marcha

1. **Supabase** (crearlo con el correo del proyecto, no el personal)
   - Crear proyecto → *SQL Editor* → pegar y ejecutar `supabase/schema.sql`.
   - *Authentication → Providers → Email*: activar **Confirm email** y largo mínimo de contraseña 8.
   - *Authentication → URL Configuration*: **Site URL** = `https://tu-dominio` y en **Redirect URLs** agregar `https://tu-dominio/app/**` (y `http://localhost:3000/app/**` para probar en local).
   - *Project Settings → API*: copiar **Project URL** y la clave **anon public**.
   - (Recomendado) Personalizar en español los correos de *Authentication → Email Templates* y configurar un SMTP propio: el correo incluido en Supabase tiene un límite bajo de envíos por hora.
2. **config.js**: pegar `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Opcional: `CONTACT_EMAIL`.
   La clave anon es pública por diseño; la seguridad la dan las políticas RLS. **Nunca** pegar la clave `service_role`.
3. **Vercel**: importar el repositorio con *Framework Preset: Other*, sin comando de build y con directorio de salida `.` (raíz).
4. Probar: registro → correo de verificación → onboarding → agregar un ramo.

Mientras `config.js` tenga los valores de ejemplo, la app funciona solo en **modo demo** (`/app?demo=1`), con datos de ejemplo y sin guardar nada.

## Desarrollo local

```bash
npm run dev     # http://localhost:3000  (sirve los archivos estáticos)
npm test        # pruebas del motor de cálculo
```

## Decisiones tomadas (spec §11)

| Punto | Decisión |
|---|---|
| Formato | Web mobile-first + PWA (instalable desde el navegador) |
| Nota de aprobación | Configurable por ramo, 4.0 por defecto |
| Cuenta demo | Se mantiene, solo local, no guarda nada |
| Asistencia | Contadores: total del semestre, clases realizadas y asistidas |
| Precios | Ocultos: "Gratis durante la beta" |
| Cifras sin fuente | Eliminadas; se reemplazaron por datos del producto (escala 1.0–7.0, 3 zonas, $0) |

## Bugs del prototipo corregidos (spec §10)

1. El promedio global es el promedio de las notas actuales y ya no queda topado en 4.0.
2. La nota mínima se acota: muestra "Ya aprobaste" si es ≤ 1.0 y "No alcanza ni con un 7.0" si pasa de 7.0 (probabilidad 0%).
3. Las ponderaciones deben sumar 100% al crear un ramo; en el detalle aparece un aviso si no cuadran.
4. La asistencia distingue clases realizadas de futuras ("Asistí hoy" / "Falté hoy" / "Deshacer").
5. El semestre activo se deduce de la fecha y el año del copyright es dinámico.
6. Las alertas y los avisos emergentes se generan con los datos reales.
7. El perfil guarda en la base de datos.
8. `--green-lt` está definida.
9. Todo texto del usuario se escapa antes de insertarlo en el HTML.
10. Se eliminaron las cifras sin fuente.

## Pendiente para el dueño

- Apagar el Cloudflare Worker del consejero y **regenerar la API key de Anthropic**.
- Activar verificación en dos pasos en Vercel, Cloudflare, GitHub y Supabase.
- Revisar la Política de privacidad y los Términos con un abogado (Ley 19.628 / Ley 21.719).
- Confirmar el dominio (`estudiaapp.cl`) y el correo de contacto.
- Eliminar una cuenta hoy requiere hacerlo a mano desde el panel de Supabase (*Authentication → Users*); borra todos sus datos en cascada.
- Plan gratis de Supabase: el proyecto se pausa tras 7 días sin actividad.
