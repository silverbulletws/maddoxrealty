// Site-level settings. Anything used on more than one page lives here.

export const SITE = {
  name: 'Maddox Realty',
  tagline: 'Beautiful Residential, Hunting & Recreational Ranches Properties',
  address: ['1309 North Main Street', 'Jacksboro, TX 76458'],
  facebook: 'https://www.facebook.com/profile.php?id=61561175821565',
};

// The site has no forms (none were found in the capture). The starter's form
// kit was removed; restore FormShell + forms.js from the starter if one is added.
export const FORMS = null;

// Agents, in the order every block on the site lists them. `short` is the
// header's version of the name.
export const AGENTS = [
  { name: 'Roxanna Maddox', title: 'Broker', phone: '940-507-0102', email: 'roxanna@maddoxrealty.com' },
  { name: 'Bob Maddox', title: 'Agent', phone: '940-507-0068', email: 'bob@maddoxrealty.com' },
  { name: 'Miles Maddox', title: 'Broker', phone: '940-229-4446', email: 'miles@maddoxrealty.com' },
  { name: 'McCall Maddox', title: 'Agent', phone: '940-229-4235', email: 'mccall@maddoxrealty.com' },
];

// One "Sold" page per year, newest first. Each needs its own src/pages/YYYY-sold.astro.
// The newest year's sales (plus sold properties with no year) also show on the
// home page. A new year: add it here and copy the previous year's page file.
export const SOLD_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016];

// Listing sections, in page order. `key` is the property's tick-box field.
export const CATEGORIES = [
  { key: 'hunting', title: 'Hunting & Recreational Ranches', button: 'HUNTING & RECREATIONAL RANCHES', anchor: 'hunting-recreational' },
  { key: 'residential', title: 'Residential', button: 'Residential Properties', anchor: 'residential' },
  { key: 'commercial', title: 'Commercial', button: 'Commercial Properties', anchor: 'commercial' },
];
