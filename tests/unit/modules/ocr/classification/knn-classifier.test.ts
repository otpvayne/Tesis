import { describe, expect, it } from "vitest";
import { KNNClassifier, euclideanDistance } from "@/modules/ocr/classification/knn-classifier";

function vec(values: number[]): Float32Array {
  return new Float32Array(values);
}

describe("euclideanDistance", () => {
  it("triángulo 3-4-5: distancia entre [0,0] y [3,4] es 5", () => {
    expect(euclideanDistance(vec([0, 0]), vec([3, 4]))).toBe(5);
  });

  it("distancia de un vector a sí mismo es 0", () => {
    expect(euclideanDistance(vec([1, 2, 3]), vec([1, 2, 3]))).toBe(0);
  });

  it("lanza si los vectores tienen distinto largo", () => {
    expect(() => euclideanDistance(vec([1, 2]), vec([1, 2, 3]))).toThrow();
  });
});

describe("KNNClassifier", () => {
  it("lanza si se predice antes de entrenar", () => {
    const knn = new KNNClassifier();
    expect(() => knn.predict(vec([0]))).toThrow();
  });

  it("con un solo vecino de cada clase, predice la clase del vecino más cercano", () => {
    const knn = new KNNClassifier();
    knn.train([vec([0]), vec([10])], ["A", "B"]);
    const result = knn.predict(vec([1]), 1);
    expect(result.label).toBe("A");
    expect(result.distances).toEqual([1]);
  });

  it("votación ponderada por distancia: un vecino muy cercano (label A) supera a dos vecinos lejanos (label B), aunque B tenga más votos", () => {
    // query=[0]. A=[1] (distancia 1). B1=[10] (distancia 10). B2=[-11]
    // (distancia 11). k=3 -> los 3 entran.
    // peso_A  = 1/(1+0.001)  ≈ 0.999001
    // peso_B1 = 1/(10+0.001) ≈ 0.0999900
    // peso_B2 = 1/(11+0.001) ≈ 0.0908999
    // total_B = peso_B1+peso_B2 ≈ 0.1908899 < peso_A -> gana A pese a 2 votos B contra 1
    const knn = new KNNClassifier();
    knn.train([vec([1]), vec([10]), vec([-11])], ["A", "B", "B"]);
    const result = knn.predict(vec([0]), 3);

    expect(result.label).toBe("A");
    const weightA = 1 / (1 + 0.001);
    const weightB = 1 / (10 + 0.001) + 1 / (11 + 0.001);
    const expectedConfidence = weightA / (weightA + weightB);
    expect(result.confidence).toBeCloseTo(expectedConfidence, 6);
    expect(result.distances).toEqual([1, 10, 11]);

    // topN: 2 labels distintas entre los vecinos (A y B), A gana
    expect(result.topN).toHaveLength(2);
    expect(result.topN[0]).toMatchObject({ label: "A" });
    expect(result.topN[0].confidence).toBeCloseTo(expectedConfidence, 6);
    expect(result.topN[1]).toMatchObject({ label: "B" });
    expect(result.topN[0].confidence + result.topN[1].confidence).toBeCloseTo(1, 10);
  });

  it("confidence es 1 cuando los k vecinos son unánimes en la misma clase", () => {
    const knn = new KNNClassifier();
    knn.train([vec([0]), vec([1]), vec([2]), vec([100])], ["A", "A", "A", "B"]);
    const result = knn.predict(vec([1]), 3);
    expect(result.label).toBe("A");
    expect(result.confidence).toBe(1);
  });

  it("confidence es alta (cercana a 1) cuando el vecino más cercano coincide exactamente (distancia 0)", () => {
    const knn = new KNNClassifier();
    knn.train([vec([5]), vec([100]), vec([200])], ["A", "B", "B"]);
    const result = knn.predict(vec([5]), 3);
    expect(result.label).toBe("A");
    expect(result.confidence).toBeGreaterThan(0.99);
  });

  it("dataset sintético 10 vs 10 (clase '0' agrupada cerca de 0, clase '1' agrupada cerca de 20): clasifica correctamente puntos nuevos de cada clúster con confidence alta", () => {
    const zeros = [-2, -1.5, -1, -0.8, -0.5, -0.2, 0, 0.3, 0.6, 1];
    const ones = [19, 19.3, 19.6, 19.8, 20, 20.2, 20.5, 20.7, 21, 21.3];

    const knn = new KNNClassifier();
    knn.train(
      [...zeros, ...ones].map((v) => vec([v])),
      [...zeros.map(() => "0"), ...ones.map(() => "1")],
    );

    // puntos de test NUEVOS (no están en el set de entrenamiento), cerca
    // de cada clúster pero no en él -- el vecino más cercano de cualquiera
    // de estos sigue siendo, por construcción, del clúster correcto
    // (el clúster opuesto está a >15 unidades de distancia como mínimo).
    const zeroQueries = [-0.9, 0.5, -1.2, 0.1];
    const oneQueries = [20.1, 19.5, 20.9, 19.1];

    for (const q of zeroQueries) {
      const result = knn.predict(vec([q]), 3);
      expect(result.label).toBe("0");
      expect(result.confidence).toBeGreaterThan(0.7);
    }
    for (const q of oneQueries) {
      const result = knn.predict(vec([q]), 3);
      expect(result.label).toBe("1");
      expect(result.confidence).toBeGreaterThan(0.7);
    }
  });

  it("k por defecto viene de OCR_CONFIG.KNN_K", () => {
    const knn = new KNNClassifier();
    knn.train([vec([0]), vec([1]), vec([2]), vec([3]), vec([100])], ["A", "A", "A", "A", "B"]);
    const withDefault = knn.predict(vec([1.5]));
    const withExplicit = knn.predict(vec([1.5]), 3);
    expect(withDefault).toEqual(withExplicit);
  });
});
