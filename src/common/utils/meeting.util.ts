import { EventFormat } from '../enums/event-format.enum';

export function isOnlineEventType(type: string) {
  return type === EventFormat.ONLINE || type === 'Online';
}

export function isGoogleMeetLink(value?: string | null) {
  return !!value && value.includes('meet.google.com');
}

export function getEventEndDate(start: Date, end?: Date | null) {
  if (end && end > start) return end;
  const fallback = new Date(start);
  fallback.setHours(fallback.getHours() + 1);
  return fallback;
}