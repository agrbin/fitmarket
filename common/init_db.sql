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
 *
 * 'opportunity' (BW) is a data structure that encodes potential total_money if
 * player was playing optimal in recent time (time periods defined in
 * config.opportunityIntervals).
 *    {
 *      "1d" => {
 *        initial_money: money,
 *        best_cost: money,
 *      }
 *    }
 *
 * - initial_money is user's money at the beggining of the time period.
 * best_cost is the best possible total money that user could raised given the
 * stock movements.
 *
 * - api_token (FW), a string that is used with API.
 *
 * - ui_defaults (FW) a JSON object that UI manages, to store default values for
 * visibility of UI elements. for example, if user is always looking at '3m' we
 * should always select '3m' whenever this user logs in.
 *
 */
DROP TABLE IF EXISTS user;
CREATE TABLE user (
  user_id TEXT,
  user_name TEXT,
  free_money DOUBLE,
  total_money DOUBLE,
  shares TEXT,
  opportunity TEXT,
  api_token TEXT,
  ui_defaults TEXT
);

/* 
 * Contains credentials needed to download new stream data points.
 *
 * 'stream_id' is google user_id of the user who owns the stream.
 * 'stream_name' is a stream nickname used in frontend.
 * 'latest_weight' (BW), the latest weight info, can be null.
 * 'provider' is 'googlefit' or 'fitbit'.
 */
DROP TABLE IF EXISTS stream_credentials;
CREATE TABLE stream_credentials (
  stream_id TEXT PRIMARY KEY,
  stream_name TEXT,
  provider TEXT,
  provider_user_id TEXT,
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
 * At 'date_time' user 'user_id' executed 'action'
 * (buy/sell/sell_all/fastmarket) on stream 'stream_user_id' on 'count' shares,
 * and the value at that time was 'stream_weight'.
 * This table is a pure log table, we don't read from it from the application.
 *
 * 'action' is "SELL" or "BUY".
 * '_name' is denormalized here for easier log reading.
 */
DROP TABLE IF EXISTS transaction_log;
CREATE TABLE transaction_log (
  datetime TEXT,
  user_id TEXT,
  user_name TEXT,
  stream_id TEXT,
  stream_name TEXT,
  stream_weight DOUBLE,
  action TEXT,
  count INT,
  is_api BOOLEAN
);

/*
 * 'user_id' had 'total_money' at time 'timestamp'.
 */
DROP TABLE IF EXISTS total_money_log;
CREATE TABLE total_money_log (
  timestamp INT,
  user_id TEXT,
  total_money DOUBLE
);

