# Manual setup — everything Terraform cannot own

Terraform in `infra/` owns the AWS side completely. This is the rest: the
accounts, credentials and dashboard steps that have no API worth automating, or
whose credentials must not live in a repository.

Work top to bottom. Steps marked **blocking** stop everything downstream.

---

## 0. Accounts to create first

| | Cost | Why |
| --- | --- | --- |
| AWS account | pay as you go | Everything in `infra/` |
| Apple Developer Program | $99/yr | **Blocking** — signing, notarization, and Sign in with Apple all need it |
| Google Cloud project | free | The Google OAuth client |
| Stripe account | 2.9% + $0.30 | Payments |
| ElevenLabs account | see below | The voice |
| Vercel account | free tier is fine | The website |
| A domain (`pilcrow.app` or similar) | ~$15/yr | **Blocking** for prod — Sign in with Apple will not accept a bare Cognito URL as a return URL forever, and the download link needs somewhere to live |

Apple Developer enrollment can take **24–48 hours**, sometimes longer for an
individual. Start it before anything else; it gates the only part of this project
that cannot be worked around.

---

## 1. AWS

1. Create the account, then an IAM user or (better) an Identity Center user with
   `AdministratorAccess` for the initial applies. Do not use the root account.
2. `aws configure --profile pilcrow`
3. Bootstrap remote state — once per account:
   ```bash
   cd infra/bootstrap
   terraform init
   terraform apply -var state_bucket=pilcrow-tfstate-<your account id>
   terraform output backend_config     # paste into infra/envs/*/backend.hcl
   ```
4. **Service quotas.** The default Lambda concurrency limit on a new account is
   often 10, not 1000. The TTS function reserves 50, and reserving more than the
   account has will fail the apply. Request an increase to at least 200 before
   launch: Service Quotas → AWS Lambda → *Concurrent executions*.

---

## 2. Domain and DNS

1. Register the domain (Route 53, or anywhere and delegate).
2. Create the Route 53 public hosted zone for it.
3. Point the registrar's nameservers at that zone's four NS records. **Wait for
   propagation before applying `module.dns`** — ACM validation will hang
   otherwise, and it hangs quietly.
4. The apex and `www` stay pointed at Vercel (§7). Terraform only manages `api.`
   and `dl.`

---

## 3. Sign in with Apple

The single fiddliest step. Order matters.

1. **Certificates, Identifiers & Profiles → Identifiers → App IDs.** Register an
   App ID with bundle identifier `com.pilcrow.app`. Enable *Sign in with Apple*.
2. **Identifiers → Services IDs.** Register a *separate* Services ID, e.g.
   `com.pilcrow.signin`. This — not the App ID — is the "client id" Cognito
   wants. Getting these two confused is the usual failure.
3. Configure the Services ID:
   - Primary App ID: the one from step 1.
   - Domains: `<hosted-ui-prefix>.auth.<region>.amazoncognito.com`
   - Return URL: `https://<hosted-ui-prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse`

   You need the Cognito domain prefix here, and Cognito needs the Apple
   credentials — so apply `module.secrets` first, put placeholder Apple values in,
   and come back once `terraform output` gives you the real domain.
4. **Keys → +.** Create a key, enable *Sign in with Apple*, associate the App ID,
   and download the `.p8`. **It downloads exactly once.** Note the Key ID.
5. Find your Team ID (top right of the developer portal).
6. Put them all in the secret:
   ```bash
   aws secretsmanager put-secret-value --secret-id pilcrow-prod-apple-oauth \
     --secret-string "$(jq -n \
       --arg s com.pilcrow.signin \
       --arg t YOURTEAMID \
       --arg k YOURKEYID \
       --arg p "$(cat AuthKey_YOURKEYID.p8)" \
       '{services_id:$s, team_id:$t, key_id:$k, private_key:$p}')"
   ```
   The private key must include the `-----BEGIN PRIVATE KEY-----` lines and its
   real newlines.

---

## 4. Google Sign-In

1. Google Cloud Console → APIs & Services → **OAuth consent screen**. External.
   Add app name, support email, and the `email`, `profile`, `openid` scopes.
   Publish it — an unpublished screen only works for test users you list by hand.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins: `https://<prefix>.auth.<region>.amazoncognito.com`
   - Authorized redirect URI: `https://<prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse`
3. Store it:
   ```bash
   aws secretsmanager put-secret-value --secret-id pilcrow-prod-google-oauth \
     --secret-string '{"client_id":"...apps.googleusercontent.com","client_secret":"..."}'
   ```

---

## 5. ElevenLabs

1. Create the account and pick a plan. Flash v2.5 is **$0.05 per 1,000
   characters** and that rate does not fall on higher tiers — paid plans bundle
   more included credits, they do not discount the unit. Read
   `docs/LAUNCH-PLAN.md` before choosing; the plan you need is a function of how
   many subscribers you expect, not of features.
2. Generate an API key with text-to-speech scope.
3. ```bash
   aws secretsmanager put-secret-value --secret-id pilcrow-prod-elevenlabs \
     --secret-string 'sk_...'
   ```
4. **Set a spend alert in the ElevenLabs dashboard.** The Lambda's reserved
   concurrency caps the rate at which money can leave, but it does not cap the
   total.

---

## 6. Stripe

1. Create the account. Complete business verification and add bank details —
   until then you are in test mode only, and verification can take days.
2. Run the bootstrap script, test mode first:
   ```bash
   STRIPE_SECRET_KEY=sk_test_... node --experimental-strip-types scripts/stripe-bootstrap.ts
   ```
   It creates the *Pilcrow Pro* product, the $9.99/mo price with lookup key
   `pilcrow_pro_monthly`, and the Billing Portal configuration. It is idempotent.
3. **Webhook endpoint.** Developers → Webhooks → Add endpoint.
   - URL: `terraform output stripe_webhook_url`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.payment_failed`
4. Copy the signing secret and the API key into Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value --secret-id pilcrow-prod-stripe \
     --secret-string 'sk_live_...'
   aws secretsmanager put-secret-value --secret-id pilcrow-prod-stripe-webhook \
     --secret-string 'whsec_...'
   ```
5. **Stripe Tax.** Settings → Tax. Register in your own jurisdiction at minimum;
   digital-goods VAT/GST rules apply from the first sale in many countries. The
   checkout session already passes `automatic_tax: { enabled: true }`, so this is
   the only thing missing.
6. Repeat 2–4 for live mode when you are ready to charge.

---

## 7. Vercel

1. Import the repository. Set the **root directory to `web/`** — otherwise Vercel
   tries to build the Electron app.
2. Environment variables:
   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_DOWNLOAD_URL` | from `terraform output web_env` |
   | `NEXT_PUBLIC_API_URL` | from `terraform output web_env` |
3. Add the domain. Vercel will ask for an `A` record on the apex and a `CNAME` on
   `www` — add those to the Route 53 zone by hand. Terraform deliberately does
   not manage them, so it will not fight the Vercel dashboard over them.
4. Record the demo audio and drop it in `web/public/demo/{before,after}.mp3`.
   The landing page already references both. This is the highest-leverage hour of
   work on the whole marketing site — it is the entire pitch in eight seconds.

---

## 8. Signing and notarization

1. **Developer ID Application certificate.** Xcode → Settings → Accounts →
   Manage Certificates → + → *Developer ID Application*. Confirm with
   `security find-identity -v -p codesigning`.
2. **App Store Connect API key** for notarization: App Store Connect → Users and
   Access → Integrations → App Store Connect API → generate a key with *Developer*
   access. Download the `.p8` (once only) and note the Key ID and Issuer ID.
3. Build:
   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   export APPLE_API_KEY=/path/to/AuthKey_XXXX.p8
   export APPLE_API_KEY_ID=XXXX
   export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   npm run build:helper && npm run make
   ```
   Without those variables `forge.config.ts` skips signing and you get an
   unsigned build — fine locally, useless to distribute.
4. Verify before publishing:
   ```bash
   spctl -a -vvv -t install out/Pilcrow-darwin-arm64/Pilcrow.app
   codesign -dv --deep --verbose=4 out/Pilcrow-darwin-arm64/Pilcrow.app
   ```
   **The Swift helper in `extraResource` must be signed too.** A nested unsigned
   executable is the most common reason notarization fails, and the error message
   does not make that obvious.
5. Upload the DMG and the ZIP plus `latest-mac.yml` to the releases bucket, then
   invalidate CloudFront:
   ```bash
   aws s3 cp out/make/ s3://<bucket>/ --recursive
   aws cloudfront create-invalidation --distribution-id <id> --paths '/latest-mac.yml'
   ```

---

## 9. Apply order

Terraform cannot do this in one pass, because `module.auth` reads the Google and
Apple secrets at plan time and those secrets do not exist yet.

```bash
cd services && npm run build          # produces the Lambda zips Terraform uploads
cd ../infra/envs/prod
terraform init -backend-config=backend.hcl

terraform apply -target=module.secrets   # 1. empty secret containers
#   ... populate them (§3, §4, §5, §6) ...
terraform apply -target=module.dns       # 2. certificates; needs DNS delegated
terraform apply                          # 3. everything else
terraform apply                          # 4. alias records, now the targets exist
```

Then confirm the SNS alert subscription from the email AWS sends you, or the
alarms fire into nothing.

---

## 10. Before taking real money

- [ ] `/health` returns 200 through the custom domain
- [ ] Sign in with Google works end to end from a packaged build
- [ ] Sign in with Apple works end to end from a packaged build
- [ ] 20 reads, then the paywall on the 21st
- [ ] Stripe test card `4242 4242 4242 4242` lifts the paywall within seconds
- [ ] Cancelling in the portal leaves access until the period end
- [ ] `spctl` passes on the DMG downloaded from `pilcrow.app/download`
- [ ] Privacy and Terms reviewed by someone qualified
- [ ] Budget alarm and ElevenLabs spend alert both confirmed working
