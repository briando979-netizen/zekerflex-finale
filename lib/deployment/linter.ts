import { execSync } from "child_process";

export interface LintResult {
  passed: boolean;
  errors: number;
  warnings: number;
  fixed: number;
}

export async function runLinter(): Promise<LintResult> {
  try {
    const output = execSync("npx eslint . --max-warnings=0", { stdio: "pipe" }).toString();
    return { passed: true, errors: 0, warnings: 0, fixed: 0 };
  } catch (error: any) {
    const errorText = error.toString();
    const errors = (errorText.match(/error/g) || []).length;
    const warnings = (errorText.match(/warning/g) || []).length;
    
    return { passed: false, errors, warnings, fixed: 0 };
  }
}

export async function runPrettier(): Promise<boolean> {
  try {
    execSync("npx prettier --check .", { stdio: "pipe" });
    return true;
  } catch {
    try {
      execSync("npx prettier --write .");
      return true;
    } catch {
      return false;
    }
  }
}

export async function runTypeScript(): Promise<boolean> {
  try {
    execSync("npx tsc --noEmit -p .", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
