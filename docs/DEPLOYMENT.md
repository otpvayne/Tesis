# Deployment — Mansor OCR

## Estado actual

**Sin deploy confirmado.** No hay `vercel.json`, carpeta `.vercel/`, ni ninguna otra
señal en este repositorio de que el proyecto se haya conectado a Vercel todavía. Este
documento son las instrucciones para hacerlo — no una descripción de un sistema ya en
producción. Si el equipo ya deployó manualmente fuera de esta sesión, actualizar esta
sección con la URL real y la fecha.

## Cómo desplegar

### Requisitos

- Repositorio en GitHub: `https://github.com/otpvayne/Tesis` (ya existe).
- Cuenta de Vercel con acceso al repositorio.
- Proyecto de Supabase ya creado (Fase 1) con las migraciones de `supabase/migrations/`
  aplicadas (`npx supabase db push --linked`).

### Pasos

1. **Conectar el repo a Vercel:**
   - `https://vercel.com/new` → importar `otpvayne/Tesis`.
   - Framework detectado: Next.js (automático).
   - Branch de producción: `main`.

2. **Configurar variables de entorno en Vercel** (mismos nombres que `.env.example`,
   con los valores reales del proyecto Supabase — nunca commitear estos valores en el
   repo):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — **solo servidor**, marcar como variable sensible en
     Vercel, nunca con prefijo `NEXT_PUBLIC_`.
   - `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_APP_URL` — la URL final que asigne Vercel (o el dominio custom).

3. **Deploy inicial:** Vercel construye automáticamente al importar. Confirmar que
   `npm run build` (el mismo comando que corre esta sesión para verificar cada fase)
   termina sin errores en el log de build de Vercel.

4. **Deploys posteriores:** cada push a `main` (vía merge de una rama de fase aprobada,
   `CLAUDE.md` §3) dispara un deploy automático — no hace falta ningún comando manual
   adicional. Ramas de fase (`fase/N-nombre`) generan preview deployments automáticos
   si Vercel está configurado con el comportamiento por defecto.

### Verificación post-deploy (checklist mínimo)

- [ ] `/login` y `/register` funcionan contra el proyecto Supabase real.
- [ ] Subir un documento en `/documents/new` guarda en Storage y en `documents`.
- [ ] Hay al menos un modelo OCR activo (`/ocr-lab/train` o `npm run generate:model`
      corrido contra el proyecto de producción) — sin esto, "Procesar documento" da 404.
- [ ] `/admin` es inaccesible para una cuenta sin rol ADMIN.
- [ ] Ejecutar (o al menos revisar) `tests/MANUAL_CHECKLIST.md` contra la URL real.

## Rollback

```bash
git revert <commit-hash>
git push origin main
```

Vercel redeploya automáticamente con el revert. Alternativa sin tocar `main`: promover
manualmente un deployment anterior a producción desde el dashboard de Vercel
(`Deployments` → deployment anterior → `Promote to Production`).

## Monitoreo

- Vercel dashboard (build logs, deployments, métricas de la función) — URL depende del
  proyecto una vez creado en Vercel.
- Supabase dashboard (`https://supabase.com/dashboard/project/<project-ref>`) — logs de
  Postgres/Auth/Storage, uso de recursos.

Ninguna de las dos cosas está configurada con alertas todavía (RNF-005: sin afirmar
disponibilidad/SLA no medido).
