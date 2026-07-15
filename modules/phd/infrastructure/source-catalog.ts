import type { PositionSource } from "../domain/types";

// The legacy Python scraper informed the first three source definitions. The
// Cloudflare version intentionally keeps browser automation and credentials out
// of source adapters; each adapter must obey the source's access policy.
export const positionSources: PositionSource[] = [
  { id: "findaphd", label: "FindAPhD", discoveryMode: "worker-fetch", enabled: true, note: "Source contract mapped; live ingestion is Milestone 2" },
  { id: "euraxess", label: "EURAXESS", discoveryMode: "worker-fetch", enabled: true, note: "Source contract mapped; live ingestion is Milestone 2" },
  { id: "academic-positions", label: "Academic Positions", discoveryMode: "worker-fetch", enabled: true, note: "Source contract mapped; live ingestion is Milestone 2" },
  { id: "australian-universities", label: "Australian universities", discoveryMode: "worker-fetch", enabled: false, note: "University adapters arrive incrementally" },
  { id: "university-websites", label: "University websites", discoveryMode: "worker-fetch", enabled: false, note: "Per-domain adapters with rate limits" },
  { id: "research-portals", label: "Research portals", discoveryMode: "official-api", enabled: false, note: "Prefer official feeds and APIs" },
  { id: "linkedin", label: "LinkedIn", discoveryMode: "user-import", enabled: false, note: "Official integration or user-supplied links only" },
];

export interface PositionDiscoveryPort {
  readonly source: PositionSource["id"];
  discover(input: { keywords: string[]; countries: string[]; maxPages: number }): Promise<Array<Record<string, unknown>>>;
}
