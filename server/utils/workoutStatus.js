const pool = require("../db");

/**
 * Workout session status lifecycle.
 *
 *   Scheduled -> the workout is booked for a future day.
 *   Active    -> the scheduled day is ongoing and the workout is not finished.
 *   Complete  -> the member finished the scheduled workout.
 *   Incomplete-> the member started the workout but the day ended before finishing.
 *   Absent    -> the scheduled day ended without any recorded workout activity.
 *
 * Every rule below is evaluated against the scheduled workout date and the
 * application timezone (Asia/Manila by default), never against the member's
 * browser clock, so the backend, the database and the UI always agree.
 */

const APP_TIME_ZONE = (process.env.APP_TIMEZONE || "Asia/Manila").trim() || "Asia/Manila";

const WORKOUT_STATUS = Object.freeze({
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETE: "Complete",
  INCOMPLETE: "Incomplete",
  ABSENT: "Absent",
});

const ISO_DATE_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";

// 2000-01-02 was a Sunday, so these anchors give us a stable weekday lookup.
const weekdayAnchorSql = (alias) => `
  CASE LOWER(BTRIM(${alias}.session_date))
    WHEN 'monday' THEN DATE '2000-01-03'
    WHEN 'tuesday' THEN DATE '2000-01-04'
    WHEN 'wednesday' THEN DATE '2000-01-05'
    WHEN 'thursday' THEN DATE '2000-01-06'
    WHEN 'friday' THEN DATE '2000-01-07'
    WHEN 'saturday' THEN DATE '2000-01-08'
    ELSE DATE '2000-01-02'
  END`;

/**
 * The calendar day a session is scheduled on.
 * Concrete dates use the stored value, weekday based (recurring) sessions use
 * the occurrence inside the current Monday-based week.
 */
const scheduledOnSql = (alias) => `
  CASE
    WHEN ${alias}.session_date ~ '${ISO_DATE_PATTERN}'
      THEN TO_DATE(${alias}.session_date, 'YYYY-MM-DD')
    ELSE (
      DATE_TRUNC('week', (NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date::timestamp)::date
      + ((EXTRACT(DOW FROM ${weekdayAnchorSql(alias)})::int + 6) % 7)
    )
  END`;

/**
 * A session counts as completed when it was flagged as completed or carries a
 * completion timestamp. Recurring weekday sessions only count as completed for
 * the occurrence they were completed in, so a new week starts a fresh attempt.
 */
const isCompleteSql = (alias) => `
  (
    COALESCE(${alias}.completed, FALSE) = TRUE
    OR ${alias}.completed_at IS NOT NULL
  )
  AND (
    ${alias}.session_date ~ '${ISO_DATE_PATTERN}'
    OR ${alias}.completed_at IS NULL
    OR (${alias}.completed_at AT TIME ZONE '${APP_TIME_ZONE}')::date = ${scheduledOnSql(alias)}
  )`;

/**
 * The status a session should have right now, derived from its scheduled day
 * and the recorded activity. Shared by the read queries and the persisted
 * evaluation so both can never disagree.
 */
const statusSql = (alias) => `
  CASE
    WHEN ${isCompleteSql(alias)} THEN '${WORKOUT_STATUS.COMPLETE}'
    WHEN ${scheduledOnSql(alias)} = (NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date
      THEN '${WORKOUT_STATUS.ACTIVE}'
    WHEN ${scheduledOnSql(alias)} < (NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date
      THEN CASE
        WHEN ${alias}.started_at IS NOT NULL THEN '${WORKOUT_STATUS.INCOMPLETE}'
        ELSE '${WORKOUT_STATUS.ABSENT}'
      END
    ELSE '${WORKOUT_STATUS.SCHEDULED}'
  END`;

/**
 * Persist the evaluated status for every session whose scheduled day already
 * started. Only rows whose status actually changed are written, so repeated
 * runs are cheap and idempotent.
 */
const evaluateWorkoutStatuses = async (client = pool) => {
  const result = await client.query(`
    WITH evaluated AS (
      SELECT
        ws.session_id,
        ${statusSql("ws")} AS target_status
      FROM workout_sessions ws
      WHERE ${scheduledOnSql("ws")} <= (NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date
    )
    UPDATE workout_sessions ws
    SET status = evaluated.target_status,
        completed = CASE
          WHEN evaluated.target_status = '${WORKOUT_STATUS.COMPLETE}' THEN TRUE
          ELSE ws.completed
        END
    FROM evaluated
    WHERE ws.session_id = evaluated.session_id
      AND (
        ws.status IS DISTINCT FROM evaluated.target_status
        OR (
          evaluated.target_status = '${WORKOUT_STATUS.COMPLETE}'
          AND COALESCE(ws.completed, FALSE) = FALSE
        )
      )
    RETURNING ws.session_id, ws.status
  `);

  return result.rowCount;
};

/**
 * Apply the evaluated status to a known set of sessions, used right after a
 * session is created or edited so the stored status is correct immediately.
 */
const applySessionStatuses = async (sessionIds, client = pool) => {
  const ids = (Array.isArray(sessionIds) ? sessionIds : [sessionIds])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!ids.length) return 0;

  const result = await client.query(`
    WITH evaluated AS (
      SELECT
        ws.session_id,
        ${statusSql("ws")} AS target_status
      FROM workout_sessions ws
      WHERE ws.session_id = ANY($1::int[])
    )
    UPDATE workout_sessions ws
    SET status = evaluated.target_status,
        completed = CASE
          WHEN evaluated.target_status = '${WORKOUT_STATUS.COMPLETE}' THEN TRUE
          ELSE ws.completed
        END
    FROM evaluated
    WHERE ws.session_id = evaluated.session_id
      AND (
        ws.status IS DISTINCT FROM evaluated.target_status
        OR (
          evaluated.target_status = '${WORKOUT_STATUS.COMPLETE}'
          AND COALESCE(ws.completed, FALSE) = FALSE
        )
      )
    RETURNING ws.session_id, ws.status
  `, [ids]);

  return result.rowCount;
};

/**
 * Aggregate the sessions of a plan into the status shown on the trainer's
 * workout plan list. Every session of a plan belongs to the same day.
 */
const planStatusSql = (alias) => `
  CASE
    WHEN COUNT(${alias}.session_id) = 0 THEN '${WORKOUT_STATUS.SCHEDULED}'
    WHEN COUNT(${alias}.session_id) FILTER (WHERE ${isCompleteSql(alias)}) = COUNT(${alias}.session_id)
      THEN '${WORKOUT_STATUS.COMPLETE}'
    WHEN MIN(${scheduledOnSql(alias)}) = (NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date
      THEN '${WORKOUT_STATUS.ACTIVE}'
    WHEN MIN(${scheduledOnSql(alias)}) < (NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date
      THEN CASE
        WHEN BOOL_OR(${alias}.started_at IS NOT NULL) THEN '${WORKOUT_STATUS.INCOMPLETE}'
        ELSE '${WORKOUT_STATUS.ABSENT}'
      END
    ELSE '${WORKOUT_STATUS.SCHEDULED}'
  END`;

let lastEvaluationAt = 0;
const EVALUATION_THROTTLE_MS = 60 * 1000;

/**
 * Refresh the stored statuses at most once a minute. This keeps the database
 * in step with the evaluated status even on hosts where the background timer
 * cannot run (for example a serverless deployment that is only alive while a
 * request is being served).
 */
const refreshWorkoutStatuses = async (client = pool) => {
  const now = Date.now();
  if (now - lastEvaluationAt < EVALUATION_THROTTLE_MS) return 0;
  lastEvaluationAt = now;
  try {
    return await evaluateWorkoutStatuses(client);
  } catch (err) {
    lastEvaluationAt = 0;
    throw err;
  }
};

module.exports = {
  APP_TIME_ZONE,
  WORKOUT_STATUS,
  statusSql,
  scheduledOnSql,
  isCompleteSql,
  planStatusSql,
  evaluateWorkoutStatuses,
  applySessionStatuses,
  refreshWorkoutStatuses,
};
