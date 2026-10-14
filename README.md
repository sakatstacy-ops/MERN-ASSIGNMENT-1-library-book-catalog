# Library Book Catalog

Mongoose data layer for a library catalog, with separate `Genre` and `Book` collections and a repeatable development seed.

## Setup

Requirements: Node.js with npm and a MongoDB Atlas database (or another MongoDB instance).

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and replace the placeholders in `MONGODB_URI` with your MongoDB connection details. Use a dedicated development database: the seed removes all existing documents from its `books` and `genres` collections.
3. Run `npm run seed`.

The script inserts five genres and twenty books, then prints a summary. It can be run again safely to restore the same catalog. Never commit `.env` or expose its connection string.

## Schema Design

### Genre

`name` is a required, trimmed, unique string used as the display label. `slug` is a required, trimmed, lowercase, URL-safe unique string for stable URLs. Both are stored once in the `genres` collection so books share consistent genre names and slugs; the trade-off is an extra query or populate operation when a book is displayed with genre details.

### Book

| Field | Type and constraints | Storage decision |
| --- | --- | --- |
| `title` | Required trimmed string | Embedded scalar: it belongs to one catalog book and is normally read with the rest of that book. |
| `author` | Required trimmed string | Embedded scalar: keeping the author label on each book makes catalog reads simple; a separate Author collection would add joins and is unnecessary for this assignment's data. |
| `isbn` | Required unique string; accepts ISBN-10/ISBN-13 shapes | Embedded scalar: it identifies this book edition and needs a unique index to prevent duplicate catalog entries. |
| `description` | Required trimmed string | Embedded scalar: book-specific descriptive text is read with the book and is not shared independently. |
| `coverImage` | Required URL string | Embedded scalar: the URL is a property of this book's cover and avoids another lookup. |
| `totalCopies` | Required whole number, minimum 1 | Embedded scalar: this inventory count belongs to this catalog record and is read together with availability. |
| `availableCopies` | Required whole number, minimum 0, no greater than `totalCopies` | Embedded scalar: it is book inventory state. Keeping both counts together simplifies checks, though concurrent checkout workflows would later need atomic updates to avoid stale counts. |
| `genre` | Required `ObjectId`, `ref: 'Genre'` | Reference, not an embedded genre object: many books can share a genre without duplicating its name/slug. This improves consistency at the cost of a populate or second query. |

The seed creates genre documents first, maps their slugs to MongoDB `_id` values, and inserts those IDs into each book's `genre` field. Seeded ISBN-13 check digits are valid, ISBN values are unique, and no seeded `availableCopies` value exceeds its `totalCopies`.

## Submission Evidence

After running the seed against Atlas, capture the `books` collection with at least 15 documents and the `genres` collection with at least four documents. Submit those genuine Atlas screenshots and this repository's URL through the course portal.

This repository's `screenshots/` directory currently contains locally captured collection views from `localhost:27017` to verify the seed output. They are not Atlas screenshots and do not replace the Atlas evidence required above.

## Catalog API

The Express API uses the same Mongoose models and `MONGODB_URI` as the seed script. Install dependencies with `npm install`, configure `.env`, seed the database if needed with `npm run seed`, and start the service with `npm start`. The default address is `http://localhost:3000`; set `PORT` to override it. `GET /health` returns a small health status.

### Book endpoints

| Method | Endpoint | Success |
| --- | --- | --- |
| `GET` | `/books` | `200`; `{ data, pagination }` |
| `GET` | `/books/:id` | `200`; one book, or `404` if absent |
| `POST` | `/books` | `201`; created book |
| `PUT` | `/books/:id` | `200`; updated book, or `404` if absent |
| `DELETE` | `/books/:id` | `204`; `404` if absent |

`GET /books` accepts `genre=<genre ObjectId>`, `search=<text>`, `page=<positive integer>`, and `limit=<1..100>`. The filters compose, and search is case-insensitive across title and author. Results are sorted by title and then ID for stable paging. For example: `GET /books?genre=<genreId>&search=dune&page=2&limit=5`. The response contains `data` and `pagination` fields (`page`, `limit`, `total`, and `totalPages`). Invalid IDs, unknown genres, and invalid page values return `400` JSON.

### Genre endpoints

| Method | Endpoint | Success |
| --- | --- | --- |
| `GET` | `/genres` | `200`; list of genres |
| `GET` | `/genres/:id` | `200`; one genre, or `404` if absent |
| `POST` | `/genres` | `201`; created genre |
| `PUT` | `/genres/:id` | `200`; updated genre, or `404` if absent |
| `DELETE` | `/genres/:id` | `204` when deleted; `409` if books still reference it; `404` if absent |

Genre deletion is restricted while any book references that genre. This avoids orphaned book references and asks the caller to reassign or delete those books first.

### Validation and errors

Book and genre create/update routes validate required fields, JSON types, and schema constraints before writing. Book validation also confirms the referenced genre exists. Validation failures, including duplicate unique values, return `400` with `{ "error": "Validation failed", "fields": [{ "field": "...", "message": "..." }] }`. Invalid ObjectId route parameters return `400`; unknown resources return `404`; unexpected failures return generic JSON without stack traces or raw database error details.

### Postman and tests

Import [`postman/library-catalog.postman_collection.json`](postman/library-catalog.postman_collection.json) into Postman. Set `baseUrl`, and replace `genreId` and `bookId` with IDs from your database. The collection includes all book/genre endpoints, combined filtering, and a saved empty-body `400` validation example.

Run `npm test` to execute the integration suite. Tests use `TEST_MONGODB_URI` when set, otherwise the isolated local database `library_catalog_api_test`; the suite clears the `books` and `genres` collections in that test database before and after running.