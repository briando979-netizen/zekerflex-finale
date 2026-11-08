// Reporting & Visualization Module
// Comprehensive reporting system with 6 subsystems:
// 1. Report Designer - Drag-drop templates
// 2. Scheduled Reports - Email delivery, cron jobs
// 3. Dashboard Builder - Interactive dashboards
// 4. Data Visualization - 20+ chart types
// 5. Export & Sharing - PDF/Excel/CSV/HTML
// 6. Real-Time Analytics - Live streaming updates

export * from "./designer";
export * from "./scheduling";
export * from "./dashboard-builder";
export * from "./visualizations";
export * from "./export";
export * from "./realtime";

// Re-export commonly used functions
export {
  createReportFromTemplate,
  getAvailableTemplates
} from "./designer";

export {
  createScheduledReport,
  executeScheduledReport,
  getOverdueSchedules
} from "./scheduling";

export {
  createDashboard,
  getDashboard,
  listDashboards,
  shareDashboard
} from "./dashboard-builder";

export {
  CHART_TYPES,
  VISUALIZATION_TEMPLATES,
  generateChartColors
} from "./visualizations";

export {
  exportReport,
  generateReportPdf,
  generateReportExcel,
  generateReportCsv,
  cleanupOldExports
} from "./export";

export {
  getRealtimeDataStore,
  handleRealtimeConnection,
  RealtimeAlertSystem,
  alertSystem
} from "./realtime";
