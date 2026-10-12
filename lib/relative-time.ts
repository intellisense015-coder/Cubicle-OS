export function formatRelativeTime(timestamp, now = Date.now()) {
  const difference = now - timestamp;
  const absoluteMinutes = Math.floor(Math.abs(difference) / 60000);
  const isPast = difference >= 0;

  if (absoluteMinutes < 1) return isPast ? "just now" : "in under a minute";

  let phrase;
  if (absoluteMinutes < 60) {
    phrase = `${absoluteMinutes} minute${absoluteMinutes === 1 ? "" : "s"}`;
  } else {
    const absoluteHours = Math.floor(absoluteMinutes / 60);
    if (absoluteHours < 24) {
      const minutes = absoluteMinutes % 60;
      const parts = [`${absoluteHours} hour${absoluteHours === 1 ? "" : "s"}`];
      if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
      phrase = parts.join(" ");
    } else {
      const absoluteDays = Math.floor(absoluteHours / 24);
      if (absoluteDays < 7) {
        phrase = `${absoluteDays} day${absoluteDays === 1 ? "" : "s"}`;
      } else if (absoluteDays < 30) {
        const weeks = Math.max(1, Math.floor(absoluteDays / 7));
        phrase = `${weeks} week${weeks === 1 ? "" : "s"}`;
      } else if (absoluteDays < 365) {
        const months = Math.max(1, Math.floor(absoluteDays / 30));
        phrase = `${months} month${months === 1 ? "" : "s"}`;
      } else {
        const years = Math.max(1, Math.floor(absoluteDays / 365));
        phrase = `${years} year${years === 1 ? "" : "s"}`;
      }
    }
  }

  return isPast ? `${phrase} ago` : `in ${phrase}`;
}
