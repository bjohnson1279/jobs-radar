# Sentinel Security Journal

This journal records critical security learnings and vulnerability patterns specific to this project.

## 2026-10-31 - Restricting browser features via Permissions-Policy header
**Vulnerability:** Even when Content-Security-Policy (CSP) and frame ancestors restrictions are in place, modern browsers allow web pages and embedded contexts to query sensitive device APIs (such as geolocation, camera, and microphone) by default unless restricted by a `Permissions-Policy` header.
**Learning:** For utility and search applications that deal with unvetted external data (job listings scraped from third-party boards), defense-in-depth requires explicitly disabling browser device capabilities at the HTTP response level.
**Prevention:** Include `Permissions-Policy: geolocation=(), camera=(), microphone=()` across all HTTP responses alongside standard CSP, nosniff, and frame headers.
