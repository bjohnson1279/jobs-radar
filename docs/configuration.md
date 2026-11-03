# Configuration reference

All preferences live in a JSON file. Native startup uses `JOBS_RADAR_CONFIG` when set, otherwise `config/settings.local.json` if present, then `config/settings.example.json`. An explicitly selected missing or invalid file causes startup to fail with its path and field named. Configuration is loaded once; restart after editing.

| Section | Settings |
| --- | --- |
| `profile` | Display name and description |
| `location` | Country, local eligibility, tiers, remote policy, and display labels |
| `roles` | Title inclusion, exclusion, and zero-score patterns |
| `companies` | Preferred company names, bonus, one-hop display-name aliases, blocked companies |
| `scoring` | Normalization ceiling and weighted matching rules |
| `sources` | Company ATS boards, aggregator switches/tags, Jobicy page limit |
| `output.limit` | Maximum CLI results per section |

## Profile

The `profile` section customizes header display metadata exposed to the UI and API:

- `profile.name`: Display name representing the search configuration profile.
- `profile.description`: High-level summary of target roles and priorities shown under the application header.

## Patterns and roles

Patterns are case-insensitive regular expressions inside JSON strings. Escape backslashes twice, for example `"\\bpython\\b|\\bdjango\\b"`. An empty pattern disables matching. An empty `roles.includeTitlePattern` allows all titles; empty exclusion patterns exclude none.

`excludeTitlePattern` omits listings entirely. `excludedScoringTitlePattern` keeps an otherwise eligible listing but assigns zero fit. `excludeTitleStackPattern` is an optional hard exclusion for technologies explicitly named in a title, such as Kotlin or .NET. It applies to new searches and saved results before scoring, even if the title also names a preferred stack. Description-only mentions still use scoring rules. Leave it empty to disable it or remove a technology when it is relevant to your profile. The example profile is only a starting point; change both filters to suit your profession and level.

## Country and location

Set `location.country.name` and literal `aliases`, such as United States with US, USA, U.S., and U.S.A. Country evidence comes from location or structured source metadata, not the title. Configured local areas can establish eligibility when no foreign country conflicts.

The examples set `allowUnspecifiedRemote: false` and `allowMultiCountryRemote: false`. Unknown-country, worldwide, and mixed target/foreign listings are excluded. Enable either option only if you want that broader interpretation. Country-name recognition supplements `restrictedRemotePattern`, which can reject additional cities/regions/global wording. Adjust those restrictions when changing countries.

`location.label` provides a human-readable name for your target region (for example, `"Seattle area"`), displayed in the CLI output headers and web interface. `location.proximityLabel` defines the display name used in score breakdowns/pros when a job earns local tier points (for example, `"Seattle proximity"`).

Local eligibility matches `localPattern` or a tier, unless a tier-only match is disambiguated by `excludedLocalPattern`. Tiers contain `label`, `pattern`, and nonnegative `points`. The highest matching tier wins. Zero-point tiers still make a location eligible. These are preference bonuses, not measured distances or commute times. Verify that a matching office is available for the role.

Use `includeLocal` and `includeRemote` to enable result categories. A remote-only profile can set `includeLocal: false`, empty local patterns, and no tiers. The source's remote hint does not override country restrictions.

## Scoring

Each rule has `label`, `pattern`, integer `points`, and `scope` (`title` or `content`). Content includes title plus description. Each rule scores once per job; combine synonyms in one pattern. Positive rules become pros and negative rules become cons. Zero weights contribute nothing. Optional `group` values make only the first matching rule in that group count.

The weighted total includes matching rules plus company/location bonuses. Displayed fit is `min(100, round(100 * max(0, total) / maxRawScore))`. The generic engineering example uses `maxRawScore: 200`: totals 145 and 125 display as 73 and 63. Pros/cons show contributions on the same scale. Rounding and caps can make their sum differ from the displayed fit. Raw totals preserve ordering when displayed scores tie. The scale does not depend on other search results.

Targets are independent of boards: adding a source board does not automatically grant a company bonus. Company matching ignores case and punctuation. `companies.targets` awards `companies.bonus` points when an employer matches a target name. `companies.aliases` maps display names to a configured target in one step. `companies.blocklist` lists employer names that are completely excluded from both search results and ranked history.

## Sources

Greenhouse, Lever, and Ashby arrays contain career-board slugs. Find them in the employer's career-board URL; the example leaves those arrays empty to avoid implying real target employers. Workday entries contain `tenant`, `datacenter`, `site`, and `displayName` based on the employer's career URL.

`remoteok` and `jobicy` each have `enabled` and `tags`; Jobicy also has `maxPages`. Disabling a source skips it. These aggregators supply remote roles regardless of your configured profession. ATS boards are queried individually rather than searching every employer on a platform.

No authentication credentials are needed for the currently used public listing endpoints. Keep any future credentials in ignored environment files rather than example profiles.

## Output

`output.limit` specifies the maximum number of results printed per section (Local Matches and Remote Matches) when running the CLI search (`npm run search`). It must be an integer between 1 and 10000.
