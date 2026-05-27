import { Chapter } from "@/components/Chapter";
import { SiteOutro } from "@/components/SiteOutro";
import { concepts } from "@/lib/concepts";
import Link from "next/link";

export default function AllConceptsPage() {
  return (
    <main className="relative">
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-10 py-5 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-accent mix-blend-difference">
        <Link href="/" className="hover:opacity-60 transition-opacity tabular">
          ← Back to dice
        </Link>
        <span className="text-muted tabular">All · 10</span>
      </nav>
      {concepts.map((c, i) => (
        <Chapter key={c.slug} concept={c} index={i} />
      ))}
      <SiteOutro />
    </main>
  );
}
