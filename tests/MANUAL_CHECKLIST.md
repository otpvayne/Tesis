# Checklist manual de Fase 7 — para Andres y Santiago

Este checklist reemplaza la ejecución automática de `tests/e2e/`, `tests/performance/` y
`tests/security/` mientras nadie los haya corrido (`CLAUDE.md` §11 prohíbe correr
servidor/navegador en la sesión de Claude Code que escribió esos archivos — ver la nota
al inicio de cada uno). Correr esto en el deploy real de Vercel (o en `npm run dev`
local) con una cuenta USER y una cuenta ADMIN reales.

Antes de empezar: confirmar que hay un modelo OCR activo (`/ocr-lab/train` → "Activar
este modelo", o `npm run generate:model`) — sin uno, "Procesar documento" da 404 y varios
puntos de abajo no se pueden probar.

## 1. Funcionalidad

- [ ] `/login` con credenciales válidas entra y redirige a `/` (bienvenida).
- [ ] `/login` con credenciales inválidas muestra un error y no navega.
- [ ] `/register` crea una cuenta nueva y redirige a `/login?registered=1`.
- [ ] `/` → "Nuevo documento" → `/documents/new`.
- [ ] Subir una imagen JPG o PNG real → "Subir documento" → redirige a `/documents/{id}`.
- [ ] En `/documents/{id}`, click "Procesar documento (OCR)" → aparece "Procesando
      (puede tardar varios segundos)..." y luego la tabla "Validación de campos (Fase
      5)" con 6 filas: Proveedor, NIT, Fecha, IVA, Valor, Total.
- [ ] Click "Editar" en un campo → aparece un input → Enter confirma → si el valor
      coincide con el original queda "✅ OK", si es distinto queda "🔧 Editado".
- [ ] "✕" al lado del input cancela la edición sin guardar cambios.
- [ ] Un campo numérico (IVA/Valor/Total) con texto no numérico muestra un error inline
      y no deja confirmar.
- [ ] "Guardar validación" queda deshabilitado mientras hay una edición sin confirmar.
- [ ] Tras "Guardar validación": aparece "Validación guardada..." y la página cambia a
      "✅ Documento validado" (resumen de solo lectura, con "(corregido)" en los campos
      editados).
- [ ] "Rechazar documento" cambia el estado a "Rechazado" y oculta la tabla de
      validación.
- [ ] `/documents` sigue mostrando el documento después de validado (con estado
      "Validado"), no desaparece.
- [ ] ADMIN ve `/admin` con KPIs (Documentos, Validados, Confidence OCR promedio,
      Usuarios activos, Modelos OCR activos, Campos editados) y el gráfico de barras de
      documentos por día.
- [ ] `/admin/documents` muestra confianza OCR y estado de validación por documento;
      filtrar por status/fecha/id funciona.
- [ ] `/admin/validations` muestra campos más corregidos, ediciones por usuario y la
      tendencia diaria.
- [ ] `/admin/models` muestra el/los modelo(s) entrenados con su accuracy real;
      "Activar"/"Desactivar" cambia cuál usa `/documents/[id]`.
- [ ] `/admin/reports` descarga los 3 archivos (2 CSV + 1 JSON) y abren correctamente
      (Excel/Notas — separador coma, UTF-8).
- [ ] Cerrar sesión ("Salir") vuelve a `/login`.

## 2. Performance

- [ ] `/documents` y `/admin` cargan en un tiempo razonable (sensación subjetiva de
      "rápido", sin un número duro verificado desde este equipo todavía).
- [ ] "Procesar documento (OCR)" termina en un tiempo razonable — el benchmark real
      medido en Fase 4e fue 4849ms para una factura sintética representativa
      (~1184 caracteres); con facturas reales puede variar. Si toma sistemáticamente
      >10s, reportarlo — sería una desviación real de RNF-001.
- [ ] `/admin/documents` (20 documentos por página) no se siente con lag al cargar ni
      al paginar.
- [ ] Editar un campo en la tabla de validación es fluido, sin lag perceptible al
      escribir.
- [ ] Descargar un reporte desde `/admin/reports` es prácticamente instantáneo con el
      volumen de datos actual.

## 3. Seguridad

- [ ] No se puede entrar a `/admin` (ni subrutas) con una cuenta sin rol ADMIN — debe
      redirigir a `/`.
- [ ] Sin sesión, entrar a `/admin` redirige a `/login`.
- [ ] No se puede abrir `/documents/{id}` de un documento de otro usuario (probar con
      un id real de otra cuenta) — debe dar una página no encontrada, no mostrar datos.
- [ ] Subir un archivo `.txt`/`.pdf`/`.exe` renombrado a `.jpg` es rechazado (mensaje:
      "El contenido del archivo no coincide con una imagen JPG o PNG válida.").
- [ ] Subir una imagen de más de 10MB es rechazada (mensaje: "...supera el tamaño
      máximo permitido (10 MB).").
- [ ] Todas las URLs de la app son HTTPS.
- [ ] Los tokens de sesión no aparecen en la URL visible (barra de direcciones).

## 4. Navegación

- [ ] "← Volver" en `/documents/{id}` regresa exactamente a la vista anterior (con los
      mismos filtros/página que tenía `/documents` o `/admin/documents`) — este proyecto
      no tiene breadcrumbs, usa este link en su lugar.
- [ ] El botón "atrás" del navegador funciona en todas las páginas probadas.
- [ ] No hay links internos rotos (404) navegando por `/`, `/documents`, `/admin/*`.
- [ ] La app se ve y se usa bien en un teléfono real (mobile first, RNF-004) — probar
      subir una factura con la cámara del celular, no solo con selector de archivo.
- [ ] Los botones tienen suficiente tamaño/contraste para usarse con el dedo en
      móvil.

## 5. Datos

- [ ] El OCR extrae los 6 campos de RF-003 (aunque el valor no sea correcto —
      el modelo activo hoy es sintético, 16.1% accuracy medido, ver `CLAUDE.md` §13).
- [ ] Guardar una validación efectivamente persiste (recargar la página y confirmar
      que sigue como "✅ Documento validado" con los valores corregidos).
- [ ] Las estadísticas de `/admin` y `/admin/validations` cambian correctamente después
      de validar un nuevo documento.
- [ ] Los 3 reportes de `/admin/reports` tienen datos consistentes con lo que se ve en
      `/admin/documents`/`/admin/validations` al momento de descargarlos.

## Al terminar

Reportar en el grupo/canal del equipo: qué falló (con captura si aplica), qué está
pendiente de revisar, y si RNF-001 (<5s) se cumple con facturas reales o no — ese dato
en particular todavía no lo tiene medido nadie con datos reales de Mansor.
