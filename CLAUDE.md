# CLAUDE.md

Este archivo es la fuente de verdad persistente del proyecto para cualquier sesión de
Claude Code que trabaje en este repositorio. **Debe releerse antes de cualquier cambio
importante en fases futuras.** Si algo en este archivo entra en conflicto con una
instrucción puntual del usuario, se detiene el trabajo y se pregunta — no se asume.

---

## 1. Identidad del proyecto

**Título:** Implementación de un sistema de digitalización de documentos físicos para
optimizar la gestión financiera en la empresa Mansor.

**Tipo:** Proyecto de grado — Ingeniería de Software.

**Empresas:** Mansor (cliente/dueño del proceso de negocio) + NETRIX Corporation
(acompañamiento técnico).

**Repositorio oficial:** `https://github.com/otpvayne/Tesis.git` (remote `origin`).

**Calendario:** no hay fecha de entrega fija. El ritmo lo define el equipo. Esto NO es
licencia para comprimir el proceso de fases — el gate de aprobación por fase se respeta
siempre, sin excepción por presión de tiempo (no existe tal presión).

## 2. Equipo

Usar exclusivamente estos nombres para este proyecto:

- **Diego Alejandro Medina Martinez** — Ingeniero, UMB
- **Andres Felipe Moreno Beltrán** — Ingeniero, UMB
- **Santiago Moralez Orozco** — Ingeniero, UMB

(Roles actualizados en Fase 2 para reflejar `README.md`, tras el commit `4864ed0`
publicado directamente en GitHub sobre `fase/0-planificacion`.)

Somos tres personas trabajando sobre el mismo repositorio. Antes de modificar cualquier
archivo: `git status`, `git branch`, `git remote -v`. Si hay cambios locales no
reconocidos, DETENERSE e informar "CAMBIOS EXTERNOS DETECTADOS" con la lista de
archivos — nunca sobrescribir.

## 3. Regla de ejecución por fases (obligatoria, sin excepciones)

El proyecto avanza por fases. **Nunca** se pasa de una fase a la siguiente sin
aprobación explícita del usuario con el texto: `"APROBAR FASE X. EJECUTAR FASE X+1."`
(o, si aplica integración a `main`: `"APROBAR FASE X. INTEGRAR A MAIN Y EJECUTAR FASE
X+1."`).

Al terminar cada fase se reporta:

1. Qué se implementó
2. Archivos creados
3. Archivos modificados
4. Decisiones técnicas tomadas
5. RF y RNF cubiertos
6. Pruebas ejecutadas
7. Resultado de las pruebas
8. Problemas encontrados
9. Deuda técnica detectada
10. Pendientes
11. Propuesta para la siguiente fase

Más evidencia Git (rama, commits, último commit, estado del push, archivos principales).
Cierre exacto:

```
FASE X FINALIZADA.
RAMA PUBLICADA EN GITHUB.
ESPERANDO APROBACIÓN PARA MERGE Y CONTINUAR.
```

Si un problema arquitectónico obliga a modificar un requerimiento: NO modificarlo en
silencio. Detenerse y reportar REQUERIMIENTO AFECTADO / PROBLEMA / CAUSA / IMPACTO /
PROPUESTA DE CAMBIO / TRAZABILIDAD AFECTADA, y esperar autorización.

### Ramas por fase

`main` (solo versiones estables aprobadas) +
`fase/0-planificacion`, `fase/1-base-tecnica`, `fase/2-documentos`, `fase/3-camara`,
`fase/4a-ocr-preprocesamiento`, `fase/4b-ocr-segmentacion`, `fase/4c-ocr-clasificacion`,
`fase/4d-ocr-training`, `fase/4e-ocr-pipeline`, `fase/4f-ocr-evaluation`,
`fase/5-validacion`, `fase/6-administracion`, `fase/7-testing`, `fase/8-deployment`,
`fase/9-documentacion`. `feature/nombre` solo para aislar trabajo puntual dentro de una
fase.

Commits: Conventional Commits (`feat(scope): ...`, `fix`, `test`, `docs`, `refactor`,
`chore`), unidades pequeñas y coherentes. Nunca `--force` sin autorización explícita.
Nunca reescribir historial compartido. Tags solo al integrar una fase importante a
`main` (`v0.1.0-foundation`, `v0.2.0-documents`, ..., `v1.0.0`).

### Procedimiento de integración a `main` (al recibir "APROBAR FASE X. INTEGRAR A MAIN...")

1. `git status` en la rama de la fase — confirmar árbol limpio, sin cambios externos no
   reconocidos (si los hay: DETENERSE e informar "CAMBIOS EXTERNOS DETECTADOS").
2. `git fetch origin` y confirmar que la rama de la fase está sincronizada con
   `origin/<rama>` (sin commits locales ni remotos pendientes de traer).
3. Integrar a `main`:
   - Si `main` no existe todavía, crearla desde la rama de la fase (no hay conflicto
     posible — es la primera integración).
   - Si `main` ya existe, traer `origin/main`, hacer merge de la rama de la fase sobre
     `main` (fast-forward si es posible; si hay conflictos, resolverlos preservando el
     trabajo de ambas partes, nunca descartando cambios sin analizarlos).
4. `git push` de `main` al remoto.
5. Crear la siguiente rama de fase (`fase/N+1-nombre`) desde el `main` ya actualizado.
6. Tag solo si la fase integrada corresponde a un hito de versión (ver convención de
   tags arriba) — no en cada integración.
7. Reportar rama, commits, último commit y estado del push como en cualquier cierre de
   fase (§3 arriba).

La rama de la fase ya integrada no se borra automáticamente — queda como evidencia
histórica salvo que el equipo pida explícitamente eliminarla.

## 4. Alcance

Aplicación **web** únicamente (Next.js). No React Native / Expo / apps nativas. Mobile
first, funcional en desktop, tablet, Android e iPhone vía navegador. Cámara vía
`navigator.mediaDevices.getUserMedia()` con fallback `<input type="file"
accept="image/jpeg,image/png" capture="environment">`. Formatos: JPG, JPEG, PNG. **No
PDF en v1.** No PWA todavía (marcar decisiones que la afectarían como `FUTURE-PWA`, sin
bloquearla). No modo offline.

## 5. Stack

- Next.js + TypeScript (modo `strict`, evitar `any`; si se usa, comentar por qué) + React
- Supabase: PostgreSQL, **Supabase Auth nativo** (sin Clerk ni proveedores externos),
  Supabase Storage (bucket privado)
- Vercel (deploy)

Server Components / Client Components / Route Handlers solo donde aporte — no todo es
`"use client"`. Versiones estables vigentes se fijan y registran en `README.md` al
bootstrap técnico (Fase 1), no antes.

## 6. Roles y seguridad

Dos roles: **USER** y **ADMIN**. USER solo ve/gestiona sus propios documentos. ADMIN ve
todo, gestiona modelos OCR y datasets, y accede a auditoría global.

La seguridad **no depende del frontend**. Aislamiento de datos garantizado por **Row
Level Security en PostgreSQL/Supabase**, nunca solo ocultando UI. `SUPABASE_SERVICE_ROLE_KEY`
nunca se expone al navegador. HTTPS, validar MIME type y tamaño de archivo, no confiar
en nombres de archivo del cliente, sin secretos en Git. Storage: bucket privado, ruta
`{user_id}/{document_id}/original.{extension}`, URLs firmadas para visualización.

## 7. Dependencias de OCR / Visión por Computador

**Regla actualizada (2026-09-08, ver `docs/decisions/0002-uso-libreria-ocr-preentrenada.md`
para la fecha real y el detalle de la aprobación — una versión anterior de este archivo
indicaba por error 2026-08-19):** se permite el uso de librerías OCR pre-entrenadas
(Tesseract.js u otras) como parte del pipeline de reconocimiento. Decisión del equipo,
con aprobación **verbal** de la asesora de tesis (Olga Lucia Roa Bohorquez), sin
registro escrito de ella en este proceso — ver ADR-0002, sección "Aprobado por", por
razones de precisión y tiempo de entrega.

El motor OCR propio desarrollado en la Fase 4 (preprocesamiento, segmentación,
HOG+kNN, síntesis de datos) se conserva en el repositorio y NO debe eliminarse: es
evidencia de trabajo académico real y debe seguir siendo referenciable, aunque ya no
sea necesariamente el único camino de producción. Debe seguir compilando y sus tests
deben seguir pasando aunque deje de ser el camino usado en producción.

**Pendiente:** el alcance exacto de la integración (si Tesseract.js reemplaza
completamente el pipeline de clasificación propio, o si se integra de forma híbrida
conservando etapas del motor propio) lo define el equipo de implementación
(Andres/Santiago) — ver ADR-0002. Una vez decidido, se actualiza esta sección con el
alcance final y se propaga al Manual Técnico y al README.

Mientras el alcance no esté definido, siguen vigentes del motor propio: Clasificador
**HOG propio** + **kNN propio**, documentados con fórmulas en `docs/ocr/algorithms.md`.
Perfiles OCR (`OCRDocumentProfile`) — por ahora solo `invoice_es`, primer modelo
`invoice_es_v1`. Tipos futuros: solo identificadores temporales
`future_document_type_2/3/4`, sin inventar campos ni reglas. Dataset y entrenamiento
vía herramienta propia **OCR LAB** (solo admin). Split train/validation/test estricto
— `test` nunca se usa para entrenar; resultados reportados solo de `test`. Caracteres
iniciales: `0-9 A-Z a-z`; acentos y signos se evalúan después, sin ampliar el alfabeto
sin medir necesidad. Confidence score siempre calculado desde información real del
pipeline (nunca aleatorio), fórmula documentada. Procesamiento intensivo en **Web
Worker**, con estados de progreso reales (nunca progreso falso basado en timers).

**Regla original (histórica, para contexto):** antes de 2026-08-19, el proyecto
prohibía explícitamente cualquier dependencia de OCR/CV de terceros (Tesseract /
Tesseract.js, OpenCV / OpenCV.js, EasyOCR, PaddleOCR, Google Vision, Google Document
AI, AWS Textract, Azure Computer Vision, OCR.space, ABBYY, TensorFlow / TensorFlow.js,
PyTorch, ONNX Runtime, ML Kit, transformers OCR, modelos preentrenados, APIs/servicios
OCR de terceros, librerías que hagan segmentación o reconocimiento automático, modelos
descargados de terceros), como restricción académica para demostrar comprensión de
los algoritmos desde los fundamentos. Esa restricción se flexibilizó por la decisión
documentada en `docs/decisions/0002-uso-libreria-ocr-preentrenada.md`.

**Alcance de la integración, resolviendo el "Pendiente" de la nota anterior (2026-09-08,
aprobado explícitamente por Diego Alejandro Medina Martinez, comunicado por Andrés
Felipe Moreno Beltrán):** el equipo de implementación (Andres/Santiago) definió que la
integración es **híbrida, no un reemplazo completo** del pipeline propio. El equipo
concluyó que el
pipeline propio, aunque funcional de extremo a extremo, todavía no reconoce caracteres
con suficiente precisión (67.4% character accuracy en test real al cierre de Fase 4f,
ver `docs/ocr/evaluation.md`) para producir campos confiables a corto plazo, y necesita
una demo funcional. Se autoriza agregar **Tesseract.js** como motor de reconocimiento
**adicional**, no como reemplazo:

- La regla de "desarrollado desde cero" de esta sección **no se elimina** — sigue
  aplicando al pipeline propio (`modules/ocr/pipeline/`, `modules/ocr/classification/`,
  `modules/ocr/segmentation/`, `modules/ocr/preprocessing/`), que sigue siendo el aporte
  académico medido de la tesis y se sigue desarrollando/mejorando en paralelo.
- Tesseract.js vive aislado en un único módulo nuevo,
  `src/modules/ocr/engines/tesseract-engine.ts`, seleccionable en tiempo de ejecución
  vía la variable de entorno `NEXT_PUBLIC_OCR_ENGINE` (`"custom"` por defecto — sin
  configurar nada, el comportamiento no cambia; `"tesseract"` activa el motor
  alternativo). Ningún otro módulo del pipeline propio fue modificado ni eliminado.
  Ver `src/app/(dashboard)/documents/[id]/process-document-client.tsx`.
- Esta excepción cubre únicamente **Tesseract.js**, para el caso de uso puntual de
  reconocimiento de caracteres en producción como plan de contingencia. No autoriza
  ninguna otra librería/API de la lista de prohibidas de esta sección (OpenCV, APIs de
  nube, modelos preentrenados de terceros, etc.) — cualquiera de esas seguiría
  requiriendo el mismo proceso: reportar REQUERIMIENTO AFECTADO / PROBLEMA / CAUSA /
  IMPACTO / PROPUESTA DE CAMBIO / TRAZABILIDAD AFECTADA (§3) y esperar autorización
  explícita antes de implementar.
- Riesgo documentado para el equipo: si la evaluación académica de la tesis pondera el
  pipeline OCR construido desde cero como criterio central (ver enunciado original del
  proyecto), usar Tesseract.js como motor de reconocimiento en la app en producción
  debe declararse honestamente en la documentación final (`README.md`,
  `docs/ocr/evaluation.md`, sustentación) como lo que es — un motor de terceros usado
  como plan de contingencia — nunca presentado como parte del pipeline propio.

**Segundo perfil OCR agregado (2026-09-08, ver ADR-0003
`docs/decisions/0003-perfil-ocr-contratos.md`):** `contract_es` (contratos), con campos
propios (Proveedor, NIT/documento, Fecha, Valor total, Vigencia, Tipo de contrato,
Número de contrato) — usa **siempre Tesseract.js**, nunca el pipeline propio HOG+kNN
(no existe modelo propio entrenado para contratos y no se entrena uno en este cambio).
Esto se saltó explícitamente la condición de `docs/roadmap.md` que bloqueaba nuevos
perfiles hasta cerrar Fase 8 — autorizado por el equipo, con el gate de accuracy de
`invoice_es` verificado de forma real en la misma sesión (73.8% sobre la partición
`test`, no el 80% reportado inicialmente — ver el ADR para el detalle). `invoice_es`
sigue siendo el único perfil con modelo propio entrenable vía OCR LAB.

## 8. Requerimientos

**Funcionales:** RF-001 Captura · RF-002 OCR propio · RF-003 Extracción de campos —
**dos perfiles**: `invoice_es` (obligatorio: **Proveedor, NIT, Fecha, IVA, Valor,
Total** — actualizado en Fase 4e con datos reales de Mansor, especificado según
facturación colombiana; reemplaza la definición original de Fase 0 que era `proveedor,
fecha, monto_total` + `numero_factura` deseado; sin líneas de producto) y `contract_es`
(agregado en ADR-0003: **Proveedor, NIT/documento, Fecha, Valor total, Vigencia, Tipo
de contrato, Número de contrato**) · RF-004 Almacenamiento (Supabase) · RF-005 Consulta
con filtros · RF-006
Integración contable — **DEFERRED**, no implementar SIIGO ni mocks presentados como
reales · RF-007 Validación humana (con trazabilidad de original vs. validado).

**No funcionales:** RNF-001 Rendimiento (<5s objetivo, medir con `processing_ms`, nunca
afirmar sin medir) · RNF-002 Usabilidad (≤3 interacciones para iniciar digitalización) ·
RNF-003 Seguridad · RNF-004 Portabilidad (responsive, navegadores modernos) · RNF-005
Disponibilidad (Vercel + Supabase, sin afirmar SLA no medido) · RNF-006
Interoperabilidad (interfaces preparadas, sin integración ficticia) · RNF-007 Hardware
(cámara, permisos, contexto seguro, Canvas/ImageData) · RNF-008 Escalabilidad (sin
estado global innecesario, consultas paginadas, OCR no bloqueante).

Matriz completa y estado real: `docs/requirements/traceability.md`.

## 9. Convenciones de calidad

SOLID cuando aporte valor, DRY sin abstracciones prematuras, alta cohesión / bajo
acoplamiento, dependency inversion para módulos externos, tipado estricto, manejo
explícito de errores, validación en los límites del sistema. Evitar: god
classes/components, duplicación, números mágicos, archivos gigantes, estado global
innecesario, dependencias circulares, sobrearquitectura. TSDoc/JSDoc en interfaces
públicas, servicios, algoritmos OCR, funciones matemáticas, Web Workers y adaptadores de
persistencia — comentarios explican el POR QUÉ, no el QUÉ.

## 10. Testing

Separar unit / integration / e2e / OCR benchmark. Prioridad máxima en unit tests con
matrices pequeñas y resultado calculable a mano para: grayscale, histograma, Otsu,
binarización, morfología, componentes conectados, segmentación, HOG, distancias, kNN,
confidence, extracción de campos. Las pruebas OCR "reales" usan siempre la partición
`test`. Detalle: `docs/testing/test-plan.md`.

## 11. Límites de ejecución de esta sesión (Claude Code)

Reglas permanentes, pedidas explícitamente por el equipo, válidas para todas las fases
siguientes sin necesidad de repetirlas en cada prompt:

- **Nunca ejecutar un servidor de desarrollo** (`next dev`, `npm run dev`, `vercel dev`,
  ni ningún proceso que quede escuchando en un puerto). El equipo lo corre desde su
  propia terminal cuando quiere probarlo manualmente. La verificación en esta sesión se
  limita a: `npm run build`, `npx tsc --noEmit`, `npx eslint .`, `npm run test`
  (unit + integration). Si algo solo puede confirmarse corriendo el servidor o viendo la
  UI en vivo, se reporta como **pendiente de verificación manual por el equipo** — nunca
  se resuelve arrancando el servidor.
- **Nunca usar herramientas de navegador/automatización visual** (Claude in Chrome o
  equivalentes) para verificar la aplicación. La verificación de UI/flujos de usuario
  queda a cargo del equipo, manualmente, fuera de esta sesión.

## 12. Prohibido siempre

Force push sin autorización explícita, eliminar ramas de otros, reescribir commits
ajenos, `git reset --hard` sobre trabajo no confirmado, `git clean -fd` sin
autorización, borrar archivos no reconocidos, subir secretos/datos privados/facturas
reales de Mansor, merge a `main` sin aprobación, commits vacíos, modificar autoría de
commits existentes, PDF en v1, PWA/offline en v1, integración contable real o simulada
como real, eliminar o dejar de mantener el motor OCR propio (sección 7), expandir el
alcance de RF-003/RF-006/perfiles OCR sin autorización explícita, ejecutar servidor de
desarrollo o herramientas de navegador en esta sesión (sección 11).

## 13. Estado actual

**Sesión 2026-09-15 (`fix/ocr-money-table-header-contamination`) — tercer bug real de
parseo de montos, encontrado con una factura real de un proveedor de Mansor:**

Andrés reportó que IVA/Valor/Total volvían a salir en "1" en algunas facturas (no
todas) -- root cause, confirmado simulando el algoritmo contra el texto OCR real antes
de tocar código: el encabezado de la tabla de ítems repite literalmente las mismas
palabras que se buscan como keyword (`"... | IVA | Valor IVA Total"`), y la fila 1
empieza justo después con su NÚMERO DE FILA (`"1 <código> [<descripción>..."`) -- ese
"1" quedaba pegado (`ADJACENT_WINDOW`) al keyword del encabezado y ganaba sobre el
valor real, que está más abajo en la sección de totales. Mismo síntoma que el segundo
fix de "sesión 2026-09-10" de más abajo (contaminación desde la tabla), pero causa
distinta -- no es el mismo bug recurrente, es una variante nueva (esta vez viene del
ENCABEZADO de la tabla, no de una fila de datos).

Dos causas concretas, en `field-extraction-helpers.ts`: (1) un candidato de 1-2 dígitos
sueltos (número de fila, cantidad) nunca es un monto real -- el mínimo de la
alternativa sin separador de miles sube de `\d+` a `\d{3,}`; (2) un candidato pegado a
una letra (`"141"` dentro del código de producto `"E141"`) tampoco es un monto -- se
agrega `(?<![A-Za-zÀ-ÿ])` antes de cada alternativa numérica. Además, la misma factura
traía `"IVA 3,952"` con COMA donde el resto de la factura usa PUNTO (glifo confundido
por el OCR) -- ahora se acepta cualquiera de los dos como separador de miles cuando
agrupa exactamente 3 dígitos. `ADJACENT_WINDOW` sube de 15 a 20 (la etiqueta real
`"TOTAL DE LA OPERACIÓN"` es más larga que `"Total"` solo, así que sin este ajuste el
campo `total` bajaba a confidence 0.7 aunque igual acertara el valor).

Test de regresión nuevo en `field-extraction.test.ts` reproduce la ESTRUCTURA real
(encabezado + 4 filas + totales con el error de coma) con nombre de
empresa/NIT/códigos de producto ficticios -- nunca se comitea el texto OCR real de un
documento real (§12). Verificado: `tsc`/`eslint` limpios, 347/347 tests unitarios
(rama sin RF-008 todavía, que vive aparte en `feature/financial-summary-reports`, sin
mergear a `main`).

**Pendiente, explícitamente fuera de esta sesión:** Andrés también reportó que
`Proveedor` sigue extrayendo mal (esta misma factura no tiene ninguna keyword de
`PROVEEDOR_KEYWORDS` -- el nombre de la empresa aparece como texto libre al inicio del
documento, sin ninguna etiqueta "Proveedor:"/"Emisor:" que la heurística actual pueda
usar). A diferencia del bug de montos, esto no tiene una causa puntual corregible con
un ajuste de regex -- necesita una heurística nueva (p. ej. buscar líneas con sufijos
de razón social como "SAS"/"LTDA", o cerca del primer NIT del documento) que se
diseñe y verifique con más de una factura real, para no sobreajustar a un solo caso.
Pedido al equipo: mandar 2-3 facturas reales más (de proveedores distintos) antes de
tocar esa heurística.

**Sesión 2026-09-13 (`feature/ocr-contract-profile`) — dos hallazgos importantes, sin
resolver el primero todavía:**

**1. CAMBIOS EXTERNOS DETECTADOS al empezar la sesión, reportado al equipo, resolución
pendiente:** `git fetch` mostró que `feature/ocr-contract-profile` **nunca llegó a
existir en `origin`** — el intento de push desde VS Code que quedó pendiente al cierre
de la sesión de 2026-09-10 sí funcionó, pero apuntó a **`main` directamente**, no a la
rama de la fase. `origin/main` tiene, commit por commit con el mismo hash, todo el
trabajo de esta rama hasta `b0e0b4e` — **sin merge commit, sin PR, y sin el texto de
aprobación `"APROBAR FASE X. INTEGRAR A MAIN..."`** que exige el §3 (violación
explícita de la prohibición del §12 "merge a `main` sin aprobación"). Solo falta ahí el
commit `9ba75a5` (docs). Se le preguntó al equipo cómo proceder (dar la integración por
buena / registrar la desviación sin darla por cerrada / pausar hasta hablar con
Diego/Andrés) — Santiago respondió pidiendo continuar con los pendientes de abajo en su
lugar, así que **esto sigue sin resolverse explícitamente** — no se tocó `main` ni se
hizo push en esta sesión. Retomar al empezar la próxima sesión: decidir qué hacer con
`main` (ya tiene el contenido, falta la aprobación formal) antes de cualquier merge
futuro. `main` local sigue 17 commits atrás de `origin/main` — no se sincronizó en esta
sesión para no tocar nada sin que el equipo decida primero.

**2. Los dos pendientes del cierre de 2026-09-10 (abajo) quedaron resueltos** —
detalle completo en `docs/decisions/0003-perfil-ocr-contratos.md`, sección "Sesión
2026-09-13": el pendiente de "dónde quedan las fotos originales" se confirmó cerrado
solo con lectura de código (URL firmada se genera en cada visita, nunca se guarda — no
era un bug). El pendiente de "contratos multi-página" se implementó con autorización
explícita del equipo tras el REQUERIMIENTO AFECTADO del §3: tabla nueva
`document_pages`, `upload-form.tsx` con `allowMultiplePages`, `createDocument`/
`deleteDocument` actualizados, galería en `/documents/[id]`. Verificado: `tsc` limpio,
`eslint` limpio, `npm run build` limpio, suite **396/403** (los 7 que fallan son el test
de RLS nuevo de `document_pages`, que no puede pasar todavía porque la migración no se
ha aplicado al proyecto Supabase real — falta `npx supabase db push --linked`, pendiente
del equipo, esta sesión no tiene el token de acceso de Supabase CLI).

**Sesión 2026-09-10 (`feature/ocr-contract-profile`, sin merge a `main` todavía) —
continuación de la de abajo:** tres commits nuevos sobre esa rama, detalle completo de
cada uno en `docs/decisions/0003-perfil-ocr-contratos.md` (sección "Pendientes",
actualización 2026-09-10): (1) reconciliación de `README.md`/`docs/ocr/evaluation.md`
con el accuracy real (73.8%, no el 16.1%/88.2% que quedaron ahí de sesiones previas);
(2) fix de un bug real en el keyword `"Contrato N°"` (límite de palabra `\b` no
matcheaba cuando el keyword termina en símbolo); (3) fix de un bug real de parseo de
montos en pesos colombianos (`MONEY_PATTERN` asumía formato dólar, truncaba montos
reales) — portado a mano desde una rama de otra sesión (`fix/colombian-money-parsing`,
no mergeada en ningún lado) porque nuestro refactor ya había movido ese código a
`field-extraction-helpers.ts`. Verificado: tsc limpio, eslint limpio, 393/393 tests.

**`git push` seguía fallando por autenticación al cierre de esta sesión** (Credential
Manager sin sesión válida vía CLI) — el equipo iba a intentar pushear los commits desde
VS Code en su lugar; **no confirmado en esta sesión si funcionó**. Revisar al empezar la
próxima sesión (`git log origin/feature/ocr-contract-profile` vs. local).

**Dos pendientes nuevos, pedidos explícitamente por Santiago al cierre de esta sesión,
para retomar mañana (detalle completo, con archivos y líneas concretas, en el ADR-0003
arriba mencionado):**

1. **Contratos multi-página** — hoy `upload-form.tsx` solo permite subir/capturar UNA
   foto por documento ("Elegir otra imagen" reemplaza, no agrega). En un contrato real,
   campos obligatorios de RF-003 (`Valor total`, `Fecha`, `Vigencia`, etc.) suelen estar
   en páginas que no son la portada — hace falta poder subir varias fotos y que todas
   queden asociadas al mismo contrato. Expande RF-001 para `contract_es` — sigue el
   proceso normal de §3 (reportar REQUERIMIENTO AFECTADO antes de implementar) al
   retomarlo, no se implementa directo.
2. **Revisar dónde y cómo quedan guardadas las fotos originales, de contratos Y de
   facturas, para poder verlas más adelante (no solo al subirlas).** Hoy
   `documents.original_file_path` es `text not null`, un solo archivo por fila de
   `documents` (`{user_id}/{document_id}/original.{extension}`) — confirmado en
   `supabase/migrations/20260811200929_create_documents.sql` y
   `src/modules/documents/actions.ts`. Falta confirmar que las URLs firmadas (§6) se
   puedan generar/abrir tiempo después de subida, no solo en el momento — no verificado
   en navegador todavía (§11). **Conectado con el punto 1**: si un contrato pasa a tener
   varias fotos, el esquema de "un archivo por documento" ya no alcanza — hay que
   decidir esto junto con el punto 1, no por separado.

**Perfil OCR de contratos agregado fuera de secuencia (`feature/ocr-contract-profile`,
2026-09-08, sin merge a `main` todavía):** nuevo `document_type` `contract_es` + sección
"Contratos" separada de "Documentos" en la app (nav, `/contracts`, `/contracts/new`),
ver ADR-0003 (`docs/decisions/0003-perfil-ocr-contratos.md`) y la nota del cierre de
§7/§8 de arriba. Expande RF-003 con un segundo perfil; usa Tesseract.js siempre (no
pipeline propio); sin dataset de contratos reales para verificar la calidad de la
extracción todavía. Verificación real hecha en esta sesión antes de proceder: el
accuracy de `invoice_es` sobre la partición `test` es **73.8%** (1792/2427 caracteres,
`bin/verify-active-model-accuracy.ts`), no el 80%/16,500 caracteres reportado
inicialmente por el equipo — sigue superando el 16.1% que bloqueaba el roadmap, así que
la condición se cumple igual, con el número correcto documentado.

Fase activa: **Fase 8 — Deploy final (integración, versionado y documentación)** (en
cierre, esperando aprobación). Fases 0, 1, 2, 3, 4a-4f, 5, 6 y 7 integradas a `main`
(tag `v0.4.0-ocr` para el cierre de Fase 4; `v0.5.0-complete` pendiente de crear al
aprobar esta fase, junto con el merge — `CLAUDE.md` §3, tags solo al integrar). Ver
`docs/roadmap.md` para el plan de fases siguientes y `docs/requirements/traceability.md`
para el estado por requerimiento.

**Fase 8 — correcciones aplicadas al enunciado original antes de escribir nada
permanente:** el prompt traía cifras que ya se habían identificado como fabricadas en
fases anteriores (2847ms de performance — el placeholder original de Fase 4f; 41%/88.2%
de accuracy citados como si fueran del modelo activo, cuando el modelo realmente activo
mide **16.1%** sobre su propio split sintético; "145 tests, 143 passed" cuando la suite
real da **323/323, 0 fallos**) y afirmaba un deploy en Vercel ("Live en producción") sin
que exista ninguna evidencia en el repo de que eso haya pasado (`vercel.json`/`.vercel/`
no existen). Confirmado con el equipo antes de proceder: `README.md`/`CHANGELOG.md`
usan solo los números reales, y `docs/DEPLOYMENT.md` son instrucciones para desplegar,
no la descripción de un sistema ya en producción. Tampoco se referencian
`docs/ocr/README.md`/`FLUJO_COMPLETO_USUARIO.md`/`TESTS_UNITARIOS.md` — ninguno existe
en el repo, y el equipo decidió no crearlos en esta fase. El tag `v0.5.0-complete` se
crea al recibir la aprobación de merge de esta fase (no antes, siguiendo el mismo gate
de aprobación de todas las fases anteriores — este prompt no repetía la línea "no
fusionar sin aprobación" de los anteriores, pero la regla de `CLAUDE.md` §3 es
permanente y no depende de que cada prompt la repita).

**Fase 7 chocó con `CLAUDE.md` §11 desde el primer momento**: el enunciado pedía correr
Playwright contra el deploy de Vercel y reportar tests E2E/performance/seguridad
"pasados" — confirmado explícitamente con el equipo antes de proceder, se dividió en
(1) regresión + gaps de cobertura reales con Vitest (sí ejecutado: 323/323 tests, 95.1%
statement coverage de los módulos con tests — Server Actions/Route Handlers/`page.tsx`
quedan fuera de ese cálculo por depender de `next/headers`), (2) 4 archivos Playwright
escritos y corregidos contra el código real pero **nunca ejecutados** en esta sesión, y
(3) `tests/MANUAL_CHECKLIST.md` para que el equipo verifique en un navegador real. Gaps
reales de seguridad cerrados: `ocr_models`/`ocr_training_samples` (RLS admin-only desde
Fase 1) nunca se habían probado contra una sesión real — ahora sí, 11/11 contra
Supabase real. Detalle completo en `docs/requirements/traceability.md`, sección
"Entregables técnicos de Fase 7".

**Fase 6 agrega `/admin` (dashboard con KPIs reales), extiende `/admin/documents`
(confidence OCR, búsqueda por id), renombra `/admin/validation-dashboard` →
`/admin/validations` (+ ediciones por usuario y tendencia real), y agrega
`/admin/models` (activar/desactivar modelos) y `/admin/reports` (CSV/JSON
descargables vía Route Handlers).** `src/proxy.ts` ahora redirige a `/login` en
`/admin/*` sin sesión (chequeo optimista, sin verificar rol — la guía oficial de Next
16 advierte evitar consultas a la base ahí; el rol se sigue verificando por página +
RLS). Ese archivo **ya existía** desde Fase 1 con otro nombre (Next 16 renombró
`middleware.ts` a `proxy.ts`) — se sobreescribió sin leerlo primero por buscar el
nombre viejo, error de proceso detectado a tiempo (el resultado es aditivo, no se
perdió lógica). Ninguna cifra de ejemplo del enunciado (ej. "Accuracy 41%") se usó —
todo sale de la base real. Detalle completo, incluida la razón por la que `id::text`
+ `ilike` no funciona en este proyecto Supabase, en
`docs/requirements/traceability.md`, sección "Entregables técnicos de Fase 6".

**Fase 5 reutiliza `document_validations` en vez de recrearla:** esa tabla ya existía
desde el bootstrap de Fase 1, con un esquema distinto al que pedía el enunciado de esta
fase (`manually_edited boolean` en vez de `text[]`, sin `notes`). Se construyó sobre el
esquema real: qué campo se corrigió se calcula comparando `original_extracted_data` vs
`validated_data` (JSONB) en vez de mantener un array paralelo. Se agregó (aditivo) el
valor `rejected` a `documents.status` y `DOCUMENT_REJECTED` a `audit_logs.action` vía
migración, porque el botón "Rechazar documento" sí necesitaba un estado real. Detalle
completo en `docs/requirements/traceability.md`, sección "Entregables técnicos de
Fase 5".

**UI de validación (`ValidationSection`/`ValidationSummary` en `/documents/[id]`,
dashboard en `/admin/validation-dashboard`) implementada pero sin verificación de
interacción real** — requiere navegador, prohibido en esta sesión (`CLAUDE.md` §11).
Persistencia y RLS sí están **VERIFIED** contra Supabase real
(`tests/integration/document-validations-rls.test.ts`, 10/10). Checklist manual para
Andres/Santiago en `docs/requirements/traceability.md`.

**Modelo OCR activado por primera vez (post-cierre de Fase 5), con accuracy real baja:**
`ocr_training_samples`/`ocr_models` estaban completamente vacías — se agregó
`node-canvas` (polyfill de Canvas 2D para Node, permitido por §7, no es librería de
OCR/CV) para correr `synthesizeDataset`/`trainModel` (Fase 4d) fuera del navegador
(`bin/generate-initial-model.ts`, `npm run generate:model`) y activar el resultado.
Accuracy real medida: **16.1%** (62 clases, muy por debajo del umbral 80% del propio
código) — confusiones de glifos genuinamente parecidos (C/G, S/5, I/l, o/q), no un
pipeline roto. Desbloquea "Procesar documento" técnicamente (ya no 404) pero las
predicciones no son confiables todavía — ver detalle en
`docs/requirements/traceability.md`, sección "Modelo OCR inicial activado".

**Fase 4f no tiene datos reales que evaluar todavía (sin cambios desde su cierre):** se construyó la infraestructura
completa (`modules/ocr/evaluation/`: métricas de caracteres, extracción de campos,
benchmark, reproducibilidad, generador de reporte) y una evaluación real contra el
modelo activo + partición `test` de `ocr_training_samples` — pero esa partición está
vacía (nadie ha etiquetado facturas reales de Mansor). La única corrida hecha en esta
sesión usa datos sintéticos (alfabeto de 2 formas conocidas) para confirmar que la
aritmética es correcta, no para afirmar precisión real — ver
`docs/ocr/evaluation.md` §6.

**RF-003 actualizado con datos reales de Mansor:** los campos obligatorios cambiaron de
`proveedor/fecha/monto_total` (+ `numero_factura` deseado, Fase 0) a **Proveedor, NIT,
Fecha, IVA, Valor, Total** (facturación colombiana). Cambio confirmado explícitamente
por el equipo antes de ejecutar Fase 4e (no asumido). `monto_total` → `total` se
propagó a `modules/documents/queries.ts` (RF-005, Fase 2) y se verificó contra Supabase
real.

**Desviación de roadmap sin resolver (arrastrada de Fase 4c/4d):** `docs/roadmap.md`
asignaba la UI de OCR LAB de etiquetado/entrenamiento a Fase 4d, no a 4c; se construyó
en 4c por pedido explícito de ese prompt. Sigue pendiente que el equipo confirme cómo
reconciliar `docs/roadmap.md` — no bloquea el trabajo, pero no se resuelve sola.

**Hueco real encontrado y cerrado en Fase 4e:** ni `trainAndEvaluateModel` (4c) ni
`saveSyntheticModel` (4d) activan el modelo que entrenan (`active` queda `false`
siempre, a propósito). Sin activar ningún modelo, `/api/ocr/active-model` (nuevo en
Fase 4e) siempre daría 404 y "Procesar documento" nunca funcionaría — se agregó
`activateModel` + botón "Activar este modelo" en ambas secciones de `/ocr-lab/train`.
Sigue sin haber ningún modelo activado todavía (nadie ha corrido `/ocr-lab/train` en un
navegador real) — el equipo debe hacerlo antes de que RF-002/RF-003 funcionen de
extremo a extremo.

**Límite de sesión (Fase 4d, no aplica a 4e):** generar el dataset sintético (Fase 4d)
requiere Canvas 2D con fuentes reales, solo disponible en navegador — esta sesión no
pudo ejecutar esa síntesis. El pipeline de Fase 4e (`runOCRPipelineOnImageData`) **sí es
completamente testeable** con `ImageData` sintética (solo `decodeImage`, el paso de
decodificar el archivo subido, requiere navegador) — el benchmark de RNF-001 en el
cierre de Fase 4e es una medición real, no una estimación.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
