import data from "@/data/concepts.json";

export type ConceptImage = { src: string; w: number; h: number };
export type Concept = {
  slug: string;
  title: string;
  tags: string[];
  brief: string;
  statement: string;
  images: ConceptImage[];
};

// concepts.json may still carry legacy fields (subtitle/date/tone) from older
// builds. We strip those at the type boundary so the rest of the app only sees
// the simplified schema.
type RawConcept = Concept & Partial<{ subtitle: string; date: string; tone: string }>;
export const concepts: Concept[] = (data as RawConcept[]).map((c) => ({
  slug: c.slug,
  title: c.title,
  tags: c.tags ?? [],
  brief: c.brief ?? "",
  statement: c.statement ?? "",
  images: c.images ?? [],
}));
