# Security policy

## Supported versions

The `main` branch and the latest tagged release receive security fixes.

## Reporting a vulnerability

Please do not open a public issue for a possible security problem. Use GitHub's
**Security → Report a vulnerability** private advisory flow for this repository,
or contact the maintainer through the GitHub profile linked from the README.

Include enough detail to reproduce the issue and say whether it affects a
self-hosted instance, a deployed PWA, or the browser UI.

## Scope notes

Stay Tuned is a local-first application, but its Node proxy can fetch
user-supplied RSS, M3U and HLS URLs. Deployments exposed to the public internet
must add authentication, rate limiting, egress filtering and SSRF protection.
Never commit secrets, feed credentials or private server addresses.
