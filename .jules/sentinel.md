# Sentinel Security Journal

This journal records critical security learnings and vulnerability patterns specific to this project.

## 2026-11-01 - Request Target Validation and Error Boundaries in HTTP Handler
**Vulnerability:** Node.js native `http.createServer` passes raw `req.url` which can contain malformed absolute URIs (e.g. `http://[`). Directly invoking `new URL(req.url, base)` outside an error boundary throws an unhandled `TypeError: Invalid URL` that terminates the server process. Additionally, unvalidated request targets allow proxy-style absolute URLs.
**Learning:** Never assume `req.url` in Node.js HTTP servers is either a relative path starting with `/` or syntactically valid for `new URL()`.
**Prevention:** Strictly enforce that request targets start with `/` (origin-form) and wrap `new URL()` instantiation in try/catch to safely return `400 Bad Request` instead of crashing.
