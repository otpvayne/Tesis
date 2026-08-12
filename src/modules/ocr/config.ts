import { MIN_CAPTURE_HEIGHT, MIN_CAPTURE_WIDTH } from "@/modules/camera/resolution";

/**
 * Parámetros ajustables del pipeline OCR propio, centralizados en un solo
 * lugar. Ningún valor aquí es un resultado medido — son puntos de partida
 * razonables que se recalibran con datos reales cuando existan (Fase 4d en
 * adelante, dataset de OCR LAB).
 */
export const OCR_CONFIG = {
  /**
   * Área mínima de captura (Fase 4a/RNF-007). Referencia informativa, no
   * la validación real: esa vive en `modules/camera/resolution.ts` y se
   * ejecuta al capturar/seleccionar la imagen, antes de que llegue a este
   * pipeline. Se calcula a partir de esas constantes (no se duplica el
   * número) para que ambos lugares no puedan desincronizarse.
   */
  MIN_RESOLUTION: MIN_CAPTURE_WIDTH * MIN_CAPTURE_HEIGHT,

  /**
   * Tamaño (px) al que se normaliza cada carácter segmentado antes de
   * pasar a extracción de características (Fase 4c, HOG). 32×32 es un
   * tamaño común en literatura de reconocimiento de caracteres (similar a
   * MNIST) — suficiente detalle para distinguir formas de letras/dígitos
   * sin generar vectores de características excesivamente grandes.
   */
  CHAR_SIZE: 32,

  /**
   * Si el paso de denoise (`preprocessing/denoise.ts`, filtro de mediana)
   * se aplica antes de segmentar. Desactivado temporalmente: el kernel 3×3
   * por defecto erosiona trazos de 1px de ancho (letras pequeñas, serifs)
   * — un píxel de un trazo delgado rodeado mayormente de fondo en su
   * vecindad 3×3 puede perder la votación de mediana y desaparecer,
   * destruyendo el carácter en vez de limpiar ruido. Se deja en `false`
   * hasta calibrar un kernel/técnica que no erosione texto pequeño (ver
   * limitación documentada en `denoise.ts`) — no se elimina la función,
   * solo se deja de invocar por defecto. En `OcrPreviewClient` (OCR LAB)
   * el paso ya era un botón manual opcional; este flag documenta la
   * decisión para cuando exista un pipeline automático real (RF-002).
   */
  APPLY_DENOISE: false,

  /**
   * Una fila de la proyección horizontal con menos píxeles blancos que
   * este valor se considera un "valle" (espacio entre líneas de texto),
   * no parte de una línea.
   *
   * Subido de 5 a 10 (bug real de Fase 4b: una foto de factura encontró 1
   * sola línea en vez de ~20-30). Causa confirmada con un test de
   * diagnóstico sintético: en documentos con estructura (líneas de borde
   * de tabla que atraviesan todo el bloque de texto, o ruido residual que
   * el denoise 3×3 no elimina por completo) las filas "valle" entre
   * líneas de texto no quedan en 0 — tienen un piso de ruido constante que
   * con threshold=5 ya alcanzaba a clasificarse como fila de texto, fusionando
   * todas las líneas en una sola región. Bajar el threshold (como se
   * consideró inicialmente) empeora esto: hace aún más fácil que una fila
   * de ruido pase el corte. Subirlo por encima del piso de ruido es lo que
   * separa las líneas correctamente. 10 es un punto de partida que
   * despejó el caso sintético (líneas de borde + ruido disperso); no es un
   * valor medido contra facturas reales de Mansor — se recalibra en Fase
   * 4d con dataset real si hace falta.
   */
  HORIZONTAL_VALLEY_THRESHOLD: 10,

  /**
   * Igual que el anterior pero para la proyección vertical dentro de una
   * línea (espacio entre palabras). Deliberadamente más bajo (2, no 5):
   * el espacio entre dos letras de una misma palabra también genera
   * columnas con pocos píxeles, así que un umbral alto fragmentaría
   * palabras en letras sueltas en vez de separar solo palabras entre sí.
   */
  VERTICAL_VALLEY_THRESHOLD: 2,

  /**
   * Un componente conectado con menos altura (px) que esto se descarta al
   * extraer caracteres — típicamente ruido residual (puntos sueltos,
   * artefactos de binarización) que un componente real de carácter no
   * produciría. 10px es bajo a propósito: un punto de una "i" o un signo
   * de puntuación son legítimamente pequeños y no deben perderse.
   */
  CHAR_MIN_HEIGHT: 10,

  /**
   * Un componente con más altura (px) que esto se descarta — indica que
   * la segmentación falló para esa región (ej. un borde del documento o
   * un logo grande capturado como "carácter"), no que sea un carácter
   * legítimamente enorme.
   */
  CHAR_MAX_HEIGHT: 200,

  /**
   * Columnas/filas de la grilla de regiones que usa `extractHOG` (Fase 4c)
   * para dividir el carácter normalizado (`CHAR_SIZE × CHAR_SIZE`) antes de
   * construir el histograma de orientaciones por región.
   *
   * El diseño original propuesto (celdas de 4px + bloques de 2×2 celdas con
   * solape del 50%, igual que HOG clásico) da 8×8=64 celdas y, con solape,
   * 7×7=49 bloques × (2×2 celdas × `HOG_ORIENTATION_BINS`=9) = 1764
   * valores — matemáticamente correcto (verificable a mano), pero de ahí no
   * hay ninguna reducción *limpia* a 108: 1764 no es divisible por un
   * número de grupos que dé una grilla entera, y 108/9=12 regiones
   * tampoco factoriza en potencias de 2 (los únicos divisores enteros de
   * 32px). Construir el HOG completo de 1764-dim solo para descartarlo con
   * un sub-muestreo arbitrario habría sido complejidad sin uso real. En su
   * lugar, `extractHOG` divide la imagen directamente en una grilla de
   * `HOG_GRID_COLS × HOG_GRID_ROWS` = 4×3 = 12 regiones (límites por
   * `Math.floor`, deterministas — columnas de 8px exactos, filas de
   * ~10-11px), cada una con su propio histograma de 9 bins normalizado
   * L2 — mismo total de 108 = 12×9 que pedía el diseño original, mismas
   * fórmulas de gradiente/orientación, sin la etapa de bloques con solape
   * (que no aporta valor aquí al no alimentar una reducción de dimensión
   * real). Ver razón completa en `docs/ocr/algorithms.md` §12.
   */
  HOG_GRID_COLS: 4,
  HOG_GRID_ROWS: 3,

  /**
   * Bins del histograma de orientación de gradiente por región de HOG,
   * cubriendo `[0°, 180°)` en incrementos de 20° (gradiente "sin signo":
   * una línea a 10° y una a 190° representan el mismo trazo). Valor
   * estándar en la literatura de HOG (Dalal & Triggs, 2005) para
   * reconocimiento de formas simples.
   */
  HOG_ORIENTATION_BINS: 9,

  /**
   * Estabilidad numérica al normalizar L2 el histograma de cada región de
   * HOG (`normalizado = histograma / (norma + epsilon)`) — evita división
   * por cero en una región sin ningún gradiente (ej. carácter que no toca
   * esa zona del lienzo 32×32).
   */
  HOG_EPSILON: 0.001,

  /**
   * `k` (número de vecinos) por defecto para `KNNClassifier.predict`. 3 es
   * un punto de partida estándar en la literatura (impar, evita empates en
   * problemas binarios; lo bastante bajo para no diluir clases con pocas
   * muestras en el dataset inicial de Fase 4d). Se recalibra con el
   * conjunto `validation` una vez exista dataset real — nunca con `test`.
   */
  KNN_K: 3,

  /**
   * Estabilidad numérica al ponderar el voto de un vecino por
   * `1 / (distancia + epsilon)` en `KNNClassifier` — evita división por
   * cero cuando la muestra de test coincide exactamente con una de
   * entrenamiento (distancia euclidiana = 0).
   */
  KNN_EPSILON: 0.001,
} as const;

/**
 * Parámetros de síntesis y entrenamiento (Fase 4d) — separados de
 * `OCR_CONFIG` porque son parámetros del *proceso de generar/entrenar* un
 * modelo, no del pipeline de reconocimiento en sí (que es lo que
 * `OCR_CONFIG` gobierna en tiempo de ejecución real). Ningún valor aquí es
 * medido — son puntos de partida para el dataset sintético; se recalibran
 * cuando exista dataset real (facturas de Mansor vía OCR LAB).
 */
export const OCR_TRAINING_CONFIG = {
  /**
   * Muestras sintéticas a generar por carácter. `62 × 160 = 9920` ≈ 10,000
   * (62 = 10 dígitos + 26 mayúsculas + 26 minúsculas, el alfabeto de
   * `CLAUDE.md` §7).
   */
  SYNTHETIC_SAMPLES_PER_CHARACTER: 160,

  /**
   * Fuentes usadas para renderizar los caracteres base antes de distorsionar.
   * Dependen de qué fuentes tenga instaladas el sistema/navegador donde
   * corre la síntesis (Canvas 2D `ctx.font`, sin control total sobre el
   * fallback) — no hay garantía de que las 4 rindan visualmente distintas
   * en cualquier máquina; es una limitación aceptada, no un bug.
   */
  SYNTHETIC_FONTS: ["Arial", "Times New Roman", "Courier New", "Helvetica"],

  /** Rotación aleatoria aplicada a cada muestra, en grados, rango `[-N, N]`. */
  DISTORTION_ROTATION_RANGE: 5,

  /** Escala aleatoria aplicada a cada muestra, proporción `[1-N, 1+N]` (`0.1` = ±10%). */
  DISTORTION_SCALE_RANGE: 0.1,

  /**
   * Probabilidad por píxel de invertir su valor (ruido "sal y pimienta").
   * `0.05` = 5% de los píxeles del carácter distorsionado quedan invertidos.
   */
  DISTORTION_NOISE_LEVEL: 0.05,

  /**
   * Desplazamiento máximo (px) del shear afín aplicado a cada muestra,
   * rango `[-N, N]`. Nota: en un lienzo de 32×32 (`OCR_CONFIG.CHAR_SIZE`),
   * ±10px es un shear agresivo (~31% del ancho) — se deja el valor pedido
   * explícitamente, pero es candidato a bajar si el equipo observa
   * caracteres irreconocibles al inspeccionar el dataset sintético
   * generado (verificación manual, ver `docs/ocr/training.md`).
   */
  DISTORTION_SKEW_RANGE: 10,

  /** Proporción del dataset sintético usada para entrenar (el resto, para medir accuracy) — split estratificado por label, ver `Dataset.split`. */
  TRAIN_TEST_SPLIT: 0.8,

  /**
   * `k` para el entrenamiento/evaluación de esta fase. Igual a
   * `OCR_CONFIG.KNN_K` por referencia (no un número separado) para que no
   * puedan desincronizarse — es conceptualmente el mismo parámetro, usado
   * tanto en tiempo real como al evaluar el modelo sintético.
   */
  KNN_K: OCR_CONFIG.KNN_K,

  /**
   * Si el accuracy medido en la partición de evaluación cae por debajo de
   * esto, `trainModel` reporta `generalizationWarning` — una señal de que
   * el dataset sintético o los parámetros de distorsión no están
   * generando muestras aprendibles, no una afirmación sobre el modelo
   * final (que se mide con `test` real, Fase 4f).
   */
  MIN_ACCURACY_THRESHOLD: 0.8,
} as const;
