/**
 * The gym's recurring availability windows.
 *
 * These are the exact hours a coach can be available and the exact hours a
 * member can pick as their preferred workout time. The trainer availability
 * editor and the admin analytics equipment filter both use this list so the
 * hour mechanic is identical everywhere in the app.
 */
export const AVAILABILITY_RANGES = [
  {
    key: "morning",
    value: "06:00|12:00",
    name: "Morning",
    label: "Morning · 6:00 AM–12:00 PM",
    start_time: "06:00",
    end_time: "12:00",
    start_hour: 6,
    end_hour: 12,
  },
  {
    key: "afternoon",
    value: "12:00|17:00",
    name: "Afternoon",
    label: "Afternoon · 12:00 PM–5:00 PM",
    start_time: "12:00",
    end_time: "17:00",
    start_hour: 12,
    end_hour: 17,
  },
  {
    key: "evening",
    value: "17:00|22:00",
    name: "Evening",
    label: "Evening · 5:00 PM–10:00 PM",
    start_time: "17:00",
    end_time: "22:00",
    start_hour: 17,
    end_hour: 22,
  },
  {
    key: "flexible",
    value: "06:00|22:00",
    name: "Flexible",
    label: "Flexible · 6:00 AM–10:00 PM",
    start_time: "06:00",
    end_time: "22:00",
    start_hour: 6,
    end_hour: 22,
  },
];

export const findAvailabilityRange = (value) =>
  AVAILABILITY_RANGES.find((range) => range.value === value);
