export function analyzeTrends(timeSeries: number[]) {
  const n = timeSeries.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += timeSeries[i];
    sumXY += i * timeSeries[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const trend = timeSeries.map((_, i) => slope * i + intercept);
  const detrended = timeSeries.map((v, i) => v - trend[i]);

  const variance = detrended.reduce((a, b) => a + b * b, 0) / n;
  const volatility = Math.sqrt(variance);

  return { slope, trend, volatility, detrended };
}

export function findCorrelations(series1: number[], series2: number[]) {
  const n = Math.min(series1.length, series2.length);
  const mean1 = series1.slice(0, n).reduce((a, b) => a + b) / n;
  const mean2 = series2.slice(0, n).reduce((a, b) => a + b) / n;

  let covariance = 0, var1 = 0, var2 = 0;

  for (let i = 0; i < n; i++) {
    const dev1 = series1[i] - mean1;
    const dev2 = series2[i] - mean2;
    covariance += dev1 * dev2;
    var1 += dev1 * dev1;
    var2 += dev2 * dev2;
  }

  const correlation = covariance / Math.sqrt(var1 * var2);
  return Math.round(correlation * 100) / 100;
}

export function detectLeadingIndicators(timeSeries: number[], targetSeries: number[], maxLag: number = 12) {
  const correlations = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    const correlation = findCorrelations(timeSeries.slice(0, -lag || undefined), targetSeries.slice(lag));
    correlations.push({ lag, correlation });
  }
  return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))[0];
}
