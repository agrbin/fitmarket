DROP TABLE IF EXISTS stream_credentials;
CREATE TABLE stream_credentials (
  user_id TEXT,
  name TEXT,
  access_token TEXT
);

DROP TABLE IF EXISTS stream_data;
CREATE TABLE stream_data (
  stream_id TEXT,
  user_id TEXT,
  date TEXT,
  weight DOUBLE
);
