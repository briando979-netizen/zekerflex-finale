import { execSync } from "child_process";

export interface TestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  timestamp: Date;
}

export async function runAllTests(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const output = execSync("npx vitest run --reporter=json", { 
      cwd: process.cwd(),
      stdio: "pipe" 
    }).toString();
    
    const result = JSON.parse(output);
    const duration = Date.now() - startTime;

    return {
      passed: result.numFailedTests === 0,
      totalTests: result.numTotalTests,
      passedTests: result.numPassedTests,
      failedTests: result.numFailedTests,
      duration,
      timestamp: new Date(),
    };
  } catch (error) {
    throw new Error(`Tests failed: ${error}`);
  }
}

export async function runTypescriptCheck(): Promise<boolean> {
  try {
    execSync("npx tsc --noEmit -p .", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function runComponentTests(): Promise<boolean> {
  try {
    execSync("npx vitest run components/ --reporter=json", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function runIntegrationTests(): Promise<boolean> {
  try {
    execSync("npx vitest run tests/ --reporter=json", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
