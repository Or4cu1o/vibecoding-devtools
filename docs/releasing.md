# Releasing

The package is published to the npm registry as `vibecoding-devtools` by `.github/workflows/release.yml`, using npm
trusted publishing (OIDC) with provenance. The workflow holds no token and no secret. Version 1.0.1 was published by
hand on 2026-11-06, without provenance; later tags publish from the workflow and are staged for approval.

## Release flow

1. Move the `[Unreleased]` entries of `CHANGELOG.md` to `[X.Y.Z] - YYYY-MM-DD`.
2. Set `version` to `X.Y.Z` in `package.json` and in both places of `npm-shrinkwrap.json`.
3. Commit, then push the tag `vX.Y.Z`.

The workflow runs lint, `validate-kit` and the tests on Linux and Windows. The publish job then fails unless the tag
equals `v` + the `package.json` version, the package name is `vibecoding-devtools` and `repository.url` is
`git+https://github.com/Or4cu1o/vibecoding-devtools.git` (the form npm normalizes to). Only then does it run
`npm stage publish --provenance --access public`.

## Approving a release

The workflow only stages the version: it is not installable until the owner approves it with 2FA, on npmjs.com or from
a terminal:

```bash
npm stage list vibecoding-devtools
npm stage approve STAGE-ID
```

Use `npm stage view STAGE-ID` or `npm stage download STAGE-ID` to inspect a staged version first, and
`npm stage reject STAGE-ID` to discard it.

## One-time setup on GitHub

In the repository, open **Settings**, then **Environments**, and create an environment named `npm`. Under
**Deployment branches and tags**, select **Selected branches and tags** and add a tag rule `v*`, so only `v*` tags can
run the publish job.

## One-time setup on npmjs.com

1. Create or use an npm account and enable two-factor authentication.
2. Open the package page, then **Settings**, then **Trusted Publisher**, and choose GitHub Actions with these values:
   - Organization or user: `Or4cu1o`
   - Repository: `vibecoding-devtools`
   - Workflow filename: `release.yml`
   - Label: `github-release`
   - Environment name: `npm` (the publish job runs in the GitHub environment of the same name)
   - Allowed actions: leave direct publishing with `npm publish` unchecked, so the trusted publisher can only stage.
3. The fields are case-sensitive and must match exactly. The npm docs state that npm does not verify them on save and
   that the first successful publish validates the configuration, which must happen within 2 days.

### First publish

The npm docs for trusted publishers do not say whether the configuration can be created before the first version
exists, so `1.0.1` was published by hand (`npm publish --access public`, with a personal 2FA login, no token) on
2026-11-06, without provenance. The trusted publisher was configured afterwards, and the workflow stages every later
tag with provenance. While setting it up, npmjs.com created a placeholder version `0.0.0-stage`, which can be
unpublished within 72 hours.

## Checking provenance

- On the package page at `https://www.npmjs.com/package/vibecoding-devtools`, the version shows a provenance
  section linking to the source commit and the workflow run.
- From a terminal, in a project that installed the package, run `npm audit signatures`. It reports the packages with
  verified attestations.

## After the first publish

In the package **Settings**, under **Publishing access**, select **Require two-factor authentication and disallow
tokens** and save. Trusted publishing keeps working; only token-based publishing is blocked.
