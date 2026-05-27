import Image from "next/image";
import { concepts } from "@/lib/concepts";

const HERO_PICKS = [
  "spine-furniture",
  "deepsea",
  "carabiner-facade",
  "sorage-house",
  "jelly-foam",
  "textile-facade",
];

export function SiteHero() {
  const featured = HERO_PICKS
    .map((s) => concepts.find((c) => c.slug === s))
    .filter(Boolean)
    .map((c) => c!.images[0]);

  return (
    <section className="relative w-full">
      {/* Title screen */}
      <div className="relative h-[100svh] w-full overflow-hidden flex items-end">
        {/* Background marquee strip of teaser images */}
        <div className="absolute inset-0 grid grid-cols-3 md:grid-cols-6 gap-1 opacity-40">
          {featured.map((img, i) => (
            <div key={i} className="relative h-full">
              <Image
                src={img.src}
                alt=""
                fill
                priority={i < 3}
                sizes="(max-width: 768px) 33vw, 16vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/10 to-bg" />

        <div className="relative w-full px-6 md:px-10 pb-16 md:pb-24">
          <div className="max-w-7xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-muted mb-4 tabular">
              Imagination Archive · 2023 — Now
            </p>
            <h1 className="text-5xl md:text-8xl font-light leading-[0.95] tracking-tight text-accent">
              <span className="block">Imagination</span>
              <span className="block italic font-extralight">using AI.</span>
            </h1>
            <p className="mt-6 md:mt-10 max-w-xl text-base md:text-lg text-muted leading-relaxed">
              생성형 AI로 그려본 공간과 가구의 단상들.
              <br className="hidden md:block" />
              하나의 컨셉이 떠오르면, 이미지가 그 생각을 마중 나옵니다.
            </p>
            <div className="mt-12 flex items-baseline gap-6 text-xs uppercase tracking-[0.2em] text-muted tabular">
              <span>10 concepts selected</span>
              <span aria-hidden>·</span>
              <span>scroll ↓</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
