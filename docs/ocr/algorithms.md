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

## 6. Operaciones morfológicas (propias) — diseño, no implementado

Erosión y dilatación binaria con kernel estructurante `K` (ej. 3×3):

```
erosion(x, y)  = min{ B(x+i, y+j) : (i,j) ∈ K }
dilation(x, y) = max{ B(x+i, y+j) : (i,j) ∈ K }
```

Apertura = erosión seguida de dilatación (elimina ruido puntual); cierre = dilatación
seguida de erosión (cierra huecos pequeños en trazos de caracteres). **No se
implementaron en Fase 4b** — el filtro de mediana de Fase 4a (§5) ya resultó
suficiente para limpiar el ruido de la imagen sintética de prueba, y componentes
conectados (§7) funcionó sin necesitar cerrar huecos en los trazos. Se revisita si
datos reales (facturas de Mansor, Fase 4d) muestran que hace falta.

## 7. Componentes conectados — `connected-components.ts` (Fase 4b, implementado)

Etiquetado por BFS con **8-conectividad**: dos píxeles blancos (255) pertenecen al
mismo componente si son vecinos horizontal, vertical, o **diagonalmente**. Los 8
vecinos de un píxel `(x, y)`:

```
(x-1,y-1) (x,y-1) (x+1,y-1)
(x-1,y)             (x+1,y)
(x-1,y+1) (x,y+1) (x+1,y+1)
```

Se usa 8 en vez de 4-conectividad porque un carácter impreso puede tener trazos que
solo se tocan en diagonal (ej. los serifs de una tipografía, o el cruce de una "X")
— con 4-conectividad esos trazos se partirían en componentes separados que Fase 4b
trataría incorrectamente como letras distintas.

### Pseudocódigo (BFS con cola indexada, O(n) real)

```
visitado = matriz booleana width×height, todo falso
componentes = []
para cada píxel (x, y) en orden de fila:
    si visitado[x,y] o no es blanco: continuar
    // BFS desde (x,y)
    cola = [(x,y)]; visitado[x,y] = true; head = 0
    píxeles = []
    mientras head < cola.length:
        (cx,cy) = cola[head]; head += 1
        píxeles.push((cx,cy))
        para cada uno de los 8 vecinos (nx,ny) de (cx,cy):
            si (nx,ny) dentro de límites y es blanco y no visitado:
                visitado[nx,ny] = true
                cola.push((nx,ny))
    componentes.push({ píxeles, boundingBox: min/max de x,y en píxeles })
retornar componentes
```

La cola usa un **puntero que avanza** (`head`), no `Array.shift()`: `shift()` es O(n)
por llamada, lo que volvería el BFS O(n²) en componentes grandes. Verificado en
`connected-components.test.ts`: dos píxeles diagonalmente adyacentes (`(0,0)` y
`(1,1)`) forman **un** componente de 2 píxeles bajo 8-conectividad, no dos.

## 8. Proyecciones y detección de valles — `projections.ts` (Fase 4b, implementado)

```
horizontal[y] = Σ_x [ B(x, y) = 255 ]     # píxeles blancos en la fila y
vertical[x]   = Σ_y [ B(x, y) = 255 ]     # píxeles blancos en la columna x
```

Una fila/columna es un **valle** (espacio vacío) si su conteo cae por debajo de un
umbral; una corrida contigua de filas/columnas que NO son valle es una región de
contenido (línea de texto, o palabra dentro de una línea). Dos umbrales distintos,
documentados con su razón en `modules/ocr/config.ts`:

- `HORIZONTAL_VALLEY_THRESHOLD = 10` — separa líneas de texto entre sí. Subido de 5 a
  10 tras un bug real (Fase 4b): con 5, filas "valle" en documentos con estructura
  (bordes de tabla que atraviesan todo el bloque de texto, ruido residual no
  eliminado por el denoise 3×3) alcanzaban el umbral y fusionaban todas las líneas
  en una sola región. Ver razón completa en `modules/ocr/config.ts`.
- `VERTICAL_VALLEY_THRESHOLD = 2` — separa palabras dentro de una línea, más bajo a
  propósito porque el espacio entre letras de una misma palabra también genera
  columnas con pocos píxeles.

## 9. Extracción de líneas, palabras y caracteres (Fase 4b, implementado)

**Líneas** (`extract-lines.ts`): se recorre `horizontal[y]` completo, se detectan las
corridas contiguas de filas con `horizontal[y] >= HORIZONTAL_VALLEY_THRESHOLD`, y a
cada corrida (una `LineRegion`) se le asignan los componentes cuyo bounding box se
**solapa** (no solo toca un punto) con su rango `[yStart, yEnd]`.

**Palabras** (`extract-words.ts`): la proyección vertical se calcula **solo con los
píxeles de los componentes ya asignados a esa línea** (`component.pixels`), en un
`Map<x, conteo>` disperso — no hace falta volver a tocar la `ImageData` completa ni
conocer el ancho de la imagen. Se aplica la misma lógica de corridas contiguas sobre
`x` en vez de `y`, con `VERTICAL_VALLEY_THRESHOLD`.

**Caracteres** (`extract-characters.ts`): la suposición es **1 componente = 1
carácter**. Cada componente de una palabra se convierte en un `CharacterRegion`
aislando sus propios píxeles (fondo negro opaco, trazo blanco) en un buffer del
tamaño exacto de su bounding box — sin fuga de píxeles de componentes vecinos, aunque
sus bounding boxes se solapen espacialmente (verificado con una forma en L en
`extract-characters.test.ts`). Se descartan los componentes fuera de
`[CHAR_MIN_HEIGHT, CHAR_MAX_HEIGHT]` (ruido o fallo de segmentación).

**Limitación conocida de la suposición 1 componente = 1 carácter** (documentada en el
código, no oculta): si un carácter queda fracturado en más de un componente (ej. una
"í" con el punto separado del cuerpo por una binarización imperfecta), o si dos
caracteres se tocan y quedan fusionados en un único componente (ej. una fuente
condensada), esta fase no tiene lógica de re-fusión ni re-partición. Válida para
facturas impresas bien definidas; se revisa con datos reales en Fase 4d/4f.

**Limitación conocida de la detección de palabras por umbral simple**: con
`VERTICAL_VALLEY_THRESHOLD = 2`, una sola columna completamente vacía entre dos
caracteres que se tocan ya se lee como fin de palabra — el algoritmo no distingue
"hueco de una letra a otra dentro de la misma palabra" de "espacio real entre
palabras" por ancho del hueco, solo por si hay algún píxel o no. No es un bug del
código (implementa exactamente lo especificado), es una limitación del enfoque de
threshold simple — a revisar si datos reales muestran que corta palabras de más.

## 10. Corrección de polaridad texto/fondo — `normalize-polarity.ts` (Fase 4b, implementado)

**Bug real encontrado al diseñar el test de integración de esta fase** (no en
producción, pero exactamente el tipo de fallo que habría aparecido con una factura
real): `otsuBinarization` (Fase 4a) separa la imagen en dos clases por luminancia sin
saber cuál "significa" texto — solo maximiza la varianza entre clases. En una factura
típica (papel claro, tinta oscura), el texto es la clase **minoritaria y más oscura**,
así que tras Otsu queda en `0` (negro). Pero `findConnectedComponents` (§7) asume que
el primer plano a segmentar es `255` (blanco). Sin corrección, la segmentación
"encontraría" el papel en blanco como si fuera el contenido, y el texto real quedaría
invisible (los huecos negros).

Heurística de corrección: se asume que el texto es la clase **minoritaria** de
píxeles (la tinta cubre menos área que el papel en un documento típico):

```
whiteCount = # píxeles con valor 255
si whiteCount > totalPíxeles / 2:
    invertir imagen (0 ↔ 255)
```

Corre entre Fase 4a (`denoise`) y Fase 4b (`findConnectedComponents`). El test de
integración incluye un caso de regresión explícito: el mismo pipeline **sin** este
paso encuentra un "componente" que cubre más de la mitad de la imagen sintética de
prueba (el papel), confirmando que el bug era real antes de la corrección.

## 11. Normalización de caracteres — `normalize-character.ts` (Fase 4b, implementado)

Cada carácter segmentado (tamaño variable) se lleva a un lienzo cuadrado
`targetSize × targetSize` (32×32 por defecto, `OCR_CONFIG.CHAR_SIZE`) **sin
distorsionar su forma**:

```
ratio = width / height
si ratio >= 1 (más ancho que alto):
    newWidth = targetSize
    newHeight = round(targetSize / ratio)
si no (más alto que ancho):
    newHeight = targetSize
    newWidth = round(targetSize · ratio)
```

El carácter se redimensiona a `newWidth × newHeight` con **interpolación
nearest-neighbor** — no bilineal/suavizada: un carácter es una forma binaria de bordes
duros, y suavizar introduciría grises intermedios que no existen en los datos
originales, difuminando justo los bordes que el clasificador (Fase 4c) necesita
distinguir. El resultado se centra en el lienzo `targetSize × targetSize`
(`offset = floor((targetSize - nuevoLado) / 2)`), con el margen sobrante en negro.

Ejemplo verificado en `normalize-character.test.ts`: un carácter de 10×20 (ratio 0.5,
el doble de alto que de ancho) normalizado a 32×32 da `newHeight=32, newWidth=16` —
sigue siendo el doble de alto que de ancho (`32 = 2×16`), la forma no se distorsiona.

## 12. HOG — Histogram of Oriented Gradients (propio) — Fase 4c, diseño

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

## 13. k-Nearest Neighbors (propio) — Fase 4c, diseño

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

## 14. Confidence score (fórmula) — Fase 4c/4e, diseño

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

## 15. Estado de este documento

**Secciones 1–5 (grayscale, normalización, histograma, Otsu, mediana): implementadas y
verificadas por unit test desde Fase 4a** (`src/modules/ocr/preprocessing/`, 42 tests).

**Secciones 7–11 (componentes conectados, proyecciones, líneas/palabras/caracteres,
corrección de polaridad, normalización de caracteres): implementadas y verificadas por
unit test desde Fase 4b** (`src/modules/ocr/segmentation/`, 40 tests). Sección 6
(morfología) sigue sin implementar — no resultó necesaria, ver nota en esa sección.

Los ejemplos numéricos de este documento están tomados directamente de los tests
correspondientes, no inventados aparte — si el código cambia, estos ejemplos deben
volver a verificarse contra los tests, no al revés.

**Secciones 12–14 (HOG, kNN, confidence) siguen siendo fórmulas de diseño, no
implementadas.** Ninguna cifra de precisión, tiempo de procesamiento o valor de
parámetro (`k`, `α`, `β`, tamaño de celda, etc.) es válida hasta calibrarse
experimentalmente en Fase 4c y reportarse en `docs/ocr/evaluation.md` con el conjunto
`test`.
