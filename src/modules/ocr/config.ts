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
} as const;
