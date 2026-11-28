"use strict";

// Rights table for the public-domain-poetry.com collection
// (GitHub copy: facjure/public-domain-poetry, the same site the Hugging Face
// "public-domain-poetry" dataset was scraped from).
//
// That collection is NOT all public domain: it also holds living and recent
// poets (Yehuda Amichai, Nizar Qabbani, A. R. Ammons, Elizabeth Jennings...)
// and translations with no translator or date. The files carry no dates, so
// a poet is cleared only when:
//   - they wrote in English (no translation question), and
//   - they died before 1931, so nothing they published in their lifetime
//     can be from 1931 or later.
// Death years are from general reference, not checked per poem. Poets whose
// work was partly first printed after 1930 are left out even if they died
// earlier (Dickinson: later editions 1935-1955; Teasdale died 1933).
//
// name in the collection -> [display name, death year]
const CLEARED = {
  "Robert Herrick": ["Robert Herrick", 1674],
  "William Wordsworth": ["William Wordsworth", 1850],
  "Edward Lear": ["Edward Lear", 1888],
  "Madison Julius Cawein": ["Madison Cawein", 1914],
  "Walt Whitman": ["Walt Whitman", 1892],
  "Ella Wheeler Wilcox": ["Ella Wheeler Wilcox", 1919],
  "Thomas Moore": ["Thomas Moore", 1852],
  "George MacDonald": ["George MacDonald", 1905],
  "William Shakespeare": ["William Shakespeare", 1616],
  "Michael Drayton": ["Michael Drayton", 1631],
  "Thomas Hardy": ["Thomas Hardy", 1928],
  "Algernon Charles Swinburne": ["Algernon Charles Swinburne", 1909],
  "Percy Bysshe Shelley": ["Percy Bysshe Shelley", 1822],
  "Paul Laurence Dunbar": ["Paul Laurence Dunbar", 1906],
  "Robert Burns": ["Robert Burns", 1796],
  "Philip Sidney (Sir)": ["Sir Philip Sidney", 1586],
  "William Lisle Bowles": ["William Lisle Bowles", 1850],
  "Walter Crane": ["Walter Crane", 1915],
  "Anna Seward": ["Anna Seward", 1809],
  "James Whitcomb Riley": ["James Whitcomb Riley", 1916],
  "Ralph Waldo Emerson": ["Ralph Waldo Emerson", 1882],
  "Jonathan Swift": ["Jonathan Swift", 1745],
  "Alfred Lord Tennyson": ["Lord Alfred Tennyson", 1892],
  "Walter Savage Landor": ["Walter Savage Landor", 1864],
  "John Keats": ["John Keats", 1821],
  "William Ernest Henley": ["William Ernest Henley", 1903],
  "Matthew Prior": ["Matthew Prior", 1721],
  "Elizabeth Barrett Browning": ["Elizabeth Barrett Browning", 1861],
  "Henry Wadsworth Longfellow": ["Henry Wadsworth Longfellow", 1882],
  "Christina Georgina Rossetti": ["Christina Rossetti", 1894],
  "Christina Rossetti": ["Christina Rossetti", 1894],
  "James McIntyre": ["James McIntyre", 1906],
  "Oscar Fingal O'Flahertie Wills Wilde": ["Oscar Wilde", 1900],
  "Oscar Wilde": ["Oscar Wilde", 1900],
  "Robert Fuller Murray": ["Robert Fuller Murray", 1894],
  "Alexander Pope": ["Alexander Pope", 1744],
  "Eugene Field": ["Eugene Field", 1895],
  "William Cowper": ["William Cowper", 1800],
  "Archibald Lampman": ["Archibald Lampman", 1899],
  "John Milton": ["John Milton", 1674],
  "William Blake": ["William Blake", 1827],
  "Emma Lazarus": ["Emma Lazarus", 1887],
  "Louisa May Alcott": ["Louisa May Alcott", 1888],
  "Rupert Brooke": ["Rupert Brooke", 1915],
  "Gerard Manley Hopkins": ["Gerard Manley Hopkins", 1889],
  "Herman Melville": ["Herman Melville", 1891],
  "Alan Seeger": ["Alan Seeger", 1916],
  "Francis William Lauderdale Adams": ["Francis Adams", 1893],
  "John Frederick Freeman": ["John Freeman", 1929],
  "John Hartley": ["John Hartley", 1915],
  "Matthew Arnold": ["Matthew Arnold", 1888],
  "George Pope Morris": ["George Pope Morris", 1864],
  "John Greenleaf Whittier": ["John Greenleaf Whittier", 1892],
  "Henry Lawson": ["Henry Lawson", 1922],
  "Robert Browning": ["Robert Browning", 1889],
  "Jean Ingelow": ["Jean Ingelow", 1897],
  "Ben Jonson": ["Ben Jonson", 1637],
  "Laurence Hope (Adela Florence Cory Nicolson)": ["Laurence Hope", 1904],
  "Charles Sangster": ["Charles Sangster", 1893],
  "Sidney Lanier": ["Sidney Lanier", 1881],
  "Rose Hawthorne Lathrop": ["Rose Hawthorne Lathrop", 1926],
  "Henry Kendall": ["Henry Kendall", 1882],
  "Alice Christiana Gertrude Thompson Meynell": ["Alice Meynell", 1922],
  "Alice Christiana Thompson Meynell": ["Alice Meynell", 1922],
  "Thomas Hood": ["Thomas Hood", 1845],
  "George Gordon Byron": ["George Gordon, Lord Byron", 1824],
  "Lord Byron": ["George Gordon, Lord Byron", 1824],
  "Edgar Allan Poe": ["Edgar Allan Poe", 1849],
  "Edgar Allen Poe": ["Edgar Allan Poe", 1849],
  "Bliss Carman (William)": ["Bliss Carman", 1929],
  "Samuel Taylor Coleridge": ["Samuel Coleridge", 1834],
  "Amy Lowell": ["Amy Lowell", 1925],
  "Oliver Wendell Holmes": ["Oliver Wendell Holmes", 1894],
  "George Parsons Lathrop": ["George Parsons Lathrop", 1898],
  "Kate Greenaway": ["Kate Greenaway", 1901],
  "Eric Mackay": ["Eric Mackay", 1898],
  "Maurice Henry Hewlett": ["Maurice Hewlett", 1923],
  "Charles Kingsley": ["Charles Kingsley", 1875],
  "Walter Scott (Sir)": ["Sir Walter Scott", 1832],
  "Arthur Hugh Clough": ["Arthur Hugh Clough", 1861],
  "William Allingham": ["William Allingham", 1889],
  "Ernest Christopher Dowson": ["Ernest Dowson", 1900],
  "John Charles McNeill": ["John Charles McNeill", 1907],
  "Robert Southey": ["Robert Southey", 1843],
  "Victor James Daley": ["Victor Daley", 1905],
  "Horatio Alger, Jr.": ["Horatio Alger, Jr.", 1899],
  "Alfred Joyce Kilmer (Joyce)": ["Joyce Kilmer", 1918],
  "Emily Pauline Johnson": ["E. Pauline Johnson", 1913],
  "Samuel Rogers": ["Samuel Rogers", 1855],
  "Jacob Bigelow": ["Jacob Bigelow", 1879],
  "Thomas Carew": ["Thomas Carew", 1640],
  "Frances Anne Kemble (Fanny)": ["Fanny Kemble", 1893],
  "John Wilmot": ["John Wilmot", 1680],
  "Dora Sigerson Shorter": ["Dora Sigerson Shorter", 1918],
  "John Milton Hay": ["John Hay", 1905],
  "William Cullen Bryant": ["William Cullen Bryant", 1878],
  "John Alexander McCrae": ["John McCrae", 1918],
  "John McCrae": ["John McCrae", 1918],
  "Lewis Carroll": ["Lewis Carroll", 1898],
  "William Browne": ["William Browne", 1645],
  "James Henry Leigh Hunt": ["James Henry Leigh Hunt", 1859],
  "William Morris": ["William Morris", 1896],
  "Oliver Goldsmith": ["Oliver Goldsmith", 1774],
  "Thomas Bailey Aldrich": ["Thomas Bailey Aldrich", 1907],
  "Will Carleton": ["Will Carleton", 1912],
  "Robert Bloomfield": ["Robert Bloomfield", 1823],
  "William Henry Drummond": ["William Henry Drummond", 1907],
  "Emily Bronte": ["Emily Bronte", 1848],
  "William Schwenck Gilbert": ["W. S. Gilbert", 1911],
  "James Barron Hope": ["James Barron Hope", 1887],
  "Abram Joseph Ryan": ["Abram Joseph Ryan", 1886],
  "Henry Austin Dobson": ["Austin Dobson", 1921],
  "Anne Bronte": ["Anne Bronte", 1849],
  "John Donne": ["John Donne", 1631],
  "Katharine Lee Bates": ["Katharine Lee Bates", 1929],
  "Thomas William Hodgson Crosland": ["T. W. H. Crosland", 1924],
  "James Elroy Flecker": ["James Elroy Flecker", 1915],
  "John Dryden": ["John Dryden", 1700],
  "Joaquin Miller": ["Joaquin Miller", 1913],
  "Mark Akenside": ["Mark Akenside", 1770],
  "Thomas Edward Brown": ["Thomas Edward Brown", 1897],
  "Horace Smith": ["Horace Smith", 1849],
  "William Hayley": ["William Hayley", 1820],
  "Margaret Sangster": ["Margaret Sangster", 1912],
  "Susanna Moodie": ["Susanna Moodie", 1885],
  "Ambrose Bierce": ["Ambrose Bierce", 1914],
  "Bret Harte (Francis)": ["Bret Harte", 1902],
  "Anne Bradstreet": ["Anne Bradstreet", 1672],
  "Wilfred Edward Salter Owen": ["Wilfred Owen", 1918],
  "Washington Irving": ["Washington Irving", 1859],
  "Susan Coolidge (Sarah Chauncey Woolsey)": ["Susan Coolidge", 1905],
  "Marietta Holley": ["Marietta Holley", 1926],
  "Helen Maria Williams": ["Helen Maria Williams", 1827],
  "Thomas Campion": ["Thomas Campion", 1620],
  "Thomas Campbell": ["Thomas Campbell", 1844],
  "Aphra Behn": ["Aphra Behn", 1689],
  "John Clare": ["John Clare", 1864],
};

// Never cleared from this collection even if a date looks fine: poems first
// printed after 1930 (Dickinson), or translations with no named translator.
const NOT_CLEARED_REASON = {
  "Emily Elizabeth Dickinson": "Many Dickinson poems were first printed in 1935-1955 editions; use the 1890-1896 Gutenberg books instead.",
  "Emily Dickinson": "Many Dickinson poems were first printed in 1935-1955 editions; use the 1890-1896 Gutenberg books instead.",
  "John Clare": "Many Clare poems were first printed after his death, some after 1930; the PoetryDB set already has his cleared ones.",
  "Wilfred Edward Salter Owen": "Some Owen poems were first printed in the 1931 Blunden edition; the PoetryDB set already has his cleared ones.",
};

function rightsForCollectionAuthor(name) {
  const hit = CLEARED[name];
  if (hit && !NOT_CLEARED_REASON[name]) {
    return {
      status: "public-domain-us",
      author: hit[0],
      basis: `${hit[0]} wrote in English and died in ${hit[1]}, so all lifetime publications predate 1931. Death year from general reference.`,
      authorDied: hit[1],
    };
  }
  return {
    status: "not-cleared",
    author: name,
    basis:
      NOT_CLEARED_REASON[name] ||
      "Not checked: no publication dates in this collection, and the poet either lived past 1930, wrote in another language (translator unknown), or isn't in the cleared table yet.",
  };
}

module.exports = { CLEARED, rightsForCollectionAuthor };
