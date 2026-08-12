# Algoritmos OCR — fórmulas y diseño

Este documento fija las fórmulas matemáticas que se implementan desde cero en fases
`4a`–`4d`. Las fórmulas en sí son conocimiento matemático de dominio público (no son
"código de terceros"); lo prohibido (ver `CLAUDE.md` §7) es importar una *implementación*
ya hecha de estos algoritmos, no conocer su definición. Cada función que implemente una
fórmula de este documento la referencia en su TSDoc.

Las secciones 1–5 están **implementadas y con unit tests en verde** desde Fase 4a
(`src/modules/ocr/preprocessing/`). Las secciones 6 en adelante siguen siendo diseño
para fases futuras (4b/4c), sin cambios respecto a Fase 0.

## 1. Escala de grises — `grayscale.ts` (Fase 4a, implementado)

Luminancia perceptual estándar ITU-R BT.601 (evita el promedio simple `(R+G+B)/3`, más
fiel a cómo el ojo humano pesa cada canal — el verde domina la percepción de brillo):

```
gray(x, y) = round(0.299 · R(x, y) + 0.587 · G(x, y) + 0.114 · B(x, y))
```

El resultado se redondea (`Math.round`) porque `ImageData` solo admite enteros 0–255
por canal (`Uint8ClampedArray`). Verificado en `grayscale.test.ts` con los tres colores
primarios puros: rojo→76, verde→150, azul→29.

## 2. Normalización de contraste — `normalize.ts` (Fase 4a, implementado)

Estiramiento lineal de histograma (min-max stretch):

```
I'(x, y) = round( (I(x, y) - I_min) / (I_max - I_min) · 255 )
```

`I_min`/`I_max` son el mínimo y máximo de intensidad de gris observados en toda la
imagen. Caso especial: si `I_min == I_max` (imagen completamente uniforme), no se
reescala — dividir entre `(I_max - I_min) = 0` no está definido, y no hay contraste que
estirar. No se usa percentil recortado (se consideró para robustez ante outliers, pero
sin datos reales de facturas todavía que justifiquen la complejidad adicional — revisar
en Fase 4f si el min-max puro resulta sensible a ruido de sensor).

## 3. Histograma y estadísticas — `histogram.ts` (Fase 4a, implementado)

```
histogram[i] = # píxeles con valor de gris i,  i = 0..255

mean   = (Σ_i i · histogram[i]) / N                     # N = total de píxeles
stddev = √( (Σ_i (i - mean)² · histogram[i]) / N )
```

La mediana se calcula sobre la distribución **exacta**, no aproximada por el primer bin
donde el conteo acumulado cruza `N/2` (eso da un resultado distinto y menos preciso para
`N` par). Se usa la definición estándar de mediana de un arreglo ordenado:

```
midLow  = floor((N - 1) / 2)
midHigh = floor(N / 2)
median  = ( valorEnPosición(midLow) + valorEnPosición(midHigh) ) / 2
```

donde `valorEnPosición(k)` recorre el histograma acumulando conteo hasta superar `k`,
sin materializar el arreglo ordenado completo. Para `N` impar, `midLow == midHigh` y la
fórmula se reduce al valor central único (caso estándar). Ejemplo verificado en
`histogram.test.ts`: píxeles `[0, 85, 170, 255]` → `mean = 127.5`, `median = 127.5`
(promedio de los dos valores centrales, 85 y 170).

## 4. Umbralización de Otsu — `otsu-binarization.ts` (Fase 4a, implementado)

Dado el histograma de probabilidades `p(i) = histogram[i] / N` (`i = 0..255`), para cada
umbral candidato `t` se definen dos clases: clase 0 = píxeles con valor `< t`, clase 1 =
píxeles con valor `>= t`.

```
w0(t) = Σ_{i=0}^{t-1} p(i)                    # peso (proporción) de la clase 0
w1(t) = 1 - w0(t)                              # peso de la clase 1

μ0(t) = Σ_{i=0}^{t-1} i·p(i) / w0(t)           # media de la clase 0
μ1(t) = Σ_{i=t}^{255} i·p(i) / w1(t)           # media de la clase 1

σ²_between(t) = w0(t) · w1(t) · (μ0(t) - μ1(t))²
```

El umbral óptimo `t*` maximiza `σ²_between(t)` sobre `t ∈ [0, 255]`, excluyendo los `t`
donde `w0(t) = 0` o `w1(t) = 0` (una clase vacía no tiene media definida). Binarización:

```
B(x, y) = 255 si gray(x, y) >= t*, si no 0
```

### Pseudocódigo (implementación real, O(256) con sumas acumuladas)

La forma ingenua recalcula `w0`/`μ0`/`μ1` desde cero para cada `t` — O(256²). La
implementación real mantiene `w0` y `sum0 = Σ i·p(i)` de la clase 0 como acumuladores
que se actualizan en cada paso, dando O(256):

```
totalSum = Σ_{i=0}^{255} i·p(i)
w0 = 0; sum0 = 0
para t = 0 hasta 255:
    w1 = 1 - w0
    si w0 > 0 y w1 > 0:
        μ0 = sum0 / w0
        μ1 = (totalSum - sum0) / w1
        varianza[t] = w0 · w1 · (μ0 - μ1)²
    # preparar clase 0 para el siguiente t (que incluye el valor t)
    w0 += p[t]
    sum0 += t · p[t]
t* = argmax_t varianza[t]
```

### Desempate en mesetas (histogramas fuertemente bimodales)

Cuando el histograma tiene toda su masa concentrada en dos valores aislados (sin píxeles
intermedios — ej. una imagen sintética de prueba con solo 0 y 255), `varianza[t]` es
**idéntica** para todo `t` entre esos dos valores: cualquier `t` en ese rango separa las
clases exactamente igual. La implementación toma el **punto medio del rango empatado**
en vez del primer `t` que alcanza el máximo — un umbral más representativo que un
extremo arbitrario de la meseta.

### Ejemplo numérico (verificado en `otsu-binarization.test.ts`)

Píxeles `[0, 0, 100, 200]` (4 píxeles, `N=4`). Histograma: `p[0]=0.5, p[100]=0.25,
p[200]=0.25`. Dos particiones posibles a comparar a mano:

```
Split en t=1 (clase 0 = {0,0}, clase 1 = {100,200}):
  w0=0.5, w1=0.5, μ0=0, μ1=(100·0.25+200·0.25)/0.5=150
  σ²_between = 0.5 · 0.5 · (0-150)² = 5625

Split en t=101 (clase 0 = {0,0,100}, clase 1 = {200}):
  w0=0.75, w1=0.25, μ0=(0·0.5+100·0.25)/0.75≈33.33, μ1=200
  σ²_between = 0.75 · 0.25 · (33.33-200)² ≈ 5208.33
```

`5625 > 5208.33` → Otsu correctamente agrupa `100` y `200` juntos en la clase alta en
vez de separar `100` con el `0`. El test comprueba exactamente esta clasificación.

Caso degenerado (imagen completamente uniforme, un solo valor de gris): no existe ningún
`t` con ambas clases no vacías. Sin un umbral "correcto" definido, se usa `128` (punto
medio del rango) como valor neutral — verificado en `otsu-binarization.test.ts` y no
provoca error ni división por cero.

## 5. Reducción de ruido — filtro de mediana — `denoise.ts` (Fase 4a, implementado)

Para cada píxel, se reemplaza su valor por la **mediana** (no el promedio) de sus
vecinos en un kernel `k×k` (3×3 por defecto):

```
salida(x, y) = mediana({ entrada(x+i, y+j) : (i,j) ∈ [-⌊k/2⌋, ⌊k/2⌋]² })
```

Los vecinos fuera de los límites de la imagen se resuelven por **replicación de borde**
(se usa el píxel de borde más cercano dentro de los límites válidos), no un padding
artificial de ceros que introduciría ruido falso en los bordes.

### Por qué mediana y no Gaussiano

Esta etapa opera sobre la salida de Otsu, que es **binaria** (solo 0 o 255). Un filtro
Gaussiano promedia sus vecinos — sobre una vecindad con valores 0 y 255 mezclados,
produce valores grises intermedios (ej. 85, 170) que rompen la propiedad binaria que
necesita la segmentación (Fase 4b espera solo 0/255). El filtro de mediana, en cambio,
siempre devuelve uno de los valores efectivamente presentes en la vecindad — si la
vecindad es binaria, la salida sigue siendo binaria — y por "votación de mayoría"
elimina un píxel aislado que difiere del resto sin difuminar los bordes del trazo.

Ejemplo verificado en `denoise.test.ts`: en una imagen 3×3 completamente negra (`0`) con
un único píxel blanco (`255`) aislado en el centro, la vecindad 3×3 completa tiene 8
ceros y 1 blanco — la mediana (5º valor de 9 ordenados) es `0`, así que el ruido
desaparece. El caso simétrico (blanco con un negro aislado) limpia igual de correcto.

## 6. Operaciones morfológicas (propias) — Fase 4b, diseño

Erosión y dilatación binaria con kernel estructurante `K` (ej. 3×3):

```
erosion(x, y)  = min{ B(x+i, y+j) : (i,j) ∈ K }
dilation(x, y) = max{ B(x+i, y+j) : (i,j) ∈ K }
```

Apertura = erosión seguida de dilatación (elimina ruido puntual); cierre = dilatación
seguida de erosión (cierra huecos pequeños en trazos de caracteres). Se implementan
ambas y se evalúa experimentalmente cuál aporta en `invoice_es`.

## 7. Componentes conectados (propio) — Fase 4b, diseño

Etiquetado por *flood fill* / unión-búsqueda con conectividad 8 sobre píxeles de
primer plano, para aislar cada glifo/blob antes de agrupar en caracteres. Complejidad
objetivo O(n) sobre el número de píxeles.

## 8. Proyecciones y segmentación — Fase 4b, diseño

Proyección horizontal (suma de píxeles de primer plano por fila) para separar líneas de
texto; proyección vertical dentro de cada línea para separar palabras y caracteres,
usando valles (mínimos locales por debajo de un umbral) como puntos de corte:

```
projH(y) = Σ_x B(x, y)
projV(x) = Σ_y B(x, y)   (dentro de una línea ya segmentada)
```

## 9. HOG — Histogram of Oriented Gradients (propio) — Fase 4c, diseño

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

## 10. k-Nearest Neighbors (propio) — Fase 4c, diseño

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

## 11. Confidence score (fórmula) — Fase 4c/4e, diseño

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

## 12. Estado de este documento

**Secciones 1–5 (grayscale, normalización, histograma, Otsu, mediana): implementadas y
verificadas por unit test desde Fase 4a** (`src/modules/ocr/preprocessing/`, 42 tests).
Los ejemplos numéricos de este documento están tomados directamente de esos tests, no
inventados aparte — si el código cambia, estos ejemplos deben volver a verificarse
contra los tests, no al revés.

**Secciones 6–11 (morfología, componentes conectados, proyecciones, HOG, kNN,
confidence) siguen siendo fórmulas de diseño, no implementadas.** Ninguna cifra de
precisión, tiempo de procesamiento o valor de parámetro (`k`, `α`, `β`, tamaño de
celda, etc.) es válida hasta calibrarse experimentalmente en las fases correspondientes
(4b/4c) y reportarse en `docs/ocr/evaluation.md` con el conjunto `test`.
