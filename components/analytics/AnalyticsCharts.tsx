"use client";

import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ChartProps {
  data: { name: string; value: number; [key: string]: any }[];
  title: string;
  type: "line" | "bar" | "pie";
  color?: string;
}

export function TrendChart({ data, title, type, color = "#0E5C4A" }: ChartProps) {
  return (
    <div className="w-full h-80 rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height="100%">
        {type === "line" && (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} />
          </LineChart>
        )}
        {type === "bar" && (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill={color} />
          </BarChart>
        )}
        {type === "pie" && (
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={["#0E5C4A", "#2D7A6B", "#4A9B88", "#67BAA5", "#85D9C2"][index % 5]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelChart({ data }: { data: { stage: string; users: number; conversionRate: number }[] }) {
  const chartData = data.map((d, i) => ({
    name: d.stage,
    value: d.users,
    fill: `hsl(${120 - i * 20}, 70%, 50%)`,
  }));

  return (
    <div className="w-full h-80 rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold mb-4">Conversion Funnel</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={150} />
          <Tooltip />
          <Bar dataKey="value" fill="#0E5C4A" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KPITile({ label, value, trend, target }: { label: string; value: number; trend?: number; target?: number }) {
  const isPositive = trend ? trend > 0 : false;
  const statusColor = !target ? "gray" : value >= target ? "green" : value >= target * 0.8 ? "yellow" : "red";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-[200px]">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold mt-2">{typeof value === "number" && value > 1000 ? (value / 1000).toFixed(1) + "k" : value}</p>
      {trend !== undefined && (
        <p className={`text-sm mt-1 ${isPositive ? "text-green-600" : "text-red-600"}`}>
          {isPositive ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
        </p>
      )}
      {target !== undefined && (
        <p className={`text-xs mt-1 font-semibold text-${statusColor}-600`}>
          Target: {target} ({statusColor === "green" ? "✓" : "•"})
        </p>
      )}
    </div>
  );
}

export function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = Math.min(value / max, 1);
  const backgroundColor = `rgba(14, 92, 74, ${intensity * 0.8 + 0.2})`;

  return (
    <div
      className="flex items-center justify-center h-12 rounded text-white text-sm font-semibold"
      style={{ backgroundColor }}
      title={String(value)}
    >
      {value}
    </div>
  );
}

export function TimelineChart({ events }: { events: { date: string; label: string; value: number }[] }) {
  return (
    <div className="w-full">
      <div className="space-y-4">
        {events.map((event, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="w-24 text-sm font-medium text-gray-600">{event.date}</div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{event.label}</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div className="bg-teal-600 h-2 rounded-full" style={{ width: `${Math.min(event.value, 100)}%` }} />
              </div>
            </div>
            <div className="text-sm font-medium">{event.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
