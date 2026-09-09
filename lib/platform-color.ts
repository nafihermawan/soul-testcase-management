const platformColors = ["#10b981", "#8b5cf6", "#f59e0b", "#3b82f6", "#ef4444", "#06b6d4"];

export function platformColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return platformColors[hash % platformColors.length];
}
