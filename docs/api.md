# API Reference

Jobs Radar provides a lightweight HTTP JSON API used by the browser interface and local automation scripts. The server listens on loopback (`127.0.0.1` by default) across ports 3100 through 3200.

## Global Headers & Security

All responses include security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy: same-origin`
- `Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`

JSON endpoints return `Cache-Control: no-store` and `Content-Type: application/json`.

Mutating requests (`POST /api/refresh` and `POST /api/application`) enforce custom header checks (`X-Jobs-Radar`) as a lightweight CSRF guard against cross-origin ambient browser requests.

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
        "locationScore": "number",
        "score": "number",
        "rawScore": "number",
        "pros": [
          { "label": "string", "contribution": "number" }
        ],
        "cons": [
          { "label": "string", "contribution": "number" }
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
  Returned if the `X-Jobs-Radar: refresh` header is missing or incorrect.
  ```json
  {
    "error": "Invalid refresh request"
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
  Returned if the `X-Jobs-Radar: application` header is missing or incorrect.
  ```json
  {
    "error": "Invalid application request"
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

#### Practical Usage
Invoked when marking a job applied, changing an application date, or clicking "Undo applied" on a card in the web interface. Application records persist across future job refreshes and config reloads.
