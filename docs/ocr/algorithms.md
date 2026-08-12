# Algoritmos OCR — fórmulas y diseño

Este documento fija las fórmulas matemáticas que se implementan desde cero en fases
`4a`–`4d`. Las fórmulas en sí son conocimiento matemático de dominio público (no son
"código de terceros"); lo prohibido (ver `CLAUDE.md` §7) es importar una *implementación*
ya hecha de estos algoritmos, no conocer su definición. Cada función que implemente una
fórmula de este documento la referencia en su TSDoc.

Las secciones 1–5 están **implementadas y con unit tests en verde** desde Fase 4a
(`src/modules/ocr/preprocessing/`). Las secciones 7–13 desde Fase 4b/4c
(`src/modules/ocr/segmentation/`, `src/modules/ocr/classification/`). Ver estado
detallado y conteo de tests por sección en §15.

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

### `thresholdMultiplier` (escape hatch experimental, Fase 4b)

`otsuBinarization` acepta un tercer parámetro opcional `thresholdMultiplier` (por
defecto `1`, sin efecto sobre la fórmula de arriba). Con fotos reales donde ruido o
iluminación despareja hacen que el threshold automático clasifique demasiado fondo como
"texto" (ver bug real documentado en el panel de diagnóstico de OCR LAB), permite mover
el corte a mano para calibración manual mientras se junta evidencia suficiente para una
corrección automática (ej. contraste adaptativo por región, Fase 4d). **No es parte de
la fórmula de Otsu** — subirlo mueve más píxeles de fondo hacia la clase oscura
(potencialmente empeorando la contaminación de ruido, no mejorándola — la dirección
correcta depende de dónde cae el histograma real, se determina empíricamente por
imagen, no se asume). Verificado en `otsu-binarization.test.ts` con un ejemplo a mano.

## 4b. Suavizado Gaussiano pre-Otsu — `gaussian-blur.ts` (Fase 4b, implementado)

Aplicado sobre la imagen en escala de grises, **antes** de `otsuBinarization` — a
diferencia del filtro de mediana de la sección 5, que opera después, sobre la salida ya
binaria. Kernel fijo 3×3 (no crece con `sigma`, por la misma razón que el filtro de
mediana se mantiene pequeño: un kernel más grande difuminaría de más un carácter
pequeño):

```
peso(dx, dy) = e^(-(dx² + dy²) / (2·sigma²)),  dx, dy ∈ {-1, 0, 1}
kernel(dx, dy) = peso(dx, dy) / Σ peso

salida(x, y) = Σ_{dx,dy} entrada(x+dx, y+dy) · kernel(dx, dy)
```

Bordes: replicación (igual que `denoise.ts`). Ejemplo verificado en
`gaussian-blur.test.ts`: con `sigma=1`, peso central `1/4.8976 ≈ 0.2042`, ortogonal
`e^-0.5/4.8976 ≈ 0.1238`, esquina `e^-1/4.8976 ≈ 0.0751`.

**Por qué Gaussiano aquí y mediana en la sección 5, no el mismo filtro en ambos
lugares:** operar sobre valores continuos (0-255) es precisamente el caso donde un
filtro Gaussiano no rompe nada (no hay binariedad que preservar todavía). Promedia
ruido de alta frecuencia (grano de sensor, artefactos JPEG) sin la votación "todo o
nada" de la mediana: un trazo delgado se atenúa en los bordes pero su centro sigue
siendo lo bastante oscuro para cruzar el threshold de Otsu, en vez de desaparecer por
completo — el problema real que llevó a desactivar `denoise` (`OCR_CONFIG.APPLY_DENOISE`,
ver sección 5).

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

## 12. HOG — Histogram of Oriented Gradients (propio) — `hog-extractor.ts` (Fase 4c, implementado)

Sobre cada carácter normalizado a `CHAR_SIZE × CHAR_SIZE` (32×32, Fase 4b):

**Gradientes** (diferencia central, con replicación de borde igual que `denoise.ts` /
`gaussian-blur.ts` — no padding de ceros, que inventaría un borde oscuro falso):

```
Gx(x, y) = I(x+1, y) - I(x-1, y)
Gy(x, y) = I(x, y+1) - I(x, y-1)
```

**Magnitud y orientación** (gradiente "sin signo": se pliega a `[0°, 180°)` sumando 180°
si es negativo, porque un trazo no tiene lado "positivo" — una línea a 10° y su opuesta a
190° son el mismo trazo):

```
magnitude(x, y)  = √(Gx² + Gy²)
orientation(x, y) = atan2(Gy, Gx),  +180° si < 0
```

### Desviación del diseño original: grilla directa de regiones, no celdas + bloques con solape

El diseño de Fase 0 (arriba) preveía celdas de `c×c` px agrupadas en bloques con solape,
normalizados por bloque (esquema clásico de Dalal & Triggs). Con los parámetros pedidos
para esta fase (celdas de 4px → grilla 8×8, bloques de 2×2 celdas con solape del 50%) el
descriptor completo da correctamente 49 bloques × (2×2 celdas × 9 bins) = **1764**
valores — pero de ahí **no hay ninguna reducción limpia a 108**: 1764 no es divisible en
un número de grupos que dé una grilla entera, y `108 / 9 bins = 12` regiones tampoco
factoriza en potencias de 2 (los únicos divisores enteros de 32px). Construir el HOG
completo de 1764-dim solo para descartarlo con un sub-muestreo arbitrario habría sido
complejidad sin uso real (`CLAUDE.md` §9 — evitar sobrearquitectura).

En su lugar, `extractHOG` divide la imagen directamente en una grilla de
`HOG_GRID_COLS × HOG_GRID_ROWS` = 4×3 = **12 regiones** (`OCR_CONFIG`), límites por
`Math.floor(i·dimensión/divisiones)` — deterministas, no necesariamente todas del mismo
tamaño en píxeles si la dimensión no es múltiplo exacto (32/4=8px por columna, exacto;
32/3≈10.67px por fila, columnas de 10/11/11px). Sin etapa de bloques con solape: cada
región se normaliza por sí sola. Mismo total que pedía el diseño original
(**12 × 9 = 108**), mismas fórmulas de gradiente/orientación/histograma, sin la
complejidad de una etapa de bloques que no alimentaba ninguna reducción de dimensión
real en este esquema.

**Histograma por región:** para cada píxel de la región, vota en el bin de orientación
más cercano (sin interpolación bilineal entre bins — votación simple, más fácil de
verificar a mano), ponderado por su magnitud:

```
binWidth = 180° / orientationBins   # 20° con 9 bins
binIndex(x, y) = round(orientation(x, y) / binWidth) mod orientationBins
histograma[binIndex] += magnitude(x, y)
```

**Normalización L2 por región** (no por bloque, ver desviación arriba):

```
normalizado = histograma / (‖histograma‖₂ + epsilon)     # epsilon = OCR_CONFIG.HOG_EPSILON = 0.001
```

El descriptor final concatena las 12 regiones (fila por fila) → **108 valores**
(`OCR_CONFIG.HOG_GRID_COLS × HOG_GRID_ROWS × HOG_ORIENTATION_BINS`).

### Ejemplo numérico (verificado en `hog-extractor.test.ts`)

Imagen 8×8, brillante (255) donde `x > y`, negra (0) donde no — un borde diagonal `\`
de esquina superior-izquierda a inferior-derecha, con una sola región (`gridCols=1,
gridRows=1`) cubriendo toda la imagen. Para el píxel interior `(4,4)` (sobre el borde):

```
izquierda (3,4): 3>4? no  -> 0        derecha (5,4): 5>4? sí -> 255    Gx = 255-0 = 255
arriba    (4,3): 4>3? sí  -> 255      abajo   (4,5): 4>5? no -> 0      Gy = 0-255 = -255

magnitude = √(255² + 255²) = 255√2 ≈ 360.6
orientation = atan2(-255, 255) = -45°  ->  plegado: -45+180 = 135°
binIndex = round(135 / 20) = round(6.75) = 7   (centro del bin: 140°, el más cercano a 135° con paso de 20°)
```

Los demás píxeles interiores sobre la diagonal producen el mismo patrón (`Gx>0, Gy<0`,
orientación ≈135°), así que el bin 7 domina claramente el histograma de la única
región — verificado en el test comprobando que `argmax(descriptor) === 7`. Un borde
vertical puro (mitad izquierda negra, mitad derecha blanca) da `Gy=0`, `orientation=0°`,
bin 0 — verificado igual.

Caso degenerado (imagen completamente uniforme): todos los gradientes son `(0,0)`,
magnitud 0 en todo punto, histograma todo en cero, `normalizado = 0/(0+epsilon) = 0` —
no produce `NaN` ni división por cero, verificado en el test.

## 13. k-Nearest Neighbors (propio) — `knn-classifier.ts` (Fase 4c, implementado)

**Distancia** entre vector de características de entrada `q` y cada muestra de
entrenamiento `s_i` — distancia euclidiana:

```
d(q, s_i) = √( Σ_j (q_j - s_i,j)² )
```

**Selección de vecinos:** los `k` vectores de entrenamiento con menor `d`
(`OCR_CONFIG.KNN_K = 3` por defecto).

**Votación ponderada** (un vecino muy cercano puede superar a varios vecinos lejanos de
otra clase — a diferencia de un conteo simple de votos por mayoría):

```
weight_i = 1 / (d(q, s_i) + epsilon)              # epsilon = OCR_CONFIG.KNN_EPSILON = 0.001
score(class) = Σ_{i : label(s_i) = class} weight_i
confidence(class) = score(class) / Σ_class' score(class')
```

La clase predicha es `argmax_class score(class)`; `confidence` es la proporción del peso
total que se llevó — `1` si los `k` vecinos son unánimes, más baja cuanto más repartido
esté el voto entre clases distintas. `KNNClassifier.predict` expone además `topN`: todas
las labels distintas entre los `k` vecinos con su `confidence`, ordenadas descendente
(`topN[0]` es siempre la predicción ganadora).

### Ejemplo numérico — votación ponderada gana sobre conteo simple (verificado en `knn-classifier.test.ts`)

Query en `0`. Vecino `A` en `1` (distancia 1). Dos vecinos `B` en `10` y `-11`
(distancias 10 y 11). `k=3` — entran los tres:

```
weight_A  = 1 / (1  + 0.001)  ≈ 0.99900
weight_B1 = 1 / (10 + 0.001)  ≈ 0.09999
weight_B2 = 1 / (11 + 0.001)  ≈ 0.09090
score(A) = 0.99900        score(B) = 0.09999 + 0.09090 = 0.19089
```

`score(A) > score(B)` pese a que `B` tiene 2 votos contra 1 de `A` — el vecino mucho más
cercano domina. `confidence = 0.99900 / (0.99900 + 0.19089) ≈ 0.8397`.

`k` y `epsilon` son puntos de partida (`OCR_CONFIG`, documentados igual que el resto de
parámetros del pipeline) — se recalibran con el conjunto `validation` cuando exista
dataset real (Fase 4d), nunca con `test`.

## 14. Confidence score (fórmula) — Fase 4c (agreement) implementado / Fase 4e (blend), diseño

Confianza por carácter, combinando consistencia del voto kNN y cercanía del vecino más
próximo (ambas señales reales del clasificador, no arbitrarias):

```
agreement(char)  = score(clase_ganadora) / Σ_class score(class)   # ∈ [0,1]
proximity(char)  = 1 / (1 + d(q, vecino_más_cercano))               # ∈ (0,1]
confidence(char) = α · agreement(char) + (1-α) · proximity(char)
```

`agreement(char)` **ya está implementado** — es exactamente `KNNClassifier.predict().confidence`
(§13). La mezcla con `proximity` (que además pesa qué tan cerca en términos absolutos
está el vecino ganador, no solo su peso relativo frente a las otras clases) queda para
cuando el pipeline completo (Fase 4e) tenga campos reales sobre los que calibrar `α` con
datos de `validation` — usar solo `agreement` por ahora no es arbitrario, es la señal que
ya existe; `α=1` implícito hasta entonces.

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

**Secciones 12–13 (HOG, kNN) y el componente `agreement` de la sección 14: implementadas
y verificadas por unit test desde Fase 4c** (`src/modules/ocr/classification/`, 23
tests). La mezcla `agreement`/`proximity` con `α`, y la fórmula de confianza por campo
(`β`) siguen siendo diseño para Fase 4e. Ningún valor de `k`, `epsilon`, tamaño de
grilla, etc. está calibrado contra datos reales — son puntos de partida documentados en
`OCR_CONFIG` (`modules/ocr/config.ts`), no resultados medidos; los tests de esta fase
usan datos sintéticos (`CLAUDE.md` §7 y el prompt de Fase 4c). El modelo real nace en
Fase 4d con dataset etiquetado de facturas de Mansor vía OCR LAB, y las cifras de
precisión reales se reportan en `docs/ocr/evaluation.md` sobre el conjunto `test`
únicamente.
