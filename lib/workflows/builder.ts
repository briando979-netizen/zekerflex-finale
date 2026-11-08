import { Workflow, WorkflowNode, WorkflowEdge } from "./types";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

export async function createWorkflow(data: {
  name: string;
  description?: string;
  userId: string;
}): Promise<Workflow> {
  const workflow: Workflow = {
    id: nanoid(),
    name: data.name,
    description: data.description,
    enabled: false,
    nodes: [],
    edges: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: data.userId,
  };

  await prisma.workflow.create({
    data: {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      userId: data.userId,
      nodesData: JSON.stringify([]),
      edgesData: JSON.stringify([]),
    },
  });

  return workflow;
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const doc = await prisma.workflow.findUnique({ where: { id } });
  if (!doc) return null;

  return {
    id: doc.id,
    name: doc.name,
    description: doc.description ?? undefined,
    enabled: doc.enabled,
    nodes: JSON.parse(doc.nodesData || "[]"),
    edges: JSON.parse(doc.edgesData || "[]"),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.userId,
  };
}

export async function updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
  const workflow = await prisma.workflow.update({
    where: { id },
    data: {
      name: updates.name,
      description: updates.description,
      enabled: updates.enabled,
      nodesData: updates.nodes ? JSON.stringify(updates.nodes) : undefined,
      edgesData: updates.edges ? JSON.stringify(updates.edges) : undefined,
      updatedAt: new Date(),
    },
  });

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description ?? undefined,
    enabled: workflow.enabled,
    nodes: JSON.parse(workflow.nodesData || "[]"),
    edges: JSON.parse(workflow.edgesData || "[]"),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    createdBy: workflow.userId,
  };
}

export async function addNode(workflowId: string, node: WorkflowNode): Promise<void> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error("Workflow not found");

  workflow.nodes.push(node);
  await updateWorkflow(workflowId, { nodes: workflow.nodes });
}

export async function addEdge(workflowId: string, edge: WorkflowEdge): Promise<void> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error("Workflow not found");

  workflow.edges.push(edge);
  await updateWorkflow(workflowId, { edges: workflow.edges });
}

export async function deleteWorkflow(id: string): Promise<void> {
  await prisma.workflow.delete({ where: { id } });
}

export async function listWorkflows(userId: string): Promise<Workflow[]> {
  const docs = await prisma.workflow.findMany({ where: { userId } });
  return docs.map((doc) => ({
    id: doc.id,
    name: doc.name,
    description: doc.description ?? undefined,
    enabled: doc.enabled,
    nodes: JSON.parse(doc.nodesData || "[]"),
    edges: JSON.parse(doc.edgesData || "[]"),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.userId,
  }));
}
