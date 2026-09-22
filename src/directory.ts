import { staffAny } from "./staffanyClient.js";
import { Section, Shift, StaffMember } from "./types.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

let staffCache: { at: number; byId: Map<string, StaffMember> } | undefined;
let sectionCache: { at: number; byId: Map<string, Section> } | undefined;

export function staffDisplayName(staff: StaffMember): string {
  if (staff.displayName) return staff.displayName;
  const first = staff.profile?.firstName ?? "";
  const last = staff.profile?.lastName ?? "";
  const name = `${first} ${last}`.trim();
  return name || staff.id;
}

export async function getStaffById(): Promise<Map<string, StaffMember>> {
  if (staffCache && Date.now() - staffCache.at < CACHE_TTL_MS) return staffCache.byId;
  const all = await staffAny.listStaff();
  const byId = new Map(all.map((s) => [s.id, s]));
  staffCache = { at: Date.now(), byId };
  return byId;
}

/** Keeps only digits, then the last 8 so "+65 9123 4567", "6591234567", and "91234567" all match. */
function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-8);
}

export async function findStaffByPhone(phone: string): Promise<StaffMember | undefined> {
  const byId = await getStaffById();
  const target = phoneKey(phone);
  if (target.length < 8) return undefined;
  const matches = [...byId.values()].filter(
    (s) => s.profile?.phoneNumber && phoneKey(s.profile.phoneNumber) === target,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export async function getSectionsById(): Promise<Map<string, Section>> {
  if (sectionCache && Date.now() - sectionCache.at < CACHE_TTL_MS) return sectionCache.byId;
  const all = await staffAny.listSections();
  const byId = new Map(all.map((s) => [s.id, s]));
  sectionCache = { at: Date.now(), byId };
  return byId;
}

export async function getShiftsById(startIso: string, endIso: string): Promise<Map<string, Shift>> {
  const all = await staffAny.listShifts(startIso, endIso);
  return new Map(all.map((s) => [s.id, s]));
}

export function invalidateDirectoryCache(): void {
  staffCache = undefined;
  sectionCache = undefined;
}
