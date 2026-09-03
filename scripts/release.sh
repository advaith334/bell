#!/usr/bin/env bash
set -euo pipefail

# Publishes a signed, notarized build to the releases bucket.
#
#   BUCKET=pilcrow-releases-prod DISTRIBUTION_ID=E123... ./scripts/release.sh
#
# The signing variables must already be exported — see docs/INFRA-MANUAL-STEPS.md
# §8. Without them forge produces an unsigned build, which this script refuses to
# publish: an unsigned .app fails Gatekeeper on every Mac but the one that built
# it, and finding that out from users is the worst way to find out.

: "${BUCKET:?set BUCKET to the releases bucket name}"
: "${DISTRIBUTION_ID:?set DISTRIBUTION_ID to the CloudFront distribution}"

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "APPLE_SIGNING_IDENTITY is not set — this build would be unsigned. Refusing." >&2
  exit 1
fi

npm run build:helper
npm run make

APP="out/Pilcrow-darwin-arm64/Pilcrow.app"

echo "==> verifying the signature before publishing"
codesign --verify --deep --strict --verbose=2 "$APP"
# The Swift helper is the usual culprit: a nested unsigned executable passes
# codesign on the bundle but fails notarization.
codesign --verify --verbose=2 "$APP/Contents/Resources/pilcrow-helper"
spctl -a -vvv -t install "$APP"

echo "==> uploading"
aws s3 cp out/make/ "s3://${BUCKET}/" --recursive \
  --exclude '*' --include '*.dmg' --include '*.zip' --include 'latest-mac.yml'

echo "==> invalidating the update feed"
# Only the feed. The DMG and ZIP are immutable per version and should stay cached.
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/latest-mac.yml' >/dev/null

echo "done — https://dl.pilcrow.app/"
