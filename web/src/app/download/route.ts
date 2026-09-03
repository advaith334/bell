import { NextResponse } from 'next/server'
import { site } from '@/lib/site'

/**
 * A redirect rather than a link, so nothing on the site ever hardcodes a version
 * number. Publishing a new release overwrites the object CloudFront serves and
 * every "Download" button on the site is instantly current.
 *
 * 302 rather than 301 for exactly that reason: a permanent redirect would be
 * cached by browsers and would outlive the release it pointed at.
 */
export function GET() {
  return NextResponse.redirect(site.downloadUrl, 302)
}
