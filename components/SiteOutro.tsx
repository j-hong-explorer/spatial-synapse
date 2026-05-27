import { concepts } from "@/lib/concepts";

export function SiteOutro() {
  return (
    <footer className="relative px-6 md:px-10 py-32 md:py-48 border-t border-muted/15">
      <div className="max-w-7xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-6 tabular">
          End — for now
        </p>
        <h3 className="text-3xl md:text-5xl font-light text-accent leading-[1.1] max-w-3xl">
          하나의 단상에서 시작해, 이미지가 생각을 마중 나오는 작업.
        </h3>
        <div className="mt-16 grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2 text-sm">
          {concepts.map((c, i) => (
            <a
              key={c.slug}
              href={`#${c.slug}`}
              className="block text-muted hover:text-accent transition-colors py-1 tabular"
            >
              <span className="text-xs">{String(i + 1).padStart(2, "0")}</span>{" "}
              {c.title}
            </a>
          ))}
        </div>
        <p className="mt-24 text-xs uppercase tracking-[0.3em] text-muted/50 tabular">
          © Jea Hong · 합정짱돌
        </p>
      </div>
    </footer>
  );
}
