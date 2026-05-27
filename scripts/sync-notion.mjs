// Pull concepts from a Notion database, download + compress images,
// and write data/concepts.json in the same shape the site already consumes.
//
// Required env (.env.local):
//   NOTION_TOKEN        — Internal integration secret
//   NOTION_DATABASE_ID  — Database to read from
//
// Notion DB schema (property names must match):
//   Title       (title)
//   Slug        (rich_text)        — URL slug e.g. "sorage-house"
//   Tags        (multi_select)     — connection basis for the graph
//   Brief       (rich_text)        — initial idea bullets
//   Statement   (rich_text)        — polished description
//   Cover       (files)            — single cover image (used in the graph)
//   Gallery     (files)            — additional images for the detail page
//   Published   (checkbox)         — only rows where Published is true are synced

import { Client } from '@notionhq/client';
import sharp from 'sharp';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env.local if it exists (local dev). On Vercel the env vars are already
// injected into process.env, so this just no-ops.
try { process.loadEnvFile('.env.local'); } catch { /* file missing — ignore */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_IMAGES = path.join(ROOT, 'public', 'images');
const OUT_JSON = path.join(ROOT, 'data', 'concepts.json');

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;
if (!TOKEN || !DB_ID) {
  console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID in .env.local');
  process.exit(1);
}

const notion = new Client({ auth: TOKEN });

// ─────────────────────────────────────────────────────────
// Notion property helpers
// ─────────────────────────────────────────────────────────

function plainText(rich) {
  if (!Array.isArray(rich)) return '';
  return rich.map((r) => r.plain_text).join('').trim();
}

function fileUrls(filesProp) {
  if (!filesProp || !Array.isArray(filesProp.files)) return [];
  // Notion files can be "file" (hosted on Notion S3, 1h expiry) or "external" (any URL)
  return filesProp.files
    .map((f) => (f.type === 'file' ? f.file?.url : f.external?.url))
    .filter(Boolean);
}

function parseConcept(page) {
  const p = page.properties;
  const slug = plainText(p.Slug?.rich_text);
  const title = plainText(p.Title?.title);
  return {
    slug,
    title,
    tags: (p.Tags?.multi_select ?? []).map((t) => t.name),
    brief: plainText(p.Brief?.rich_text),
    statement: plainText(p.Statement?.rich_text),
    coverUrls: fileUrls(p.Cover),
    galleryUrls: fileUrls(p.Gallery),
  };
}

// ─────────────────────────────────────────────────────────
// Image pipeline: download → resize → webp → save
// ─────────────────────────────────────────────────────────

async function downloadAndCompress(url, destPath, maxWidth, quality) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const pipeline = sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality });
  const meta = await pipeline.metadata();
  await pipeline.toFile(destPath);
  // Re-read final metadata to get post-resize dimensions
  const final = await sharp(destPath).metadata();
  return {
    src: destPath.replace(path.join(ROOT, 'public'), '').split(path.sep).join('/'),
    w: final.width ?? meta.width ?? maxWidth,
    h: final.height ?? meta.height ?? maxWidth,
  };
}

async function processConceptImages(c) {
  const destDir = path.join(PUBLIC_IMAGES, c.slug);
  await mkdir(destDir, { recursive: true });

  // Combine cover + gallery, cover first so it's images[0]
  const allUrls = [...c.coverUrls, ...c.galleryUrls];
  if (allUrls.length === 0) {
    console.warn(`  ! ${c.title}: no images in Notion`);
    return [];
  }

  const out = [];
  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    const isCover = i === 0; // first image is the cover (used in graph nodes)
    const destName = `${String(i + 1).padStart(2, '0')}.webp`;
    const destPath = path.join(destDir, destName);
    try {
      const info = await downloadAndCompress(
        url,
        destPath,
        isCover ? 900 : 1600,   // smaller for cover (graph thumb), larger for gallery
        isCover ? 78 : 82
      );
      out.push(info);
    } catch (e) {
      console.warn(`  ! ${c.title} image ${i + 1}: ${e.message}`);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function resolveDataSourceId() {
  // In Notion SDK v5+, queries hit data sources, not databases.
  // Treat NOTION_DATABASE_ID as a database id; pull its first data source id.
  const db = await notion.databases.retrieve({ database_id: DB_ID });
  const dsId = db?.data_sources?.[0]?.id;
  if (!dsId) throw new Error('Database has no data source. Check NOTION_DATABASE_ID.');
  return dsId;
}

async function queryAllPages() {
  const dsId = await resolveDataSourceId();
  const pages = [];
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: dsId,
      start_cursor: cursor,
      page_size: 100,
      filter: {
        property: 'Published',
        checkbox: { equals: true },
      },
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function main() {
  console.log('→ Querying Notion database…');
  const pages = await queryAllPages();
  console.log(`  Found ${pages.length} published concept(s).\n`);

  if (pages.length === 0) {
    console.warn('No published concepts found. Make sure rows have Published = true and the integration has access to the database.');
    return;
  }

  await mkdir(PUBLIC_IMAGES, { recursive: true });
  await mkdir(path.dirname(OUT_JSON), { recursive: true });

  const concepts = [];
  for (const page of pages) {
    const raw = parseConcept(page);
    if (!raw.slug) {
      console.warn(`  ! Skipping page "${raw.title || page.id}" — missing Slug`);
      continue;
    }
    console.log(`✓ ${raw.title}`);
    // Clear any stale images for this slug, then re-download fresh ones
    const destDir = path.join(PUBLIC_IMAGES, raw.slug);
    if (existsSync(destDir)) await rm(destDir, { recursive: true, force: true });
    const images = await processConceptImages(raw);
    concepts.push({
      slug: raw.slug,
      title: raw.title,
      tags: raw.tags,
      brief: raw.brief,
      statement: raw.statement,
      images,
    });
  }

  await writeFile(OUT_JSON, JSON.stringify(concepts, null, 2), 'utf-8');
  console.log(`\nWrote ${OUT_JSON} (${concepts.length} concepts)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
