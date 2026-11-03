import { getDemoValue } from "@/lib/demo-session";

export type ApprovalsQuerySnapshot = {
  approvals: any[];
  dataSource: "demo";
  errorMessage: string;
};

/**
 * Approval requests are currently stored in the browser demo session. Keeping
 * the read behind one query function gives every approval consumer the same
 * cache contract without changing the existing approval workflow.
 */
export async function fetchApprovalsSnapshot(): Promise<ApprovalsQuerySnapshot> {
  const savedApprovals = getDemoValue("approvals");
  return {
    approvals: Array.isArray(savedApprovals) ? savedApprovals : [],
    dataSource: "demo",
    errorMessage: "",
  };
}
