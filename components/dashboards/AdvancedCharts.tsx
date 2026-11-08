"use client";

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Sankey,
  Sink,
  Source,
  Link,
  Node,
} from "recharts";

export interface ChartData {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface AdvancedChartProps {
  data: ChartData[];
  type: "line" | "bar" | "area" | "pie" | "sankey" | "funnel" | "heatmap";
  title: string;
  colors?: string[];
  height?: number;
}

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export function AdvancedLineChart({ data, title, height = 300 }: AdvancedChartProps) {
  return (
    <div className="w-full bg-white rounded-lg p-4 shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdvancedBarChart({ data, title, height = 300 }: AdvancedChartProps) {
  return (
    <div className="w-full bg-white rounded-lg p-4 shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" fill="#3B82F6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdvancedPieChart({ data, title, height = 300 }: AdvancedChartProps) {
  return (
    <div className="w-full bg-white rounded-lg p-4 shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name}: ${value}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdvancedAreaChart({ data, title, height = 300 }: AdvancedChartProps) {
  return (
    <div className="w-full bg-white rounded-lg p-4 shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="value" fill="#3B82F6" stroke="#3B82F6" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KPICard({
  title,
  value,
  target,
  trend,
  status,
}: {
  title: string;
  value: number;
  target: number;
  trend: "up" | "down" | "flat";
  status: "on-track" | "at-risk" | "off-track";
}) {
  const statusColors = {
    "on-track": "bg-green-50 border-green-200",
    "at-risk": "bg-yellow-50 border-yellow-200",
    "off-track": "bg-red-50 border-red-200",
  };

  return (
    <div className={`border rounded-lg p-4 ${statusColors[status]}`}>
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-3xl font-bold mt-2">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500">Target: {target.toLocaleString()}</p>
      <div className="mt-2 flex items-center">
        <span
          className={`text-sm font-semibold ${
            trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-600"
          }`}
        >
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {Math.abs((value / target - 1) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function Heatmap({ data, title, height = 300 }: AdvancedChartProps) {
  return (
    <div className="w-full bg-white rounded-lg p-4 shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="grid grid-cols-7 gap-1">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="aspect-square rounded"
            style={{
              backgroundColor: `rgba(59, 130, 246, ${Math.min(item.value as number / 100, 1)})`,
            }}
            title={`${item.name}: ${item.value}`}
          />
        ))}
      </div>
    </div>
  );
}
