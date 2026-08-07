import type { RadarSource } from "@/lib/radar/types";

export type ConnectorKind = RadarSource;
export type ConnectorMode = "live" | "not-connected" | "coming-later";

export interface NormalizedMention {
  id: string;
  platform: RadarSource;
  externalId: string;
  author?: string;
  content: string;
  url?: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement: number;
  language?: string;
  metadata: Record<string, unknown>;
}

export interface ConnectorQuery {
  query: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
}

export interface ConnectorResult {
  mentions: NormalizedMention[];
  nextCursor?: string;
  fetchedAt: string;
}

export interface ConnectorCapabilities {
  search: boolean;
  mentionDetail: boolean;
  pagination: boolean;
  historicalDays?: number;
  availableFields: (keyof NormalizedMention)[];
}

export interface CredentialValidation {
  valid: boolean;
  message: string;
}

export interface DataConnector<TRaw = unknown> {
  readonly id: ConnectorKind;
  readonly label: string;
  readonly mode: ConnectorMode;
  searchMentions(query: ConnectorQuery): Promise<ConnectorResult>;
  fetchMention(externalId: string): Promise<NormalizedMention | null>;
  normalizeMention(raw: TRaw): NormalizedMention;
  validateCredentials(credentials?: Record<string, string>): Promise<CredentialValidation>;
  getCapabilities(): ConnectorCapabilities;
}
