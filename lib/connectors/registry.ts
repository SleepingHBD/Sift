import { radarConnectors } from "@/lib/radar/connectors";

export const connectorDescriptors = radarConnectors;

export function isConnectorImplemented(source: string) {
  return ["rss", "manual", "youtube"].includes(source);
}
