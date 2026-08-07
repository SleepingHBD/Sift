"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SentimentPoint, SourceBreakdown, VolumePoint } from "@/lib/radar/types";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "11px",
  color: "var(--text)",
  boxShadow: "var(--shadow-lg)",
  fontSize: 13,
};

export function RadarVolumeChart({ data, onSpike }: { data: VolumePoint[]; onSpike: (spikeId: string) => void }) {
  return (
    <div className="radar-chart radar-chart--large" aria-label="Mention volume and detected spikes over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 18, right: 12, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="radarMentionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dfff4f" stopOpacity={0.38} />
              <stop offset="100%" stopColor="#dfff4f" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border-strong)" }} labelFormatter={(label) => String(label)} />
          <Area type="monotone" dataKey="baseline" name="Recent baseline" stroke="var(--muted)" strokeDasharray="4 5" fill="transparent" strokeWidth={1.25} />
          <Area type="monotone" dataKey="mentions" name="Mentions" stroke="#a8c800" fill="url(#radarMentionFill)" strokeWidth={2.5} />
          {data.filter((point) => point.spikeId).map((point) => (
            <ReferenceDot
              key={point.spikeId}
              x={point.label}
              y={point.mentions}
              r={6}
              fill="#ff7d68"
              stroke="var(--card)"
              strokeWidth={3}
              className="radar-spike-dot"
              onClick={() => point.spikeId && onSpike(point.spikeId)}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RadarSentimentChart({ data }: { data: SentimentPoint[] }) {
  return (
    <div className="radar-chart" aria-label="Sentiment over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 10, left: -28, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value}%`} />
          <Line type="monotone" dataKey="positive" stroke="#a8c800" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="neutral" stroke="#9ca091" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="negative" stroke="#ff7d68" strokeWidth={1.75} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const sourceColors = ["#dfff4f", "#93b8ff", "#ff7d68", "#bd9cff", "#9ca091"];

export function RadarSourceChart({ data, onSelect }: { data: SourceBreakdown[]; onSelect: (source: string) => void }) {
  return (
    <div className="radar-chart" aria-label="Conversation volume by source">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 13, left: 2, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={78} tick={{ fill: "var(--text)", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--subtle)" }} />
          <Bar
            dataKey="mentions"
            radius={[0, 5, 5, 0]}
            barSize={15}
            onClick={(_entry, index) => {
              const selectedSource = data[index]?.source;
              if (selectedSource) onSelect(selectedSource);
            }}
          >
            {data.map((item, index) => <Cell key={item.source} fill={sourceColors[index % sourceColors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
