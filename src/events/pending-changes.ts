export type EventPendingChangesStatus = 'PENDING' | 'REJECTED';

export type EventPendingChanges = {
  payload: Record<string, unknown>;
  status: EventPendingChangesStatus;
  rejectionReason?: string | null;
  submittedAt: string;
  comment?: string | null;
};
