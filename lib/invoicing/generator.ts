import { prisma } from "@/lib/prisma";

export async function generateInvoiceFromTimesheet(timesheetId: string) {
  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: { shiftAssignment: { include: { shift: true } } },
  });

  if (!timesheet || timesheet.status !== "APPROVED") {
    throw new Error("Timesheet must be approved to generate invoice");
  }

  const hoursWorked = timesheet.hoursWorked;
  const hourlyRate = timesheet.shiftAssignment.shift.hourlyRate;
  const amount = hoursWorked * hourlyRate;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: timesheet.shiftAssignment.freelancerId,
      amount: amount,
      amountCents: Math.round(amount * 100),
      status: "PENDING",
      type: "INVOICE",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      description: `Work performed: ${hoursWorked} hours at ${timesheet.shiftAssignment.shift.locatie || "Site"}`,
    },
  });

  return invoice;
}

export async function generateMonthlyInvoice(workerId: string, month: number, year: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const timesheets = await prisma.timesheet.findMany({
    where: {
      submittedBy: workerId,
      status: "APPROVED",
      approvedAt: { gte: monthStart, lt: monthEnd },
    },
    include: { shiftAssignment: true },
  });

  if (timesheets.length === 0) {
    return null;
  }

  const totalAmount = timesheets.reduce((sum, ts) => {
    return sum + (ts.earnedCents || 0);
  }, 0);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: workerId,
      amount: totalAmount / 100,
      amountCents: totalAmount,
      status: "PENDING",
      type: "INVOICE",
      dueDate: monthEnd,
      description: `Monthly invoice for ${new Date(year, month - 1).toLocaleDateString("nl-NL", { month: "long", year: "numeric" })} - ${timesheets.length} shifts`,
    },
  });

  return invoice;
}

export async function recordPayment(invoiceId: string, amountCents: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: amountCents >= invoice.amountCents ? "PAID" : "PARTIAL",
      paidAtCents: amountCents,
      paidAt: new Date(),
    },
  });

  return updated;
}
