# Jobs Radar

A configurable local job-search application that reads ATS boards and remote-job aggregators, ranks listings on a 0-100 fit scale, explains pros and cons, and tracks applications and listing age.

The committed configurations and test fixtures are generic examples. Personal preferences, imported resumes, job history, and application records stay outside version control and Docker images.

## Quick start with Node.js

Requires Node.js 22.18 or later (native TypeScript support) and npm.

```sh
npm ci
npm run setup
npm start
```

Edit `config/settings.local.json` for your location, country, role, skills, target companies, and scoring preferences. Restart after changing it. Setup never overwrites an existing local configuration. If no local file exists, the generic `config/settings.example.json` is used.

Open the URL printed at startup, normally http://127.0.0.1:3100. Click **Search job boards** to fetch listings. The example has no company boards populated; it uses RemoteOK and Jobicy for discovery. Add your own ATS board slugs to search company-specific postings.

```sh
npm run search       # CLI search
npm test            # Offline tests with synthetic fixtures
npm run typecheck   # TypeScript checks
```

Without an explicit `PORT`, the local server tries ports 3100 through 3200. Use `PORT` to choose a fixed port. Native runs listen on loopback by default.

## Run with Docker

Requires Docker Engine/Desktop and Docker Compose. No host Node.js installation is needed for this option.

Create your private configuration before starting Compose. In PowerShell:

```powershell
Copy-Item config/settings.example.json config/settings.local.json
```

On macOS/Linux:

```sh
cp config/settings.example.json config/settings.local.json
```

Skip copying if the local file already exists. Edit your local settings, then run:

```sh
docker compose up --build -d
docker compose logs -f
```

Open http://127.0.0.1:3100. To use a different host port, copy `.env.example` to `.env` and change `JOBS_RADAR_PORT`, or set the environment variable before running Compose. For example, PowerShell uses `$env:JOBS_RADAR_PORT = '3110'`.

```sh
docker compose stop       # Stop the app
# After editing configuration:
docker compose restart
# Rebuild after source/dependency changes:
docker compose up --build -d
# Remove the app container; bind-mounted files remain:
docker compose down
```

Compose mounts the private configuration read-only and `data/` read-write. Existing local history is therefore available in Docker. Run only one server against a given data directory: stop the native server before running Docker with the same history. On Linux, the host data directory must be writable by the container's non-root Node user (UID 1000); create it and set appropriate ownership if necessary.

The image contains production dependencies, source, web assets, and only the generic example configuration. `.dockerignore` allowlists the build inputs and excludes private files. The container runs as a non-root user with a health check, and Compose publishes its port only on host loopback. This is a local single-user app with no login system.

To run the checks during an image build:

```sh
docker build --target test -t jobs-radar-test -f docker/Dockerfile .
```

## Configuration and profiles

See [configuration reference](docs/configuration.md) for every section, country filtering, regex patterns, scoring, and provider setup. `config/examples/toronto-product-design.json` demonstrates a different location and profession using fictitious company targets.

You can select an alternate configuration in PowerShell:

```powershell
$env:JOBS_RADAR_CONFIG = './config/examples/toronto-product-design.json'
$env:JOBS_RADAR_DATA_FILE = './data/design-search/jobs.json'
npm start
```

Native `JOBS_RADAR_CONFIG` and `JOBS_RADAR_DATA_FILE` paths may be absolute or relative to the launch directory. Docker Compose uses `JOBS_RADAR_CONFIG` as the host configuration file to mount and `JOBS_RADAR_DATA_DIR` as the host history directory. See `.env.example` for Compose defaults. `.env` is read by Compose; native Node runs use environment variables directly.

Use separate data files/directories for different people. Tests always use `tests/fixtures/settings.json`, never your local profile, and do not contact ATS services.

## Listing history and applications

The web server saves listing snapshots, source publication dates, first-seen and last-seen dates, and application records in `data/jobs.json`. Back up your data directory to preserve history.

The default view shows unapplied listings from the latest search. Use **Applied - all history** or **All history** to see saved records eligible under your current profile. Mark a job applied with an editable date, update it, or undo the status. Opening an application link does not mark a listing applied; the app does not submit applications.

Publication dates are used when provided. Ashby dates are labeled **Last published**; unavailable dates fall back to **First seen**, which measures discovery rather than original publication. Age does not affect scoring. Missing jobs remain in history as **Not returned in latest search**, which does not confirm closure. New provider listing IDs are tracked separately even if company/title are the same.

Preferences can be changed without deleting history. Saved listings are reclassified and rescored on read. CLI searches do not update application history.

## API reference

For details on the HTTP endpoints used by the web interface, request/response formats, security headers, and application state updates, see the [API reference](docs/api.md).

## Project layout

```text
config/
  settings.example.json       Generic starter, committed
  settings.local.json         Your preferences, ignored
  examples/                   Additional generic profiles
src/
  entrypoints/                HTTP server and CLI
  config/                     Configuration loader and validation
  domain/                     Types, filters, location, country, scoring, ranking
  providers/                  ATS and aggregator adapters
  services/                   Search orchestration
  storage/                    Atomic persistent history store
  presentation/               CLI formatting
web/                          Browser interface
scripts/                      Local setup utilities
tests/                        Offline tests and synthetic fixtures
docs/                         Configuration and API documentation
docker/                       Multi-stage Dockerfile
data/                         Personal history and artifacts, ignored
compose.yaml                  Local container orchestration
```

## Before committing

Commit source, documentation, lockfiles, and example profiles. Keep `*.local.json`, `*.local.md`, `.env*` (except `.env.example`), resumes/documents, and `data/` out of Git. Private configuration and data are mounted at runtime, never copied into an image.

```sh
git status --short
git diff --cached --stat
git check-ignore config/settings.local.json data/jobs.json
```

The ignore rules do not remove files that were already committed; inspect the staged diff before publishing. Git commits retain the author identity configured in Git.

## Limitations

Provider errors currently skip the source, and aggregator discovery windows may omit older listings. Workday currently scores only title/location information. Titles and descriptions are matched with configurable patterns, including optional skills and boilerplate; scores are heuristic fit indicators, not hiring probabilities. Source country/location text can be ambiguous, so strict filters can omit otherwise suitable roles. Board slugs and current source availability are not validated at startup.

## Security Policy & Vulnerability Reporting

Security is a top priority. Please review our [Security Policy](SECURITY.md) for details on how to responsibly disclose vulnerabilities.

> ⚠️ **DO NOT open public GitHub issues for security vulnerabilities.** Follow the private reporting process outlined in [SECURITY.md](SECURITY.md).
