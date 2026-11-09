# API Reference

Jobs Radar provides a lightweight HTTP JSON API used by the browser interface and local automation scripts. The server listens on loopback (`127.0.0.1` by default) across ports 3100 through 3200.

## Global Headers & Security

All responses include security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'`
- `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`

JSON endpoints return `Cache-Control: no-store` and `Content-Type: application/json`.

Incoming `Host` headers are validated against authorized local hosts (`localhost`, `127.0.0.1`, `[::1]`, and configured `HOST`) to prevent DNS rebinding attacks from malicious websites attempting to access local API endpoints.

Mutating requests (`POST /api/refresh` and `POST /api/application`) enforce custom header checks (`X-Jobs-Radar`) and validate incoming `Origin` headers against authorized local hosts (`allowedHosts`) when present, providing defense-in-depth against cross-origin CSRF attacks.

---

## Endpoints

### 1. Health Check

Checks if the server is up and responsive. Used by Docker Compose and container orchestrators for health monitoring.

- **Method**: `GET`
- **Route**: `/api/health`
- **Headers**: None required
- **Query Parameters**: None
- **Request Body**: None

#### Response

- **Status Code**: `200 OK`
- **Body Schema**:
  ```json
  {
    "status": "ok"
  }
  ```

---

### 2. Get Jobs and Profile

Retrieves the active profile configuration, ranked listing snapshots with calculated scores, pros/cons signals, and search status.

- **Method**: `GET`
- **Route**: `/api/jobs`
- **Headers**: None required
- **Query Parameters**: None
- **Request Body**: None

#### Response

- **Status Code**: `200 OK`
- **Body Schema**:
  ```json
  {
    "profile": {
      "name": "string",
      "description": "string",
      "locationLabel": "string",
      "country": "string",
      "includeLocal": "boolean",
      "includeRemote": "boolean"
    },
    "jobs": [
      {
        "id": "string",
        "title": "string",
        "company": "string",
        "url": "string",
        "location": "string",
        "country": "string | undefined",
        "description": "string",
        "postedAt": "string | null",
        "postedDateKind": "'original' | 'lastPublished' | undefined",
        "firstSeenAt": "string",
        "lastSeenAt": "string",
        "inLatestSearch": "boolean",
        "appliedAt": "string | null",
        "isRemote": "boolean",
        "isLocal": "boolean",
        "remoteHint": "boolean | undefined",
        "locationScore": "number",
        "score": "number",
        "rawScore": "number",
        "reasons": [ "string" ],
        "pros": [
          { "label": "string", "points": "number", "contribution": "number" }
        ],
        "cons": [
          { "label": "string", "points": "number", "contribution": "number" }
        ]
      }
    ],
    "updatedAt": "string | null",
    "refreshing": "boolean",
    "error": "string | null"
  }
  ```

#### Practical Usage
Called on web app load and after background refreshes to populate and filter listing cards. Jobs are pre-ranked according to `rawScore` descending, then company, then title.

---

### 3. Trigger Job Refresh

Triggers an asynchronous search across configured ATS boards (Greenhouse, Lever, Ashby, Workday) and aggregator sources (RemoteOK, Jobicy).

- **Method**: `POST`
- **Route**: `/api/refresh`
- **Headers**:
  - `X-Jobs-Radar: refresh` (*Required*)
- **Query Parameters**: None
- **Request Body**: None

#### Responses

- **Status Code**: `202 Accepted`
  Returned when the refresh job has been initiated or is already in progress.
  ```json
  {
    "refreshing": true
  }
  ```

- **Status Code**: `403 Forbidden`
  Returned if the `X-Jobs-Radar: refresh` header is missing or incorrect, or if the `Origin` header is untrusted.
  ```json
  {
    "error": "Invalid refresh request"
  }
  ```
  or
  ```json
  {
    "error": "Invalid Origin header"
  }
  ```

#### Practical Usage
Triggered when the user clicks the "Search job boards" button in the web UI. Because scraping and aggregator queries can take several seconds to a few minutes, the endpoint returns `202 Accepted` immediately, and the client polls `GET /api/jobs` until `refreshing` is false.

---

### 4. Update Application Status

Marks a job listing as applied with an application timestamp, updates the application date, or clears the applied status.

- **Method**: `POST`
- **Route**: `/api/application`
- **Headers**:
  - `Content-Type: application/json` (*Required*)
  - `X-Jobs-Radar: application` (*Required*)
- **Query Parameters**: None
- **Request Body**:
  - Max body size: 4096 bytes (4 KB).
  - JSON Schema:
    | Field | Type | Required / Optional | Description |
    | --- | --- | --- | --- |
    | `id` | `string` | **Required** | The unique listing identifier. |
    | `applied` | `boolean` | **Required** | `true` to record or update an application date; `false` to mark unapplied. |
    | `appliedAt` | `string` | **Optional** | ISO date string or date format accepted by `Date.parse()`. Required to be valid and not in the future when `applied` is `true`. Defaults to the current UTC timestamp if omitted. |

  Example Request:
  ```json
  {
    "id": "gh-example-12345",
    "applied": true,
    "appliedAt": "2025-05-20T00:00:00.000Z"
  }
  ```

#### Responses

- **Status Code**: `200 OK`
  Application status updated successfully.
  ```json
  {
    "saved": true
  }
  ```

- **Status Code**: `400 Bad Request`
  Returned if the body is invalid JSON, missing required fields, or has an invalid/future date.
  ```json
  {
    "error": "Invalid JSON"
  }
  ```
  or
  ```json
  {
    "error": "id and applied are required"
  }
  ```
  or
  ```json
  {
    "error": "Application date must be valid and not in the future"
  }
  ```

- **Status Code**: `403 Forbidden`
  Returned if the `X-Jobs-Radar: application` header is missing or incorrect, or if the `Origin` header is untrusted.
  ```json
  {
    "error": "Invalid application request"
  }
  ```
  or
  ```json
  {
    "error": "Invalid Origin header"
  }
  ```

- **Status Code**: `404 Not Found`
  Returned if `id` does not match any job currently tracked in the data store.
  ```json
  {
    "error": "Unknown job"
  }
  ```

- **Status Code**: `413 Payload Too Large`
  Returned if the request payload exceeds 4096 bytes.
  ```json
  {
    "error": "Request too large"
  }
  ```
- **Status Code**: `415 Unsupported Media Type`
  Returned if the `Content-Type` header is missing or is not `application/json`.
  ```json
  {
    "error": "Content-Type must be application/json"
  }
  ```

#### Practical Usage
Invoked when marking a job applied, changing an application date, or clicking "Undo applied" on a card in the web interface. Application records persist across future job refreshes and config reloads.

---

### 5. Static Web Assets

Serves the front-end user interface files (HTML, client JavaScript, and CSS stylesheets).

- **Method**: `GET`
- **Routes**:
  - `/` (Serves `web/index.html`)
  - `/app.js` (Serves `web/app.js`)
  - `/style.css` (Serves `web/style.css`)
- **Headers**: None required
- **Query Parameters**: None
- **Request Body**: None

#### Responses

- **Status Code**: `200 OK`
  - `/`: Returns HTML document with `Content-Type: text/html; charset=utf-8`.
  - `/app.js`: Returns JavaScript application script with `Content-Type: text/javascript; charset=utf-8`.
  - `/style.css`: Returns CSS stylesheet with `Content-Type: text/css; charset=utf-8`.

All static responses include global security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Content-Security-Policy`).

#### Practical Usage
Requested by web browsers when accessing the application UI at the root server address.

---

## Generic Error Responses

In addition to endpoint-specific errors, the HTTP server returns standardized JSON error payloads for unrecognized routes, malformed requests, or unhandled exceptions:

### Malformed Request Target or Invalid Host (`400 Bad Request`)
Returned when an incoming request target is not in valid origin-form (e.g. malformed URIs, proxy-style paths with hostnames, protocol-relative URIs starting with `//`, or paths containing backslashes `\`) or when the `Host` header is missing or malformed.

- **Status Code**: `400 Bad Request`
- **Body Schema**:
  ```json
  {
    "error": "Bad Request"
  }
  ```
  or
  ```json
  {
    "error": "Invalid Host header"
  }
  ```

### Unauthorized Host (`403 Forbidden`)
Returned when an incoming request includes an unauthorized `Host` header (such as an external domain from a DNS rebinding attempt) not matching the allowed local hostnames.

- **Status Code**: `403 Forbidden`
- **Body Schema**:
  ```json
  {
    "error": "Invalid Host header"
  }
  ```

### Unrecognized Route (`404 Not Found`)
Returned when an HTTP request path does not match any recognized API endpoint or static asset.

- **Status Code**: `404 Not Found`
- **Body Schema**:
  ```json
  {
    "error": "Not found"
  }
  ```

### Server Error (`500 Internal Server Error`)
Returned when an unexpected error or unhandled exception occurs while serving a request.

- **Status Code**: `500 Internal Server Error`
- **Body Schema**:
  ```json
  {
    "error": "Unable to serve request"
  }
  ```
