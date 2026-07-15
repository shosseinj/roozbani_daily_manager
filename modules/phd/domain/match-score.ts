import type { MatchBreakdown } from "./types";

type CandidateProfile = {
  researchInterests: string[];
  skills: string[];
  educationSummary: string;
};

type MatchablePosition = {
  title: string;
  researchArea: string;
  description?: string | null;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();

function keywordHits(haystack: string, needles: string[]) {
  const normalized = normalize(haystack);
  return needles.filter((needle) => normalized.includes(normalize(needle)));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scorePosition(profile: CandidateProfile, position: MatchablePosition): MatchBreakdown {
  const text = `${position.title} ${position.researchArea} ${position.description || ""}`;
  const researchHits = keywordHits(text, profile.researchInterests);
  const skillHits = keywordHits(text, profile.skills);
  const medicalTrack = /medical|health|clinical|imaging|cancer/i.test(text);
  const visionTrack = /vision|image|transformer|segmentation|detection/i.test(text);

  const research = clamp(48 + researchHits.length * 10 + (medicalTrack ? 8 : 0) + (visionTrack ? 6 : 0));
  const publications = clamp(54 + (medicalTrack ? 20 : 4) + (visionTrack ? 14 : 0));
  const skills = clamp(45 + skillHits.length * 9 + (visionTrack ? 8 : 0));
  const education = clamp(/m\.sc|master|electrical|computer/i.test(profile.educationSummary) ? 84 : 68);
  const overall = clamp(research * 0.35 + publications * 0.2 + skills * 0.3 + education * 0.15);
  const strengths = [...new Set([...researchHits.slice(0, 3), ...skillHits.slice(0, 3)])];
  const gaps = [
    !/foundation model|vision.language|llm/i.test(text) ? "Evidence of recent foundation-model work" : "A position-specific foundation-model case study",
    "A concise research pitch tailored to this lab",
  ];

  return {
    research,
    publications,
    skills,
    education,
    overall,
    explanation: `${researchHits.length || "No explicit"} research-interest overlaps and ${skillHits.length || "no explicit"} skill overlaps were found. The score favors medical-imaging and computer-vision evidence, then adjusts for the education requirement.`,
    strengths: strengths.length ? strengths : ["Transferable machine-learning background", "Research-oriented education"],
    gaps,
  };
}
