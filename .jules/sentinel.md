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

## 2026-11-05 - Cross-Origin Resource Policy (CORP) Enforcement on Local Server Endpoints
**Vulnerability:** Without `Cross-Origin-Resource-Policy: same-origin`, browsers permit external web origins to make `no-cors` subresource requests embedding sensitive local endpoints (such as `/api/jobs` or static assets) via `<img>`, `<script>`, or media tags. While standard CORS prevents cross-origin JavaScript from reading response text directly, XS-Leaks (cross-site search/leak via resource loading timing or error events) and speculative execution side channels (Spectre) can infer sensitive personal job search preferences, listings, and application status.
**Learning:** `Cross-Origin-Opener-Policy` isolates browsing contexts at the window level, but does not prevent cross-origin subresource embedding. `Cross-Origin-Resource-Policy: same-origin` is required to block cross-origin subresource reads and embeddings at the network layer.
**Prevention:** Always send `Cross-Origin-Resource-Policy: same-origin` alongside COOP and CSP on all responses in local web applications handling user data.

## 2026-11-06 - Host Header Validation against DNS Rebinding in Local HTTP Server
**Vulnerability:** Without Host header validation, a local HTTP server bound to loopback is vulnerable to DNS rebinding attacks. An attacker-controlled website can resolve to 127.0.0.1 via low-TTL DNS records, allowing attacker client-side JavaScript to execute same-origin requests to the local server. Because browsers consider the request same-origin to the attacker's domain, CORP, COOP, and CORS policies are bypassed, exposing local user profile data, search queries, and application history.
**Learning:** Browser origin-isolation defenses (CORS, CORP, COOP) assume the domain in the address bar is trust-partitioned. When a remote domain rebinds to loopback, only server-side Host header validation can distinguish legitimate local requests (e.g. localhost, 127.0.0.1, [::1]) from rebound external hosts. Note also that client-side fetch implementations (like Node's fetch) automatically enforce and overwrite Host headers with the target URL's authority, so testing raw Host header anomalies requires lower-level HTTP client agents (`http.request`).
**Prevention:** Strictly validate incoming `req.headers.host` against an allowlist of authorized local hostnames (`localhost`, `127.0.0.1`, `[::1]`, and configured host), rejecting unrecognized hosts with 403 Forbidden and malformed headers with 400 Bad Request before routing or serving requests.

## 2026-11-07 - Origin Header Validation on Mutating Endpoints for Cross-Origin CSRF Defense
**Vulnerability:** Relying solely on custom request headers (such as `X-Jobs-Radar`) for CSRF protection leaves a gap if cross-origin requests carry ambient credentials or bypass header checks. Modern browsers automatically attach the `Origin` header on all cross-origin POST, PUT, DELETE, and CORS requests. Without validating `req.headers.origin`, requests originating from external origins (e.g. `http://evil.com`) or opaque origins (`null`) could attempt mutating operations against the local service.
**Learning:** Custom header requirements provide protection against simple HTML form submissions, but verifying the browser-controlled `Origin` header against `allowedHosts` provides an essential defense-in-depth layer against cross-origin scripting and unauthorized ambient context requests.
**Prevention:** On all mutating endpoints (e.g. `POST`), validate `req.headers.origin` when present against authorized local hostnames (`localhost`, `127.0.0.1`, `[::1]`, and configured host), rejecting untrusted or malformed origins immediately with `403 Forbidden`.

## 2026-11-10 - HTTP Method Validation and 405 Method Not Allowed Handling
**Vulnerability:** When native Node.js HTTP servers route requests by compound `url.pathname === ... && req.method === ...` checks without dedicated method-mismatch handling, unsupported HTTP methods on existing routes fall through to a generic `404 Not Found`. This obscures endpoint contracts from clients and scanners, creating ambiguity between non-existent routes and valid routes invoked with disallowed methods.
**Learning:** Decoupling route pathname resolution from HTTP verb checking allows servers to strictly enforce HTTP semantics by returning `405 Method Not Allowed` alongside the mandatory `Allow` response header.
**Prevention:** For each recognized route, validate `req.method` against permitted verbs and return `405 Method Not Allowed` with an `Allow` header if an unsupported verb is requested.
