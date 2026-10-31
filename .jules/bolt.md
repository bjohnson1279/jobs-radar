# Bolt Performance Journal

## 2025-05-20 - Presentation formatting scoring recomputation and salary regex fast-path
**Learning:** `rankJobs` attaches computed fit breakdown (`reasons`, `pros`, `cons`) to ranked objects. Calling `formatJob` during CLI output was re-running `scoreJobDetails` from scratch over thousands of long job descriptions, executing 25+ regular expressions per job a second time. Additionally, scanning unconstrained job descriptions with a salary regex incurred unnecessary evaluation when no `$` was present. Reusing `j.reasons` with fallback to `scoreJobDetails` and pre-checking `description.includes('$')` provides a ~33x speedup on formatting batches.
**Action:** Always forward and reuse calculated domain scoring/breakdown metadata into presentation formatters rather than re-evaluating rule engines, and guard salary regex passes with cheap substring pre-checks.

## 2025-05-19 - Location matcher regex overhead and memoization
**Learning:** `parseLocation` executes up to 8 regular expressions per call, including broad country matching against ~250 foreign country names and ~670 country codes. During search ranking over thousands of jobs, job locations repeat heavily. Scope-bound Map memoization keyed on `(location, title, sourceCountry)` yields a ~5.5x speedup for location parsing without introducing state leak across config changes.
**Action:** Memoize pure regex-heavy evaluation helpers that process repetitive fields like location and company metadata in list pipeline mappings.

## 2025-05-18 - Fast-path check and single-pass cleaning in V8 text processing
**Learning:** In V8, string replacement callbacks `replace(regex, fn)` incur JS-to-C++ boundary overhead when processing large HTML descriptions. Chained regexes remain faster, but fast-path checking (`includes('<') || includes('&')`) before executing multi-pass entity regexes completely skips redundant scans on clean strings. Furthermore, passing raw HTML to downstream scoring functions causes duplicate full-text cleaning passes.
**Action:** Always clean strings once at the entry point of pipeline transformations, and add cheap substring pre-checks (`includes`) before running multi-regex string replacement sequences.
