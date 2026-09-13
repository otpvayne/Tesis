# ADR-0003: Perfil OCR de contratos (`contract_es`)

- **Estado:** Aceptado
- **Fecha:** 2026-09-08
- **Decide:** Santiago Moralez Orozco, con autorización explícita para saltarse el gate
  de `docs/roadmap.md` que bloqueaba nuevos perfiles hasta cerrar Fase 8

## Contexto

Hasta este cambio el sistema solo digitalizaba facturas (`invoice_es`, RF-003:
Proveedor, NIT, Fecha, IVA, Valor, Total). El equipo pidió agregar una sección para
digitalizar **contratos**, ahora que Tesseract.js está aprobado como motor de
reconocimiento (ADR-0002).

Esto es formalmente una expansión de alcance de RF-003 / perfiles OCR
(`CLAUDE.md` §12 la lista como algo que requiere autorización explícita). Antes de
escribir código se reportó REQUERIMIENTO AFECTADO/PROBLEMA/CAUSA/IMPACTO al equipo
(`CLAUDE.md` §3) porque `docs/roadmap.md` documentaba explícitamente que ningún perfil
nuevo arrancaría antes de (1) superar el 16.1% de accuracy real de `invoice_es` y (2)
cerrar Fase 8 -- ninguna de las dos condiciones estaba cumplida formalmente (Fase 8
sigue en cierre). El equipo confirmó avanzar de todas formas, reportando que el
pipeline propio ya medía ~80% de accuracy con 16,500 caracteres reales.

**Verificación real de esa cifra (hecha en esta sesión, no solo reportada):** se corrió
`bin/verify-active-model-accuracy.ts` (`npm run verify:model-accuracy`) -- mismo cálculo
que `evaluateActiveModelOnTestPartition` (`training-actions.ts`) pero invocable fuera
del navegador, contra el modelo activo real y la partición `test` real de
`ocr_training_samples`. Resultado medido: **73.8% de accuracy (1792/2427 caracteres),
59 clases** -- distinto del 80%/16,500 reportado (la cifra reportada probablemente
contaba train+validation+test, no solo `test`, que es la única partición que cuenta
para RF-003/`CLAUDE.md` §7/§10). El número real sigue superando ampliamente el 16.1%
que bloqueaba el roadmap, así que la condición de accuracy sí se cumple -- con el
número correcto documentado, no el reportado.

Campos obligatorios del contrato (dados por el equipo, análogos a
Proveedor/NIT/Fecha/IVA/Valor/Total de facturas): **Proveedor, NIT o documento de los
implicados, Fecha, Valor total, Vigencia, Tipo de contrato, Número de contrato.**

No existe todavía ningún dataset de contratos reales etiquetados.

## Decisión

1. **Nuevo `document_type`: `contract_es`** (`DOCUMENT_TYPES`,
   `src/modules/documents/types.ts`). Sin migración de base de datos --
   `documents.document_type` es `text not null` sin `CHECK constraint` (a diferencia de
   `status`), así que el valor nuevo no requiere tocar `supabase/migrations/`.
2. **Motor OCR: siempre Tesseract.js para `contract_es`**, sin importar
   `NEXT_PUBLIC_OCR_ENGINE` (`ocrEngineForDocumentType`,
   `src/modules/ocr/classification/document-ocr-profile.ts`). No existe (ni se entrena
   en este cambio) un modelo propio HOG+kNN para contratos -- entrenar uno repetiría
   todo el ciclo de Fase 4 (síntesis, entrenamiento, evaluación) sin datos reales
   disponibles, y Tesseract ya está aprobado para exactamente este tipo de necesidad
   (ADR-0002). `invoice_es` no cambia de comportamiento.
3. **Sin soporte de OCR LAB para `contract_es`** -- `/ocr-lab/train` y
   `training-actions.ts` siguen hardcodeados a `invoice_es`; no hace falta entrenar
   nada para un perfil que usa un motor pre-entrenado.
4. **Extracción de campos:** nuevo módulo
   `src/modules/ocr/classification/contract-field-extraction.ts`, mismo patrón
   regex+keywords+3 niveles de confianza que `field-extraction.ts` (`invoice_es`),
   reusando las primitivas compartidas extraídas a
   `field-extraction-helpers.ts`. **No verificado todavía contra contratos reales** --
   no existe dataset de contratos etiquetado; las keywords/patrones son un punto de
   partida razonable, no un resultado medido. Se ajustan cuando el equipo tenga
   contratos reales de Mansor para probar.
5. **Sección "Contratos" separada de "Documentos" en la app** (nav, lista, formulario de
   subida) -- no un selector de tipo escondido dentro del flujo de facturas:
   - `Sidebar.tsx`: nuevos links `/contracts` y `/contracts/new`.
   - `src/modules/documents/upload-form.tsx`: formulario de subida (cámara + fallback de
     archivo) extraído de `documents/new/page.tsx` para reusarlo parametrizado por tipo
     de documento en `contracts/new/page.tsx`, sin duplicar la lógica de cámara/permisos.
   - `contracts/page.tsx`: mismo patrón que `documents/page.tsx`, filtrando
     `documentType: "contract_es"` (nuevo filtro en `listDocuments`/`DocumentFilters`).
     `documents/page.tsx` ahora filtra explícitamente `documentType: "invoice_es"` para
     no mezclar ambos tipos en la misma lista.
   - El detalle/validación de un contrato sigue viviendo en `/documents/[id]` (esa
     página ya resuelve por `id`, agnóstica al perfil) -- no se duplicó esa página
     completa. Los links desde `/contracts` usan `?back=/contracts...`, mismo patrón
     que ya usan `documents/page.tsx` y `admin/documents/page.tsx`.
6. **Generalización de tipos de validación (RF-003/RF-007):**
   `VALIDATION_FIELDS_BY_DOCUMENT_TYPE` (`validation-types.ts`) reemplaza a la lista
   plana `VALIDATION_FIELDS` como fuente de "qué campos le corresponden a ESTE
   documento" (`documents/[id]/page.tsx`, `ValidationSummary`). `VALIDATION_FIELDS`
   (unión de todos los perfiles) se conserva para las vistas admin que agregan a través
   de todos los tipos de documento (`modules/admin/stats.ts`, `/admin/validations`);
   `buildValidationsReportRows` (`modules/admin/reports.ts`) también se actualizó para
   escoger los campos del perfil de cada documento (vía un nuevo embed
   `documents(document_type)` en `/api/admin/reports/validations`), en vez de asumir
   siempre los 6 campos de factura.
7. **`saveOcrResult`** (`document-processing.ts`) deja de mapear a mano los 6 campos de
   factura -- guarda dinámicamente las claves que trae `extractedData` (excluyendo los
   metadatos `rawOCR`/`extractionMethod`), sirve para cualquier perfil sin cambios
   futuros.

## Fuera de alcance de este cambio

- `/admin/documents` y `/admin/reports` (excepto el fix puntual de
  `buildValidationsReportRows` arriba) ya eran genéricos por campo/valor y no requirieron
  cambios adicionales.
- No se agregó ningún perfil más allá de `contract_es` -- "otros documentos" mencionado
  por el equipo queda para cuando haya campos concretos definidos (mismo criterio de
  `CLAUDE.md` §7: nada de inventar campos para tipos sin definir).

## Pendientes (sin resolver en esta sesión, para retomar)

- **Verificación manual en navegador real** (`CLAUDE.md` §11, no se pudo hacer en esta
  sesión): flujo completo de `/contracts/new` (cámara + fallback de archivo), "Procesar
  documento" con Tesseract.js real (worker/WASM), y revisar los campos extraídos de un
  contrato en `/documents/[id]` (`ValidationSection`/`ValidationSummary`).
- **Probar `extractContractFields` contra contratos reales de Mansor** — las
  keywords/patrones (`identificacion`, `vigencia`, `tipoContrato`, `numeroContrato`) son
  un punto de partida razonable, no medido; ajustar según lo que aparezca en contratos
  reales, mismo proceso que se siguió con las facturas en Fase 4e.
- **Resolver la autenticación de git en esta máquina** para poder hacer `git push` —
  falló por "Password authentication is not supported" tanto en esta rama como en
  `feature/ocr-dataset-plan` (trabajo de importación de PDFs, independiente de esto).
- **`feature/ocr-dataset-plan` sigue sin pushear** — no relacionado con contratos, pero
  quedó pendiente de la misma sesión.
- **Colisión de numeración de ADR-0002** entre ramas (`0002-uso-libreria-ocr-preentrenada.md`
  en `main` vs. `0002-import-pdf-facturas-electronicas-dataset.md` en
  `feature/ocr-dataset-plan`) — resolver al converger ambas ramas.
- **Confirmar formalmente con el equipo (Diego/Andrés)** la decisión de saltar el gate
  de accuracy/Fase 8 de `docs/roadmap.md` — quedó autorizada por Santiago en esta
  sesión, sin registro explícito de los otros dos todavía.
- **`README.md` tiene deuda previa a este cambio, no resuelta aquí**: la sección "OCR
  Pipeline" todavía dice "sin Tesseract... de terceros" (ya no es cierto desde el merge
  de ADR-0002 a `main`) y cita 88.2%/16.1% de accuracy cuando esta sesión midió 73.8%
  real sobre `test`. No se tocó a fondo por no ser parte del alcance de este cambio —
  pendiente de una pasada de reconciliación completa.
- **"Otros documentos"** mencionados por el equipo junto con contratos siguen sin campos
  definidos — no se inventan (`CLAUDE.md` §7); pendiente de que el equipo los especifique
  antes de implementar un tercer perfil.
- **Decisión de fondo pendiente**: si a futuro se entrena un modelo propio (HOG+kNN)
  para `contract_es`, o si Tesseract.js se queda como solución permanente para este
  perfil — impacta cómo se presenta esto en la sustentación (ver "Consecuencias" abajo).
- **Merge a `main`**: sigue pendiente de la aprobación explícita de `CLAUDE.md` §3
  (`"APROBAR FASE X. INTEGRAR A MAIN..."`) — no se hace antes de esa autorización.
- Revisar visualmente los nuevos links de nav ("Contratos"/"Nuevo contrato") en mobile
  y desktop — no verificable sin navegador en esta sesión.

## Actualización 2026-09-10

**Resuelto en esta sesión** (commits sobre `feature/ocr-contract-profile`, detalle en
cada mensaje de commit):

- ~~`README.md` tiene deuda previa...~~ — **RESUELTO**: `README.md` y
  `docs/ocr/evaluation.md` reconciliados con el accuracy real medido (**73.8%**,
  1792/2427 caracteres, partición `test` real — no el 16.1%/88.2% que quedaban ahí de
  sesiones anteriores). Commit `docs: reconciliar README.md y evaluation.md con
  accuracy real medida`.
- **Bug real encontrado y corregido, keyword `"Contrato N°"`**: `buildKeywordRegex`
  (`field-extraction-helpers.ts`) ponía `\b` fijo en ambos extremos de todo keyword —
  como "N°" termina en símbolo (no en carácter de palabra), ese `\b` nunca matcheaba
  seguido de un espacio (el caso real: "Contrato N° 123..."). Corregido para que solo
  agregue `\b` en el extremo que realmente es alfanumérico. Beneficia también a
  `invoice_es` (ningún keyword de facturas tenía el problema, pero el fix es genérico).
  Test de regresión agregado y verificado con `git stash` (falla sin el fix, pasa con
  él). Commit `fix(ocr): keyword que termina en simbolo no matcheaba en texto real`.
- **Bug real de montos en pesos colombianos, heredado por `contract_es`**: otra sesión
  (rama `fix/colombian-money-parsing`, no mergeada en ningún lado todavía) encontró que
  `MONEY_PATTERN` asumía formato dólar (2 decimales exactos) y truncaba montos reales
  ("71.000" → "71", "11.334" → "11.33"). Como `contract_es` comparte `extractMoneyField`
  con `invoice_es` (`field-extraction-helpers.ts`), el campo **Valor total** de
  contratos tenía el mismo bug sin corregir. Portado a mano (no cherry-pick directo —
  el fix original tocaba `field-extraction.ts`, pero esa lógica ya vivía en
  `field-extraction-helpers.ts` en esta rama por nuestro propio refactor). De paso se
  corrigieron los tests de `contract-field-extraction.test.ts` que usaban formato dólar
  (escritos en paralelo, antes de que este fix existiera en ningún lado — ninguna de
  las dos sesiones sabía de la otra). Commit `fix(ocr): interpretar montos con formato
  de pesos colombianos, no dolares`.
- Verificado tras los tres commits: `npx tsc --noEmit` limpio, `npx eslint .` limpio,
  suite completa **393/393**.

**Backup local creado antes de commitear**: rama `backup/ocr-contract-profile-2026-09-10-pre-doc-fix`
apuntando al commit previo a esta sesión (`8373f17`) — no se pushea, solo para poder
revertir localmente si hace falta.

**`git push` seguía fallando por autenticación (CLI) al cierre de esta sesión** —
Credential Manager configurado pero sin sesión válida; se colgaba esperando login
interactivo que este entorno no puede completar. El equipo iba a intentar el push de
estos 3 commits desde VS Code en su lugar (probablemente tiene su propio flujo de auth
con GitHub) — **no confirmado en esta sesión si terminó funcionando**. Revisar al
empezar la próxima sesión.

**Hallazgo colateral, investigando por qué `git fetch` traía ramas nuevas
inesperadas**: `origin/main` tenía 6 commits que nuestro `main` local no tenía
(ADR-0002 + integración de Tesseract.js, mergeados vía PR por otra sesión) — resultó
ser un falso alarma: esos commits YA son ancestros de `feature/ocr-contract-profile`
(nuestra rama arrancó de ahí), solo el puntero de `main` local estaba desactualizado.
Sin conflicto real, pero el puntero local de `main` sigue sin actualizarse — hacerlo
antes de cualquier merge futuro (`git fetch && git checkout main && git merge
--ff-only origin/main`, sin tocar la rama de contratos).

**Dos pendientes nuevos, pedidos explícitamente por Santiago al cierre de esta
sesión — documentar, no implementar todavía:**

1. **Contratos multi-página.** Hoy `src/modules/documents/upload-form.tsx` (usado por
   `/documents/new` y `/contracts/new`, ver punto 5 de la Decisión arriba) tiene un
   único `<input type="file">` sin `multiple` y un único `selectedFile` en estado — el
   botón "Elegir otra imagen" **reemplaza** la foto capturada, no permite agregar una
   segunda. Problema real: en un contrato físico, los datos obligatorios de RF-003
   (`Valor total`, `Fecha`, `Vigencia`, `Tipo de contrato`, `Número de contrato`) casi
   nunca están todos en la primera página — suelen estar repartidos entre la carátula y
   las páginas de condiciones/firmas. Con el flujo actual, el usuario solo puede subir
   una página, y el resto del contrato nunca llega a extraerse ni a quedar guardado.
   **Se necesita:** poder capturar/subir varias fotos en `/contracts/new` y que todas
   queden asociadas al MISMO contrato (no como documentos separados sin relación entre
   sí). Esto expande RF-001 (`CLAUDE.md` §8) específicamente para `contract_es` — al
   retomarlo, sigue el proceso normal de `CLAUDE.md` §3 (reportar REQUERIMIENTO
   AFECTADO / PROBLEMA / CAUSA / IMPACTO / PROPUESTA DE CAMBIO / TRAZABILIDAD AFECTADA
   antes de tocar código), no se implementa directo — está conectado con el punto 2
   siguiente y conviene decidir ambos juntos.
2. **Revisar dónde y cómo quedan guardadas las fotos originales — de contratos Y de
   facturas — para poder verlas más adelante, no solo en el momento de subirlas.** Es
   justamente lo que le da valor a tener un sistema digitalizado en vez de solo
   extracción de datos: poder volver a la foto original si hace falta revisar algo.
   Estado real hoy, confirmado en el código (no supuesto):
   - `documents.original_file_path` es `text not null` — **un solo archivo por fila de
     `documents`**, ruta `{user_id}/{document_id}/original.{extension}`
     (`supabase/migrations/20260811200929_create_documents.sql`,
     `src/modules/documents/actions.ts`, función que arma el `path` y hace el
     `.upload(...)` contra el bucket privado).
   - El mecanismo de visualización (URLs firmadas, `CLAUDE.md` §6) existe en el código,
     pero **no está verificado en esta sesión** que efectivamente se pueda generar y
     abrir la URL firmada tiempo después de la subida (no solo justo al procesar el
     documento) — requiere navegador, bloqueado por `CLAUDE.md` §11.
   - **Este punto está directamente conectado con el punto 1**: si `contract_es` pasa a
     tener varias fotos por contrato, el esquema actual de "un archivo por documento"
     ya no alcanza tal cual está — hay que decidir si es un array de rutas en la misma
     fila, una tabla nueva (ej. `document_pages`, `contract_id` + `page_number` +
     `file_path`), o varias filas de `documents` enlazadas por un identificador de
     grupo. No tiene sentido resolver el almacenamiento de facturas (que siguen siendo
     una foto por documento) por separado del de contratos si van a compartir el mismo
     mecanismo — decidir los dos puntos juntos, no por separado.

## Consecuencias

- RF-003 ahora cubre dos perfiles con campos propios cada uno; la matriz de
  trazabilidad y `CLAUDE.md` §7/§8 se actualizan en el mismo cambio.
- Riesgo documentado (ya señalado en ADR-0002, aplica igual aquí): usar Tesseract.js
  como motor de reconocimiento de contratos en producción debe declararse honestamente
  en la documentación final de la tesis como lo que es -- un motor de terceros, no el
  pipeline propio -- si la evaluación académica pondera el pipeline construido desde
  cero como criterio central.
- Sin dataset de contratos reales, la calidad real de `extractContractFields` es
  desconocida hasta que el equipo pruebe con contratos reales de Mansor -- mismo
  patrón de honestidad que el resto del proyecto (no se afirma precisión sin medir).

## Sesión 2026-09-13 -- cierre de los dos pendientes de arriba

**Pendiente 2 (dónde quedan las fotos originales) -- cerrado, solo con lectura de
código, sin hacer falta navegador:** `src/app/(dashboard)/documents/[id]/page.tsx`
genera la URL firmada **en cada visita a la página** (`createSignedUrl`, TTL 5 min),
nunca la guarda -- el objeto en Storage no expira, solo el link. Ver una foto original
mucho después de subirla ya funcionaba por diseño, para facturas y para contratos de
una sola foto. No era un bug.

**Pendiente 1 (contratos multi-página) -- implementado, con autorización explícita del
equipo tras reportar REQUERIMIENTO AFECTADO (`CLAUDE.md` §3):**

- Tabla nueva `document_pages` (`supabase/migrations/20260913090000_create_document_pages.sql`):
  `document_id` (FK a `documents`, cascade), `page_number` (`>= 2`, único por
  documento), `file_path`. RLS con el mismo patrón que `ocr_results` (resuelto vía el
  documento dueño, no una columna propia). `documents.original_file_path` **no cambió**
  -- sigue siendo la portada/página 1, cero migración de datos, facturas sin cambios de
  comportamiento.
- `upload-form.tsx`: nuevo prop `allowMultiplePages` (solo `true` en `/contracts/new`).
  `selectedFile: File | null` pasó a `selectedFiles: File[]`; para contratos se puede
  agregar otra página (cámara o archivo) sin perder las ya confirmadas, y quitar una
  página individual antes de subir. Facturas siguen igual: una sola foto, "Elegir otra
  imagen" sigue reemplazando.
- `createDocument` (Server Action): lee `formData.getAll("file")` en vez de `.get(...)`,
  sube la primera como portada (como siempre) y el resto a `document_pages` en la misma
  ruta del bucket (`page-{n}.{extension}`). `deleteDocument` ahora también borra los
  objetos de Storage de las páginas (la fila cae por `on delete cascade`, el objeto en
  Storage no).
- `/documents/[id]`: si el documento tiene páginas adicionales, se muestran en una
  galería, cada una con su propia URL firmada generada en la misma visita (mismo
  patrón que la portada).
- Test de integración nuevo `tests/integration/document-pages-rls.test.ts` (mismo
  patrón que `document-validations-rls.test.ts`): aislamiento por dueño, admin ve todo,
  unique constraint de `page_number`, `page_number < 2` rechazado, cascada al borrar el
  documento. **No pasa todavía contra el proyecto Supabase real** -- la migración no se
  ha aplicado ahí (`npx supabase db push --linked`, ver `docs/DEPLOYMENT.md`); esta
  sesión no tiene el `SUPABASE_ACCESS_TOKEN` para hacerlo. Queda para el equipo antes de
  dar este test por verificado. El resto de la suite sigue en verde: **396/403**, los 7
  que fallan son justamente estos (error `PGRST205`, tabla no encontrada -- no es un bug
  de código).
- Verificado en esta sesión: `npx tsc --noEmit` limpio, `npx eslint .` limpio,
  `npm run build` limpio. RF-001 (matriz de trazabilidad) y `CLAUDE.md` actualizados en
  el mismo cambio.
- **Sin resolver todavía (fuera de alcance de este cambio, a propósito):** el OCR de
  contratos sigue corriendo solo sobre la portada. Correr Tesseract.js sobre cada página
  y fusionar los campos extraídos es una decisión aparte -- mezclarla aquí habría hecho
  el cambio más grande de lo que se autorizó.
