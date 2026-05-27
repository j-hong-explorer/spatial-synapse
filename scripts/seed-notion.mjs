// One-shot migration: take the current data/concepts.json (built from obsidian)
// and create 40 corresponding pages in your Notion database, filled with text
// properties. Image fields (Cover/Gallery) are left empty — you upload images
// directly in Notion. Run this ONCE after creating the empty database.
//
//   node --env-file=.env.local scripts/seed-notion.mjs

import { Client } from '@notionhq/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONCEPTS_JSON = path.join(ROOT, 'data', 'concepts.json');

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DATABASE_ID;
if (!TOKEN || !DB_ID) {
  console.error('Missing NOTION_TOKEN or NOTION_DATABASE_ID in .env.local');
  process.exit(1);
}

const notion = new Client({ auth: TOKEN });

// Notion rich-text fields cap at 2000 chars per text run. Most concepts are
// well under, but split defensively just in case.
function richTextChunks(s) {
  if (!s) return [];
  const max = 1900;
  const out = [];
  for (let i = 0; i < s.length; i += max) {
    out.push({ type: 'text', text: { content: s.slice(i, i + max) } });
  }
  return out;
}

async function main() {
  const concepts = JSON.parse(await readFile(CONCEPTS_JSON, 'utf-8'));
  console.log(`→ Seeding ${concepts.length} concept(s) into Notion DB…\n`);

  // Pull existing slugs so we don't double-create on re-run
  const existing = new Set();
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const p of res.results) {
      const slugProp = p.properties?.Slug?.rich_text;
      const slug = Array.isArray(slugProp) ? slugProp.map(r => r.plain_text).join('') : '';
      if (slug) existing.add(slug);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  for (const c of concepts) {
    if (existing.has(c.slug)) {
      console.log(`= ${c.title} — already in DB, skipped`);
      continue;
    }
    // Legacy tone value (if present from older builds) becomes another tag
    const mergedTags = [...(c.tags || [])];
    if (c.tone && !mergedTags.includes(c.tone)) mergedTags.push(c.tone);
    try {
      await notion.pages.create({
        parent: { database_id: DB_ID },
        properties: {
          Title:     { title: [{ type: 'text', text: { content: c.title || '' } }] },
          Slug:      { rich_text: richTextChunks(c.slug || '') },
          Tags:      { multi_select: mergedTags.map(name => ({ name })) },
          Brief:     { rich_text: richTextChunks(c.brief || '') },
          Statement: { rich_text: richTextChunks(c.statement || '') },
          Published: { checkbox: true },
        },
      });
      console.log(`+ ${c.title}`);
    } catch (e) {
      console.warn(`! ${c.title} — ${e.message}`);
    }
  }

  console.log('\nDone. Now upload images to each row in Notion (Cover + Gallery fields).');
}

main().catch((e) => { console.error(e); process.exit(1); });
