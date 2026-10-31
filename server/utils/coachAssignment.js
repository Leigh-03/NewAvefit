const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const LEGACY_TIME_WINDOWS = {
  Morning: ["06:00", "12:00"],
  Afternoon: ["12:00", "17:00"],
  Evening: ["17:00", "22:00"],
  Flexible: ["06:00", "22:00"],
};
const DAY_INDEX_BY_NAME = Object.fromEntries(
  Object.entries(DAY_INDEX).map(([name, index]) => [name.toLowerCase(), index])
);

const timeToMinutes = (value) => {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const getMemberAvailability = (member, availabilityRows = []) => {
  if (availabilityRows.length) {
    return availabilityRows
      .filter((slot) => DAY_INDEX[slot.day_of_week] !== undefined)
      .map((slot) => ({
        day: DAY_INDEX[slot.day_of_week],
        start_time: slot.start_time,
        end_time: slot.end_time,
      }));
  }

  const window = LEGACY_TIME_WINDOWS[member.preferred_workout_time];
  if (!window || !Array.isArray(member.preferred_days)) return [];
  return member.preferred_days
    .map((day) => ({
      day: DAY_INDEX_BY_NAME[String(day).trim().toLowerCase()],
      start_time: window[0],
      end_time: window[1],
    }))
    .filter((slot) => slot.day !== undefined);
};

const getScheduleMatch = (memberSlots, coachSlots, duration, requiredDays) => {
  const sessionMinutes = Number(duration);
  if (
    !memberSlots.length ||
    !Number.isInteger(sessionMinutes) ||
    sessionMinutes < 1 ||
    !Number.isInteger(Number(requiredDays)) ||
    Number(requiredDays) < 1
  ) {
    return { compatible: false, matchedDays: [] };
  }

  const matchedDays = memberSlots
    .filter((memberSlot) => coachSlots.some((coachSlot) => {
      const start = timeToMinutes(coachSlot.start_time);
      const end = timeToMinutes(coachSlot.end_time);
      const memberStart = timeToMinutes(memberSlot.start_time);
      const memberEnd = timeToMinutes(memberSlot.end_time);
      return Number(coachSlot.day_of_week) === memberSlot.day &&
        start !== null &&
        end !== null &&
        memberStart !== null &&
        memberEnd !== null &&
        Math.min(end, memberEnd) - Math.max(start, memberStart) >= sessionMinutes;
    }))
    .map((slot) => slot.day);

  return {
    compatible: new Set(matchedDays).size >= Number(requiredDays),
    matchedDays: [...new Set(matchedDays)],
  };
};

const getCapacityStatus = (assignedMembers, maxMembers, status = "Active") => {
  const assigned = Number(assignedMembers) || 0;
  const capacity = Number(maxMembers) || 0;
  if (status !== "Active") return "Inactive";
  if (capacity > 0 && assigned >= capacity) return "Full";
  if (capacity > 0 && assigned / capacity >= 0.8) return "Near Capacity";
  return "Available";
};

module.exports = {
  getCapacityStatus,
  getMemberAvailability,
  getScheduleMatch,
};
