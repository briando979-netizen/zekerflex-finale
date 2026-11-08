export interface FilterOptions {
  search?: string;
  status?: string | string[];
  sort?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  category?: string;
}

export interface FilterResult<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  hasMore: boolean;
}

export function applyFilters<T>(items: T[], filters: FilterOptions): FilterResult<T> {
  let filtered = [...items];

  if (filters.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter((item: any) =>
      Object.values(item).some((val) => String(val).toLowerCase().includes(search))
    );
  }

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    filtered = filtered.filter((item: any) => statuses.includes(item.status));
  }

  if (filters.category) {
    filtered = filtered.filter((item: any) => item.category === filters.category);
  }

  if (filters.minAmount || filters.maxAmount) {
    filtered = filtered.filter((item: any) => {
      const amount = item.amount || item.bedrag || 0;
      if (filters.minAmount && amount < filters.minAmount) return false;
      if (filters.maxAmount && amount > filters.maxAmount) return false;
      return true;
    });
  }

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    items: filtered.slice(start, end),
    total: filtered.length,
    page,
    pages: Math.ceil(filtered.length / limit),
    hasMore: end < filtered.length,
  };
}

export function buildFilterQuery(filters: FilterOptions): Record<string, any> {
  const query: Record<string, any> = {};

  if (filters.search) {
    query.search = filters.search;
  }

  if (filters.status) {
    query.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
  }

  if (filters.category) {
    query.category = filters.category;
  }

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.createdAt.lte = new Date(filters.dateTo);
  }

  return query;
}
