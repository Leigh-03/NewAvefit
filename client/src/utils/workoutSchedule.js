const timeToMinutes = (value) => {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

const TIME_WINDOWS = {
  Morning: ["06:00", "12:00"],
  Afternoon: ["12:00", "17:00"],
  Evening: ["17:00", "22:00"],
  Flexible: ["06:00", "22:00"],
};

const getMemberSlots = (member, weekday) => {
  const storedSlots = Array.isArray(member?.weekly_availability)
    ? member.weekly_availability
    : [];
  const daySlots = storedSlots.filter((slot) => (
    String(slot.day_of_week || "").toLowerCase() === weekday.toLowerCase()
  ));
  if (daySlots.length) return daySlots;

  const preferredDays = Array.isArray(member?.preferred_days)
    ? member.preferred_days
    : [];
  const window = TIME_WINDOWS[member?.preferred_workout_time];
  if (
    !window ||
    !preferredDays.some((day) => String(day).toLowerCase() === weekday.toLowerCase())
  ) {
    return [];
  }
  return [{ start_time: window[0], end_time: window[1] }];
};

export function getCompatibleWorkoutStartTimes(member, coachAvailability, sessionDate) {
  if (!member || !sessionDate || !Array.isArray(coachAvailability)) return [];
  const duration = Number(member.workout_duration);
  if (!Number.isInteger(duration) || duration < 1) return [];

  const date = new Date(`${sessionDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== sessionDate) return [];
  const weekdayIndex = date.getUTCDay();
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekdayIndex];
  const memberSlots = getMemberSlots(member, weekday);
  const compatibleTimes = new Set();

  for (const memberSlot of memberSlots) {
    for (const coachSlot of coachAvailability) {
      if (Number(coachSlot.day_of_week) !== weekdayIndex) continue;
      const memberStart = timeToMinutes(memberSlot.start_time);
      const memberEnd = timeToMinutes(memberSlot.end_time);
      const coachStart = timeToMinutes(coachSlot.start_time);
      const coachEnd = timeToMinutes(coachSlot.end_time);
      if ([memberStart, memberEnd, coachStart, coachEnd].some((time) => time === null)) continue;
      const start = Math.max(
        memberStart,
        coachStart
      );
      const end = Math.min(
        memberEnd,
        coachEnd
      );

      const firstQuarterHour = Math.ceil(start / 15) * 15;
      for (let candidate = firstQuarterHour; candidate + duration <= end; candidate += 15) {
        compatibleTimes.add(minutesToTime(candidate));
      }
    }
  }

  return [...compatibleTimes].sort();
}

export function formatWorkoutTime(value) {
  const minutes = timeToMinutes(String(value || "").slice(0, 5));
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}
