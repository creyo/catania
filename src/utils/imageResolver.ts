import type { ImageMetadata } from 'astro';
import { frontmatter as settingsFrontmatter } from '../content/settings.mdx';
import fallbackImage from '../assets/images/catania/about-us.jpg';

// Eagerly import all images in src/assets/images and all subfolders (catania, steelcraft, etc.)
const localImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/images/**/*.{jpeg,jpg,png,gif,webp,avif,svg,PNG,JPG,JPEG,WEBP,AVIF}',
  { eager: true }
);

/**
 * Resolves an article's featured image from the local assets folder dynamically based on the active theme in settings.mdx.
 * If imageFeatured is empty/missing, returns null.
 * If imageFeatured is provided but not found in assets, returns the provided custom fallback or the default fallback image.
 *
 * @param imageFeatured The image filename from the MDX/Spreadsheet frontmatter.
 * @param customFallback Optional custom fallback image metadata.
 * @returns ImageMetadata | null of the resolved image.
 */
export function resolveArticleImage(
  imageFeatured: string | undefined | null,
  customFallback: ImageMetadata = fallbackImage
): ImageMetadata | null {
  if (!imageFeatured || !imageFeatured.trim()) {
    return null;
  }

  // Clean up leading/trailing spaces or slashes
  const cleanName = imageFeatured.trim().replace(/^\//, '');

  // Determine active theme folder name (e.g. "catania" or "steelcraft") from settings.mdx
  const themeFolder = (settingsFrontmatter?.theme || '').toLowerCase();

  // Try finding the image in the active theme folder first
  const possiblePaths = [
    `/src/assets/images/${themeFolder}/${cleanName}`,
    `/src/assets/images/${themeFolder}/${cleanName.toLowerCase()}`,
    `/src/assets/images/${cleanName}`,
    `/src/assets/images/${cleanName.toLowerCase()}`,
  ];

  for (const path of possiblePaths) {
    if (localImages[path]) {
      return localImages[path].default;
    }
  }

  // Fallback search across any folder inside /src/assets/images/ for a matching filename
  const cleanLower = cleanName.toLowerCase();
  for (const [key, module] of Object.entries(localImages)) {
    if (key.toLowerCase().endsWith(`/${cleanLower}`)) {
      return module.default;
    }
  }

  // If filename was provided but not found in any path or subfolder, return the fallback image
  return customFallback;
}

/**
 * Resolve an image name to ImageMetadata or null if empty.
 */
export function resolveImage(
  imageFeatured: string | undefined | null,
): ImageMetadata | null {
  return resolveArticleImage(imageFeatured);
}
