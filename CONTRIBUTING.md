# Contributing to Stay Tuned

Thanks for helping improve 留频. The project is released under
**GPL-3.0-only** (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).

## Before you start

- Use Node.js 22 or newer (minimum 20.19).
- Run `npm ci` once, then `npm test` and `npm run build` before opening a pull
  request.
- Read [docs/design/constraints.md](docs/design/constraints.md) before changing
  the receiver, layout, faders or themes.
- Keep changes focused; do not silently redesign unrelated screens.

## Licensing of contributions

By submitting a contribution you agree that it may be distributed under
GPL-3.0-only. We use the [Developer Certificate of Origin 1.1][dco] rather than
a separate CLA. Sign every commit:

```bash
git commit -s -m "Fix: ..."
```

The sign-off certifies that you have the right to submit the contribution
under the project's license. Do not copy code, images, audio, fonts or design
assets from another project unless you also add the source, license and
required attribution to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Asset policy

- New fonts must be redistributable (prefer SIL OFL) and include their license.
- New images/audio must be original, generated for the project, or explicitly
  licensed for GPL-3.0-compatible redistribution.
- Do not commit API keys, tokens, cookies, private feeds or personal data.
- If you add a dependency, run `npm run license:check`, then `npm run notices` to
  regenerate the dependency tables in `THIRD_PARTY_NOTICES.md`.

## Reporting bugs

Use GitHub Issues for bugs and feature requests. For security-sensitive reports,
follow [SECURITY.md](SECURITY.md).

[dco]: https://developercertificate.org/
