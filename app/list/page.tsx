import Link from "next/link";
import { concepts } from "@/lib/concepts";
import { ModeTabs } from "@/components/ModeTabs";
import { getAllViews } from "@/lib/views";

// Recompute the order every minute so popular concepts bubble to the top
// without needing a redeploy.
export const revalidate = 60;

export default async function ListPage() {
  const views = await getAllViews();
  const ordered = [...concepts].sort((a, b) => {
    const va = views[a.slug] ?? 0;
    const vb = views[b.slug] ?? 0;
    if (vb !== va) return vb - va;
    // Stable fallback when counts tie (esp. when no views recorded yet)
    return concepts.indexOf(a) - concepts.indexOf(b);
  });
  return (
    <main className="relative min-h-[100svh] bg-bg">
      <header className="sticky top-0 z-30 px-5 md:px-10 py-4 md:py-5 bg-bg/80 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-0">
          <div>
            <div className="tabular text-[10px] md:text-xs uppercase tracking-[0.18em] md:tracking-[0.2em] text-muted">
              Spatial Synapse<span className="md:hidden"><br />by Jaehong Park</span><span className="hidden md:inline"> by Jaehong Park</span>
            </div>
            <p className="mt-1.5 text-[10px] md:text-[11px] text-muted/55 leading-snug max-w-[270px] md:max-w-md break-keep">
              AI로 정리하는 내 머릿속 공간 아이디어 아카이브
            </p>
          </div>
          <ModeTabs />
        </div>
      </header>

      <div className="px-5 md:px-10 pt-10 md:pt-16 pb-32">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-muted/70 tabular mb-8 md:mb-12">
            {concepts.length} concepts · sorted by views
          </p>
          <ul className="divide-y divide-muted/15">
            {ordered.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/c/${c.slug}?from=list`}
                  className="block py-6 md:py-8 group transition-colors"
                >
                  <h2 className="text-xl md:text-3xl font-light text-accent group-hover:text-accent/60 transition-colors leading-tight mb-2">
                    {c.title}
                  </h2>
                  {c.tags.length > 0 && (
                    <p className="text-[10px] md:text-xs uppercase tracking-[0.18em] text-muted/80 tabular">
                      {c.tags.join("  ·  ")}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
