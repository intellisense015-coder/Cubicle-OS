export function getLocalDateInputValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getLocalTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function isDateBeforeToday(value, now = new Date()) {
  return Boolean(value) && value < getLocalDateInputValue(now);
}

export function isTimeBeforeNow(value, date, now = new Date()) {
  return Boolean(value) && date === getLocalDateInputValue(now) && value < getLocalTimeInputValue(now);
}
