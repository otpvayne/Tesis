export interface Component {
  id: number;
  /** Coordenadas `[x, y]` de cada píxel del componente, en el espacio de la imagen original. */
  pixels: Array<[number, number]>;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/** Los 8 vecinos de un píxel (arriba/abajo/izq/der + las 4 diagonales). */
const NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Etiquetado de componentes conectados sobre una imagen binaria (implementado
 * desde cero, ver `CLAUDE.md` §7), con **8-conectividad**: dos píxeles
 * blancos pertenecen al mismo componente si son vecinos horizontal,
 * vertical, O diagonalmente. Se usa 8 en vez de 4-conectividad porque un
 * carácter fotografiado e impreso puede tener trazos que solo se tocan en
 * diagonal (ej. una "X" o los serifs de una tipografía) — con
 * 4-conectividad esos trazos se partirían en componentes separados que
 * después la segmentación de caracteres (Fase 4b) trataría como letras
 * distintas incorrectamente.
 *
 * BFS con una cola indexada (puntero que avanza, no `Array.shift()`) para
 * mantener O(n) real sobre el número de píxeles — `shift()` es O(n) por
 * llamada y volvería el algoritmo O(n²) en componentes grandes.
 */
export function findConnectedComponents(imageData: ImageData): Component[] {
  const { data, width, height } = imageData;
  const visited = new Uint8Array(width * height);
  const components: Component[] = [];
  let nextId = 0;

  const isWhite = (x: number, y: number): boolean => data[(y * width + x) * 4] === 255;

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      const startIdx = startY * width + startX;
      if (visited[startIdx] || !isWhite(startX, startY)) continue;

      const pixels: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[startX, startY]];
      visited[startIdx] = 1;

      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      let head = 0;

      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        pixels.push([cx, cy]);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const nIdx = ny * width + nx;
          if (visited[nIdx] || !isWhite(nx, ny)) continue;

          visited[nIdx] = 1;
          queue.push([nx, ny]);
        }
      }

      components.push({
        id: nextId++,
        pixels,
        boundingBox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      });
    }
  }

  return components;
}
