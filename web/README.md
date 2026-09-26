# GitHub Pages password protection

## Vercel

The Next.js deployment uses server-side password verification, independently of
the static Pages encryption below. Configure `SITE_PASSWORD_HASH` (the result of
`hashPassword` from `lib/site-auth.mjs`) and a random 32-byte hexadecimal
`SITE_SESSION_SECRET` as sensitive Vercel environment variables. Neither the
password nor either environment value is committed or sent to the browser.

The proxy protects all routes, including direct public HTML/JS URLs. The events
API also validates the session itself. A successful login creates a signed,
12-hour Secure/HttpOnly/SameSite=Strict cookie. Missing configuration fails closed.
Rotating either environment value invalidates sessions after redeployment.
The native app loads its own bundled files and does not use this Next.js proxy.

Run `node scripts/test-vercel-auth.mjs` to check password and session handling.

## GitHub Pages

Only the Pages build is protected. `public/` and the macOS application remain
unchanged and require no password.

Configure the `SITE_PASSWORD` Actions secret before deployment. Builds without
the secret fail before producing a new artifact. Never commit the password.
For local builds, provide `SITE_PASSWORD` through the environment.

The build derives a non-extractable AES-256-GCM key using PBKDF2-SHA-256,
600,000 iterations and the random public salt in `site-lock-config.json`.
Each encrypted payload receives a fresh 96-bit IV and authenticated context.
The salt is stable so an already unlocked tab can decrypt future calendar
updates. Rotating the password or salt requires users to reload and unlock again.

The published artifact contains only a login shell, its unlock script and
encrypted page/calendar payloads. No application JavaScript or plaintext
calendar endpoint is deployed. After unlocking, the key stays in page memory;
it is not saved to browser storage or cookies. Reloading requires the password.
Calendar refresh continues every 15 minutes using the encrypted data endpoint.

This is client-side encryption for static hosting, not server-side access
control. Encrypted files can be downloaded and password guesses can be tested
offline. A public source repository remains public; this does not protect its
source, prior downloads, or copies of the earlier unprotected site.

Validation: `node scripts/test-site-lock.mjs` tests encryption, incorrect passwords,
tampering, missing-secret failure, encrypted-only output, deferred script order
and isolation from the native app. It builds `_site` with a disposable test
password; rebuild with the deployment secret before manually publishing it.
