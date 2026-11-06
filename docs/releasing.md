# Releasing

The package is published to the npm registry as `vibecoding-devtools` by `.github/workflows/release.yml`, using npm
trusted publishing (OIDC) with provenance. The workflow holds no token and no secret.

## Release flow

1. Move the `[Unreleased]` entries of `CHANGELOG.md` to `[X.Y.Z] - YYYY-MM-DD`.
2. Set `version` to `X.Y.Z` in `package.json` and in both places of `npm-shrinkwrap.json`.
3. Commit, then push the tag `vX.Y.Z`.

The workflow runs lint, `validate-kit` and the tests on Linux and Windows. The publish job then fails unless the tag
equals `v` + the `package.json` version, the package name is `vibecoding-devtools` and `repository.url` is
`https://github.com/Or4cu1o/vibecoding-devtools`. Only then does it run `npm publish --provenance --access public`.

## One-time setup on npmjs.com

1. Create or use an npm account and enable two-factor authentication.
2. Open the package page, then **Settings**, then **Trusted Publisher**, and choose GitHub Actions with these values:
   - Organization or user: `Or4cu1o`
   - Repository: `vibecoding-devtools`
   - Workflow filename: `release.yml`
   - Environment name: leave empty (the workflow uses no environment)
   - Allowed actions: tick direct publishing with `npm publish`. The workflow uses it, and a configuration created
     after 2026-09-03 permits only staged publishing by default.
3. The fields are case-sensitive and must match exactly. The npm docs state that npm does not verify them on save and
   that the first successful publish validates the configuration, which must happen within 2 days.

### Does the package need to exist first?

The npm docs for trusted publishers do not say whether the configuration can be created before the first version
exists. Check the **Trusted Publisher** section for a package that is not on the registry yet:

- If npmjs.com accepts it, push the tag and the workflow performs the first publish.
- If it does not, publish `1.0.1` once by hand from a clean checkout of the tag with
  `npm publish --access public` (this uses your own 2FA login, not a token), then configure the trusted publisher
  and use the workflow from the next version on. The first version then has no provenance.

## Checking provenance

- On the package page at `https://www.npmjs.com/package/vibecoding-devtools`, the version shows a provenance
  section linking to the source commit and the workflow run.
- From a terminal, in a project that installed the package, run `npm audit signatures`. It reports the packages with
  verified attestations.

## After the first publish

In the package **Settings**, under **Publishing access**, select **Require two-factor authentication and disallow
tokens** and save. Trusted publishing keeps working; only token-based publishing is blocked.
