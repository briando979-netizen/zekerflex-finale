interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'UNSET' | 'OK' | 'ERROR';
  attributes?: Record<string, string | number>;
  events?: Array<{ name: string; timestamp: number }>;
}

interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  endTime?: number;
}

const traces: Map<string, Trace> = new Map();
let currentSpan: Span | null = null;

const generateId = (): string => Math.random().toString(36).substring(2, 15);

export const startTrace = (name: string): string => {
  const traceId = generateId();
  traces.set(traceId, {
    traceId,
    spans: [],
    startTime: Date.now(),
  });
  return traceId;
};

export const startSpan = (
  traceId: string,
  name: string,
  attributes?: Record<string, string | number>
): string => {
  const spanId = generateId();
  const trace = traces.get(traceId);
  if (!trace) throw new Error(`Trace ${traceId} not found`);

  const span: Span = {
    id: spanId,
    traceId,
    parentSpanId: currentSpan?.id,
    name,
    startTime: Date.now(),
    status: 'UNSET',
    attributes,
  };

  trace.spans.push(span);
  const prev = currentSpan;
  currentSpan = span;

  return spanId;
};

export const endSpan = (spanId: string, status: 'OK' | 'ERROR' = 'OK'): void => {
  for (const trace of traces.values()) {
    const span = trace.spans.find((s) => s.id === spanId);
    if (span) {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      span.status = status;
      return;
    }
  }
};

export const addSpanEvent = (spanId: string, eventName: string): void => {
  for (const trace of traces.values()) {
    const span = trace.spans.find((s) => s.id === spanId);
    if (span) {
      span.events = span.events || [];
      span.events.push({ name: eventName, timestamp: Date.now() });
      return;
    }
  }
};

export const endTrace = (traceId: string): void => {
  const trace = traces.get(traceId);
  if (trace) {
    trace.endTime = Date.now();
  }
};

export const getTrace = (traceId: string): Trace | undefined => {
  return traces.get(traceId);
};

export const getAllTraces = (): Trace[] => Array.from(traces.values());
