import { NextRequest, NextResponse } from 'next/server';

export const apiOptimization = {
  compression: ['gzip', 'brotli'],
  pagination: { default: 50, max: 100 },
  timeout: 30000,
};

export const batchEndpoint = async (req: NextRequest) => {
  const body = await req.json();
  const { requests } = body as { requests: Array<{ method: string; path: string; body?: any }> };

  if (requests.length > 50) {
    return NextResponse.json({ error: 'Max 50 requests per batch' }, { status: 400 });
  }

  const results = await Promise.all(
    requests.map(async (r) => {
      try {
        const res = await fetch(`${process.env.NEXTAUTH_URL}${r.path}`, {
          method: r.method,
          body: r.body ? JSON.stringify(r.body) : undefined,
          headers: { 'Content-Type': 'application/json' },
        });
        return { status: res.status, data: await res.json() };
      } catch (e) {
        return { status: 500, error: String(e) };
      }
    })
  );

  return NextResponse.json({ results });
};

export const graphqlOptimization = {
  queryComplexity: { max: 1000 },
  depth: { max: 10 },
  aliases: false,
  batching: true,
};

export const aggregationCache = {
  users: 3600,
  shifts: 300,
  ratings: 1800,
  analytics: 600,
};

export const responseCompression = {
  threshold: 1024,
  level: 6,
};

export const filteringOptimization = {
  indexed: ['status', 'companyId', 'createdAt'],
  range: ['salary', 'distance', 'rating'],
};

export const sortingOptimization = {
  indexed: ['createdAt DESC', 'rating DESC', 'salary ASC'],
  default: 'createdAt DESC',
};
