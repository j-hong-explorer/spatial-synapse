import Image from "next/image";
import type { Concept } from "@/lib/concepts";
import { Reveal } from "./Reveal";

export function Chapter({ concept, index }: { concept: Concept; index: number }) {
  const num = String(index + 1).padStart(2, "0");
  const total = concept.images.length;

  // First image = cover. Next 4 = hero flow. Rest = grid.
  const cover = concept.images[0];
  const flow = concept.images.slice(1, 5);
  const rest = concept.images.slice(5);

  return (
    <section className="relative w-full" id={concept.slug}>
      {/* Cover — full-bleed first image with overlaid title */}
      <div className="relative h-[100svh] w-full overflow-hidden">
        <Image
          src={cover.src}
          alt={concept.title}
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/10" />
        <div className="absolute inset-0 flex flex-col justify-between p-6 md:p-10">
          <div className="flex items-baseline justify-between text-xs uppercase tracking-[0.3em] text-muted tabular">
            <span>Chapter · {num} / 10</span>
          </div>
          <div className="max-w-7xl mx-auto w-full">
            <Reveal>
              <h2 className="text-5xl md:text-8xl font-light tracking-tight text-accent leading-[0.95]">
                {concept.title}
              </h2>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-6 flex flex-wrap gap-2">
                {concept.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] uppercase tracking-widest border border-muted/40 text-muted px-3 py-1 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Brief — large readable typography */}
      {concept.brief && (
        <div className="px-6 md:px-10 py-24 md:py-40 max-w-4xl mx-auto">
          <Reveal slow>
            <p className="text-2xl md:text-4xl leading-[1.4] font-light text-accent/95 whitespace-pre-line">
              {concept.brief.replace(/^- /gm, "")}
            </p>
          </Reveal>
        </div>
      )}

      {/* Image flow — alternating offsets for rhythm */}
      <div className="space-y-24 md:space-y-40 px-6 md:px-10 pb-24 md:pb-40">
        {flow.map((img, i) => {
          const isWide = i % 2 === 0;
          return (
            <Reveal key={img.src} slow>
              <figure
                className={`mx-auto img-card ${
                  isWide ? "max-w-6xl" : "max-w-3xl md:ml-[20%]"
                }`}
              >
                <div
                  className="relative w-full"
                  style={{ aspectRatio: `${img.w} / ${img.h}` }}
                >
                  <Image
                    src={img.src}
                    alt={`${concept.title} ${i + 2}`}
                    fill
                    sizes={isWide ? "(max-width: 1280px) 100vw, 1280px" : "(max-width: 1280px) 80vw, 768px"}
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-3 text-[11px] uppercase tracking-widest text-muted tabular">
                  {String(i + 2).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </figcaption>
              </figure>
            </Reveal>
          );
        })}
      </div>

      {/* Statement */}
      {concept.statement && (
        <div className="px-6 md:px-10 py-24 md:py-40 border-t border-muted/15">
          <div className="max-w-4xl mx-auto">
            <Reveal>
              <p className="text-xs uppercase tracking-[0.3em] text-muted mb-6">
                Statement
              </p>
              <p className="text-xl md:text-2xl leading-[1.6] font-light text-accent/90 whitespace-pre-line">
                {concept.statement.split("\n-\n").join("\n\n— ")}
              </p>
            </Reveal>
          </div>
        </div>
      )}

      {/* Remaining thumbnail grid */}
      {rest.length > 0 && (
        <div className="px-6 md:px-10 pb-32 md:pb-48">
          <div className="max-w-7xl mx-auto">
            <Reveal>
              <p className="text-xs uppercase tracking-[0.3em] text-muted mb-8 tabular">
                Variations · {String(rest.length).padStart(2, "0")}
              </p>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {rest.map((img, i) => (
                <Reveal key={img.src} delay={(i % 4) * 60}>
                  <figure className="img-card">
                    <div
                      className="relative w-full overflow-hidden"
                      style={{ aspectRatio: `${img.w} / ${img.h}` }}
                    >
                      <Image
                        src={img.src}
                        alt={`${concept.title} ${i + 6}`}
                        fill
                        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                        className="object-cover"
                      />
                    </div>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
