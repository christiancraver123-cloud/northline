// Draft-first safety: nothing may reach an external platform without an APPROVED approval record.
// No publishing adapter exists. If one is added it MUST call assertPublishable() first.
import type { Production } from "@/lib/db/records";

export class ApprovalRequiredError extends Error {}

export function assertPublishable(p: Production, hasApprovedRecord: boolean) {
  if (p.status !== "APPROVED" && p.status !== "SCHEDULED") throw new ApprovalRequiredError(`Production ${p.code} is ${p.status}; human approval required before publishing.`);
  if (!hasApprovedRecord) throw new ApprovalRequiredError(`Production ${p.code} has no approved approval record.`);
}
