// Reads 10 selected obsidian markdown notes, parses them,
// and copies their referenced images into public/images/<slug>/.
// Outputs data/concepts.json consumed by the app.

import { readFile, readdir, mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NOTES_DIR = '/Users/j._.hong_/Library/Mobile Documents/iCloud~md~obsidian/Documents/합정짱돌/1. Projects/생성형 AI/생성형 AI 아카이브';
const IMAGES_DIR = '/Users/j._.hong_/Library/CloudStorage/GoogleDrive-jeahong0754@gmail.com/내 드라이브/Archive_01_개인/작업/2023~_생성형 ai 작업_이미지 아카이브';

const PUBLIC_IMAGES = path.join(ROOT, 'public', 'images');
const OUT_JSON = path.join(ROOT, 'data', 'concepts.json');

const CONCEPTS = [
  { folder: '240124_소라게 하우스',                slug: 'sorage-house',     title: '소라게 하우스',           subtitle: 'Hermit-crab House',       tone: 'curve' },
  { folder: '240118_과대포장 구조',                slug: 'overpackaging',    title: '과대포장 구조',           subtitle: 'Overpackaged Architecture', tone: 'soft' },
  { folder: '240202_텍스타일 방수 외장재',         slug: 'textile-facade',   title: '텍스타일 방수 외장재',    subtitle: 'Textile Waterproof Skin', tone: 'fabric' },
  { folder: '240930_카라비너, 쇠사슬 파사드',      slug: 'carabiner-facade', title: '카라비너 파사드',         subtitle: 'Carabiner Facade',        tone: 'metal' },
  { folder: '240105_스피커 하우스',                slug: 'speaker-house',    title: '스피커 하우스',           subtitle: 'Speaker House',           tone: 'sound' },
  { folder: '250719_척추뼈 가구',                  slug: 'spine-furniture',  title: '척추뼈 가구',             subtitle: 'Spine Furniture',         tone: 'organic' },
  { folder: '240106_탕후루 체어',                  slug: 'tanghulu-chair',   title: '탕후루 체어',             subtitle: 'Tanghulu Chair',          tone: 'sweet' },
  { folder: '240127_심해 가구',                    slug: 'deepsea',          title: '심해 가구',               subtitle: 'Deep-Sea Furniture',      tone: 'mystery' },
  { folder: '240728_젤리 폼 체어',                 slug: 'jelly-foam',       title: '젤리 폼 체어',            subtitle: 'Jelly Foam Chair',        tone: 'jelly' },
  { folder: '241102_샌드위치 체어',                slug: 'sandwich-chair',   title: '샌드위치 체어',           subtitle: 'Sandwich Chair',          tone: 'layer' },

  // — Expanded set (30 more) —
  { folder: '240101_스피커 문',                                       slug: 'speaker-door',       title: '스피커 문',           subtitle: 'Speaker Door',           tone: 'sound' },
  { folder: '241014_스포츠 + 공간, 가구',                              slug: 'sports-fusion',      title: '스포츠 + 공간, 가구',  subtitle: 'Sports Fusion',          tone: 'play' },
  { folder: '240402_종이 스피커',                                     slug: 'paper-speaker',      title: '종이 스피커',          subtitle: 'Paper Speaker',          tone: 'sound' },
  { folder: '240916_탱크 협탁을 만들다 나온 부산물들',                  slug: 'tank-byproducts',    title: '탱크 협탁 부산물',     subtitle: 'Tank Side By-products',  tone: 'metal' },
  { folder: '240527_스케이트보드 파크에서 휴식',                        slug: 'skate-rest',         title: '스케이트보드 파크',    subtitle: 'Skate Park Rest',        tone: 'play' },
  { folder: '231214_물결같은 패브릭 바닥',                              slug: 'fabric-floor',       title: '물결 패브릭 바닥',     subtitle: 'Wavy Fabric Floor',      tone: 'fabric' },
  { folder: '250225_식물 데리고 다니기',                                slug: 'plant-companion',    title: '식물 데리고 다니기',   subtitle: 'Plant Companion',        tone: 'nature' },
  { folder: '250223_니트 안경',                                       slug: 'knit-glasses',       title: '니트 안경',            subtitle: 'Knit Glasses',           tone: 'fabric' },
  { folder: '241009_계단 복합 가구',                                   slug: 'stair-furniture',    title: '계단 복합 가구',       subtitle: 'Stair Furniture',        tone: 'form' },
  { folder: '240415_취미 돛단배 체어',                                 slug: 'sailboat-chair',     title: '돛단배 체어',          subtitle: 'Sailboat Hobby Chair',   tone: 'leisure' },
  { folder: '240121_와플대학 사옥',                                   slug: 'waffle-hq',          title: '와플대학 사옥',        subtitle: 'Waffle University HQ',   tone: 'form' },
  { folder: '250518_의자에 옷을 디스플레이 하려다 발견한 부산물들',        slug: 'garment-display',    title: '옷 디스플레이 부산물', subtitle: 'Garment Display By-products', tone: 'curve' },
  { folder: '250106_과자의 집',                                       slug: 'sweets-house',       title: '과자의 집',            subtitle: 'Sweets House',           tone: 'food' },
  { folder: '240223_좌석 형태가 다양한 영화관',                         slug: 'flexible-cinema',    title: '형태가 다양한 영화관', subtitle: 'Flexible Cinema',        tone: 'soft' },
  { folder: '240225_거미줄 체어',                                     slug: 'spiderweb-chair',    title: '거미줄 체어',          subtitle: 'Spiderweb Chair',        tone: 'organic' },
  { folder: '241024_식물 의자',                                       slug: 'plant-chair',        title: '식물 의자',            subtitle: 'Living Plant Chair',     tone: 'nature' },
  { folder: '240907_롤러코스터 체어',                                  slug: 'rollercoaster-chair', title: '롤러코스터 체어',     subtitle: 'Rollercoaster Chair',    tone: 'play' },
  { folder: '240609_패딩체어(re)',                                    slug: 'puffer-chair',       title: '패딩 체어 (re)',       subtitle: 'Puffer Chair Mark II',   tone: 'soft' },
  { folder: '240406_지하철 팝업',                                     slug: 'subway-popup',       title: '지하철 팝업',          subtitle: 'Subway Popup',           tone: 'popup' },
  { folder: '240302_도심 속의 클라이밍 놀이터',                         slug: 'climbing-plaza',     title: '도심 클라이밍 놀이터', subtitle: 'Climbing Plaza',         tone: 'play' },
  { folder: '250127_건축물 굽기',                                     slug: 'baked-architecture', title: '건축물 굽기',          subtitle: 'Baked Architecture',     tone: 'curve' },
  { folder: '250204_계단 조형 스터디',                                 slug: 'stair-study',        title: '계단 조형 스터디',     subtitle: 'Stair Form Studies',     tone: 'form' },
  { folder: '250131_반려 조명',                                       slug: 'companion-light',    title: '반려 조명',            subtitle: 'Companion Light',        tone: 'quiet' },
  { folder: '240512_성장하는 3D 프린터 자연 건축',                       slug: 'growing-architecture', title: '성장하는 자연 건축', subtitle: 'Growing Architecture',   tone: 'nature' },
  { folder: '240331_안마의자 + 스피커 + 방귀 방음',                     slug: 'massage-throne',     title: '안마의자 + 스피커',    subtitle: 'Massage Throne',         tone: 'humor' },
  { folder: '231002_어른이 만든 놀이터',                                slug: 'adults-playground',  title: '어른이 만든 놀이터',   subtitle: "Adults' Playground",     tone: 'play' },
  { folder: '250508_스테인리스스틸 파이프를 구부리다 나온 부산물들',      slug: 'steel-pipe-byproducts', title: '스틸 파이프 부산물',  subtitle: 'Bent Steel By-products', tone: 'metal' },
  { folder: '250207_나전칠기 킨츠키',                                  slug: 'najeon-kintsugi',    title: '나전칠기 킨츠키',      subtitle: 'Najeon Kintsugi',        tone: 'craft' },
  { folder: '240925_바우하우스체어 업사이클',                           slug: 'bauhaus-upcycle',    title: '바우하우스 업사이클',  subtitle: 'Bauhaus Recycled',       tone: 'craft' },
  { folder: '240204_높낮이 조절 도르래 체어',                          slug: 'pulley-chair',       title: '도르래 체어',          subtitle: 'Pulley-adjustable Chair', tone: 'metal' },
];

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { tags: [], body: md };
  const fm = m[1];
  const tags = [];
  const lines = fm.split('\n');
  let inTags = false;
  for (const line of lines) {
    if (/^tags:/.test(line)) { inTags = true; continue; }
    if (inTags) {
      const t = line.match(/^\s*-\s*(.+?)\s*$/);
      if (t) tags.push(t[1]);
      else if (/^\S/.test(line)) inTags = false;
    }
  }
  return { tags, body: md.slice(m[0].length) };
}

function extractImages(body) {
  const out = [];
  const re = /!\[\[([^\]]+?)\]\]/g;
  let m;
  while ((m = re.exec(body))) out.push(m[1].trim());
  return out;
}

function cleanText(s) {
  return s
    .replace(/!\[\[[^\]]+\]\]/g, '')        // remove image embeds
    .replace(/^Imagination using AI\.\s*\d+\s*$/gim, '') // strip series footer
    .replace(/[ \t]+$/gm, '')                 // trim trailing spaces
    .replace(/\n{3,}/g, '\n\n')              // collapse blank lines
    .trim();
}

function extractSections(body) {
  // Split on horizontal rules in any common form: "---", "- ---", "----"
  const segments = body
    .split(/^\s*-?\s*-{3,}\s*$/m)
    .map(cleanText)
    .filter(Boolean);

  // First non-empty segment = brief (bullet ideas / initial thinking)
  // Second non-empty segment = statement (refined description + prompt)
  const brief = segments[0] ?? '';
  const statement = segments.slice(1).join('\n\n');
  return { brief, statement };
}

async function main() {
  await mkdir(PUBLIC_IMAGES, { recursive: true });
  await mkdir(path.dirname(OUT_JSON), { recursive: true });

  const concepts = [];

  for (const concept of CONCEPTS) {
    try {
    const notePath = path.join(NOTES_DIR, `${concept.folder}.md`);
    const imgFolder = path.join(IMAGES_DIR, concept.folder);

    const md = await readFile(notePath, 'utf-8');
    const { tags, body } = parseFrontmatter(md);
    const { brief, statement } = extractSections(body);
    const embedded = extractImages(body);

    // Use all images present in folder, sorted; prefer embedded order if available.
    const folderFiles = (await readdir(imgFolder)).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
    const ordered = [
      ...embedded.filter(f => folderFiles.includes(f)),
      ...folderFiles.filter(f => !embedded.includes(f)),
    ];

    const destDir = path.join(PUBLIC_IMAGES, concept.slug);
    await mkdir(destDir, { recursive: true });

    const copied = [];
    for (let i = 0; i < ordered.length; i++) {
      const src = path.join(imgFolder, ordered[i]);
      const ext = path.extname(ordered[i]).toLowerCase();
      const destName = `${String(i + 1).padStart(2, '0')}${ext}`;
      const dest = path.join(destDir, destName);
      if (!existsSync(dest)) await copyFile(src, dest);
      const meta = await sharp(dest).metadata();
      copied.push({
        src: `/images/${concept.slug}/${destName}`,
        w: meta.width ?? 1024,
        h: meta.height ?? 1024,
      });
    }

    concepts.push({
      slug: concept.slug,
      title: concept.title,
      subtitle: concept.subtitle,
      date: concept.folder.slice(0, 6),
      tone: concept.tone,
      tags,
      brief,
      statement,
      images: copied,
    });

    console.log(`✓ ${concept.title} — ${copied.length} images`);
    } catch (e) {
      console.warn(`✗ ${concept.title} — skipped (${e.message})`);
    }
  }

  await writeFile(OUT_JSON, JSON.stringify(concepts, null, 2), 'utf-8');
  console.log(`\nWrote ${OUT_JSON}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
