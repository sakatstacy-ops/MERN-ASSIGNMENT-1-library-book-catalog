require('dotenv').config();

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const Book = require('../models/Book');
const Genre = require('../models/Genre');

const testDatabase = 'library_catalog_api_test';
const mongoUri = process.env.TEST_MONGODB_URI || `mongodb://127.0.0.1:27017/${testDatabase}`;
let genre;
let otherGenre;

function bookPayload(overrides = {}) {
  return {
    title: 'Dune Test Edition',
    author: 'Frank Herbert',
    isbn: '9781234500001',
    description: 'A test book for API integration coverage.',
    coverImage: 'https://example.com/dune-test.jpg',
    totalCopies: 8,
    availableCopies: 5,
    genre: String(genre._id),
    ...overrides,
  };
}

before(async () => {
  await mongoose.connect(mongoUri);
  await Promise.all([Book.deleteMany({}), Genre.deleteMany({})]);
  [genre, otherGenre] = await Genre.create([
    { name: 'Test Science Fiction', slug: 'test-science-fiction' },
    { name: 'Test Mystery', slug: 'test-mystery' },
  ]);
});

after(async () => {
  await Promise.all([Book.deleteMany({}), Genre.deleteMany({})]);
  await mongoose.disconnect();
});

test('health and book list return JSON with pagination metadata', async () => {
  await Book.create([
    bookPayload({ isbn: '9781234500002', title: 'Dune Test One' }),
    bookPayload({ isbn: '9781234500003', title: 'Dune Test Two' }),
    bookPayload({ isbn: '9781234500004', title: 'Other Test', author: 'Dune Author', genre: String(otherGenre._id) }),
  ]);

  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.status, 'ok');

  const response = await request(app)
    .get(`/books?genre=${genre._id}&search=dune&page=2&limit=1`)
    .expect(200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.pagination.total, 2);
  assert.equal(response.body.pagination.totalPages, 2);
  assert.equal(response.body.pagination.page, 2);
  assert.equal(response.body.data[0].genre.name, 'Test Science Fiction');
});

test('book search matches author case-insensitively and ignores regex syntax', async () => {
  const authorMatch = await request(app).get('/books?search=FRANK%20HERBERT&limit=20').expect(200);
  assert.equal(authorMatch.body.pagination.total, 2);

  const escaped = await request(app).get('/books?search=%5B&limit=20').expect(200);
  assert.equal(escaped.body.pagination.total, 0);
});

test('empty and malformed book bodies return field-specific 400 JSON', async () => {
  const empty = await request(app).post('/books').send({}).expect(400);
  assert.equal(empty.body.error, 'Validation failed');
  assert.ok(empty.body.fields.some((issue) => issue.field === 'title'));
  assert.equal(JSON.stringify(empty.body).includes('ValidationError'), false);

  const wrongType = await request(app).post('/books').send(bookPayload({ totalCopies: 'many' })).expect(400);
  assert.ok(wrongType.body.fields.some((issue) => issue.field === 'totalCopies'));

  const missingGenre = await request(app).post('/books').send(bookPayload({ genre: '012345678901234567890123' })).expect(400);
  assert.ok(missingGenre.body.fields.some((issue) => issue.field === 'genre'));
});

test('book CRUD creates, reads, updates, and deletes with expected statuses', async () => {
  const created = await request(app).post('/books').send(bookPayload({ isbn: '9781234500010' })).expect(201);
  const id = created.body.data._id;
  assert.equal(created.body.data.genre.name, 'Test Science Fiction');

  const read = await request(app).get(`/books/${id}`).expect(200);
  assert.equal(read.body.data.isbn, '9781234500010');

  const updated = await request(app).put(`/books/${id}`).send(bookPayload({
    title: 'Updated Dune Test',
    isbn: '9781234500011',
  })).expect(200);
  assert.equal(updated.body.data.title, 'Updated Dune Test');

  await request(app).delete(`/books/${id}`).expect(204);
  await request(app).get(`/books/${id}`).expect(404);
});

test('genre CRUD and referenced-genre delete protection work', async () => {
  const created = await request(app).post('/genres').send({ name: 'Temporary Genre', slug: 'temporary-genre' }).expect(201);
  const id = created.body.data._id;

  const list = await request(app).get('/genres').expect(200);
  assert.ok(list.body.data.some((item) => item._id === id));

  const read = await request(app).get(`/genres/${id}`).expect(200);
  assert.equal(read.body.data.slug, 'temporary-genre');

  await request(app).put(`/genres/${id}`).send({ name: 'Renamed Genre', slug: 'renamed-genre' }).expect(200);
  await request(app).delete(`/genres/${id}`).expect(204);

  await request(app).post('/books').send(bookPayload({ isbn: '9781234500012' })).expect(201);
  await request(app).delete(`/genres/${genre._id}`).expect(409);
});

test('invalid IDs and paging values are JSON errors, not server errors', async () => {
  const invalidId = await request(app).get('/genres/not-an-id').expect(400);
  assert.ok(invalidId.body.error);

  const invalidPage = await request(app).get('/books?page=0').expect(400);
  assert.ok(invalidPage.body.fields.some((issue) => issue.field === 'page'));

  await request(app).get('/books/aaaaaaaaaaaaaaaaaaaaaaaa').expect(404);
  await request(app).get('/genres/aaaaaaaaaaaaaaaaaaaaaaaa').expect(404);
  const missingRoute = await request(app).get('/not-a-route').expect(404);
  assert.ok(missingRoute.body.error);
  assert.equal(JSON.stringify(missingRoute.body).includes('stack'), false);
});