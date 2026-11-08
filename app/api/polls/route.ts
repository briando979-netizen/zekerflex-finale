import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { createPoll, listChannelPolls, vote, getPollResults } from "@/lib/polls/voting";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const channelId = request.nextUrl.searchParams.get("channelId");
    const pollId = request.nextUrl.searchParams.get("pollId");

    if (pollId) {
      const results = await getPollResults(pollId);
      return NextResponse.json(results);
    }

    if (!channelId) throw AppError.validation("channelId required");
    const polls = await listChannelPolls(channelId);
    return NextResponse.json({ polls });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action, ...pollData } = body;

    if (action === "create") {
      const poll = await createPoll(principal.userId, pollData);
      return NextResponse.json({ poll }, { status: 201 });
    }

    if (action === "vote") {
      const { pollId, optionIndex } = pollData;
      await vote(pollId, principal.userId, optionIndex);
      const results = await getPollResults(pollId);
      return NextResponse.json(results);
    }

    throw AppError.validation("Unknown action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
