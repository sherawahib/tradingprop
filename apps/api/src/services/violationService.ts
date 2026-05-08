import crypto from "node:crypto";
import type { ViolationCode, ViolationRecord, ViolationSeverity } from "@paper-trader/shared";
import { StateStore } from "../db/stateStore";

export class ViolationService {
  constructor(private readonly store: StateStore) {}

  add(accountId: string, code: ViolationCode, severity: ViolationSeverity, message: string, evidence: Record<string, number | string | boolean | null>): ViolationRecord {
    const record: ViolationRecord = {
      id: crypto.randomUUID(),
      accountId,
      code,
      severity,
      message,
      evidence,
      createdAt: Date.now()
    };
    this.store.update((s) => {
      s.violations.unshift(record);
      s.violations = s.violations.slice(0, 3000);
      if (severity === "HARD_BREACH") {
        const progress = s.progressByAccountId[accountId];
        if (progress) {
          progress.status = "BREACHED";
          progress.violatedAt = Date.now();
        }
        const trader = s.traders.find((t) => t.accountId === accountId);
        if (trader) trader.accountStatus = "BREACHED";
        return;
      }
      if (severity === "RULE_FREEZE") {
        const progress = s.progressByAccountId[accountId];
        if (progress && progress.status !== "BREACHED") {
          if (progress.status === "ACTIVE" || progress.status === "PASSED") {
            progress.status = "LOCKED";
            progress.violatedAt = Date.now();
          }
        }
        const trader = s.traders.find((t) => t.accountId === accountId);
        if (trader && trader.accountStatus !== "BREACHED") trader.accountStatus = "LOCKED";
      }
    });
    return record;
  }
}
