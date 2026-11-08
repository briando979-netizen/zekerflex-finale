import { runAllTests, runTypescriptCheck } from "./test-runner";
import { runLinter, runPrettier, runTypeScript } from "./linter";
import { buildProject, buildDocker } from "./builder";

export interface PipelineResult {
  stage: string;
  success: boolean;
  timestamp: Date;
  duration: number;
}

const results: PipelineResult[] = [];

export async function runDeploymentPipeline() {
  const startTime = Date.now();
  
  // Stage 1: Tests
  try {
    await runAllTests();
    results.push({ stage: "Tests", success: true, timestamp: new Date(), duration: 0 });
  } catch (err) {
    results.push({ stage: "Tests", success: false, timestamp: new Date(), duration: 0 });
    throw err;
  }
  
  // Stage 2: Linting
  try {
    await runLinter();
    await runPrettier();
    results.push({ stage: "Lint", success: true, timestamp: new Date(), duration: 0 });
  } catch (err) {
    results.push({ stage: "Lint", success: false, timestamp: new Date(), duration: 0 });
    throw err;
  }
  
  // Stage 3: TypeScript
  try {
    await runTypeScript();
    results.push({ stage: "TypeScript", success: true, timestamp: new Date(), duration: 0 });
  } catch (err) {
    results.push({ stage: "TypeScript", success: false, timestamp: new Date(), duration: 0 });
    throw err;
  }
  
  // Stage 4: Build
  try {
    await buildProject();
    results.push({ stage: "Build", success: true, timestamp: new Date(), duration: 0 });
  } catch (err) {
    results.push({ stage: "Build", success: false, timestamp: new Date(), duration: 0 });
    throw err;
  }
  
  // Stage 5: Docker
  try {
    await buildDocker();
    results.push({ stage: "Docker", success: true, timestamp: new Date(), duration: 0 });
  } catch (err) {
    results.push({ stage: "Docker", success: false, timestamp: new Date(), duration: 0 });
    throw err;
  }
  
  return {
    success: true,
    totalDuration: Date.now() - startTime,
    stages: results,
  };
}

export async function rollbackDeployment() {
  try {
    // Trigger rollback on VPS
    console.log("Rolling back to previous version...");
    return true;
  } catch {
    return false;
  }
}
