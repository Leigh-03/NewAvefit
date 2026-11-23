const test = require("node:test");
const assert = require("node:assert/strict");
const { isExerciseEquipmentAvailable } = require("../utils/exerciseEquipment");

test("equipment-required exercises are available only when at least one unit is in service", () => {
  assert.equal(isExerciseEquipmentAvailable({ equipment: "Treadmill", equipment_in_service_count: 1 }), true);
  assert.equal(isExerciseEquipmentAvailable({ equipment: "Treadmill", equipment_in_service_count: 0 }), false);
  assert.equal(isExerciseEquipmentAvailable({ equipment: "Treadmill", equipment_in_service_count: null }), false);
});

test("bodyweight and equipment-free exercises remain available without inventory", () => {
  for (const equipment of [null, "", "None", "Bodyweight", "No Equipment", "Home"]) {
    assert.equal(isExerciseEquipmentAvailable({ equipment, equipment_in_service_count: 0 }), true);
  }
});
