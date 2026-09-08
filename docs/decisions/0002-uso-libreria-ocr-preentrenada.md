# ADR-0002: Uso de librería OCR pre-entrenada (Tesseract.js)

- **Estado:** Aceptado
- **Fecha:** 2026-09-08 (fecha real de redacción de este ADR; una versión anterior de
  este documento indicaba por error 2026-08-19)
- **Decide:** Equipo del proyecto (Diego Alejandro Medina Martinez, Andres Felipe
  Moreno Beltrán, Santiago Moralez Orozco), con aprobación verbal de la asesora de
  tesis — ver nota de verificación en "Aprobado por"

## Contexto

La Fase 4 del proyecto implementó un motor OCR propio desde cero (preprocesamiento,
segmentación, descriptor HOG, clasificador k-NN, síntesis de datos de entrenamiento),
sin dependencias externas de OCR o visión por computador, como restricción académica
explícita documentada en `CLAUDE.md` §7 y en el Manual Técnico del proyecto.

Al cierre de la Fase 8, el modelo activo (entrenado únicamente con caracteres
sintéticos) midió una precisión real de aproximadamente 16% por carácter — muy por
debajo de un umbral usable en producción. El plan original contemplaba mejorar esta
cifra mediante etiquetado manual de caracteres reales de facturas de Mansor y
reentrenamiento del modelo propio.

Con el tiempo de entrega a biblioteca aproximándose, el equipo, en conjunto con el
asesor de tesis (quien también es jurado de sustentación), evaluó el riesgo de no
alcanzar una precisión aceptable a tiempo usando exclusivamente el motor propio.

## Decisión

Se aprueba el uso de librerías OCR pre-entrenadas (específicamente Tesseract.js) para
mejorar la precisión de reconocimiento del sistema antes de la entrega final.

**Alcance exacto (pendiente de definir por el equipo de implementación):** si
Tesseract.js reemplaza completamente el pipeline de clasificación propio, o si se
integra de forma híbrida conservando etapas del motor propio (por ejemplo,
preprocesamiento o segmentación). Esta sección se actualizará una vez el equipo
defina la arquitectura final.

## Consecuencias

- El motor OCR propio (Fase 4a-4f) se conserva en el repositorio como trabajo
  académico realizado y evidencia del proceso, aunque dejaría de ser el camino usado
  en producción según el alcance final que se defina.
- La documentación del proyecto (Manual Técnico, README, `CLAUDE.md` §7) requiere
  actualización una vez se confirme el alcance exacto de la integración, para que el
  trabajo entregado sea consistente entre código y documentación.
- La sustentación de tesis debe presentar ambos componentes con honestidad: el motor
  propio como el aporte académico central desarrollado por el equipo, y la librería
  pre-entrenada como la solución adoptada para cumplir el requisito de precisión en
  producción dentro del tiempo disponible, con aprobación formal del asesor/jurado.

## Aprobado por

- Asesora de tesis: Olga Lucia Roa Bohorquez — aprobación **verbal**, comunicada por
  el equipo (Diego → Andrés). No hay registro escrito de la asesora en este proceso;
  se documenta como verbal para no sobre-representar el nivel de confirmación real.
- Equipo: Diego Alejandro Medina Martinez, Andres Felipe Moreno Beltrán,
  Santiago Moralez Orozco
