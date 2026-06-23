// Single source of truth for applicant status → permissions and admin role caps.
// Use these helpers everywhere instead of hand-rolling `status === "approved"` checks.

export type ApplicantStatus = "pending" | "approved" | "rejected" | "suspended";
export type AppRole = "admin" | "user";

export interface ApplicantPermissions {
  /** Can open the test link and begin a new attempt. */
  canTakeTest: boolean;
  /** Can sign in with name + link token. */
  canLogin: boolean;
  /** Can view their own past results. */
  canViewResults: boolean;
  /** Counts toward the "active applicants" pool in admin dashboards. */
  isActive: boolean;
  /** Human-readable explanation for UI tooltips and toasts. */
  label: string;
  description: string;
}

export const STATUS_PERMISSIONS: Record<ApplicantStatus, ApplicantPermissions> = {
  approved: {
    canTakeTest: true,
    canLogin: true,
    canViewResults: true,
    isActive: true,
    label: "Approved",
    description: "Full access — can take the test and view results.",
  },
  pending: {
    canTakeTest: false,
    canLogin: true,
    canViewResults: false,
    isActive: true,
    label: "Pending",
    description: "Awaiting admin approval before the test can be taken.",
  },
  suspended: {
    canTakeTest: false,
    canLogin: false,
    canViewResults: true,
    isActive: false,
    label: "Suspended",
    description: "Temporarily blocked from logging in or taking the test.",
  },
  rejected: {
    canTakeTest: false,
    canLogin: false,
    canViewResults: false,
    isActive: false,
    label: "Rejected",
    description: "Access denied. Cannot log in or take the test.",
  },
};

export function permissionsFor(status: string | null | undefined): ApplicantPermissions {
  const key = (status ?? "pending") as ApplicantStatus;
  return STATUS_PERMISSIONS[key] ?? STATUS_PERMISSIONS.pending;
}

export interface AdminRoleCaps {
  manageUsers: boolean;
  manageQuestions: boolean;
  manageOrganizations: boolean;
  manageAssignments: boolean;
  manageSettings: boolean;
  viewAudit: boolean;
  label: string;
}

export const ROLE_CAPS: Record<AppRole, AdminRoleCaps> = {
  admin: {
    manageUsers: true,
    manageQuestions: true,
    manageOrganizations: true,
    manageAssignments: true,
    manageSettings: true,
    viewAudit: true,
    label: "Administrator",
  },
  user: {
    manageUsers: false,
    manageQuestions: false,
    manageOrganizations: false,
    manageAssignments: false,
    manageSettings: false,
    viewAudit: false,
    label: "Standard user",
  },
};

export const APPLICANT_STATUSES: ApplicantStatus[] = ["approved", "pending", "suspended", "rejected"];
