CREATE TABLE blockchains (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  'index' INTEGER NOT NULL,
  previousHash VARCHAR(500) NOT NULL,
  hash VARCHAR(500) NOT NULL,
  data VARCHAR(500) NOT NULL,
  nonce VARCHAR(500) NOT NULL,
  timestamp DATETIME NOT NULL
);
