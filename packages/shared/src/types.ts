export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: "admin" | "user";
  createdAt: string;
}

export interface Person {
  id: string;
  immichPersonId: string;
  name: string;
  thumbnailUrl: string | null;
  assetCount: number;
  syncDate: string | null;
  createdAt: string;
}

export interface AssetCache {
  id: string;
  immichAssetId: string;
  personId: string;
  thumbnailUrl: string;
  exif: string | null;
  createdAt: string;
}

export type AccessRequestStatus = "pending" | "approved" | "denied";

export interface AccessRequest {
  id: string;
  userId: string;
  personId: string;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface Approval {
  id: string;
  userId: string;
  personId: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export type DownloadJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface DownloadJob {
  id: string;
  userId: string;
  personId: string;
  status: DownloadJobStatus;
  zipPath: string | null;
  expiresAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
