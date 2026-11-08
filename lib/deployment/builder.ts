import { execSync } from "child_process";

export interface BuildResult {
  success: boolean;
  duration: number;
  artifactSize: number;
  timestamp: Date;
  errors?: string[];
}

export async function buildProject(): Promise<BuildResult> {
  const startTime = Date.now();
  
  try {
    execSync("npm run build", { stdio: "pipe" });
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      duration,
      artifactSize: 0,
      timestamp: new Date(),
    };
  } catch (error: any) {
    return {
      success: false,
      duration: Date.now() - startTime,
      artifactSize: 0,
      timestamp: new Date(),
      errors: [error.toString()],
    };
  }
}

export async function buildDocker(): Promise<BuildResult> {
  const startTime = Date.now();
  
  try {
    execSync('docker build -t zekerflex-app:latest .', { stdio: "pipe" });
    
    return {
      success: true,
      duration: Date.now() - startTime,
      artifactSize: 0,
      timestamp: new Date(),
    };
  } catch (error: any) {
    return {
      success: false,
      duration: Date.now() - startTime,
      artifactSize: 0,
      timestamp: new Date(),
      errors: [error.toString()],
    };
  }
}

export async function pushDockerImage(): Promise<boolean> {
  try {
    execSync('docker push zekerflex-app:latest', { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
