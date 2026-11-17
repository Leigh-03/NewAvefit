const pool = require("../db");
const { buildSyntheticProgressEntries } = require("../utils/demoProgress");

const START_DATE = "2026-04-01";

const getTodayInManila = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getEmailArgument = () => {
  const emailIndex = process.argv.indexOf("--email");
  const email = emailIndex >= 0 ? process.argv[emailIndex + 1]?.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Provide a valid account with --email <address>.");
  }
  return email;
};

const insertProgressLog = async (client, userId, entry) => {
  await client.query(
    `INSERT INTO progress_logs (
       user_id, weight, bmi, body_fat, log_date, waist, chest, hips,
       left_arm, right_arm, left_leg, right_leg, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT DO NOTHING`,
    [
      userId,
      entry.weight,
      entry.bmi,
      entry.body_fat,
      entry.log_date,
      entry.waist,
      entry.chest,
      entry.hips,
      entry.left_arm,
      entry.right_arm,
      entry.left_leg,
      entry.right_leg,
      entry.notes,
    ]
  );
};

const seedAccountProgress = async () => {
  const email = getEmailArgument();
  const apply = process.argv.includes("--apply");
  const endDate = getTodayInManila();
  const client = await pool.connect();
  let inTransaction = false;

  try {
    if (apply) {
      await client.query("BEGIN");
      inTransaction = true;
    }

    const accountResult = await client.query(
      `SELECT user_id, height, weight, fitness_goal
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );
    if (!accountResult.rowCount) throw new Error(`No account found for ${email}.`);

    const account = accountResult.rows[0];
    const existingResult = await client.query(
      `SELECT TO_CHAR(log_date, 'YYYY-MM-DD') AS log_date, weight
       FROM progress_logs
       WHERE user_id = $1
       ORDER BY log_date DESC, progress_id DESC`,
      [account.user_id]
    );
    const latestWeight = existingResult.rows.find((entry) => entry.weight != null)?.weight
      ?? account.weight;
    const generated = buildSyntheticProgressEntries({
      height: account.height,
      goal: account.fitness_goal,
      endWeight: latestWeight,
      startDate: START_DATE,
      endDate,
    });
    const existingDates = new Set(existingResult.rows.map((entry) => entry.log_date));
    const missingEntries = generated.filter((entry) => !existingDates.has(entry.log_date));

    if (apply) {
      for (const entry of missingEntries) {
        await insertProgressLog(client, account.user_id, entry);
      }
      await client.query("COMMIT");
      inTransaction = false;
      console.log(`Added ${missingEntries.length} synthetic weekly check-ins for ${email}.`);
    } else {
      console.log(`Dry run for ${email}: ${missingEntries.length} synthetic check-ins would be added.`);
      console.log(`Date range: ${START_DATE} through ${endDate}. Existing check-ins will be preserved.`);
      console.log("Run with --apply to write the sample data.");
    }
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seedAccountProgress().catch((error) => {
  console.error(`Account progress seed failed: ${error.message}`);
  process.exitCode = 1;
});
