"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--text)",
  boxShadow: "var(--shadow-lg)",
  fontSize: 13,
};

export function MentionAreaChart({ data }: { data: { date: string; mentions: number; baseline: number }[] }) {
  return (
    <div className="chart-box" aria-label="Mention volume over time chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="mentionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dfff4f" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#dfff4f" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border-strong)" }} />
          <Area type="monotone" dataKey="baseline" stroke="var(--muted)" strokeDasharray="4 5" fill="transparent" strokeWidth={1.5} />
          <Area type="monotone" dataKey="mentions" stroke="#a8c800" fill="url(#mentionFill)" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShareBarChart({ data }: { data: { name: string; share: number; color: string }[] }) {
  return (
    <div className="chart-box chart-box--bar" aria-label="Competitor share of voice chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 10, bottom: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={108} tick={{ fill: "var(--text)", fontSize: 13 }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--subtle)" }} />
          <Bar dataKey="share" radius={[0, 6, 6, 0]} barSize={20}>
            {data.map((item) => <Cell key={item.name} fill={item.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
