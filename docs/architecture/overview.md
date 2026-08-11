# Arquitectura del sistema — Visión general

**Fase:** 0 — Planificación y arquitectura
**Estado:** propuesta final para Fase 0 (implementación real inicia en Fase 1)

## 1. Contexto arquitectónico

Aplicación web Next.js (App Router) desplegada en Vercel, con Supabase como backend de
datos, autenticación y almacenamiento de archivos. No hay backend propio adicional: la
lógica de servidor vive en Route Handlers / Server Actions de Next.js, y la seguridad de
datos se garantiza en PostgreSQL vía Row Level Security (RLS), no en la capa de
aplicación.

```
[Navegador: cámara / archivo]
        |
        v
[Next.js App Router — Server + Client Components]
        |            \
        v             v
[Route Handlers /   [Web Worker: pipeline OCR propio]
 Server Actions]
        |
        v
[Supabase: Auth · Postgres (RLS) · Storage privado]
```

El pipeline OCR corre **en el navegador dentro de un Web Worker**, no en el servidor:
evita bloquear la interfaz (RNF-008) y no requiere infraestructura de cómputo adicional
en el backend. El servidor solo persiste imagen original, resultados OCR y validaciones.

## 2. Estructura de carpetas propuesta

Se parte de la estructura de referencia del enunciado y se ajusta para resolver
ambigüedades detectadas (ver §4). Esta estructura se crea en Fase 1 (bootstrap técnico);
en Fase 0 solo se documenta.

```
src/
  app/
    (auth)/                 # login, registro — layout sin nav de app
    (dashboard)/            # shell autenticado: nav, layout compartido
      admin/                # rutas admin, anidadas bajo el mismo shell,
                             # protegidas por chequeo de rol (server) + RLS
    api/                    # Route Handlers (webhooks, endpoints que no
                             # encajan como Server Action)
  modules/                  # lógica de dominio por feature (framework-agnostic
                             # donde sea posible; UI + casos de uso del módulo)
    auth/
    users/
    documents/
    camera/
    ocr/
      preprocessing/
      segmentation/
      classification/      # HOG + kNN propios
      extraction/           # extractor de campos invoice_es
      profiles/             # OCRDocumentProfile, invoice_es
    validation/              # flujo de validación humana (RF-007): UI +
                             # casos de uso sobre document_validations
    audit/
  components/
    ui/                      # componentes de presentación puros, sin lógica
                             # de dominio
    layout/
  lib/
    supabase/                # clientes Supabase (browser/server), tipos generados
    validation/              # utilidades de validación GENÉRICAS y reusables
                             # (schemas de entrada, tipos primitivos) — no
                             # confundir con modules/validation (ver §4)
    utils/
  workers/
    ocr.worker.ts            # entry point del Web Worker; orquesta
                             # modules/ocr, no contiene lógica propia
  types/

supabase/
  migrations/                # migraciones SQL versionadas
  policies/                  # políticas RLS documentadas/organizadas por tabla
  seeds/                     # datos ficticios de desarrollo únicamente

docs/
  architecture/
  requirements/
  ocr/
  testing/
  decisions/

tests/
  unit/
  integration/
  e2e/
  ocr-benchmark/
```

## 3. Módulos y responsabilidades

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `auth` | Sesión, perfil, rol | Supabase Auth |
| `users` | Gestión de perfiles (`profiles`) | `auth` |
| `documents` | CRUD de documentos, estado, filtros (RF-004, RF-005) | `auth`, Storage |
| `camera` | Captura vía `getUserMedia`, fallback input file (RF-001) | ninguno (independiente, ver §13 del enunciado) |
| `ocr` | Pipeline propio completo: preprocesamiento → segmentación → clasificación → extracción de campos → confidence (RF-002, RF-003) | `camera`/`documents` (recibe `ImageData`), corre en `workers/ocr.worker.ts` |
| `validation` | Flujo de validación humana, diffs original/validado (RF-007) | `ocr`, `documents` |
| `audit` | Registro y consulta de `audit_logs` | todos los módulos que generan eventos |

`camera` y `ocr` son intencionalmente independientes entre sí: `camera` solo produce una
imagen capturada/confirmada; `ocr` solo consume `ImageData`. Esto permite probar el
pipeline OCR con imágenes fijas de dataset sin depender de la cámara real.

## 4. Ambigüedades resueltas (no bloqueantes)

Análisis del enunciado detectó puntos que requerían una decisión de diseño explícita
para evitar duplicación o confusión futura. Ninguno constituye una contradicción de
requerimiento que amerite detener el trabajo y pedir autorización (protocolo de
`CLAUDE.md` §3) — se documentan como decisiones de arquitectura:

1. **`lib/validation/` vs. `modules/validation/`.** El enunciado lista ambos. Se separan
   por nivel: `lib/validation` son utilidades genéricas y reusables de validación de
   entrada (ej. schemas de formularios, validación de tipo/tamaño de archivo para
   RNF-003) sin conocimiento de reglas de negocio; `modules/validation` es el módulo de
   dominio de RF-007 (comparar documento vs. datos OCR, registrar quién validó y qué se
   corrigió). Ver ADR-0001.
2. **Ubicación de `admin/`.** El enunciado lo lista como hermano de `(dashboard)/`. Se
   decide anidarlo dentro de `(dashboard)/admin/` para reutilizar el shell de layout y
   los componentes de navegación, distinguiendo únicamente el conjunto de rutas visibles
   por rol. La protección real de acceso es de todas formas por rol (server-side) + RLS,
   nunca solo por routing.
3. **Formato de cierre de fase.** El enunciado da dos plantillas de cierre (una general
   en la regla de ejecución por fases, otra específica de control de versiones). Se usa
   siempre la plantilla más completa (con evidencia Git) como cuerpo del reporte, y el
   texto literal indicado explícitamente para cada fase como línea de cierre.

## 5. Frontera Server/Client Components

- **Server Components por defecto** para todo lo que lee datos (listados, detalle de
  documento, dashboards) — reduce JS enviado al cliente y permite leer con RLS del lado
  servidor usando la sesión del usuario.
- **Client Components** solo donde hay interactividad real: captura de cámara, preview,
  formularios de validación, progreso del Web Worker OCR, componentes de UI con estado
  local.
- **Server Actions / Route Handlers** para mutaciones (crear documento, subir imagen a
  Storage, guardar resultado OCR, guardar validación). Se prioriza Server Actions;
  Route Handlers se reservan para casos que lo requieran explícitamente (ej. si se
  necesita una URL de API estable).

## 6. Despliegue

Vercel (Next.js) + Supabase (Postgres, Auth, Storage) gestionados como proyectos
separados, conectados por variables de entorno (ver `.env.example`). Sin servidores
propios adicionales. `FUTURE-PWA`: ningún elemento de esta arquitectura impide agregar
un manifest + service worker más adelante; no se implementa ahora.

## 7. Escalabilidad y rendimiento (RNF-008, RNF-001)

- Sin estado global de servidor: cada request server-side lee su propio contexto de
  sesión.
- Listados de documentos paginados desde el inicio (no cargar todo el historial).
- Índices en `documents(owner_id, created_at)`, `documents(status)`, y en campos usados
  por filtros de RF-005 (ver `data-model.md`).
- OCR nunca bloquea el hilo principal: corre en Web Worker; `processing_ms` se mide y
  persiste en cada ejecución para poder verificar RNF-001 con datos reales, nunca por
  afirmación.
