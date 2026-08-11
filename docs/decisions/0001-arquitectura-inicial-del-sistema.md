# ADR-0001: Arquitectura inicial del sistema

- **Estado:** Aceptado
- **Fecha:** 2026-08-11
- **Fase:** 0 — Planificación y arquitectura
- **Participantes:** Diego Alejandro Medina Martinez (Tech Lead, NETRIX Corporation),
  Andres Felipe Moreno Beltrán (Desarrollador, Mansor), Santiago Moralez Orozco
  (Desarrollador, Mansor)

## Contexto

El proyecto de grado requiere digitalizar facturas físicas de Mansor mediante captura
web y un motor OCR desarrollado enteramente por el equipo (sin librerías OCR/CV/ML de
terceros), con validación humana, control de acceso por rol, y trazabilidad completa
requerimiento → implementación → prueba, verificable ante un jurado académico. No hay
fecha de entrega fija; el proceso por fases con gates de aprobación se sigue sin
excepción.

## Decisión

1. **Aplicación web única (Next.js + TypeScript + React), mobile first**, sin apps
   nativas ni React Native/Expo. Server Components por defecto, Client Components solo
   donde hay interactividad real (cámara, preview, progreso OCR, formularios de
   validación).
2. **Supabase** como backend único: PostgreSQL + Auth nativo + Storage privado. Sin
   proveedor de autenticación externo. Seguridad de datos garantizada por **Row Level
   Security**, nunca solo por lógica de frontend.
3. **Motor OCR propio**, ejecutado en un **Web Worker** en el navegador (no en
   servidor), con pipeline: decodificación → escala de grises → normalización/contraste
   → binarización (Otsu propio) → morfología propia → componentes conectados propios →
   segmentación por proyecciones → HOG propio → kNN propio → reconstrucción →
   postprocesamiento → extracción de campos → confidence score. Ninguna dependencia de
   OCR/CV/ML de terceros (lista explícita en `CLAUDE.md` §7).
4. **Un solo perfil documental en esta fase: `invoice_es`**, primer modelo
   `invoice_es_v1`. Perfiles futuros solo como identificadores temporales sin definir.
5. **Estructura de carpetas** por módulo de dominio (`src/modules/*`) + capas técnicas
   compartidas (`src/lib`, `src/components`, `src/workers`), separando explícitamente
   utilidades genéricas de validación (`lib/validation`) del módulo de dominio de
   validación humana RF-007 (`modules/validation`) — ver `docs/architecture/overview.md`
   §4 para el detalle de esta y otras dos decisiones de desambiguación.
6. **Modelo de datos** basado en las siete entidades de referencia del enunciado
   (`profiles`, `documents`, `ocr_results`, `document_validations`, `ocr_models`,
   `ocr_training_samples`, `audit_logs`), con JSONB en los campos que deben tolerar
   múltiples perfiles documentales sin migraciones destructivas.
7. **Dataset y entrenamiento** gestionados por una herramienta interna propia, **OCR
   LAB** (solo `ADMIN`), con particiones `train`/`validation`/`test` estrictas —
   `test` nunca se usa para entrenar ni calibrar.
8. **Git**: rama por fase, `main` solo recibe código estable vía merge autorizado
   explícitamente, Conventional Commits, sin force push ni reescritura de historial
   compartido sin autorización.
9. **Fuera de alcance actual** (sin implementación, ni siquiera simulada): PDF, PWA,
   modo offline, integración contable (RF-006, `DEFERRED`). Se documentan como
   `FUTURE-PWA` / `DEFERRED` para no bloquear su incorporación futura sin
   comprometerse a ella ahora.

## Análisis de contradicciones

Se revisó el enunciado completo buscando conflictos que obligaran a modificar un
requerimiento (protocolo de `CLAUDE.md` §3). **No se encontró ninguna contradicción
bloqueante** que requiera detener el trabajo y solicitar autorización de cambio de
requerimiento en esta fase.

Se identificaron tres **ambigüedades de diseño** (no contradicciones de requerimiento)
resueltas mediante decisión arquitectónica documentada en
`docs/architecture/overview.md` §4:

- Solapamiento aparente entre `lib/validation/` y `modules/validation/` en la
  estructura de referencia → resuelto por separación de responsabilidad (genérico vs.
  dominio).
- Ubicación de `admin/` en la estructura de rutas → resuelto anidándolo bajo
  `(dashboard)/admin/` en vez de como hermano top-level, reutilizando el shell de
  layout.
- Dos plantillas de texto de cierre de fase en el enunciado (general vs. con evidencia
  Git) → resuelto usando siempre el reporte más completo, con el texto de cierre
  literal indicado para cada fase específica.

Ninguna de estas decisiones modifica el alcance, los RF/RNF, ni requiere aprobación
especial — son puramente de organización interna del código y de formato de reporte.

## Alternativas consideradas

- **Backend propio separado (Node/Express) en vez de Route Handlers/Server Actions de
  Next.js**: descartado — añade infraestructura y superficie de despliegue adicional sin
  necesidad; Supabase + Next.js cubren los requerimientos con RLS como límite de
  seguridad real.
- **Ejecutar el pipeline OCR en servidor en vez de Web Worker en cliente**: descartado
  por ahora — evita cómputo/infraestructura de servidor adicional y cumple RNF-008 (no
  bloquear la interfaz) sin backend dedicado; puede reconsiderarse si el rendimiento en
  dispositivos móviles de gama baja resulta insuficiente (a medir en Fase 4f).
- **Tabla separada por tipo documental en vez de JSONB en `extracted_data`**: descartado
  — con un solo perfil activo (`invoice_es`) no se justifica la complejidad; JSONB deja
  la puerta abierta a perfiles futuros sin migración destructiva.

## Consecuencias

- El equipo asume la carga de implementar y documentar matemáticamente cada algoritmo
  OCR (`docs/ocr/algorithms.md`), lo cual es más lento que integrar una librería
  existente pero es un requisito explícito e innegociable del proyecto.
- La seguridad del sistema depende críticamente de que las políticas RLS se implementen
  y prueben correctamente desde Fase 1/2 — cualquier ausencia de política equivale a
  una fuga de datos entre usuarios.
- Mantener JSONB flexible implica que la validación de forma de `extracted_data` /
  `validated_data` debe hacerse en la capa de aplicación (TypeScript), no solo en la
  base de datos.
