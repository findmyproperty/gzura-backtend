export function formatInvoiceNumber(registrationId: string) {
  return `INV-${registrationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function formatTicketId(registrationId: string) {
  return `GZ-${registrationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function formatInr(amount: number) {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function isPaidRegistration(input: {
  paymentStatus?: string | null;
  amountPaid?: string | number | null;
}) {
  const amount =
    input.amountPaid != null ? Number(input.amountPaid) : null;
  return (
    input.paymentStatus === 'PAID' ||
    (amount != null && Number.isFinite(amount) && amount > 0)
  );
}
