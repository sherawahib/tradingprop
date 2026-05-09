/**
 * Demo bank-transfer instructions until a card gateway is wired.
 * Override via environment variables in production-style deployments.
 */
export interface BankTransferCheckoutInfoPayload {
  beneficiaryName: string;
  bankName: string;
  iban: string;
  swiftBic: string;
  currency: string;
  /** Shown to the customer — include payment reference in the transfer memo. */
  referenceHint: string;
}

export function getBankTransferCheckoutInfo(): BankTransferCheckoutInfoPayload {
  return {
    beneficiaryName: process.env.BANK_TRANSFER_BENEFICIARY ?? "PropPrime Demo Holdings LLC",
    bankName: process.env.BANK_TRANSFER_BANK_NAME ?? "Demo International Bank",
    iban: process.env.BANK_TRANSFER_IBAN ?? "GB29 NWBK 6016 1331 9268 19",
    swiftBic: process.env.BANK_TRANSFER_SWIFT ?? "NWBKGB2L",
    currency: process.env.BANK_TRANSFER_CURRENCY ?? "USD",
    referenceHint:
      process.env.BANK_TRANSFER_REFERENCE_HINT ??
      "Use the payment reference shown in checkout as the transfer memo / narration so we can match your payment."
  };
}
