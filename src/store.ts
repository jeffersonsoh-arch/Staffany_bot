import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Db, LinkedUser, SwapRequest, SwapRequestStatus } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "data", "db.json");

function load(): Db {
  if (!existsSync(DB_PATH)) return { links: {}, swapRequests: [] };
  return JSON.parse(readFileSync(DB_PATH, "utf-8")) as Db;
}

function save(db: Db): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function getLink(telegramId: number): LinkedUser | undefined {
  return load().links[String(telegramId)];
}

export function setLink(link: LinkedUser): void {
  const db = load();
  db.links[String(link.telegramId)] = link;
  save(db);
}

export function removeLink(telegramId: number): void {
  const db = load();
  delete db.links[String(telegramId)];
  save(db);
}

export function listSwapRequests(status?: SwapRequestStatus): SwapRequest[] {
  const all = load().swapRequests;
  return status ? all.filter((r) => r.status === status) : all;
}

export function getSwapRequest(id: string): SwapRequest | undefined {
  return load().swapRequests.find((r) => r.id === id);
}

export function addSwapRequest(input: Omit<SwapRequest, "id" | "createdAt" | "updatedAt" | "status">): SwapRequest {
  const db = load();
  const now = new Date().toISOString();
  const request: SwapRequest = {
    ...input,
    id: randomUUID().slice(0, 8),
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  db.swapRequests.push(request);
  save(db);
  return request;
}

export function updateSwapRequest(id: string, patch: Partial<SwapRequest>): SwapRequest | undefined {
  const db = load();
  const request = db.swapRequests.find((r) => r.id === id);
  if (!request) return undefined;
  Object.assign(request, patch, { updatedAt: new Date().toISOString() });
  save(db);
  return request;
}
