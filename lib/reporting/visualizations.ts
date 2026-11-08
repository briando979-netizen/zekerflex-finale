import { z } from "zod";

// Chart types supported
export const CHART_TYPES = [
  "line",
  "bar",
  "pie",
  "doughnut",
  "radar",
  "scatter",
  "bubble",
  "area",
  "heatmap",
  "histogram",
  "boxplot",
  "violin",
  "gantt",
  "sankey",
  "treemap",
  "sunburst",
  "waterfall",
  "funnel",
  "gauge",
  "bullet",
] as const;

export const VisualizationSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(CHART_TYPES),
  metrics: z.array(z.string()),
  dimensions: z.array(z.string()),
  filters: z.record(z.unknown()).optional(),
  config: z.object({
    // Chart.js/Recharts configuration
    responsive: z.boolean().default(true),
    maintainAspectRatio: z.boolean().default(true),
    animation: z.boolean().default(true),
    colors: z.array(z.string()).optional(),
    legend: z.object({ show: z.boolean(), position: z.string() }).optional(),
    tooltip: z.object({ enabled: z.boolean() }).optional(),
    xAxis: z.object({ label: z.string().optional() }).optional(),
    yAxis: z.object({ label: z.string().optional() }).optional(),
  }),
  theme: z.enum(["light", "dark", "custom"]).default("light"),
  drillDownEnabled: z.boolean().default(false),
  drillDownTarget: z.string().optional(),
});

export type Visualization = z.infer<typeof VisualizationSchema>;

// Default color palettes
export const COLOR_PALETTES = {
  default: [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#14b8a6",
  ],
  pastel: [
    "#fbb4ae",
    "#b3cde3",
    "#ccebc5",
    "#decbe4",
    "#fed9a6",
    "#ffffcc",
    "#e5d8bd",
    "#fddaec",
  ],
  dark: [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
  ],
};

// Create visualization configuration for Chart.js
export function createChartConfig(
  visualization: Visualization
): Record<string, unknown> {
  const baseConfig = {
    type: visualization.type,
    responsive: visualization.config.responsive,
    maintainAspectRatio: visualization.config.maintainAspectRatio,
    animation: visualization.config.animation,
    options: {
      plugins: {
        legend: visualization.config.legend || { display: true, position: "top" },
        tooltip: visualization.config.tooltip || { enabled: true },
        title: {
          display: true,
          text: visualization.title,
        },
      },
      scales: {
        ...(visualization.config.xAxis && {
          x: {
            title: {
              display: true,
              text: visualization.config.xAxis.label,
            },
          },
        }),
        ...(visualization.config.yAxis && {
          y: {
            title: {
              display: true,
              text: visualization.config.yAxis.label,
            },
          },
        }),
      },
    },
    data: {
      labels: [],
      datasets: [
        {
          label: visualization.metrics[0],
          data: [],
          borderColor: visualization.config.colors?.[0] || COLOR_PALETTES.default[0],
          backgroundColor: visualization.config.colors?.[0] || COLOR_PALETTES.default[0],
        },
      ],
    },
  };

  return baseConfig;
}

// Create visualization for Recharts
export function createRechartsConfig(
  visualization: Visualization
): Record<string, unknown> {
  return {
    type: visualization.type,
    title: visualization.title,
    metrics: visualization.metrics,
    dimensions: visualization.dimensions,
    data: [],
    config: {
      responsive: visualization.config.responsive,
      animation: visualization.config.animation,
      colors: visualization.config.colors || COLOR_PALETTES.default,
      theme: visualization.theme,
    },
  };
}

// Preset visualization templates
export const VISUALIZATION_TEMPLATES = {
  revenue_trend: {
    title: "Revenue Trend",
    type: "line" as const,
    metrics: ["sum_revenue"],
    dimensions: ["date"],
    config: {
      responsive: true,
      animation: true,
      yAxis: { label: "Revenue (€)" },
      xAxis: { label: "Date" },
    },
  },

  sales_by_region: {
    title: "Sales by Region",
    type: "bar" as const,
    metrics: ["sum_revenue"],
    dimensions: ["region"],
    config: {
      responsive: true,
      animation: true,
      xAxis: { label: "Region" },
      yAxis: { label: "Revenue (€)" },
    },
  },

  market_share: {
    title: "Market Share",
    type: "pie" as const,
    metrics: ["sum_revenue"],
    dimensions: ["company"],
    config: {
      responsive: true,
      animation: true,
    },
  },

  performance_gauge: {
    title: "Performance Metrics",
    type: "gauge" as const,
    metrics: ["completion_rate"],
    dimensions: [],
    config: {
      responsive: true,
      animation: true,
    },
  },

  sales_funnel: {
    title: "Sales Funnel",
    type: "funnel" as const,
    metrics: ["count"],
    dimensions: ["stage"],
    config: {
      responsive: true,
      animation: true,
    },
  },

  workforce_distribution: {
    title: "Workforce Distribution",
    type: "doughnut" as const,
    metrics: ["count_workers"],
    dimensions: ["department"],
    config: {
      responsive: true,
      animation: true,
    },
  },

  customer_journey: {
    title: "Customer Journey",
    type: "sankey" as const,
    metrics: ["count"],
    dimensions: ["from_stage", "to_stage"],
    config: {
      responsive: true,
      animation: true,
    },
  },

  time_series: {
    title: "Time Series Analysis",
    type: "area" as const,
    metrics: ["value"],
    dimensions: ["date"],
    config: {
      responsive: true,
      animation: true,
      yAxis: { label: "Value" },
      xAxis: { label: "Time" },
    },
  },
};

// Apply theme to visualization
export function applyTheme(
  config: Record<string, unknown>,
  theme: "light" | "dark" | "custom"
): Record<string, unknown> {
  const themeConfig = {
    light: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      gridColor: "#e5e7eb",
    },
    dark: {
      backgroundColor: "#1f2937",
      textColor: "#ffffff",
      gridColor: "#374151",
    },
    custom: {
      backgroundColor: "#f3f4f6",
      textColor: "#111827",
      gridColor: "#d1d5db",
    },
  };

  return {
    ...config,
    theme: themeConfig[theme],
  };
}

// Validate visualization configuration
export function validateVisualization(
  visualization: unknown
): { valid: boolean; errors: any[] } {
  try {
    VisualizationSchema.parse(visualization);
    return { valid: true, errors: [] };
  } catch (err: any) {
    return { valid: false, errors: err.errors || [{ message: String(err) }] };
  }
}

// Generate chart colors based on data count
export function generateChartColors(count: number, palette = "default"): string[] {
  const colors =
    COLOR_PALETTES[palette as keyof typeof COLOR_PALETTES] ||
    COLOR_PALETTES.default;

  if (count <= colors.length) {
    return colors.slice(0, count);
  }

  // Generate additional colors by lightening existing ones
  const additional = [];
  for (let i = colors.length; i < count; i++) {
    const baseColor = colors[i % colors.length];
    additional.push(lightenColor(baseColor, 20));
  }

  return [...colors, ...additional];
}

// Helper to lighten a hex color
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);

  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;

  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? R : 255) * 0x10000 +
      (G < 255 ? G : 255) * 0x100 +
      (B < 255 ? B : 255)
    )
      .toString(16)
      .slice(1)
  );
}
