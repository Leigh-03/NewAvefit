const test = require("node:test");
const assert = require("node:assert/strict");
const { isTransientDatabaseError } = require("../utils/databaseErrors");

test("classifies common PostgreSQL connection failures as transient", () => {
  assert.equal(isTransientDatabaseError({ message: "Connection terminated due to connection timeout" }), true);
  assert.equal(isTransientDatabaseError({ message: "Connection terminated unexpectedly" }), true);
  assert.equal(isTransientDatabaseError({ code: "08006", message: "connection failure" }), true);
  assert.equal(isTransientDatabaseError({ code: "53300", message: "too many connections" }), true);
});

test("does not classify query and application errors as transient connection failures", () => {
  assert.equal(isTransientDatabaseError({ code: "23505", message: "duplicate key value" }), false);
  assert.equal(isTransientDatabaseError(new Error("invalid credentials")), false);
});
