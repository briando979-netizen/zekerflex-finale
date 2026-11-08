import { Feature } from "./features";

export interface InferenceRequest {
  features: Feature[];
  modelId: string;
  userId?: string;
  batchId?: string;
}

export interface InferencePrediction {
  prediction: number;
  probability: number;
  confidence: number;
  latencyMs: number;
  modelId: string;
}

const predictionCache = new Map<
  string,
  { prediction: InferencePrediction; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;

export async function predictRealTime(
  request: InferenceRequest
): Promise<InferencePrediction> {
  const startTime = Date.now();
  const cacheKey = `${request.modelId}:${JSON.stringify(request.features)}`;

  const cached = predictionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.prediction;
  }

  const prediction = await runInference(request);
  const latencyMs = Date.now() - startTime;

  const result = {
    ...prediction,
    latencyMs,
  };

  predictionCache.set(cacheKey, {
    prediction: result,
    timestamp: Date.now(),
  });

  return result;
}

export async function predictBatch(
  requests: InferenceRequest[]
): Promise<InferencePrediction[]> {
  const startTime = Date.now();
  const predictions = await Promise.all(requests.map(runInference));
  const latencyMs = Date.now() - startTime;

  return predictions.map((p) => ({
    ...p,
    latencyMs: Math.floor(latencyMs / requests.length),
  }));
}

export function enableFallback(primary: () => Promise<InferencePrediction>, fallback: () => Promise<InferencePrediction>): () => Promise<InferencePrediction> {
  return async () => {
    try {
      return await primary();
    } catch {
      console.warn("Primary model failed, using fallback");
      return await fallback();
    }
  };
}

export function optimizeLatency(
  features: Feature[],
  maxLatencyMs: number = 100
): Feature[] {
  const importantFeatures = features
    .filter((f) => Math.abs(f.value) > 0.1)
    .sort(
      (a, b) =>
        Math.abs(b.value) - Math.abs(a.value)
    )
    .slice(0, Math.ceil(features.length / 2));

  return importantFeatures.length > 0 ? importantFeatures : features;
}

export function handleCache(
  cacheKey: string,
  fetcher: () => Promise<InferencePrediction>,
  ttl: number = 60000
): () => Promise<InferencePrediction> {
  return async () => {
    const cached = predictionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.prediction;
    }

    const prediction = await fetcher();
    predictionCache.set(cacheKey, {
      prediction,
      timestamp: Date.now(),
    });

    return prediction;
  };
}

export function clearCache(): void {
  predictionCache.clear();
}

export function getCacheStats(): { size: number; oldest: number; newest: number } {
  if (predictionCache.size === 0) {
    return { size: 0, oldest: 0, newest: 0 };
  }

  const timestamps = Array.from(predictionCache.values()).map(
    (v) => v.timestamp
  );
  return {
    size: predictionCache.size,
    oldest: Math.min(...timestamps),
    newest: Math.max(...timestamps),
  };
}

async function runInference(
  request: InferenceRequest
): Promise<InferencePrediction> {
  const sum = request.features.reduce((acc, f) => acc + f.value, 0);
  const rawPrediction = 1 / (1 + Math.exp(-sum));
  const confidence = Math.abs(rawPrediction - 0.5) * 2;

  return {
    prediction: rawPrediction > 0.5 ? 1 : 0,
    probability: rawPrediction,
    confidence,
    latencyMs: 0,
    modelId: request.modelId,
  };
}
