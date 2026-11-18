const TRANSIENT_DATABASE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);

const isTransientDatabaseError = (error) => {
  const code = typeof error?.code === "string" ? error.code : "";
  if (TRANSIENT_DATABASE_CODES.has(code) || code.startsWith("08")) return true;

  return /connection terminated|connection timeout|timeout expired|server closed the connection unexpectedly|could not connect to server/i
    .test(String(error?.message || ""));
};

module.exports = { isTransientDatabaseError };
