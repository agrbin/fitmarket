/* TODO: unique on user_id */
DROP TABLE IF EXISTS stream_credentials;
CREATE TABLE stream_credentials (
  user_id TEXT,
  name TEXT,
  fitbit_user_id TEXT,
  access_token TEXT,
  refresh_token TEXT
);

DROP TABLE IF EXISTS stream_data;
CREATE TABLE stream_data (
  name TEXT,
  user_id TEXT,
  date TEXT,
  weight DOUBLE
);
