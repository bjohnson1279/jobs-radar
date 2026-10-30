# Jobs Radar API Reference

This document provides a comprehensive specification of the HTTP API endpoints provided by Jobs Radar. The web interface communicates with the backend local server via these routes.

## Base URL & General Headers

By default, the server runs locally at `http://127.0.0.1:3100`.

All JSON endpoints return standard HTTP status codes and set `Content-Type: application/json` and `Cache-Control: no-store`.

Standard security headers included on all responses:
* `X-Content-Type-Options: nosniff`
* `X-Frame-Options: DENY`
* `Referrer-Policy: strict-origin-when-cross-origin`
* `Cross-Origin-Opener-Policy: same-origin`
* `Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`

---

## Endpoints

### 1. Health Check

Checks backend server status. Used for container health checks and readiness monitoring.

* **HTTP Method**: `GET`
* **Route Path**: `/api/health`
* **Headers**: None required.
* **Parameters**: None.

#### Response

* **Status Code**: `200 OK`
* **Payload Schema**:
  ```json
  {
    "status": "ok"
  }
  ```

---

### 2. Get Jobs and Profile

Retrieves current profile metadata, ranked job listings, background refresh status, search timestamp, and last error message (if any).

* **HTTP Method**: `GET`
* **Route Path**: `/api/jobs`
* **Headers**: None required.
* **Parameters**: None.

#### Response

* **Status Code**: `200 OK`
* **Payload Schema**:
  ```json
  {
    "profile": {
      "name": "Alex Mercer",
      "description": "Senior Software Engineer with full-stack and distributed systems experience.",
      "locationLabel": "Greater Seattle Area",
      "country": "United States",
      "includeLocal": true,
      "includeRemote": true
    },
    "jobs": [
      {
        "id": "lever:example-corp:12345",
        "company": "Example Corp",
        "title": "Senior Software Engineer",
        "location": "Seattle, WA",
        "url": "https://jobs.lever.co/example-corp/12345",
        "description": "Full job description text...",
        "score": 85,
        "rawScore": 170,
        "isLocal": true,
        "isRemote": false,
        "postedAt": "2025-01-15T00:00:00.000Z",
        "postedDateKind": "lastPublished",
        "firstSeenAt": "2025-01-16T10:00:00.000Z",
        "lastSeenAt": "2025-01-20T10:00:00.000Z",
        "inLatestSearch": true,
        "appliedAt": null,
        "pros": [
          { "label": "Full-stack / TypeScript", "contribution": 30 }
        ],
        "cons": []
      }
    ],
    "updatedAt": "2025-01-20T10:00:00.000Z",
    "refreshing": false,
    "error": null
  }
  ```

#### Practical Usage

Called on initial web page load to render the application header profile info and populate the job listings list.

---

### 3. Refresh Job Search

Triggers an asynchronous job board search across configured ATS boards and aggregators in the background.

* **HTTP Method**: `POST`
* **Route Path**: `/api/refresh`
* **Headers**:
  * `x-jobs-radar`: `refresh` (**Required**)

#### Response

* **Status Code**: `202 Accepted`
* **Payload Schema**:
  ```json
  {
    "refreshing": true
  }
  ```

#### Error Responses

* **Status Code**: `403 Forbidden` (Missing or invalid `x-jobs-radar` header)
  ```json
  {
    "error": "Invalid refresh request"
  }
  ```

#### Practical Usage

Triggered when the user clicks **Search job boards** in the browser interface. The web app periodically polls `GET /api/jobs` while `refreshing` is `true` until search completion.

---

### 4. Update Application Status

Marks a job listing as applied (with an optional or specified date) or undoes applied status.

* **HTTP Method**: `POST`
* **Route Path**: `/api/application`
* **Headers**:
  * `Content-Type`: `application/json` (**Required**)
  * `x-jobs-radar`: `application` (**Required**)
* **Request Body** (JSON, max 4 KB):

| Field | Type | Required / Optional | Description |
| --- | --- | --- | --- |
| `id` | `string` | **Required** | Unique identifier for the job listing (e.g. `greenhouse:acme:98765`). |
| `applied` | `boolean` | **Required** | `true` to record an application; `false` to undo/clear application status. |
| `appliedAt` | `string` | Optional | ISO 8601 date string or `YYYY-MM-DD`. Required when `applied` is `true`. Defaults to current date if omitted. Must not be in the future. |

#### Request Example

```json
{
  "id": "lever:example-corp:12345",
  "applied": true,
  "appliedAt": "2025-01-20T00:00:00.000Z"
}
```

#### Response

* **Status Code**: `200 OK`
* **Payload Schema**:
  ```json
  {
    "saved": true
  }
  ```

#### Error Responses

* **Status Code**: `400 Bad Request` (Missing required fields or invalid/future application date)
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
* **Status Code**: `403 Forbidden` (Missing or invalid `x-jobs-radar` header)
  ```json
  {
    "error": "Invalid application request"
  }
  ```
* **Status Code**: `404 Not Found` (Job ID not found in stored history)
  ```json
  {
    "error": "Unknown job"
  }
  ```
* **Status Code**: `413 Payload Too Large` (Body payload exceeds 4096 bytes)
  ```json
  {
    "error": "Request too large"
  }
  ```

#### Practical Usage

Called when user clicks **Mark as applied**, **Update application date**, or **Undo applied** in the web interface.
