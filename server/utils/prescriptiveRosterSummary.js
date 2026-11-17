const DAY_MS = 24 * 60 * 60 * 1000;

const buildPrescriptiveRosterSummary = (members, now = Date.now()) => {
  const stalledMemberCount = members.filter((member) => {
    const latestLogTime = new Date(member.latest_log_date).getTime();
    const previousLogTime = new Date(member.previous_log_date).getTime();
    return member.latest_log_date &&
      member.previous_log_date &&
      now - latestLogTime <= 30 * DAY_MS &&
      latestLogTime - previousLogTime >= 14 * DAY_MS &&
      member.latest_weight != null &&
      member.previous_weight != null &&
      Number.isFinite(Number(member.latest_weight)) &&
      Number.isFinite(Number(member.previous_weight)) &&
      Math.abs(Number(member.latest_weight) - Number(member.previous_weight)) < 0.5;
  }).length;
  const inactiveMemberCount = members.filter((member) => (
    Number(member.completed_last_two_weeks) === 0
  )).length;
  const previousWeekWorkoutCount = members.reduce(
    (total, member) => total + Number(member.completed_previous_week || 0),
    0
  );
  const lastWeekWorkoutCount = members.reduce(
    (total, member) => total + Number(member.completed_last_week || 0),
    0
  );
  const weightLossMemberCount = members.filter((member) => (
    /loss|lose/i.test(String(member.fitness_goal || ""))
  )).length;

  return {
    roster_size: members.length,
    stalled_member_count: stalledMemberCount,
    inactive_member_count: inactiveMemberCount,
    weight_loss_member_count: weightLossMemberCount,
    previous_week_workout_count: previousWeekWorkoutCount,
    last_week_workout_count: lastWeekWorkoutCount,
  };
};

module.exports = { buildPrescriptiveRosterSummary };
