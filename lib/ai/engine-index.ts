// AI Engine - Unified Export

// 1. Matching
export { computeMatchScore, getRecommendations } from "./matching/optimizer";

// 2. Search
export { semanticSearch, autoSuggest } from "./search/semantic";

// 3. Content Generation
export { generateContent, optimizeForSEO } from "./content/generator";

// 4. Fraud Detection
export { detectFraud, getFragRiskScore } from "./fraud/detector";

// 5. Customer Support
export { handleSupportRequest, prioritizeTicket, suggestResponse } from "./support/chatbot";

// 6. Scheduling
export { recommendSchedule, avoidConflicts, optimizeResources } from "./scheduling/optimizer";

// 7. Pricing
export { computeDynamicPrice, optimizeMargin, forecastDemand } from "./pricing/optimizer";

// 8. Analytics
export {
  detectAnomalies,
  analyzeTrends,
  predictiveModeling,
  cohortAnalysis,
  attributionModeling,
  segmentDiscovery,
  forecasting,
} from "./analytics/predictor";

// 9. Workflows
export { executeWorkflow, createWorkflow, triggerWorkflow } from "./workflows/executor";

// 10. Vision
export {
  analyzeImage,
  recognizeFood,
  analyzeRestaurant,
  detectLogo,
  classifyBusinessType,
  assessQuality,
  filterInappropriateContent,
  checkForSafetyIssues,
  extractTextFromImage,
  getImageMetadata,
} from "./vision/analyzer";

// 11. Language Models
export {
  generateText,
  translateText,
  summarizeText,
  classifyText,
  extractEntities,
  detectSentiment,
  detectIntentTopic,
  generateAnswerToQuestion,
  supportedLanguages,
} from "./models/language";

// 12. Ethics & Compliance
export {
  detectBias,
  computeFairnessScore,
  explainPrediction,
  createAuditTrail,
  logDecision,
  checkRegulationCompliance,
  getModelInterpretability,
  auditModelPerformance,
} from "./ethics/compliance";

// 13. Model Management
export {
  createModelVersion,
  evaluateModel,
  deployModel,
  rollbackModel,
  abTestModel,
  getModelPerformance,
  retrainModel,
  listModelVersions,
  monitorModelDrift,
  getFeatureImportance,
  configureModelParams,
} from "./models-admin/manager";
