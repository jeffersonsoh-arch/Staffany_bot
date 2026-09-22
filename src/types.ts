export interface StaffMember {
  id: string;
  orgUserId: string;
  organisationId: string;
  displayName?: string;
  profile?: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  workInfo?: {
    status: string;
    homeSection: { id: string; name: string } | null;
  };
}

export interface Section {
  id: string;
  name: string;
  tag?: string | null;
}

export interface Shift {
  id: string;
  sectionId: string;
  name: string;
  timeStart: string;
  timeEnd: string;
}

export interface ShiftSlot {
  id: string;
  userId: string | null;
  timeStart: string;
  timeEnd: string;
  shiftId: string;
  roleId: string;
  sectionId: string;
  isPublished?: boolean;
}

export type SwapRequestStatus = "open" | "claimed" | "cancelled";

export interface SwapRequest {
  id: string;
  shiftSlotId: string;
  offeredByStaffId: string;
  offeredByTelegramId: number;
  offeredByName: string;
  status: SwapRequestStatus;
  claimedByStaffId?: string;
  claimedByTelegramId?: number;
  claimedByName?: string;
  createdAt: string;
  updatedAt: string;
  shiftSummary: string;
}

export interface LinkedUser {
  telegramId: number;
  staffId: string;
  name: string;
  email: string | null;
  linkedAt: string;
}

export interface Db {
  links: Record<string, LinkedUser>;
  swapRequests: SwapRequest[];
}
