# Algoritmos OCR — fórmulas y diseño

Este documento fija las fórmulas matemáticas que se implementarán desde cero en fases
`4a`–`4d`. Las fórmulas en sí son conocimiento matemático de dominio público (no son
"código de terceros"); lo prohibido (ver `CLAUDE.md` §7) es importar una *implementación*
ya hecha de estos algoritmos, no conocer su definición. Cada función que implemente una
fórmula de este documento debe referenciarla en su TSDoc.

## 1. Escala de grises

Luminancia perceptual estándar (evita simple promedio, más fiel a percepción humana):

```
gray(x, y) = 0.299 · R(x, y) + 0.587 · G(x, y) + 0.114 · B(x, y)
```

## 2. Normalización de contraste

Estiramiento lineal de histograma (min-max stretch):

```
I'(x, y) = (I(x, y) - I_min) / (I_max - I_min) · 255
```

donde `I_min`/`I_max` son el mínimo y máximo de intensidad observados en la imagen (o en
un percentil recortado, a definir experimentalmente en Fase 4a si el min-max puro es
sensible a outliers de ruido).

## 3. Umbralización de Otsu (propia)

Dado el histograma normalizado `p(i)` (probabilidad del nivel de intensidad `i`, para
`i = 0..255`), para cada umbral candidato `t`:

```
w0(t) = Σ_{i=0}^{t} p(i)                    # peso de la clase fondo
w1(t) = 1 - w0(t)                            # peso de la clase objeto

μ0(t) = Σ_{i=0}^{t} i·p(i) / w0(t)
μ1(t) = Σ_{i=t+1}^{255} i·p(i) / w1(t)

σ²_between(t) = w0(t)·w1(t)·(μ0(t) - μ1(t))²
```

El umbral óptimo `t*` maximiza `σ²_between(t)` sobre todo `t ∈ [0, 255]`. Binarización:

```
B(x, y) = 255 si gray(x, y) > t*, si no 0
```

(o el sentido inverso según convención texto=blanco/negro que se fije en Fase 4a).

## 4. Operaciones morfológicas (propias)

Erosión y dilatación binaria con kernel estructurante `K` (ej. 3×3):

```
erosion(x, y)  = min{ B(x+i, y+j) : (i,j) ∈ K }
dilation(x, y) = max{ B(x+i, y+j) : (i,j) ∈ K }
```

Apertura = erosión seguida de dilatación (elimina ruido puntual); cierre = dilatación
seguida de erosión (cierra huecos pequeños en trazos de caracteres). Se implementan
ambas y se evalúa experimentalmente cuál aporta en `invoice_es`.

## 5. Componentes conectados (propio)

Etiquetado por *flood fill* / unión-búsqueda con conectividad 8 sobre píxeles de
primer plano, para aislar cada glifo/blob antes de agrupar en caracteres. Complejidad
objetivo O(n) sobre el número de píxeles.

## 6. Proyecciones y segmentación

Proyección horizontal (suma de píxeles de primer plano por fila) para separar líneas de
texto; proyección vertical dentro de cada línea para separar palabras y caracteres,
usando valles (mínimos locales por debajo de un umbral) como puntos de corte:

```
projH(y) = Σ_x B(x, y)
projV(x) = Σ_y B(x, y)   (dentro de una línea ya segmentada)
```

## 7. HOG — Histogram of Oriented Gradients (propio)

Sobre cada carácter normalizado a tamaño fijo (ej. `WxH` a definir en Fase 4c):

**Gradientes** (Sobel simple o diferencia central):

```
Gx(x, y) = I(x+1, y) - I(x-1, y)
Gy(x, y) = I(x, y+1) - I(x, y-1)
```

**Magnitud y orientación:**

```
magnitude(x, y)  = √(Gx² + Gy²)
orientation(x, y) = atan2(Gy, Gx)   # en [0°, 180°) si se usa "unsigned gradient"
```

**Histograma por celda:** dividir la imagen del carácter en celdas de `c×c` píxeles; en
cada celda, acumular `magnitude(x,y)` en `nbins` (ej. 9) bins de orientación, con
interpolación bilineal opcional entre bins adyacentes.

**Normalización por bloque:** agrupar celdas en bloques (ej. 2×2 celdas) y normalizar el
vector concatenado del bloque con norma L2 (o L2-Hys, recortando valores altos y
renormalizando):

```
v' = v / √(‖v‖² + ε²)
```

El vector de características final es la concatenación de todos los bloques
normalizados. Todos los parámetros (`c`, `nbins`, tamaño de bloque, `ε`) se fijan
experimentalmente en Fase 4c y se documentan aquí con su justificación una vez elegidos.

## 8. k-Nearest Neighbors (propio)

**Distancia** entre vector de características de entrada `q` y cada muestra de
entrenamiento `s_i` — distancia euclidiana como base:

```
d(q, s_i) = √( Σ_j (q_j - s_i,j)² )
```

**Selección de vecinos:** los `k` vectores de entrenamiento con menor `d`.

**Votación ponderada** (pesa más a los vecinos más cercanos, mitiga empates ingenuos):

```
weight_i = 1 / (d(q, s_i) + ε)
score(class) = Σ_{i : label(s_i) = class} weight_i
```

La clase predicha es `argmax_class score(class)`. `k` y `ε` se fijan experimentalmente
en Fase 4c sobre el conjunto de `validation` (nunca `test`).

## 9. Confidence score (fórmula)

Confianza por carácter, combinando consistencia del voto kNN y cercanía del vecino más
próximo (ambas señales reales del clasificador, no arbitrarias):

```
agreement(char)  = score(clase_ganadora) / Σ_class score(class)   # ∈ [0,1]
proximity(char)  = 1 / (1 + d(q, vecino_más_cercano))               # ∈ (0,1]
confidence(char) = α · agreement(char) + (1-α) · proximity(char)
```

Confianza por campo (RF-003/sección 18), combinando confianza promedio de los
caracteres del campo y coherencia con el patrón esperado del campo (ej. `fecha` matchea
`dd/mm/yyyy` u otro patrón soportado; `monto_total` matchea patrón numérico/moneda):

```
confidence(field) = β · mean(confidence(char) para char en field)
                   + (1-β) · patternMatchScore(field)
```

`α`, `β` se fijan experimentalmente en Fase 4c/4e y se documentan aquí con su valor
final y la justificación (no se inventan sin evidencia). Rango de salida siempre
`[0.0, 1.0]`.

## 10. Estado de este documento

En Fase 0 estas son las fórmulas de **diseño**, no resultados medidos. Ninguna cifra de
precisión, tiempo de procesamiento o valor de parámetro (`k`, `α`, `β`, tamaño de
celda, etc.) es válida hasta calibrarse experimentalmente en las fases correspondientes
y reportarse en `docs/ocr/evaluation.md` con el conjunto `test`.
