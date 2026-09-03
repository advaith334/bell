/**
 * Everything the site needs to know about the product, in one place, so a price
 * change or a new download URL is a single edit rather than a search.
 *
 * The download URL comes from Terraform (`terraform output web_env`) and points
 * at CloudFront in front of the releases bucket. It is an environment variable
 * rather than a constant because dev and prod each have their own.
 */

export const site = {
  name: 'Pilcrow',
  tagline: 'Highlight anything. Hear it read back.',
  description:
    'Pilcrow reads your selection aloud in a natural voice — with pauses where paragraphs actually are, and none of the line-by-line stutter that makes every other read-aloud tool unbearable on terminal output.',
  url: 'https://pilcrow.app',
  downloadUrl: process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? 'https://dl.pilcrow.app/Pilcrow.dmg',
  supportEmail: 'support@pilcrow.app',

  price: {
    amount: '$9.99',
    period: 'month',
    freeReads: 20,
    includedChars: 150_000,
  },

  requirements: 'macOS 13 or newer, Apple silicon',
} as const
