# Bolt Performance Journal

## 2025-05-20 - Fast-path scoring and title/company memoization
**Learning:** In list pipeline scoring, creating `new Set()` objects on every item for rule group deduplication and constructing unused `reasons`/`pros`/`cons` arrays during raw scraping calls adds significant GC and string formatting overhead. Parametrizing detail construction and using lazy array checks for small group sets, alongside Map memoization for company normalization and title filters, yields a ~30% performance boost for job scoring and ranking.
**Action:** Avoid allocating intermediate reporting structures (reasons, pros, cons) in high-throughput pipeline scoring methods when only numerical metrics are required, and lazy-initialize group collections.

## 2025-05-19 - Location matcher regex overhead and memoization
**Learning:** `parseLocation` executes up to 8 regular expressions per call, including broad country matching against ~250 foreign country names and ~670 country codes. During search ranking over thousands of jobs, job locations repeat heavily. Scope-bound Map memoization keyed on `(location, title, sourceCountry)` yields a ~5.5x speedup for location parsing without introducing state leak across config changes.
**Action:** Memoize pure regex-heavy evaluation helpers that process repetitive fields like location and company metadata in list pipeline mappings.

## 2025-05-18 - Fast-path check and single-pass cleaning in V8 text processing
**Learning:** In V8, string replacement callbacks `replace(regex, fn)` incur JS-to-C++ boundary overhead when processing large HTML descriptions. Chained regexes remain faster, but fast-path checking (`includes('<') || includes('&')`) before executing multi-pass entity regexes completely skips redundant scans on clean strings. Furthermore, passing raw HTML to downstream scoring functions causes duplicate full-text cleaning passes.
**Action:** Always clean strings once at the entry point of pipeline transformations, and add cheap substring pre-checks (`includes`) before running multi-regex string replacement sequences.
