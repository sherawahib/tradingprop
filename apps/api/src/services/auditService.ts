import crypto from "node:crypto";
import type { AuditEvent } from "@paper-trader/shared";
import { StateStore } from "../db/stateStore";

export class AuditService {
  constructor(private readonly store: StateStore) {}

  log(action: string, details: Record<string, unknown>, actorId = "system", accountId?: string): AuditEvent {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      actorId,
      accountId,
      action,
      details,
      createdAt: Date.now()
    };
    this.store.update((s) => {
      s.auditEvents.push(event);
      s.auditEvents = s.auditEvents.slice(-5000);
    });
    return event;
  }
}
