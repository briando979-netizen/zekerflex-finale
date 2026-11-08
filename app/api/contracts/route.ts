import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { createContract, getContract, searchContracts, updateContract } from '@/lib/contracts/manager';
import { toErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requirePrincipal();
    const query = req.nextUrl.searchParams.get('q');
    const results = query ? await searchContracts(query) : [];
    return NextResponse.json({ contracts: results });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePrincipal();
    const data = await req.json();
    const contract = await createContract(data);
    return NextResponse.json({ contract }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    const data = await req.json();
    const contract = await updateContract(id, data);
    return NextResponse.json({ contract });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
