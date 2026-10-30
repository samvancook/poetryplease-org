import { readFileSync } from 'node:fs';

const books = JSON.parse(readFileSync(new URL('./book-catalog-lookup.json', import.meta.url), 'utf8'));
const key = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const attributes = new Map(books.filter(book => book.chapbookContestResult).map(book => [
  key(book.author) + '|' + key(book.title),
  Object.freeze({ chapbookContestWinner: book.chapbookContestWinner === true,
    chapbookContestYear: book.chapbookContestYear, chapbookContestResult: book.chapbookContestResult }),
]));

// Book title alone is insufficient: some legacy assets carry another book's label.
export function bookReviewAttributes(item = {}) {
  return attributes.get(key(item.author) + '|' + key(item.book)) || null;
}

export function matchesBookReviewGroup(item, filters = {}) {
  if (!filters.bookGroup) return !filters.contestYear;
  if (filters.bookGroup !== 'chapbook-winners') return false;
  const book = bookReviewAttributes(item);
  return book?.chapbookContestWinner === true && (!filters.contestYear || String(book.chapbookContestYear) === String(filters.contestYear));
}

export function bookReviewGroups() {
  return [{ id: 'chapbook-winners', label: 'Chapbook contest winners',
    years: [...new Set(books.filter(book => book.chapbookContestWinner === true).map(book => book.chapbookContestYear))].sort((a, b) => b - a) }];
}
