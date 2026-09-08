"use client";

import Link from "next/link";
import { ReviewButton } from "@/components/app/ReviewButton";

export function CompletedShiftActions({ timesheetId, timesheetStatus, clientId, clientName, shiftId }: { timesheetId: string | null; timesheetStatus: string | null; clientId: string | null; clientName: string | null; shiftId: string }) {
  if (!timesheetId) return <Link href={`/dashboard/klussen/${shiftId}`} className="btn-primary w-full">Bekijk afronding</Link>;
  const submitted = timesheetStatus && timesheetStatus !== "DRAFT";
  const reviewed = clientId && clientName ? <ReviewButton subjectType="company" subjectId={clientId} subjectName={clientName} shiftId={shiftId} label="Review achterlaten" /> : null;
  return <div className="space-y-2"><div className="flex flex-wrap items-center gap-2">{submitted ? <span className="pill-ok">Uren ingediend</span> : <Link href={`/dashboard/uren/${timesheetId}`} className="btn-primary flex-1">Uren invullen</Link>}{reviewed}</div>{submitted && <Link href="/dashboard/uitbetalingen" className="block rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-center text-xs font-semibold text-brand-700 hover:bg-brand-100">Volgende stap: kies je uitbetaling →</Link>}{!submitted && <p className="text-center text-xs text-neutralx-400">Na indienen kun je een review plaatsen en je uitbetaling kiezen.</p>}</div>;
}
