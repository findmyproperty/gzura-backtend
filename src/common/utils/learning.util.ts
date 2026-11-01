import { EventRegistration } from '../../entities/event-registration.entity';
import { Event } from '../../entities/event.entity';

type EventDates = Pick<Event, 'dateStart' | 'dateEnd'>;

type AttendanceInput = Pick<
  EventRegistration,
  'checkedInAt' | 'attendedAt'
>;

export function formatCertificateNumber(registrationId: string) {
  return `CERT-${registrationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function isEventEnded(event: EventDates) {
  const end = event.dateEnd ?? event.dateStart;
  if (!end) return false;
  const timestamp = new Date(end).getTime();
  return !Number.isNaN(timestamp) && Date.now() > timestamp;
}

export function hasAttended(
  registration: AttendanceInput,
  event: Pick<Event, 'type'>,
) {
  if (event.type === 'Offline') {
    return Boolean(registration.checkedInAt);
  }
  return Boolean(registration.attendedAt);
}
