export interface IndicatorPoint {
  date: string;
  values: Record<string, string>;
}

/** Simple moving average, aligned to the input arrays (first `period-1` points have no value). */
function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` values. */
function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  const seed = sma(values, period);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      if (seed[i] !== null) {
        prev = seed[i]!;
        out[i] = prev;
      }
    } else {
      prev = values[i]! * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's RSI, the standard formulation used by most charting platforms. */
function rsi(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i]! - values[i - 1]!;
    if (diff >= 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i]! - values[i - 1]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Standard MACD: EMA12 - EMA26, with a 9-period signal line. */
function macd(values: number[]): { line: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const line: (number | null)[] = values.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? ema12[i]! - ema26[i]! : null
  );

  // Signal line = EMA9 of the MACD line, computed only over the defined portion of `line`.
  const firstDefined = line.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(values.length).fill(null);
  if (firstDefined !== -1) {
    const definedLine = line.slice(firstDefined).map((v) => v as number);
    const signalEma = ema(definedLine, 9);
    signalEma.forEach((v, i) => {
      signal[firstDefined + i] = v;
    });
  }

  const histogram: (number | null)[] = values.map((_, i) =>
    line[i] !== null && signal[i] !== null ? line[i]! - signal[i]! : null
  );

  return { line, signal, histogram };
}

function fmt(n: number | null): string | null {
  return n === null ? null : n.toFixed(2);
}

/**
 * Computes the requested indicator over a date-aligned close-price series and returns
 * the most recent `limit` points, newest first.
 */
export function computeIndicator(
  dates: string[],
  closes: number[],
  indicator: "RSI" | "SMA" | "EMA" | "MACD",
  period: number,
  limit: number
): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];

  if (indicator === "RSI") {
    const series = rsi(closes, period);
    for (let i = 0; i < dates.length; i++) {
      const v = fmt(series[i]!);
      if (v !== null) points.push({ date: dates[i]!, values: { RSI: v } });
    }
  } else if (indicator === "SMA") {
    const series = sma(closes, period);
    for (let i = 0; i < dates.length; i++) {
      const v = fmt(series[i]!);
      if (v !== null) points.push({ date: dates[i]!, values: { [`SMA_${period}`]: v } });
    }
  } else if (indicator === "EMA") {
    const series = ema(closes, period);
    for (let i = 0; i < dates.length; i++) {
      const v = fmt(series[i]!);
      if (v !== null) points.push({ date: dates[i]!, values: { [`EMA_${period}`]: v } });
    }
  } else {
    const { line, signal, histogram } = macd(closes);
    for (let i = 0; i < dates.length; i++) {
      const l = fmt(line[i]!);
      const s = fmt(signal[i]!);
      const h = fmt(histogram[i]!);
      if (l !== null && s !== null && h !== null) {
        points.push({ date: dates[i]!, values: { MACD: l, Signal: s, Histogram: h } });
      }
    }
  }

  points.reverse(); // newest first
  return points.slice(0, limit);
}
