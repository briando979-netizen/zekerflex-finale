export { fullTextSearch } from "./fulltext";
export { getFacets, applyFacetFilters, type Facet, type FacetValue } from "./facets";
export {
  buildFilterQuery,
  getPriceFilterRanges,
  getCategoryFilter,
  getDateRangeFilter,
  getTagFilter,
} from "./filters";
export { getSearchAnalytics, trackSearch, type SearchAnalytics } from "./analytics";
export { getAutoSuggestions, getTrendingSuggestions, getPersonalizedSuggestions, correctMisspellings } from "./suggestions";
export {
  addSynonym,
  getSynonyms,
  addBoostRule,
  getBoostMultiplier,
  rerankeResults,
  getPersonalizationBoost,
  createSearchExperiment,
  getExperimentResults,
  getSearchPerformanceMetrics,
  type RankedResult,
} from "./optimization";
