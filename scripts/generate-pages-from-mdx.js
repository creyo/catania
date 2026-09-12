import fs from "fs";
import path from "path";
import matter from "gray-matter";

export function generatePages() {
  console.log("🚀 Starting page and collection generation script...");

  // Load pages.mdx catalog
  const catalogPath = path.resolve("src/content/pages.mdx");
  const catalogRaw = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, "utf-8") : "";
  const { data: catalogFrontmatter } = catalogRaw ? matter(catalogRaw) : { data: {} };
  const pageEntries = catalogFrontmatter.pages ?? [];

  // Load settings.mdx
  const settingsPath = path.resolve("src/content/settings.mdx");
  const settingsRaw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf-8") : "";
  const { data: settingsFrontmatter } = settingsRaw ? matter(settingsRaw) : { data: {} };

  const themeName = String(settingsFrontmatter.theme ?? "").trim();
  const themeFolder = themeName.toLowerCase();

  // Load collections.mdx catalog dynamically
  const collectionsPath = path.resolve("src/content/collections.mdx");
  let collectionsList = [];
  if (fs.existsSync(collectionsPath)) {
    const collectionsRaw = fs.readFileSync(collectionsPath, "utf-8");
    const { data: colData } = matter(collectionsRaw);
    collectionsList = colData.collections ?? [];
  }

  // Fallback to Settings.slugs if collections.mdx is empty
  if (collectionsList.length === 0) {
    const rawSlugs = String(settingsFrontmatter.slugs ?? "Blog, Products").trim();
    collectionsList = rawSlugs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({
        name: s,
        slug: s.toLowerCase(),
        folder: s.toLowerCase(),
        tab: s,
        publish: "Y",
      }));
  }

  // Build collections lookup map by folder and slug
  const collectionsMap = new Map();
  const dynamicSlugFolders = new Set();
  for (const col of collectionsList) {
    const publish = (col.publish || "Y").toUpperCase();
    if (publish !== "Y") continue;

    const folder = (col.folder || col.slug || "").toLowerCase().replace(/^\/|\/$/g, "");
    const slug = (col.slug || col.folder || "").toLowerCase().replace(/^\/|\/$/g, "");

    if (folder) {
      collectionsMap.set(folder, col);
      dynamicSlugFolders.add(folder);
    }
    if (slug) {
      collectionsMap.set(slug, col);
      dynamicSlugFolders.add(slug);
    }
  }

  // Ensure src/pages folder exists and clean up old generated pages
  const pagesDir = path.resolve("src/pages");
  if (!fs.existsSync(pagesDir)) {
    fs.mkdirSync(pagesDir, { recursive: true });
  } else {
    const existingFiles = fs.readdirSync(pagesDir);
    for (const file of existingFiles) {
      if (file === ".gitkeep") continue;
      const fullPath = path.join(pagesDir, file);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    console.log("🧹 Cleaned up src/pages directory before generating pages.");
  }

  // Track processed collection folders to avoid duplication
  const processedFolders = new Set();

  function generatePageOrCollection(pageEntry, isFromCollectionsOnly = false) {
    const rawSlug = pageEntry.slug || pageEntry.folder;
    if (!rawSlug) return;

    const cleanSlug = rawSlug.toLowerCase().replace(/^\/|\/$/g, "");
    const publish = (pageEntry.publish || "Y").toUpperCase();
    if (publish !== "Y") {
      console.log(`⏭️  Skipping page generation for unpublished item: ${cleanSlug}`);
      return;
    }

    const collectionInfo = collectionsMap.get(cleanSlug);
    const isSlugFolder = dynamicSlugFolders.has(cleanSlug);
    const targetFolder = isSlugFolder ? (collectionInfo?.folder || cleanSlug) : cleanSlug;

    if (isSlugFolder) {
      processedFolders.add(targetFolder);
    }

    const depthLevel = isSlugFolder ? targetFolder.split("/").filter(Boolean).length + 1 : 1;
    const importDepthPrefix = "../".repeat(depthLevel);

    const mdxPath = path.resolve(`src/content/${targetFolder}.mdx`);
    let frontmatter = {};
    let components = [];

    if (fs.existsSync(mdxPath)) {
      const pageRaw = fs.readFileSync(mdxPath, "utf-8");
      const parsed = matter(pageRaw);
      frontmatter = parsed.data || {};
      components = frontmatter.data ?? [];
    } else {
      frontmatter = {
        metaTitle: pageEntry.metaTitle || pageEntry.name || targetFolder,
        metaDescription: pageEntry.metaDescription || `Explore ${targetFolder}`,
      };
    }

    let orderedSections = (pageEntry?.sections ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (orderedSections.length === 0 && components.length > 0) {
      const uniqueSections = new Set();
      components.forEach((c) => {
        if ((c.publish || "Y").toUpperCase() === "Y" && c.section) {
          uniqueSections.add(c.section);
        }
      });
      orderedSections = [...uniqueSections];
    }

    const validComponents = new Set();
    const rawComponentNames = components
      .filter((c) => (c.publish || "Y").toUpperCase() === "Y" && c.component)
      .map((c) => c.component);

    // Strictly use components defined in MDX data - do NOT inject default fallback components
    if (!fs.existsSync(mdxPath)) {
      console.log(`⏭️ No MDX file found for ${targetFolder}. Page will render empty layout (no fallback data/components used).`);
    }

    for (const comp of rawComponentNames) {
      const compFile = path.resolve(`src/components/${themeFolder}/${comp}.astro`);
      if (fs.existsSync(compFile)) {
        validComponents.add(comp);
      } else {
        console.warn(`⚠️ Component "${comp}" not found at ${compFile}. Skipping import for page ${cleanSlug}.`);
      }
    }

    let constBlock = "";
    let renderBlock = "";

    for (const sec of orderedSections) {
      const secItems = components.filter(
        (c) => c.section === sec && (c.publish || "Y").toUpperCase() === "Y"
      );

      const comp = secItems.length > 0 ? secItems[0].component : sec;
      if (!comp || !validComponents.has(comp)) continue;

      const varPrefix = sec.toLowerCase().replace(/[^a-z0-9]/gi, "");

      if (secItems.length > 1) {
        constBlock += `const ${varPrefix}Items = frontmatter.data.filter((c) => c.section === '${sec}' && (c.publish || 'Y').toUpperCase() === 'Y').sort((a, b) => Number(a.order || 0) - Number(b.order || 0));\n\n`;
        renderBlock += `{${varPrefix}Items.length > 0 && <${comp} items={${varPrefix}Items} folderPath="${targetFolder}" />}\n`;
      } else if (secItems.length === 1) {
        constBlock += `const ${varPrefix}Item = frontmatter.data.find((c) => c.section === '${sec}' && (c.publish || 'Y').toUpperCase() === 'Y');\n\n`;
        renderBlock += `{${varPrefix}Item && <${comp} {...${varPrefix}Item} folderPath="${targetFolder}" />}\n`;
      } else {
        renderBlock += `<${comp} folderPath="${targetFolder}" />\n`;
      }
    }

    const componentImportBlock = [...validComponents]
      .map((comp) => `import ${comp} from '${importDepthPrefix}components/${themeFolder}/${comp}.astro';`)
      .join("\n");

    const layoutImport = frontmatter.layout
      ? `import Layout from '${frontmatter.layout}';`
      : `import Layout from '${importDepthPrefix}layouts/Layout.astro';`;

    const mdxImport = fs.existsSync(mdxPath)
      ? `import { frontmatter } from '${importDepthPrefix}content/${targetFolder}.mdx';`
      : `const frontmatter = ${JSON.stringify(frontmatter)};`;

    const astroContent = `---\n${layoutImport}\n${componentImportBlock}\n${mdxImport}\n\n${constBlock}\n---\n<Layout\n  title={frontmatter.metaTitle || "${pageEntry.name || targetFolder}"}\n  description={frontmatter.metaDescription || "Default description"}\n>\n${renderBlock}\n</Layout>\n`;

    if (isSlugFolder) {
      const targetDir = path.resolve(`src/pages/${targetFolder}`);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const indexPath = path.join(targetDir, "index.astro");
      fs.writeFileSync(indexPath, astroContent, "utf-8");
      console.log(`✅ Generated collection index: ${indexPath}`);

      const folderLastName = targetFolder.split("/").pop() || targetFolder;
      const cleanLastName = folderLastName.toLowerCase();
      const singularLastName = cleanLastName.endsWith("s") ? cleanLastName.slice(0, -1) : cleanLastName;

      const pascalSingular = singularLastName.charAt(0).toUpperCase() + singularLastName.slice(1);
      const pascalPlural = cleanLastName.charAt(0).toUpperCase() + cleanLastName.slice(1);

      const candidateSingular = `${pascalSingular}Detail`;
      const candidatePlural = `${pascalPlural}Detail`;

      let detailComponentImport = "";
      if (fs.existsSync(path.resolve(`src/components/${themeFolder}/${candidateSingular}.astro`))) {
        detailComponentImport = `import DetailComponent from '${importDepthPrefix}components/${themeFolder}/${candidateSingular}.astro';`;
      } else if (fs.existsSync(path.resolve(`src/components/${themeFolder}/${candidatePlural}.astro`))) {
        detailComponentImport = `import DetailComponent from '${importDepthPrefix}components/${themeFolder}/${candidatePlural}.astro';`;
      } else {
        detailComponentImport = `import DetailComponent from '${importDepthPrefix}components/${themeFolder}/GenericDetail.astro';`;
      }

      const slugPagePath = path.join(targetDir, "[slug].astro");
      const detailContent = `---
import Layout from '${importDepthPrefix}layouts/Layout.astro';
${detailComponentImport}

export async function getStaticPaths() {
  const files = import.meta.glob('${importDepthPrefix}content/${targetFolder}/*.mdx', { eager: true });
  return Object.values(files)
    .filter((p: any) => (p.frontmatter.publish || 'Y').toUpperCase() === 'Y')
    .map((p: any) => {
      return {
        params: { slug: p.frontmatter.slug },
        props: { item: p.frontmatter, Content: p.Content }
      };
    });
}

const { item, Content } = Astro.props;
---

<Layout title={\`\${item.title || item.name || item.productName || '${targetFolder}'}\`}>
  <DetailComponent item={item} Content={Content} slugFolder="${targetFolder}" />
</Layout>
`;
      fs.writeFileSync(slugPagePath, detailContent, "utf-8");
      console.log(`✅ Dynamically generated detail route file: ${slugPagePath}`);

    } else {
      const outPath = path.resolve(`src/pages/${targetFolder}.astro`);
      const parentDir = path.dirname(outPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(outPath, astroContent, "utf-8");
      console.log(`✅ Generated single page: ${outPath}`);
    }
  }

  // 1️⃣ Process entries defined in pages.mdx
  for (const pageEntry of pageEntries) {
    generatePageOrCollection(pageEntry);
  }

  // 2️⃣ Process any collection entries from collections.mdx that were not in pages.mdx
  for (const col of collectionsList) {
    const folder = (col.folder || col.slug || "").toLowerCase().replace(/^\/|\/$/g, "");
    if (folder && !processedFolders.has(folder)) {
      generatePageOrCollection(col, true);
    }
  }

  console.log("Successfully generated all Astro page routes!");
}

// Execute when run as standalone script
generatePages();

