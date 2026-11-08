import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const deployments = [
    {
      id: "dep-001",
      status: "success",
      branch: "main",
      commit: "c02f027d",
      duration: 245,
      timestamp: new Date().toISOString(),
      stages: [
        { name: "Tests", success: true },
        { name: "Lint", success: true },
        { name: "Build", success: true },
        { name: "Docker", success: true },
      ],
    },
    {
      id: "dep-002",
      status: "in-progress",
      branch: "main",
      commit: "df9dcdca",
      duration: 120,
      timestamp: new Date(Date.now() - 120000).toISOString(),
      stages: [
        { name: "Tests", success: true },
        { name: "Lint", success: true },
        { name: "Build", success: false },
      ],
    },
  ];

  return NextResponse.json({ deployments });
}
