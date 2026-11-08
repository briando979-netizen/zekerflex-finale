import { NextRequest, NextResponse } from 'next/server';
import { requirePrincipal } from '@/lib/auth';
import { AppError, toErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = `
  type Query {
    content(id: String!): Content
    contents(typeId: String, locale: String, state: String, limit: Int, offset: Int): [Content]
    contentType(id: String!): ContentType
    contentTypes: [ContentType]
  }

  type Content {
    id: String!
    typeId: String!
    title: String!
    slug: String!
    state: String!
    data: JSON!
    version: Int!
    locale: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    publishedAt: DateTime
  }

  type ContentType {
    id: String!
    name: String!
    displayName: String!
    fields: [ContentField]!
  }

  type ContentField {
    id: String!
    name: String!
    type: String!
    required: Boolean!
  }
`;

async function executeQuery(query: string, variables: Record<string, any>) {
  // Simple query parser
  if (query.includes('contents')) {
    return {
      data: {
        contents: [],
      },
    };
  }
  if (query.includes('content(')) {
    return {
      data: {
        content: null,
      },
    };
  }
  if (query.includes('contentTypes')) {
    return {
      data: {
        contentTypes: [],
      },
    };
  }
  return { data: {} };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const body = await request.json();
    const { query, variables } = body;

    if (!query) {
      throw AppError.validation('Query required');
    }

    const result = await executeQuery(query, variables || {});
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePrincipal();
    return NextResponse.json({ schema });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
