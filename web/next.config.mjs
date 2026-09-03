/**
 * Deliberately minimal. The site is almost entirely static — the only dynamic
 * route is /download, which redirects to whatever the current release is so the
 * link on the page never has a version number baked into it.
 */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default config
