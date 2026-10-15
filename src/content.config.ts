import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Properties: one folder per property, src/content/property/<slug>/index.md,
// with its photos beside it. The folder name is the address: /property/<slug>/.
// Staff edit these in the SBWS post editor — any change here must be made in
// sbws.json in the same commit (`npm run build` checks).
const property = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/property' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // Listings are ordered by this, newest first. Imported properties carry
      // approximate dates that reproduce the WordPress order.
      date: z.coerce.date(),
      description: z.string().optional(),
      // The cover photo: first in the gallery and the photo on listing cards.
      // Named cover-*.webp so the gallery's other photos leave it out.
      image: image().optional(),
      imageAlt: z.string().default(''),
      // "$542,290" — shown as typed. perAcre adds " Per Acre" after it.
      price: z.string().default(''),
      perAcre: z.boolean().default(false),
      // "42.7 Acres" — shown as "Size: …" under the price when filled in.
      size: z.string().default(''),
      // available: home page. sold: the soldYear page (and the home page when
      // soldYear is the newest year or blank). unlisted: own page only.
      status: z.enum(['available', 'sold', 'unlisted']),
      soldYear: z.number().optional(),
      underContract: z.boolean().default(false),
      // Which listing sections it appears in.
      hunting: z.boolean().default(false),
      residential: z.boolean().default(false),
      commercial: z.boolean().default(false),
      features: z.array(z.string()).default([]),
      // Map pin: "33.33,-98.25" or an address. Blank shows the "not available" note.
      map: z.string().default(''),
    }),
});

export const collections = { property };
