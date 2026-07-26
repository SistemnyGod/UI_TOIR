export interface ReleaseResponseResolution {
  restoreAccepted: boolean;
  assignmentStatus: "accepted" | "released";
  preserveLocalData: boolean;
}

export function getReleaseResponseResolution(status: string): ReleaseResponseResolution | null {
  if (status === "rejected" || status === "conflict") {
    return { restoreAccepted: true, assignmentStatus: "accepted", preserveLocalData: true };
  }

  if (status === "accepted" || status === "duplicate") {
    return { restoreAccepted: false, assignmentStatus: "released", preserveLocalData: false };
  }

  return null;
}