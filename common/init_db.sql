/*
 * Conventions:
 * BW - backend writes
 * FW - frotend writes
 */

/*
 * 'user_id' is a google user_id identifier. It's a big positive number.
 * 'user_name' is user's nickname that will be used in frontend.
 *
 * 'free_money' (FW) is the current amount of money that user can use to perform BUY
 *    transactions.
 *
 * 'total_money' (BW) is 'free_money' + share.count * share.value for each share in
 *    possesion. This value updates with backend sync every day.
 *
 * 'shares' (FW) is a JSON encoded object that encodes user's shares in possesion.
 *    {TEXT "stream_id" => INT "count"},
 */
DROP TABLE IF EXISTS user;
CREATE TABLE user (
  user_id TEXT,
  user_name TEXT,
  free_money DOUBLE,
  total_money DOUBLE,
  shares TEXT
);

/* 
 * Contains credentials needed to download new stream data points.
 *
 * 'stream_id' is google user_id of the user who owns the stream.
 * 'stream_name' is a stream nickname used in frontend.
 * 'latest_weight' (BW), the latest weight info, can be null.
 */
DROP TABLE IF EXISTS stream_credentials;
CREATE TABLE stream_credentials (
  stream_id TEXT,
  stream_name TEXT,
  fitbit_user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  latest_weight DOUBLE
);

/*
 * Stream data points.
 * The data-point is usually updated every day at ~noon CEST time. The weight
 * is the minimum measurement during that day so far in UTC time.
 *
 * 'stream_name' is denormalized here from stream_credentials table.
 * 'date' is YYYY-MM-DD of the current date. We may encounter some timezone
 *    hacks: https://dev.fitbit.com/docs/basics/#time-zones
 * 'weight' is body weight in kilograms.
 */
DROP TABLE IF EXISTS stream_data;
CREATE TABLE stream_data (
  stream_id TEXT,
  stream_name TEXT,
  date TEXT,
  weight DOUBLE
);

/*
 * At 'date_time' user 'user_id' executed 'action' (BUY/SELL) on
 * stream 'stream_user_id' on 'count' shares, and the value at that time was
 * 'stream_weight'.
 * This table is a pure log table, we don't read from it from the application.
 *
 * 'action' is "SELL" or "BUY". See db.SELL and db.BUY.
 * '_name' is denormalized here for easier log reading.
 */
DROP TABLE IF EXISTS transaction_log;
CREATE TABLE transaction_log (
  datetime TEXT,
  user_id TEXT,
  user_name TEXT,
  stream_user_id TEXT,
  stream_name TEXT,
  stream_weight DOUBLE,
  action TEXT,
  count INT
);

