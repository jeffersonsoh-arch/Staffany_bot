import axios, { AxiosInstance, isAxiosError } from "axios";
import { config } from "./config.js";
import { Section, Shift, ShiftSlot, StaffMember } from "./types.js";

interface Page<T> {
  items: T[];
  meta?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  };
}

export class StaffAnyApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "StaffAnyApiError";
  }
}

export class StaffAnyClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.staffanyBaseUrl,
      headers: { Authorization: `Bearer ${config.staffanyApiKey}` },
      timeout: 15_000,
    });
  }

  private async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    try {
      const res = await this.http.get<{ data: T }>(path, { params });
      return res.data.data;
    } catch (err) {
      throw this.wrap(err);
    }
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    try {
      const res = await this.http.post<{ data: T }>(path, body);
      return res.data.data;
    } catch (err) {
      throw this.wrap(err);
    }
  }

  private wrap(err: unknown): StaffAnyApiError {
    if (isAxiosError(err)) {
      const status = err.response?.status;
      const message =
        (err.response?.data as { message?: string } | undefined)?.message ?? err.message ?? "StaffAny API error";
      return new StaffAnyApiError(message, status);
    }
    return new StaffAnyApiError(err instanceof Error ? err.message : "Unknown StaffAny API error");
  }

  private async paginateAll<T>(fetchPage: (cursor?: string) => Promise<Page<T>>): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await fetchPage(cursor);
      all.push(...page.items);
      if (!page.meta?.hasMore || !page.meta.nextCursor) break;
      cursor = page.meta.nextCursor;
    }
    return all;
  }

  async me(): Promise<{ id: string; name?: string }> {
    return this.get<{ id: string; name?: string }>("/workspace/v2/me");
  }

  async listStaff(): Promise<StaffMember[]> {
    return this.paginateAll<StaffMember>((cursor) =>
      this.get<Page<StaffMember>>("/workspace/v2/staff", { limit: 100, cursor }),
    );
  }

  async getStaff(staffId: string): Promise<StaffMember> {
    return this.get<StaffMember>(`/workspace/v2/staff/${encodeURIComponent(staffId)}`);
  }

  async listSections(): Promise<Section[]> {
    const result = await this.get<{ items: Section[] }>("/workspace/v2/sections");
    return result.items;
  }

  async listShifts(startIso: string, endIso: string): Promise<Shift[]> {
    return this.paginateAll<Shift>((cursor) =>
      this.get<Page<Shift>>("/workspace/v2/shifts", { start: startIso, end: endIso, limit: 100, cursor }),
    );
  }

  async listShiftSlots(opts: {
    start: string;
    end: string;
    staffIds?: string[];
    includeUnassigned?: boolean;
  }): Promise<ShiftSlot[]> {
    return this.paginateAll<ShiftSlot>((cursor) =>
      this.get<Page<ShiftSlot>>("/workspace/v2/shift-slots", {
        start: opts.start,
        end: opts.end,
        staffIds: opts.staffIds?.join(","),
        includeUnassigned: opts.includeUnassigned,
        limit: 100,
        cursor,
      }),
    );
  }

  async assignShiftSlot(shiftSlotId: string, userId: string): Promise<void> {
    await this.post("/workspace/v2/shift-slots/assign", {
      items: [{ shiftSlotId, userId }],
    });
  }

  async unassignShiftSlot(shiftSlotId: string): Promise<void> {
    await this.post("/workspace/v2/shift-slots/unassign", {
      items: [{ shiftSlotId }],
    });
  }
}

export const staffAny = new StaffAnyClient();
