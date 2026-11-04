# Sentinel Security Journal

This journal records critical security learnings and vulnerability patterns specific to this project.

## 2026-11-01 - Request Target Validation and Error Boundaries in HTTP Handler
**Vulnerability:** Node.js native `http.createServer` passes raw `req.url` which can contain malformed absolute URIs (e.g. `http://[`). Directly invoking `new URL(req.url, base)` outside an error boundary throws an unhandled `TypeError: Invalid URL` that terminates the server process. Additionally, unvalidated request targets allow proxy-style absolute URLs.
**Learning:** Never assume `req.url` in Node.js HTTP servers is either a relative path starting with `/` or syntactically valid for `new URL()`.
**Prevention:** Strictly enforce that request targets start with `/` (origin-form) and wrap `new URL()` instantiation in try/catch to safely return `400 Bad Request` instead of crashing.

## 2026-11-02 - Protocol-Relative and Backslash Request Targets Bypassing Origin Validation in WHATWG URL
**Vulnerability:** Checking `req.url.startsWith('/')` is insufficient to guarantee origin-form paths. Protocol-relative request targets like `//attacker.com/api/jobs` or paths with backslashes like `/\attacker.com` satisfy `.startsWith('/')`, but the WHATWG URL parser interprets `//` as a scheme-relative URI and converts backslashes to forward slashes, causing the parsed `url.origin` to change to an untrusted external host (e.g. `http://attacker.com`).
**Learning:** In WHATWG URL parsing, any string starting with `//` or containing backslashes immediately following the root slash can override the base URL's origin and hostname.
**Prevention:** Disallow paths starting with `//` or containing `\`, and assert `url.origin === baseOrigin` after `new URL(req.url, baseOrigin)` parsing to fail securely with `400 Bad Request`.

## 2026-11-03 - Media Type Confusion on Mutating JSON Endpoints
**Vulnerability:** In native HTTP servers handling JSON mutations, relying solely on custom headers (like `X-Jobs-Radar`) without validating the `Content-Type` header allows clients and potential cross-origin or proxy intermediaries to submit arbitrary MIME types or unexpected encodings without contract enforcement.
**Learning:** Checking media types early (`req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json'`) fails fast with `415 Unsupported Media Type` before streaming or deserializing request bodies, preventing media-type confusion and ensuring strictly typed input processing.
**Prevention:** Always validate that incoming payload media types match expected mime-types before consuming request streams on mutating JSON endpoints.
