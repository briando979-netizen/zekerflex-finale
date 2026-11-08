import { prisma } from '@/lib/prisma';
import { Form } from './schema';

export interface FormSubmission {
  id: string;
  formId: string;
  data: Record<string, any>;
  status: 'pending' | 'submitted' | 'error';
  submittedAt?: Date;
  errorMessage?: string;
}

export async function saveFormDraft(
  formId: string,
  userId: string,
  data: Record<string, any>,
  pageIndex: number
): Promise<FormSubmission> {
  const submission = await prisma.formSubmission.upsert({
    where: { formId_userId: { formId, userId } },
    update: {
      data,
      currentPage: pageIndex,
      lastSavedAt: new Date(),
    },
    create: {
      id: `submission-${Date.now()}`,
      formId,
      userId,
      data,
      currentPage: pageIndex,
      status: 'pending',
      lastSavedAt: new Date(),
    },
  });

  return {
    id: submission.id,
    formId: submission.formId,
    data: submission.data as Record<string, any>,
    status: submission.status as 'pending' | 'submitted' | 'error',
  };
}

export async function submitForm(
  formId: string,
  userId: string,
  data: Record<string, any>,
  webhooks?: Array<{ url: string; headers?: Record<string, string> }>,
  emailConfig?: { to: string; subject: string; template: string }
): Promise<FormSubmission> {
  const submission = await prisma.formSubmission.create({
    data: {
      id: `submission-${Date.now()}`,
      formId,
      userId,
      data,
      status: 'submitted',
      submittedAt: new Date(),
    },
  });

  // Trigger webhooks
  if (webhooks) {
    for (const webhook of webhooks) {
      fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...webhook.headers },
        body: JSON.stringify({ formId, submissionId: submission.id, data }),
      }).catch(() => {
        // Log error but don't block submission
      });
    }
  }

  return {
    id: submission.id,
    formId: submission.formId,
    data: submission.data as Record<string, any>,
    status: 'submitted',
    submittedAt: submission.submittedAt || undefined,
  };
}

export async function getSubmissionDraft(formId: string, userId: string) {
  return prisma.formSubmission.findUnique({
    where: { formId_userId: { formId, userId } },
  });
}
