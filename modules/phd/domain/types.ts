export type PositionSourceId =
  | "findaphd"
  | "euraxess"
  | "academic-positions"
  | "australian-universities"
  | "university-websites"
  | "research-portals"
  | "linkedin"
  | "manual"
  | "sample";

export type FundingStatus = "funded" | "partially-funded" | "self-funded" | "unknown";
export type ApplicationStatus = "shortlisted" | "preparing" | "contacted" | "applied" | "interview" | "offer" | "rejected";

export type MatchBreakdown = {
  research: number;
  publications: number;
  skills: number;
  education: number;
  overall: number;
  explanation: string;
  strengths: string[];
  gaps: string[];
};

export type PositionRecord = {
  id: string;
  source: PositionSourceId | string;
  title: string;
  university: string;
  professor: string | null;
  country: string;
  city: string | null;
  research_area: string;
  description: string | null;
  url: string | null;
  funding_status: FundingStatus | string;
  scholarship: number | boolean;
  funding_amount: string | null;
  deadline: string | null;
  status: string;
  is_demo: number | boolean;
  match: MatchBreakdown;
  application_id: string | null;
  application_status: ApplicationStatus | null;
};

export type PositionSource = {
  id: PositionSourceId;
  label: string;
  discoveryMode: "worker-fetch" | "official-api" | "user-import";
  enabled: boolean;
  note: string;
};

export type JourneySuggestion = {
  id: string;
  title: string;
  description: string;
  area: "Research" | "English" | "Documents" | "Relocation";
  durationMinutes: number;
  suggestedDate: string;
  suggestedTime: string;
};
