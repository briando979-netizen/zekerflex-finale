import { Workflow, WorkflowExecution, ExecutionLog } from "./types";
import { ConditionEvaluator } from "./conditions";
import { EmailAction, SMSAction, CreateRecordAction, UpdateRecordAction, DeleteRecordAction, WebhookAction, NotificationAction } from "./actions";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

export class WorkflowExecutor {
  static async execute(workflow: Workflow, inputData: Record<string, unknown>): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      id: nanoid(),
      workflowId: workflow.id,
      status: "running",
      startedAt: new Date(),
      logs: [],
      result: {},
    };

    try {
      await this.executeNodes(workflow, execution, inputData);
      execution.status = "success";
    } catch (error) {
      execution.status = "error";
      execution.error = error instanceof Error ? error.message : String(error);
      execution.logs.push({
        timestamp: new Date(),
        nodeId: "executor",
        message: execution.error,
        level: "error",
      });
    }

    execution.completedAt = new Date();
    return execution;
  }

  private static async executeNodes(workflow: Workflow, execution: WorkflowExecution, data: Record<string, unknown>): Promise<void> {
    const triggerNode = workflow.nodes.find((n) => n.type === "trigger");
    if (!triggerNode) throw new Error("No trigger node found");

    let currentNodeId = triggerNode.id;
    let nodeData = { ...data };
    const maxIterations = 100;
    let iteration = 0;

    while (currentNodeId && iteration < maxIterations) {
      iteration++;
      const node = workflow.nodes.find((n) => n.id === currentNodeId);
      if (!node) break;

      try {
        const result = await this.executeNode(node, nodeData);
        if (result) {
          nodeData = { ...nodeData, ...result };
        }

        execution.logs.push({
          timestamp: new Date(),
          nodeId,
          message: `Node executed: ${node.label}`,
          level: "info",
          data: result,
        });

        const edge = workflow.edges.find((e) => e.source === currentNodeId);
        currentNodeId = edge?.target;
      } catch (error) {
        execution.logs.push({
          timestamp: new Date(),
          nodeId,
          message: error instanceof Error ? error.message : String(error),
          level: "error",
        });

        const errorEdge = workflow.edges.find((e) => e.source === currentNodeId && e.label === "error");
        currentNodeId = errorEdge?.target;
      }
    }
  }

  private static async executeNode(node: any, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const config = node.config || {};

    switch (node.type) {
      case "action":
        return await this.executeAction(node, data);

      case "condition":
        return await this.executeCondition(node, data);

      case "loop":
        return await this.executeLoop(node, data);

      default:
        return null;
    }
  }

  private static async executeAction(node: any, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const actionType = node.config.actionType as string;

    const context = {
      workflowId: "",
      nodeId: node.id,
      data,
    };

    switch (actionType) {
      case "email":
        await EmailAction.execute(node.config, context);
        break;
      case "sms":
        await SMSAction.execute(node.config, context);
        break;
      case "create_record":
        await CreateRecordAction.execute(node.config, context);
        break;
      case "update_record":
        await UpdateRecordAction.execute(node.config, context);
        break;
      case "delete_record":
        await DeleteRecordAction.execute(node.config, context);
        break;
      case "webhook":
        await WebhookAction.execute(node.config, context);
        break;
      case "notification":
        await NotificationAction.execute(node.config, context);
        break;
    }

    return null;
  }

  private static async executeCondition(node: any, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const config = node.config.conditionConfig;
    const result = ConditionEvaluator.evaluate(config, data);

    return { conditionResult: result };
  }

  private static async executeLoop(node: any, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const items = data[node.config.items as string] as any[];
    const results = [];

    for (const item of items || []) {
      results.push({
        [node.config.currentItem as string]: item,
      });
    }

    return { loopResults: results };
  }
}

export async function saveExecution(execution: WorkflowExecution): Promise<void> {
  await prisma.workflowExecution.create({
    data: {
      id: execution.id,
      workflowId: execution.workflowId,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt ?? null,
      logsData: JSON.stringify(execution.logs),
      error: execution.error,
      resultData: execution.result ? JSON.stringify(execution.result) : null,
    },
  });
}

export async function getExecution(id: string): Promise<WorkflowExecution | null> {
  const doc = await prisma.workflowExecution.findUnique({ where: { id } });
  if (!doc) return null;

  return {
    id: doc.id,
    workflowId: doc.workflowId,
    status: doc.status as any,
    startedAt: doc.startedAt,
    completedAt: doc.completedAt ?? undefined,
    logs: JSON.parse(doc.logsData || "[]"),
    error: doc.error ?? undefined,
    result: doc.resultData ? JSON.parse(doc.resultData) : undefined,
  };
}
