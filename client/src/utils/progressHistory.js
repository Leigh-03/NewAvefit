export function formatWeightDifference(entries, index) {
  if (index === 0 || entries[index]?.weight == null || entries[index - 1]?.weight == null) return "—";
  const difference = Number(entries[index].weight) - Number(entries[index - 1].weight);
  if (!Number.isFinite(difference)) return "—";
  return `${difference > 0 ? "+" : ""}${difference.toFixed(2)} kg`;
}

export function formatWeightToTarget(weight, targetWeight) {
  if (weight == null || targetWeight == null) return "—";
  const difference = Number(targetWeight) - Number(weight);
  if (!Number.isFinite(difference)) return "—";
  if (difference.toFixed(2) === "0.00") return "Target reached";
  return `${Math.abs(difference).toFixed(2)} kg to ${difference > 0 ? "gain" : "lose"}`;
}
