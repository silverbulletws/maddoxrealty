// Everything the listings and the property page work out from the collection.
import { getCollection } from 'astro:content';
import { SOLD_YEARS } from '../config/site.js';

/** Every property, newest first (the WordPress listing order). */
export async function getProperties() {
  const all = await getCollection('property');
  return all.sort((a, b) => b.data.date - a.data.date || a.data.title.localeCompare(b.data.title));
}

/** "$7,250 Per Acre", as the cards and the property page show it. */
export function priceText(data) {
  return [data.price, data.perAcre ? 'Per Acre' : ''].filter(Boolean).join(' ');
}

/** "Available", "Sold in 2025", "Sold", or nothing for an unlisted property. */
export function availabilityText(data) {
  if (data.status === 'available') return 'Available';
  if (data.status === 'sold') return data.soldYear ? `Sold in ${data.soldYear}` : 'Sold';
  return '';
}

// Home page: what's for sale, then the newest year's sales (and sales with no year).
export const isForSale = (p) => p.data.status === 'available';
export const isRecentlySold = (p) =>
  p.data.status === 'sold' && (!p.data.soldYear || p.data.soldYear === SOLD_YEARS[0]);
export const soldIn = (year) => (p) => p.data.status === 'sold' && p.data.soldYear === year;

// The gallery photos in each property's folder, cover first, then by file name
// (the post editor numbers new photos 01-, 02- … so they sort in upload order).
const photoFiles = import.meta.glob('/src/content/property/*/*.{webp,jpg,jpeg,png}', { eager: true, import: 'default' });

export function galleryFor(entry) {
  const prefix = `/src/content/property/${entry.id}/`;
  const photos = Object.entries(photoFiles)
    .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).startsWith('cover-'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, img]) => img);
  return entry.data.image ? [entry.data.image, ...photos] : photos;
}
