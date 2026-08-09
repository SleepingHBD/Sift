import { radarConnectors } from "./connectors.ts";
import type { RadarConnectorSettings } from "./connector-utils.ts";
import type { ConnectorDescriptor, RadarSource } from "./types.ts";

export type MonitorCoverageStatus =
  | "ready"
  | "needs-configuration"
  | "backend-unavailable"
  | "not-included"
  | "unavailable";

export interface MonitorSourceCoverage {
  source: RadarSource;
  name: string;
  description: string;
  capabilities: string[];
  collectionMethod: string;
  configuration: string;
  selected: boolean;
  configured: boolean;
  runnable: boolean;
  status: MonitorCoverageStatus;
}

export interface MonitorCoverageReport {
  sources: MonitorSourceCoverage[];
  explicitSelection: boolean;
  runnableCount: number;
  attentionCount: number;
}

const previewSources: RadarSource[] = ["youtube", "rss", "manual", "reddit", "news"];

export function buildMonitorCoverage(
  selectedSources: RadarSource[],
  settings: RadarConnectorSettings,
  backendConfigured: boolean,
): MonitorCoverageReport {
  const explicitSelection = selectedSources.length > 0;
  const descriptors = new Map(radarConnectors.map((connector) => [connector.source, connector]));
  const sources = previewSources.flatMap((source) => {
    const descriptor = descriptors.get(source);
    return descriptor ? [coverageFor(descriptor, selectedSources, settings, backendConfigured)] : [];
  });

  return {
    sources,
    explicitSelection,
    runnableCount: sources.filter((source) => source.runnable).length,
    attentionCount: sources.filter((source) => source.selected && !source.runnable).length,
  };
}

function coverageFor(
  connector: ConnectorDescriptor,
  selectedSources: RadarSource[],
  settings: RadarConnectorSettings,
  backendConfigured: boolean,
): MonitorSourceCoverage {
  const configured = isConfigured(connector.source, settings);
  const available = connector.state === "available";
  const selected = selectedSources.length ? selectedSources.includes(connector.source) : available;
  const runnable = available && configured && selected && backendConfigured;
  const status: MonitorCoverageStatus = !available
    ? "unavailable"
    : !selected
      ? "not-included"
      : !configured
        ? "needs-configuration"
        : !backendConfigured
          ? "backend-unavailable"
          : "ready";

  return {
    source: connector.source,
    name: connector.name,
    description: connector.description,
    capabilities: connector.capabilities,
    collectionMethod: collectionMethod(connector.source),
    configuration: configurationLabel(connector.source, settings),
    selected,
    configured,
    runnable,
    status,
  };
}

function isConfigured(source: RadarSource, settings: RadarConnectorSettings) {
  if (source === "rss") return settings.rssFeedUrls.length > 0;
  if (source === "manual") return settings.manualUrls.length > 0;
  if (source === "youtube") return settings.youtubeEnabled;
  return false;
}

function collectionMethod(source: RadarSource) {
  if (source === "youtube") return "Official YouTube Data API";
  if (source === "rss") return "Permitted RSS or Atom feeds";
  if (source === "manual") return "User-supplied public URLs";
  if (source === "reddit") return "Official API required";
  if (source === "news") return "Licensed news API required";
  return "Not implemented";
}

function configurationLabel(source: RadarSource, settings: RadarConnectorSettings) {
  if (source === "rss") return settings.rssFeedUrls.length
    ? `${settings.rssFeedUrls.length} feed${settings.rssFeedUrls.length === 1 ? "" : "s"} configured`
    : "No feeds configured";
  if (source === "manual") return settings.manualUrls.length
    ? `${settings.manualUrls.length} public page${settings.manualUrls.length === 1 ? "" : "s"} configured`
    : "No public pages configured";
  if (source === "youtube") return settings.youtubeEnabled ? "Enabled for this workspace" : "Not enabled";
  return "No genuine connector available";
}
