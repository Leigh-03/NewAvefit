const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRegistration } = require("../utils/security");

const validRegistration = {
  first_name: "Alex",
  last_name: "Santos",
  email: "alex@example.com",
  password: "Strong!123",
};

test("allows email registration without a phone number", () => {
  assert.equal(validateRegistration(validRegistration), null);
  assert.equal(validateRegistration({ ...validRegistration, phone: "" }), null);
  assert.equal(validateRegistration({ ...validRegistration, phone: null }), null);
});

test("validates a phone number when one is provided", () => {
  assert.equal(validateRegistration({ ...validRegistration, phone: "09123456789" }), null);
  assert.match(
    validateRegistration({ ...validRegistration, phone: "12345" }),
    /Phone number must start with 09/
  );
});
