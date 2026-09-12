// scripts/fetch-sections.js
// This script fetches page definitions and component data from Google Sheets,
// generates individual page MDX files, and builds a clean pages.mdx catalog.

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
//Alifi-Master rafi
// const SPREADSHEET_URL ='https://docs.google.com/spreadsheets/d/1amHL7CCi2BrF-c2bG5Cn1OVEko56hDcBhi_0JNtVWeA/gviz/tq?tqx=out:csv&headers=1&sheet=';

// DubaiPropertyHelp
// const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1ehYTW5l1msJiilmIhLsVLzZj1dalM9rgdJgZbLnJabg/gviz/tq?tqx=out:csv&headers=1&sheet=';

//Oblam - Live
//const SPREADSHEET_URL ='https://docs.google.com/spreadsheets/d/1tRhWbztAGOguDr9m7y5PY6Nd7sNbrY7KymdmwTtM_OM/gviz/tq?tqx=out:csv&headers=1&sheet=';

//Catania-Live
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1K6CvWpVUTIBUSJxATtFItm8ylNyBszEna3FOU7-hWsY/gviz/tq?tqx=out:csv&headers=1&sheet=';

// Steelcraft
// const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1uQ4keF8hCwyaVbOZq3KLoypsMmBu-9khaLk_TcNfONc/gviz/tq?tqx=out:csv&sheet=';

// const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1Y1MwOd7_6Hp3k06UmU2AuQTn777uZkqusfmVuRVrrk0/gviz/tq?tqx=out:csv&sheet=';

// Convert header strings like "Sub-Title" to camelCase "subTitle".
function toCamelCase(str) {
  if (!str) return '';
  const clean = str.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
  if (!clean) return '';
  return clean
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

// Fetch a single sheet (CSV) and return an array of records
// Fetch a single sheet (CSV) and return an array of records
async function fetchSheet(sheetName) {
  console.log(`Fetching sheet: ${sheetName}...`);

  const namesToTry = [
    sheetName,
    sheetName.toLowerCase(),
    sheetName.endsWith('s') ? sheetName.slice(0, -1) : `${sheetName}s`,
    (sheetName.endsWith('s') ? sheetName.slice(0, -1) : `${sheetName}s`).toLowerCase(),
  ];

  // Remove duplicates while maintaining order
  const uniqueNames = [...new Set(namesToTry)];

  for (const name of uniqueNames) {
    let encoded = encodeURIComponent(name);
    let response = await fetch(`${SPREADSHEET_URL}${encoded}`);

    if (response.ok) {
      const csvData = await response.text();
      const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      });

      // Google Sheets returns the first sheet (e.g. Hero) if the requested sheet tab does NOT exist.
      // If we requested a collection sheet (e.g., "Commercial Kitchen") but got back the "Hero" sheet headers
      // (which have "Component" and "Section" columns instead of "Slug" or "Category"), continue trying next candidate!
      if (records.length > 0) {
        const sampleKeys = Object.keys(records[0]).map(k => k.trim().toLowerCase());
        const isHeroOrComponentSheet = sampleKeys.includes('Component') && sampleKeys.includes('Section');
        const isRequestingComponentSheet = ['Sections', 'text', '3column', 'testimonial', 'imagegrid', 'pages', 'settings'].includes(name.toLowerCase());

        if (isHeroOrComponentSheet && !isRequestingComponentSheet) {
          console.log(`  -> Sheet tab '${name}' was redirected by Google Sheets to default tab. Trying next candidate...`);
          continue;
        }
      }

      return records;
    }
  }

  throw new Error(`Failed to fetch sheet '${sheetName}' from Google Sheets.`);
}

function escapeYamlString(val) {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
}

// Convert a page definition row into a one‑line entry for the pages catalog
function formatPage(page) {
  const lines = [];
  if (page['Publish']) lines.push(`publish: "${escapeYamlString(page['Publish'])}"`);
  if (page['Order']) lines.push(`order: "${escapeYamlString(page['Order'])}"`);
  lines.push(`name: "${escapeYamlString(page['Name'])}"`);
  lines.push(`slug: "${escapeYamlString(page['Slug'])}"`);
  if (page['Menu-Name']) lines.push(`menuName: "${escapeYamlString(page['Menu-Name'])}"`);
  if (page['Sections']) lines.push(`sections: "${escapeYamlString(page['Sections'])}"`);
  if (page['Meta-Title']) lines.push(`metaTitle: "${escapeYamlString(page['Meta-Title'])}"`);
  if (page['Meta-Description'])
    lines.push(`metaDescription: "${escapeYamlString(page['Meta-Description'])}"`);
  // Prefix hyphen to the first line and indent the rest.
  if (lines.length) {
    lines[0] = `- ${lines[0]}`;
  }
  return lines.map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');
}

// Main workflow
async function main() {
  try {
    // Ensure the content folder exists and clean up old content before fetching fresh data.
    const contentFolder = path.join(process.cwd(), 'src', 'content');
    if (!fs.existsSync(contentFolder)) {
      fs.mkdirSync(contentFolder, { recursive: true });
    } else {
      const existing = fs.readdirSync(contentFolder);
      for (const item of existing) {
        if (item === '.gitkeep') continue;
        const itemPath = path.join(contentFolder, item);
        fs.rmSync(itemPath, { recursive: true, force: true });
      }
      console.log('🧹 Cleaned up src/content directory before fetching latest data.');
    }

    // 1️⃣ Fetch Settings first to populate dynamic tabs
    let COMPONENT_TABS = [];
    let settings = [];
    try {
      settings = await fetchSheet('Settings');
    } catch (err) {
      try {
        settings = await fetchSheet('Setting');
      } catch (err2) {
        console.warn('⚠️ Unable to fetch Settings or Setting sheet. Using default tabs.');
      }
    }

    if (settings && settings.length > 0) {
      const settingsRow = settings[0];
      const tabsVal = settingsRow['Tabs'] || settingsRow['tabs'] || '';
      if (tabsVal) {
        COMPONENT_TABS = tabsVal.split(',').map(t => t.trim()).filter(Boolean);
        // Ensure component tabs are unique to avoid duplicate content generation
        COMPONENT_TABS = [...new Set(COMPONENT_TABS)];
      }

      // Build frontmatter for settings.mdx
      let settingsFrontmatter = '---\n';
      for (const [key, value] of Object.entries(settingsRow)) {
        if (!key || key.trim() === '') continue;
        const propName = toCamelCase(key);
        if (!propName) continue;
        const safeValue = escapeYamlString(value);
        settingsFrontmatter += `${propName}: "${safeValue}"\n`;
      }
      settingsFrontmatter += '---\n';
      const settingsPath = path.join(contentFolder, 'settings.mdx');
      fs.writeFileSync(settingsPath, settingsFrontmatter, 'utf-8');
      console.log(`  -> Wrote ${settingsPath}`);
    }

    // 2️⃣ Fetch the Pages definition. If it fails (e.g., the sheet is not public), fall back to an empty list so existing MDX files remain usable.
    let pages = [];
    try {
      pages = await fetchSheet('Pages');
    } catch (err) {
      console.warn('⚠️ Unable to fetch Pages sheet – proceeding with empty page list.');
    }

    // Ensure each page has a slug; generate from name if missing.
    pages = pages.map(p => {
      if (!p['Slug'] || p['Slug'].trim() === '') {
        const generated = p['Name'] ? p['Name'].toLowerCase().replace(/\s+/g, '-') : '';
        console.warn(`⚠️ Page "${p['Name']}" missing slug. Using generated slug "${generated}"`);
        p['Slug'] = generated;
      }
      return p;
    });


    // 3️⃣ Fetch all component tabs. If a tab fails, log a warning and treat it as empty.
    const componentData = {};
    for (const tab of COMPONENT_TABS) {
      try {
        componentData[tab] = await fetchSheet(tab);
      } catch (err) {
        console.warn(`⚠️ Unable to fetch sheet '${tab}': ${err.message}`);
        componentData[tab] = [];
      }
    }

    // 4️⃣ Process each page.
    const pagesLines = [];
    for (const page of pages) {
      const pageName = page['Name'];
      let slug = page['Slug'];
      // Fallback slug if missing: generate from page name
      if (!slug || slug.trim() === '') {
        slug = pageName.toLowerCase().replace(/\s+/g, '-');
        console.warn(`⚠️ Slug missing for page '${pageName}'. Using generated slug '${slug}'.`);
      }
      const sectionsString = page['Sections'];

      if (!pageName || !slug) continue;

      const publish = (page['Publish'] || 'Y').toUpperCase();
      const mdxFilePath = path.join(contentFolder, `${slug}.mdx`);

      if (publish !== 'Y') {
        console.log(`⏭️  Skipping MDX file for unpublished page: ${pageName} (${slug})`);
        if (fs.existsSync(mdxFilePath)) {
          fs.unlinkSync(mdxFilePath);
        }
        // Add entry to pages.mdx catalog so pages.mdx knows about all pages
        pagesLines.push(formatPage(page));
        continue;
      }

      const sections = sectionsString
        ? sectionsString.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      console.log(`Processing Page: ${pageName} (${slug}) with sections:`, sections);

      // Build front‑matter for the individual MDX file.
      let frontmatter = '---\n';
      frontmatter += `title: "${escapeYamlString(pageName)}"\n`;
      frontmatter += `slug: "${escapeYamlString(slug)}"\n`;
      for (const [key, value] of Object.entries(page)) {
        if (!key || key.trim() === '' || key.toLowerCase() === 'slug' || key.toLowerCase() === 'title') continue;
        const propName = toCamelCase(key);
        if (!propName || propName === 'title' || propName === 'slug') continue;
        const safeValue = escapeYamlString(value);
        frontmatter += `${propName}: "${safeValue}"\n`;
      }
      frontmatter += `data:\n`;

      // Build component blocks.
      let foundSectionsCount = 0;
      for (const section of sections) {
        const matchingRows = [];
        for (const tab of COMPONENT_TABS) {
          const rows = componentData[tab].filter(r =>
            r['Page'] &&
            r['Page'].toLowerCase().replace(/\s+/g, '').replace(/s$/, '') === pageName.toLowerCase().replace(/\s+/g, '').replace(/s$/, '') &&
            r['Section'] &&
            r['Section'].toLowerCase().replace(/\s+/g, '') === section.toLowerCase().replace(/\s+/g, '') &&
            (r['Publish'] || 'Y').toUpperCase() === 'Y'
          );
          rows.forEach(row => matchingRows.push({ tab, row }));
        }
        if (matchingRows.length === 0) {
          console.warn(`- Warning: Section '${section}' not found (or not published) in any component tab for page '${pageName}'.`);
          continue;
        }

        foundSectionsCount += matchingRows.length;

        const ordered = matchingRows.filter(m => m.row['Order'] && m.row['Order'].toString().trim() !== '');
        const unordered = matchingRows.filter(m => !m.row['Order'] || m.row['Order'].toString().trim() === '');

        const renderBlock = ({ tab, row }) => {
          let block = `  - component: "${escapeYamlString(row['Component'] || tab)}"\n`;
          block += `    section: "${escapeYamlString(section)}"\n`;
          if (row['Publish']) block += `    publish: "${escapeYamlString(row['Publish'])}"\n`;
          if (row['Page']) block += `    page: "${escapeYamlString(row['Page'])}"\n`;
          for (const [k, v] of Object.entries(row)) {
            if (['Section', 'Order', 'Publish', 'Page', 'Component'].includes(k)) continue;
            if (!k.trim()) continue;
            const prop = toCamelCase(k);
            if (!prop) continue;
            const safe = escapeYamlString(v);
            block += `    ${prop}: "${safe}"\n`;
          }
          if (row['Order'] && row['Order'].toString().trim() !== '') {
            block += `    order: "${escapeYamlString(row['Order'].toString().trim())}"\n`;
          }
          block += '\n';
          frontmatter += block;
        };

        if (ordered.length > 0) {
          ordered.sort((a, b) => parseInt(a.row['Order'], 10) - parseInt(b.row['Order'], 10));
          ordered.forEach(renderBlock);
        } else if (unordered.length > 0) {
          renderBlock(unordered[0]);
        }
      }

      frontmatter += '---\n\n';
      const filePath = path.join(contentFolder, `${slug}.mdx`);
      const parentDir = path.dirname(filePath);

      // If no section data was found for this page, do NOT write a default MDX file!
      if (foundSectionsCount === 0) {
        console.log(`⏭️  Skipping MDX file creation for page '${pageName}' (${slug}) - No section data found in component tabs.`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } else {
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(filePath, frontmatter, 'utf-8');
        console.log(`  -> Wrote ${filePath}`);
      }

      // Add entry to the pages catalog.
      pagesLines.push(formatPage(page));
    }

    // Write the pages.mdx catalog.
    const pagesFilePath = path.join(contentFolder, 'pages.mdx');
    const finalContent = `---\npages:\n${pagesLines.join('\n')}\n---\n`;
    fs.writeFileSync(pagesFilePath, finalContent, 'utf-8');
    console.log('  -> Wrote pages.mdx catalog');

    // 5️⃣ Fetch Collections tab sheet and generate individual MDX files for item-based sheets
    let collections = [];
    try {
      collections = await fetchSheet('Collections');
    } catch (err) {
      try {
        collections = await fetchSheet('Collection');
      } catch (err2) {
        console.warn('⚠️ Unable to fetch Collections sheet. Falling back to Settings.slugs if available.');
      }
    }

    const ITEM_SHEETS = [];
    const collectionsCatalog = [];

    if (collections && collections.length > 0) {
      for (const col of collections) {
        const publish = (col['Publish'] || 'Y').toUpperCase();
        if (publish !== 'Y') continue;

        const name = (col['Name'] || '').trim();
        const rawSlug = (col['Slug'] || '').trim();
        const rawFolder = (col['Folder'] || col['folder'] || rawSlug).trim();
        const tab = (col['Tab'] || col['tab'] || col['Folder Tab'] || name).trim();

        const slug = rawSlug.toLowerCase().replace(/^\/|\/$/g, '');
        const folder = rawFolder.toLowerCase().replace(/^\/|\/$/g, '');

        if (!folder || !tab) continue;

        ITEM_SHEETS.push({
          name: name || folder,
          sheet: tab,
          folder: folder,
          slug: slug || folder,
          slugCols: ['Slug', 'Name', 'Product Name', 'Title'],
          bodyCol: 'Content',
        });

        collectionsCatalog.push({
          publish,
          order: col['Order'] || '999',
          name: name || folder,
          slug: slug || folder,
          folder: folder,
          tab: tab,
        });
      }
    }

    // Fallback: If Collections sheet wasn't present, check Settings sheet
    if (ITEM_SHEETS.length === 0 && settings && settings.length > 0) {
      const settingsRow = settings[0];
      const slugsVal = settingsRow['Slugs'] || settingsRow['slugs'] || '';
      if (slugsVal) {
        const configuredSlugs = slugsVal.split(',').map(s => s.trim()).filter(Boolean);
        for (const slugName of configuredSlugs) {
          const folderName = slugName.toLowerCase();
          ITEM_SHEETS.push({
            name: slugName,
            sheet: slugName,
            folder: folderName,
            slug: folderName,
            slugCols: ['Slug', 'Title', 'Name', 'Product Name'],
            bodyCol: 'Content',
          });
          collectionsCatalog.push({
            publish: 'Y',
            order: '999',
            name: slugName,
            slug: folderName,
            folder: folderName,
            tab: slugName,
          });
        }
      }
    }

    // Write src/content/collections.mdx catalog
    let collectionsFrontmatter = '---\ncollections:\n';
    for (const c of collectionsCatalog) {
      collectionsFrontmatter += `- publish: "${c.publish}"\n`;
      collectionsFrontmatter += `  order: "${c.order}"\n`;
      collectionsFrontmatter += `  name: "${c.name}"\n`;
      collectionsFrontmatter += `  slug: "${c.slug}"\n`;
      collectionsFrontmatter += `  folder: "${c.folder}"\n`;
      collectionsFrontmatter += `  tab: "${c.tab}"\n`;
    }
    collectionsFrontmatter += '---\n';
    const collectionsPath = path.join(contentFolder, 'collections.mdx');
    fs.writeFileSync(collectionsPath, collectionsFrontmatter, 'utf-8');
    console.log(`  -> Wrote collections.mdx catalog (${collectionsCatalog.length} active collections)`);

    // Process each item collection
    for (const { sheet, folder, slugCols, bodyCol } of ITEM_SHEETS) {
      const subFolder = path.join(contentFolder, folder);
      if (fs.existsSync(subFolder)) {
        const existingFiles = fs.readdirSync(subFolder, { recursive: true });
        for (const file of existingFiles) {
          const filePath = path.join(subFolder, file);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        }
      } else {
        fs.mkdirSync(subFolder, { recursive: true });
      }

      let rows = [];
      try {
        rows = await fetchSheet(sheet);
      } catch (err) {
        console.warn(`⚠️ Unable to fetch sheet '${sheet}' for collection folder '${folder}':`, err.message);
        continue;
      }

      let written = 0;
      let skipped = 0;

      for (const row of rows) {
        const publish = (row['Publish'] || 'Y').toUpperCase();
        if (publish !== 'Y') { skipped++; continue; }

        // Resolve slug from the first non-empty column in slugCols
        let slug = '';
        for (const col of slugCols) {
          if (row[col] && row[col].trim()) {
            slug = row[col].trim();
            break;
          }
        }

        // If slug contains path like /industries/commercial-kitchens/display-equipment, extract last segment
        if (slug.includes('/')) {
          const parts = slug.split('/').filter(Boolean);
          slug = parts[parts.length - 1] || slug;
        }

        // Normalise: lowercase, replace non-alphanumeric with hyphens
        slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!slug) { skipped++; continue; }

        // Build frontmatter from ALL columns (auto camelCase), skip empty keys and duplicate keys.
        let fm = '---\n';
        fm += `slug: "${slug}"\n`;
        fm += `folder: "${folder}"\n`;
        for (const [col, val] of Object.entries(row)) {
          if (!col || !col.trim()) continue;
          if (bodyCol && col === bodyCol) continue; // body goes below fence
          const prop = toCamelCase(col);
          if (!prop || prop === 'slug' || prop === 'folder') continue;
          const safe = escapeYamlString(val);
          fm += `${prop}: "${safe}"\n`;
        }
        fm += '---\n';

        // Append body content if a bodyCol is defined.
        if (bodyCol && row[bodyCol]) {
          let body = row[bodyCol];
          // Convert relative markdown image paths ![alt](image/x.jpg) -> <img> HTML tags
          body = body.replace(/!\[([^\]]*)\]\(image\/([^)]+)\)/g, '<img src="/image/$2" alt="$1" />');
          body = body.replace(/!\[\]\(image\/([^)]+)\)/g, '<img src="/image/$1" alt="" />');
          fm += '\n' + body + '\n';
        }

        const filePath = path.join(subFolder, `${slug}.mdx`);
        fs.writeFileSync(filePath, fm, 'utf-8');
        written++;
      }

      console.log(`  -> Wrote ${written} MDX files to src/content/${folder}/ (${skipped} skipped / unpublished).`);
    }

    console.log('Successfully generated all MDX files!');
  } catch (err) {
    console.error('Error generating content:', err);
  }
}

// Execute
main();

