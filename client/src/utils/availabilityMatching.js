const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PREFERRED_TIME_WINDOWS = {
  Morning: [6 * 60, 12 * 60],
  Afternoon: [12 * 60, 17 * 60],
  Evening: [17 * 60, 22 * 60],
  Flexible: [6 * 60, 22 * 60],
};

export function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getMemberAvailabilitySlots(preferences = {}) {
  return Array.isArray(preferences.availability) && preferences.availability.length
    ? preferences.availability.map((slot) => {
      const day = DAY_INDEX[slot.day_of_week];
      const window = PREFERRED_TIME_WINDOWS[slot.time_preference];
      return day === undefined || !window
        ? null
        : { day, start: window[0], end: window[1] };
    }).filter(Boolean)
    : (Array.isArray(preferences.days) ? preferences.days : []).map((day) => {
      const dayOfWeek = DAY_INDEX[day];
      const window = PREFERRED_TIME_WINDOWS[preferences.preferredWorkoutTime];
      return dayOfWeek === undefined || !window
        ? null
        : { day: dayOfWeek, start: window[0], end: window[1] };
    }).filter(Boolean);
}

export function coachSlotMatchesMemberSlot(slot, memberSlot, duration) {
  const start = timeToMinutes(slot.start_time);
  const end = timeToMinutes(slot.end_time);
  const overlapStart = start === null ? null : Math.max(memberSlot.start, start);
  const overlapEnd = end === null ? null : Math.min(memberSlot.end, end);
  return Number(slot.day_of_week) === memberSlot.day &&
    overlapStart !== null &&
    overlapEnd !== null &&
    overlapEnd - overlapStart >= duration;
}

export function evaluateCoachAvailability(trainer, preferences) {
  const emptyStatus = {
    schedule_compatible: false,
    day_capacity_full: false,
    member_capacity_full: false,
    full_days: [],
    can_select: false,
  };
  if (!Array.isArray(trainer.availability)) return emptyStatus;
  const duration = Number.parseInt(String(preferences.duration ?? 60), 10);
  const requiredDays = Number(preferences.daysPerWeek);
  const memberSlots = getMemberAvailabilitySlots(preferences);

  if (!memberSlots.length || !Number.isInteger(duration) || duration < 1) return emptyStatus;
  const workoutDays = Number.isInteger(requiredDays) && requiredDays > 0
    ? Math.min(requiredDays, memberSlots.length)
    : memberSlots.length;
  const matchedAvailability = memberSlots.map((memberSlot) => {
    const matchingSlots = trainer.availability.filter((slot) => coachSlotMatchesMemberSlot(slot, memberSlot, duration));
    const availableSlots = matchingSlots.filter((slot) => (
      Number(slot.member_limit) > Number(slot.assigned_member_count)
    ));
    return { day: memberSlot.day, matchingSlots, availableSlots };
  });
  const scheduleMatches = matchedAvailability.filter(({ matchingSlots }) => matchingSlots.length > 0).length;
  const capacityMatches = matchedAvailability.filter(({ availableSlots }) => availableSlots.length > 0).length;
  const scheduleCompatible = scheduleMatches >= workoutDays;
  const dayCapacityFull = scheduleCompatible && capacityMatches < workoutDays;
  const fullDays = matchedAvailability
    .filter(({ matchingSlots, availableSlots }) => matchingSlots.length > 0 && availableSlots.length === 0)
    .map(({ day }) => DAY_NAMES[day]);
  const assignedCount = Number(trainer.assigned_member_count) || 0;
  const maxMembers = Number(trainer.max_members) || 0;
  const memberCapacityFull = maxMembers > 0 && assignedCount >= maxMembers;

  return {
    schedule_compatible: scheduleCompatible,
    day_capacity_full: dayCapacityFull,
    member_capacity_full: memberCapacityFull,
    full_days: fullDays,
    can_select: scheduleCompatible && !dayCapacityFull && !memberCapacityFull,
  };
}
