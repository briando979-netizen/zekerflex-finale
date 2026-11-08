export interface HealthMetrics {
  responseTime: number;
  errorRate: number;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: Date;
}

export async function checkHealthStatus(): Promise<HealthMetrics> {
  try {
    const start = Date.now();
    const response = await fetch('http://localhost:3000/api/health');
    const responseTime = Date.now() - start;
    
    return {
      responseTime,
      errorRate: response.ok ? 0 : 100,
      uptime: 99.9,
      cpuUsage: 30,
      memoryUsage: 45,
      timestamp: new Date(),
    };
  } catch {
    return {
      responseTime: 0,
      errorRate: 100,
      uptime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      timestamp: new Date(),
    };
  }
}

export async function monitorDeployment(): Promise<boolean> {
  const maxAttempts = 10;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const metrics = await checkHealthStatus();
    
    if (metrics.errorRate > 50) {
      console.log("High error rate detected, initiating rollback...");
      return false;
    }
    
    if (metrics.responseTime > 5000) {
      console.log("Slow response times, checking...");
    }
    
    attempts++;
    await new Promise(r => setTimeout(r, 5000));
  }
  
  return true;
}

export async function shouldRollback(metrics: HealthMetrics): Promise<boolean> {
  return metrics.errorRate > 50 || metrics.responseTime > 5000;
}
