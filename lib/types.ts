export type Lifecycle =
  | "Emerging"
  | "Accelerating"
  | "Mainstream"
  | "Saturated"
  | "Declining";

export type Sentiment = "positive" | "neutral" | "negative";

export interface Project {
  id: string;
  cloudId?: string;
  clientRef?: string;
  name: string;
  brand: string;
  market: string;
  focus: string;
  description?: string;
  competitors?: string[];
  accent: string;
  counts: { mentions: number; research: number; insights: number };
  status?: "active" | "archived";
  createdAt?: string;
  updatedAt?: string;
}

export interface Trend {
  id: string;
  name: string;
  growth: number;
  volume: string;
  platforms: string[];
  category: string;
  audience: string;
  lifecycle: Lifecycle;
  firstDetected: string;
  keywords: string[];
  score: number;
  factors: { label: string; value: number }[];
  happening: string;
  tension: string;
  opportunity: string;
  risk: string;
}

export interface Mention {
  id: string;
  platform: "Reddit" | "YouTube" | "News" | "RSS";
  author: string;
  content: string;
  timestamp: string;
  engagement: number;
  sentiment: Sentiment;
  topics: string[];
  sourceUrl: string;
  important?: boolean;
}

export interface InspirationItem {
  id: string;
  cloudId?: string;
  clientRef?: string;
  projectId: string;
  brand: string;
  title: string;
  type: string;
  source: string;
  url?: string;
  tags: string[];
  palette: string;
  savedAt: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResearchItem {
  id: string;
  cloudId?: string;
  clientRef?: string;
  projectId: string;
  title: string;
  publication: string;
  url?: string;
  type: string;
  date: string;
  tags: string[];
  summary: string;
  collection: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Competitor {
  id: string;
  name: string;
  share: number;
  sentiment: number;
  growth: number;
  topic: string;
  color: string;
}

export interface EvidenceSource {
  id: string;
  label: string;
  type: string;
  excerpt: string;
}

export interface CulturalInsight {
  id: string;
  title: string;
  observation: string;
  behaviour: string;
  tension: string;
  insight: string;
  opportunity: string;
  confidence: "Strong signal" | "Developing signal" | "Hypothesis";
  sourceIds: string[];
}

export interface CreativeTerritory {
  id: string;
  name: string;
  coreThought: string;
  culturalConnection: string;
  brandRole: string;
  execution: string;
  tone: string;
  risk: string;
}
