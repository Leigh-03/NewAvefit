const pool = require("../db");
const enrichExercise = require("./exerciseGuidance");
const { isExerciseEquipmentAvailable } = require("./exerciseEquipment");

const getExerciseCatalog = async () => {
  const result = await pool.query(`
    WITH ranked_exercises AS (
      SELECT e.*,
        ROW_NUMBER() OVER (
          PARTITION BY TRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(BTRIM(e.exercise_name)), CHR(39), '', 'g'),
            '[^a-z0-9]+', ' ', 'g'
          ))
          ORDER BY
            (e.movement_steps IS NOT NULL) DESC,
            (NULLIF(BTRIM(e.description), '') IS NOT NULL) DESC,
            (NULLIF(BTRIM(e.equipment), '') IS NOT NULL) DESC,
            e.exercise_id ASC
        ) AS duplicate_rank
      FROM exercises e
    )
    SELECT e.*, c.category_name,
      COALESCE(inventory.in_service_count, 0)::int AS equipment_in_service_count
    FROM ranked_exercises e
    LEFT JOIN exercise_categories c ON e.category_id = c.category_id
    LEFT JOIN equipment_inventory inventory
      ON LOWER(BTRIM(inventory.equipment_name)) = LOWER(BTRIM(e.equipment))
    WHERE e.duplicate_rank = 1
    ORDER BY e.exercise_name ASC
  `);

  return {
    ...result,
    rows: result.rows.map((exercise) => {
      const enrichedExercise = enrichExercise(exercise);
      return {
        ...enrichedExercise,
        equipment_available: isExerciseEquipmentAvailable(enrichedExercise),
      };
    }),
  };
};

module.exports = getExerciseCatalog;
