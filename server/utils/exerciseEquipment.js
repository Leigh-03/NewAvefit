const equipmentNotRequired = new Set(["", "none", "bodyweight", "body weight", "no equipment", "home"]);

const isExerciseEquipmentAvailable = (exercise) => {
  const equipment = String(exercise?.equipment || "").trim().toLowerCase();
  if (equipmentNotRequired.has(equipment)) return true;
  return Number(exercise?.equipment_in_service_count) > 0;
};

module.exports = { isExerciseEquipmentAvailable };
