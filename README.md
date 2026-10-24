# Security Configuration Repository 🛡️

This repository manages security policies, dependency update configurations, issue templates, and security guidelines for the organization.

## Security Policy & Vulnerability Reporting

Security is a top priority. Please review our [Security Policy](SECURITY.md) for details on how to responsibly disclose vulnerabilities.

> ⚠️ **DO NOT open public GitHub issues for security vulnerabilities.** Follow the private reporting process outlined in [SECURITY.md](SECURITY.md).

## Repository Overview

- **`SECURITY.md`**: Security disclosure guidelines and supported versions.
- **`.github/dependabot.yml`**: Automated dependency security updates.
- **`.github/ISSUE_TEMPLATE/`**: Issue templates with security disclaimers.
- **`.github/PULL_REQUEST_TEMPLATE.md`**: Pull request template including a mandatory security checklist.
- **`.gitignore`**: Ignore rules preventing accidental commits of sensitive files (API keys, private certificates, `.env` files, etc.).
- **`.jules/sentinel.md`**: Journal tracking security learnings and architectural constraints.

## Contributing

When contributing changes to this repository:
1. Ensure no credentials, secret keys, or private tokens are committed.
2. Verify all pull requests against the checklist in [PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md).
