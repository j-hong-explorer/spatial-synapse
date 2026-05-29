import { notFound } from "next/navigation";
import Image from "next/image";
import { Fragment, Suspense } from "react";
import { ViewTransition } from "react";
import { concepts } from "@/lib/concepts";
import { Reveal } from "@/components/Reveal";
import { BackLink } from "@/components/BackLink";
import { ViewBumper } from "@/components/ViewBumper";

export function generateStaticParams() {
  return concepts.map((c) => ({ slug: c.slug }));
}

export default async function ConceptPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const concept = concepts.find((c) => c.slug === slug);
  if (!concept) notFound();

  const cover = concept.images[0];
  // All non-cover images flow in a single column at unified width.
  const flowImages = concept.images.slice(1);

  return (
    <main className="relative">
      {/* Fixed back link — text/destination depends on whether the user came
          from Brain or Dice. Wrapped in Suspense because useSearchParams() is
          a dynamic API and would otherwise opt the whole page out of SSG. */}
      <Suspense fallback={null}>
        <BackLink />
      </Suspense>

      {/* Bumps the view count for this slug once on mount. Silent. */}
      <ViewBumper slug={concept.slug} />

      {/* Cover */}
      <section className="relative h-[100svh] w-full overflow-hidden">
        <ViewTransition name={`cover-${concept.slug}`}>
          <div className="absolute inset-0">
            <Image
              src={cover.src}
              alt={concept.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
        </ViewTransition>
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/10" />
        {/* Text container gets its OWN view-transition-name so it stacks above
            the cover snapshot during the transition — text stays visible from
            frame zero instead of being hidden under the morphing cover image. */}
        <div
          className="absolute inset-0 flex flex-col justify-end p-6 md:p-10 pb-24 md:pb-32"
          style={{ viewTransitionName: "detail-meta" }}
        >
          <div className="max-w-4xl mx-auto w-full">
            <h1 className="text-[2.7rem] md:text-[5.4rem] font-light tracking-tight text-accent leading-[1.05] break-keep">
              {concept.title}
            </h1>
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
          </div>
        </div>
      </section>

      {/* Brief */}
      {concept.brief && (
        <div className="px-5 md:px-8 py-20 md:py-32">
          <div className="max-w-4xl mx-auto">
            <Reveal slow>
              <p className="text-[1.125rem] md:text-[1.6875rem] leading-[1.55] font-light text-accent/95 whitespace-pre-line break-keep">
                {concept.brief.replace(/^- /gm, "")}
              </p>
            </Reveal>
          </div>
        </div>
      )}

      {/* Image flow with Statement interleaved after the 2nd flow image */}
      <div className="space-y-16 md:space-y-24 px-5 md:px-8 pb-24 md:pb-40">
        {flowImages.map((img, i) => (
          <Fragment key={img.src}>
            <Reveal slow>
              <figure className="img-card max-w-4xl mx-auto">
                <div
                  className="relative w-full overflow-hidden"
                  style={{ aspectRatio: `${img.w} / ${img.h}` }}
                >
                  <Image
                    src={img.src}
                    alt={`${concept.title} ${i + 2}`}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 896px"
                    className="object-cover"
                  />
                </div>
              </figure>
            </Reveal>

            {/* Statement appears after the 2nd flow image (= 3rd image overall) */}
            {i === 1 && concept.statement && (
              <Reveal slow>
                <div className="max-w-4xl mx-auto py-8 md:py-16">
                  <p className="text-[1.0125rem] md:text-[1.35rem] leading-[1.65] font-light text-accent/90 whitespace-pre-line break-keep">
                    {concept.statement.split("\n-\n").join("\n\n— ")}
                  </p>
                </div>
              </Reveal>
            )}
          </Fragment>
        ))}

        {/* Statement fallback if there are fewer than 2 flow images */}
        {flowImages.length < 2 && concept.statement && (
          <Reveal slow>
            <div className="max-w-4xl mx-auto py-8 md:py-16">
              <p className="text-lg md:text-2xl leading-[1.6] font-light text-accent/90 whitespace-pre-line">
                {concept.statement.split("\n-\n").join("\n\n— ")}
              </p>
            </div>
          </Reveal>
        )}
      </div>
    </main>
  );
}
