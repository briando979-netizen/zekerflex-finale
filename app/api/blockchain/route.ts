import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import * as blockchain from '@/lib/blockchain/smart-contracts';
import * as ledger from '@/lib/blockchain/distributed-ledger';
import * as consensus from '@/lib/blockchain/consensus';
import * as tokenization from '@/lib/blockchain/tokenization';
import * as settlement from '@/lib/blockchain/settlement';
import * as compliance from '@/lib/blockchain/compliance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireRole('PLATFORM_ADMIN');
    const type = request.nextUrl.searchParams.get('type');

    if (type === 'contracts') {
      const contracts = await blockchain.listSmartContracts();
      return NextResponse.json({ contracts });
    }

    return NextResponse.json({ status: 'blockchain-api-ready' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole('PLATFORM_ADMIN');
    const body = await request.json();
    const action = body.action;

    if (action === 'deploy-contract') {
      const contract = await blockchain.deploySmartContract(body.contract);
      return NextResponse.json({ contract }, { status: 201 });
    }

    if (action === 'record-ledger') {
      const entry = await ledger.recordLedgerEntry(body.data, body.previousHash);
      return NextResponse.json({ entry }, { status: 201 });
    }

    if (action === 'initiate-swap') {
      const swap = await settlement.initiateAtomicSwap(
        body.party1, body.party2, body.token1Id, BigInt(body.amount1),
        body.token2Id, BigInt(body.amount2)
      );
      return NextResponse.json({ swap }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
