import { describe, expect, it } from "vitest";
import { applySaltPepperNoise, rotateImage, scaleImage, skewImage } from "@/modules/ocr/classification/distortions";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

function grayImage(values: number[], width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  values.forEach((v, i) => {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  return createImageData(data, width, height);
}

function values(imageData: ImageData): number[] {
  const out: number[] = [];
  for (let i = 0; i < imageData.data.length; i += 4) out.push(imageData.data[i]);
  return out;
}

describe("rotateImage", () => {
  it("rotación de 90° en una imagen 4×4 mapea exactamente como predice la matriz de rotación (a mano)", () => {
    // prettier-ignore
    const input = grayImage([
       0,  1,  2,  3,
       4,  5,  6,  7,
       8,  9, 10, 11,
      12, 13, 14, 15,
    ], 4, 4);

    // cx=cy=2. rad=-90°: cos≈0, sin=-1 -> srcX(x,y)=2+dy, srcY(x,y)=2-dx
    // srcX = y, srcY = 4-x. Columna x=0 siempre cae fuera de rango
    // (srcX=y da 0..3 pero srcY=4 esta fuera) -> fondo (255) en toda esa
    // columna; el resto son lecturas exactas de la matriz de entrada.
    const result = rotateImage(input, 90, 255);
    // prettier-ignore
    expect(values(result)).toEqual([
      255, 12,  8, 4,
      255, 13,  9, 5,
      255, 14, 10, 6,
      255, 15, 11, 7,
    ]);
  });

  it("rotar 0° es la identidad", () => {
    const input = grayImage([10, 20, 30, 40], 2, 2);
    const result = rotateImage(input, 0, 255);
    expect(values(result)).toEqual(values(input));
  });
});

describe("scaleImage", () => {
  it("factor=1 es la identidad", () => {
    const input = grayImage([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, 3);
    const result = scaleImage(input, 1, 255);
    expect(values(result)).toEqual(values(input));
  });

  it("factor=2 (zoom in) preserva el píxel central y trae contenido antes fuera del cuadrante hacia el centro", () => {
    // 4x4, cx=cy=2. factor=2 -> src(x,y) = 2 + (coord-2)/2.
    // Pixel central de salida mas cercano, (2,2): src = (2,2) -> mismo valor que en el original.
    // prettier-ignore
    const input = grayImage([
       0,  1,  2,  3,
       4,  5,  6,  7,
       8,  9, 10, 11,
      12, 13, 14, 15,
    ], 4, 4);
    const result = scaleImage(input, 2, 255);
    // (x=2,y=2): src=(2,2) -> valor original en (2,2) = 10
    expect(result.data[(2 * 4 + 2) * 4]).toBe(10);
  });
});

describe("skewImage", () => {
  it("offsetX=0, offsetY=0 es la identidad", () => {
    const input = grayImage([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, 3);
    const result = skewImage(input, 0, 0, 255);
    expect(values(result)).toEqual(values(input));
  });

  it("shear horizontal puro: la fila central (y=cy) no se desplaza, las filas extremas sí", () => {
    // 3x3, cx=cy=1. offsetXPx=1: src.x = x - 1*((y-1)/1) = x - (y-1)
    // fila y=1 (centro): src.x = x - 0 = x -> identidad en esa fila
    // fila y=0 (arriba): src.x = x - (-1) = x+1 -> desplazada
    // prettier-ignore
    const input = grayImage([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
    ], 3, 3);
    const result = skewImage(input, 1, 0, 255);

    // fila central sin cambios
    expect(result.data[(1 * 3 + 0) * 4]).toBe(40);
    expect(result.data[(1 * 3 + 1) * 4]).toBe(50);
    expect(result.data[(1 * 3 + 2) * 4]).toBe(60);

    // fila superior (y=0): src.x = x+1 -> (0,0)->src(1,0)=20; (1,0)->src(2,0)=30; (2,0)->src(3,0) fuera de rango -> 255
    expect(result.data[(0 * 3 + 0) * 4]).toBe(20);
    expect(result.data[(0 * 3 + 1) * 4]).toBe(30);
    expect(result.data[(0 * 3 + 2) * 4]).toBe(255);
  });
});

describe("applySaltPepperNoise", () => {
  it("probability=0 nunca invierte ningun pixel", () => {
    const input = grayImage([10, 20, 30, 40], 2, 2);
    const result = applySaltPepperNoise(input, 0, () => 0.999);
    expect(values(result)).toEqual(values(input));
  });

  it("probability=1 invierte todos los pixeles", () => {
    const input = grayImage([10, 20, 30, 200], 2, 2);
    const result = applySaltPepperNoise(input, 1, () => 0);
    expect(values(result)).toEqual([245, 235, 225, 55]);
  });

  it("usa el generador inyectado, no Math.random, para ser determinista", () => {
    // secuencia fija: invierte el 1er y 3er pixel (random<0.5), deja el 2do y 4to (random>=0.5)
    const sequence = [0.1, 0.9, 0.2, 0.8];
    let i = 0;
    const fakeRandom = () => sequence[i++];
    const input = grayImage([100, 100, 100, 100], 2, 2);
    const result = applySaltPepperNoise(input, 0.5, fakeRandom);
    expect(values(result)).toEqual([155, 100, 155, 100]);
  });
});
