const express = require('express');
const booksRouter = require('./routes/books');
const genresRouter = require('./routes/genres');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/books', booksRouter);
app.use('/genres', genresRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;