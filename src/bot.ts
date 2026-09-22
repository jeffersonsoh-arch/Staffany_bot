import { Context, Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "./config.js";
import { findStaffByPhone, getSectionsById, getShiftsById, getStaffById, staffDisplayName } from "./directory.js";
import { staffAny, StaffAnyApiError } from "./staffanyClient.js";
import {
  addSwapRequest,
  getLink,
  getSwapRequest,
  listSwapRequests,
  removeLink,
  setLink,
  updateSwapRequest,
} from "./store.js";
import { dayBoundsUtc, formatDate, formatTimeRange, parseDateInput } from "./timezone.js";
import { Section, Shift, ShiftSlot, StaffMember } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function commandArgs(ctx: Context): string[] {
  const msg = ctx.message;
  if (!msg || !("text" in msg)) return [];
  return msg.text.trim().split(/\s+/).slice(1);
}

function linkStaff(telegramId: number, staff: StaffMember): void {
  setLink({
    telegramId,
    staffId: staff.id,
    name: staffDisplayName(staff),
    email: staff.profile?.email ?? null,
    linkedAt: new Date().toISOString(),
  });
}

function requireLink(ctx: Context) {
  const fromId = ctx.from?.id;
  if (!fromId) return undefined;
  const link = getLink(fromId);
  if (!link) {
    ctx.reply("You're not linked to a StaffAny profile yet. Use /registerphone first.");
    return undefined;
  }
  return { link, fromId };
}

async function describeSlot(slot: ShiftSlot): Promise<string> {
  const [sections, shifts, staffById] = await Promise.all([
    getSectionsById(),
    getShiftsById(slot.timeStart, slot.timeEnd),
    getStaffById(),
  ]);
  const section = sections.get(slot.sectionId)?.name ?? "Unknown section";
  const shiftName = shifts.get(slot.shiftId)?.name;
  const assignedStaff = slot.userId ? staffById.get(slot.userId) : undefined;
  const whoName = slot.userId ? (assignedStaff ? staffDisplayName(assignedStaff) : "Unknown staff") : "Unassigned";
  const date = formatDate(slot.timeStart, config.timezone);
  const time = formatTimeRange(slot.timeStart, slot.timeEnd, config.timezone);
  const label = shiftName ? `${section} – ${shiftName}` : section;
  return `${date}, ${time} — ${label} — ${whoName}\n  id: ${slot.id}`;
}

function shortSlotLabel(slot: ShiftSlot, sections: Map<string, Section>, shifts: Map<string, Shift>): string {
  const section = sections.get(slot.sectionId)?.name ?? "Unknown section";
  const shiftName = shifts.get(slot.shiftId)?.name;
  const date = formatDate(slot.timeStart, config.timezone);
  const time = formatTimeRange(slot.timeStart, slot.timeEnd, config.timezone);
  const label = shiftName ? `${section} – ${shiftName}` : section;
  return `${date} ${time} – ${label}`;
}

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  bot.start((ctx) =>
    ctx.reply(
      "Hi! I'm the StaffAny shift bot.\n\n" +
        "First, link your Telegram to your StaffAny profile:\n" +
        "/registerphone\n\n" +
        "Then try /help to see what I can do.",
    ),
  );

  bot.help((ctx) =>
    ctx.reply(
      "Commands:\n" +
        "/registerphone – link your Telegram to your StaffAny profile by phone number\n" +
        "/whoami – show your linked profile\n" +
        "/unlink – remove the link\n" +
        "/myshifts [days] – your upcoming shifts (default 7 days)\n" +
        "/whosworking [today|tomorrow|YYYY-MM-DD] – who's rostered on a given day\n" +
        "/offswap – pick one of your upcoming shifts to offer for someone else to take\n" +
        "/openswaps – list open swap offers\n" +
        "/takeswap – pick an open swap offer to claim (reassigns the shift to you)\n" +
        "/cancelswap – pick one of your own open swap offers to cancel",
    ),
  );

  bot.command("registerphone", async (ctx) => {
    await ctx.reply(
      "Tap the button below to share your Telegram phone number. I'll match it against your StaffAny profile.",
      Markup.keyboard([Markup.button.contactRequest("Share my phone number")])
        .oneTime()
        .resize(),
    );
  });

  bot.on(message("contact"), async (ctx) => {
    if (!ctx.from) return;
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply("That's not your own contact card — please use the share-my-number button instead.");
      return;
    }
    try {
      const staff = await findStaffByPhone(contact.phone_number);
      if (!staff) {
        await ctx.reply(
          "Couldn't find a unique StaffAny staff member with that phone number. " +
            "Ask a manager to check the phone number on your StaffAny profile.",
          Markup.removeKeyboard(),
        );
        return;
      }
      linkStaff(ctx.from.id, staff);
      await ctx.reply(`Linked! You're now ${staffDisplayName(staff)} in StaffAny.`, Markup.removeKeyboard());
    } catch (err) {
      await ctx.reply(`Couldn't reach StaffAny: ${(err as Error).message}`, Markup.removeKeyboard());
    }
  });

  bot.command("unlink", async (ctx) => {
    if (!ctx.from) return;
    removeLink(ctx.from.id);
    await ctx.reply("Unlinked. Use /registerphone to link again.");
  });

  bot.command("whoami", async (ctx) => {
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link } = resolved;
    await ctx.reply(`Linked as ${link.name}${link.email ? ` (${link.email})` : ""}.\nStaffAny staff ID: ${link.staffId}`);
  });

  bot.command("myshifts", async (ctx) => {
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link } = resolved;
    const [daysArg] = commandArgs(ctx);
    const days = Math.min(30, Math.max(1, Number(daysArg) || 7));
    const start = new Date().toISOString();
    const end = new Date(Date.now() + days * DAY_MS).toISOString();
    try {
      const slots = await staffAny.listShiftSlots({ start, end, staffIds: [link.staffId], includeUnassigned: false });
      slots.sort((a, b) => a.timeStart.localeCompare(b.timeStart));
      if (slots.length === 0) {
        await ctx.reply(`No shifts scheduled for you in the next ${days} day(s).`);
        return;
      }
      const lines = await Promise.all(slots.map(describeSlot));
      await ctx.reply(`Your shifts for the next ${days} day(s):\n\n${lines.join("\n\n")}`);
    } catch (err) {
      await ctx.reply(`Couldn't fetch your shifts: ${(err as Error).message}`);
    }
  });

  bot.command("whosworking", async (ctx) => {
    const [dateArg] = commandArgs(ctx);
    let dateStr: string;
    try {
      dateStr = parseDateInput(dateArg, config.timezone);
    } catch (err) {
      await ctx.reply((err as Error).message);
      return;
    }
    try {
      const { start, end } = dayBoundsUtc(dateStr, config.timezone);
      const slots = await staffAny.listShiftSlots({ start, end, includeUnassigned: false });
      if (slots.length === 0) {
        await ctx.reply(`Nobody is rostered on ${dateStr}.`);
        return;
      }
      const [sections, staffById] = await Promise.all([getSectionsById(), getStaffById()]);
      slots.sort((a, b) => a.timeStart.localeCompare(b.timeStart));
      const lines = slots.map((slot) => {
        const section = sections.get(slot.sectionId)?.name ?? "Unknown section";
        const staffMember = slot.userId ? staffById.get(slot.userId) : undefined;
        const who = staffMember ? staffDisplayName(staffMember) : "Unassigned";
        const time = formatTimeRange(slot.timeStart, slot.timeEnd, config.timezone);
        return `${time} — ${section} — ${who}`;
      });
      await ctx.reply(`Rostered on ${dateStr}:\n\n${lines.join("\n")}`);
    } catch (err) {
      await ctx.reply(`Couldn't fetch the roster: ${(err as Error).message}`);
    }
  });

  bot.command("offswap", async (ctx) => {
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link } = resolved;
    try {
      const start = new Date().toISOString();
      const end = new Date(Date.now() + 14 * DAY_MS).toISOString();
      const slots = await staffAny.listShiftSlots({ start, end, staffIds: [link.staffId], includeUnassigned: false });
      slots.sort((a, b) => a.timeStart.localeCompare(b.timeStart));
      if (slots.length === 0) {
        await ctx.reply("You have no upcoming shifts in the next 14 days to offer for swap.");
        return;
      }
      const [sections, shifts] = await Promise.all([getSectionsById(), getShiftsById(start, end)]);
      const buttons = slots
        .slice(0, 15)
        .map((slot) => [Markup.button.callback(shortSlotLabel(slot, sections, shifts), `offswap:${slot.id}`)]);
      await ctx.reply("Pick a shift to offer for swap:", Markup.inlineKeyboard(buttons));
    } catch (err) {
      await ctx.reply(`Couldn't fetch your shifts: ${(err as Error).message}`);
    }
  });

  bot.action(/^offswap:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link, fromId } = resolved;
    const slotId = ctx.match[1];
    try {
      const start = new Date().toISOString();
      const end = new Date(Date.now() + 60 * DAY_MS).toISOString();
      const slots = await staffAny.listShiftSlots({ start, end, staffIds: [link.staffId], includeUnassigned: false });
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) {
        await ctx.reply("That shift wasn't found among your upcoming shifts — it may have changed. Run /offswap again.");
        return;
      }
      const shiftSummary = await describeSlot(slot);
      const request = addSwapRequest({
        shiftSlotId: slot.id,
        offeredByStaffId: link.staffId,
        offeredByTelegramId: fromId,
        offeredByName: link.name,
        shiftSummary,
      });
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});
      await ctx.reply(
        `Swap offer created (id: ${request.id}) for:\n${shiftSummary}\n\nAnyone linked can claim it via /takeswap.`,
      );
    } catch (err) {
      await ctx.reply(`Couldn't create the swap offer: ${(err as Error).message}`);
    }
  });

  bot.command("openswaps", async (ctx) => {
    const open = listSwapRequests("open");
    if (open.length === 0) {
      await ctx.reply("No open swap offers right now.");
      return;
    }
    const lines = open.map((r) => `#${r.id} — offered by ${r.offeredByName}\n${r.shiftSummary}`);
    await ctx.reply(`Open swap offers:\n\n${lines.join("\n\n")}`);
  });

  bot.command("takeswap", async (ctx) => {
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link } = resolved;
    const takeable = listSwapRequests("open").filter((r) => r.offeredByStaffId !== link.staffId);
    if (takeable.length === 0) {
      await ctx.reply("No open swap offers you can take right now.");
      return;
    }
    const buttons = takeable
      .slice(0, 15)
      .map((r) => [Markup.button.callback(r.shiftSummary.split("\n")[0], `takeswap:${r.id}`)]);
    await ctx.reply("Pick a swap offer to take:", Markup.inlineKeyboard(buttons));
  });

  bot.action(/^takeswap:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link, fromId } = resolved;
    const requestId = ctx.match[1];
    const request = getSwapRequest(requestId);
    if (!request || request.status !== "open") {
      await ctx.reply("That swap offer doesn't exist or is no longer open — run /takeswap again for the current list.");
      return;
    }
    if (request.offeredByStaffId === link.staffId) {
      await ctx.reply("You can't take your own swap offer. Use /cancelswap instead.");
      return;
    }
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});

    try {
      await staffAny.unassignShiftSlot(request.shiftSlotId);
    } catch (err) {
      const detail = err instanceof StaffAnyApiError ? err.message : (err as Error).message;
      await ctx.reply(
        `Couldn't unassign the original staff member (${detail}). Write access may not be enabled for this ` +
          "Workspace API key — ask a manager to make the swap manually in StaffAny.",
      );
      return;
    }

    try {
      await staffAny.assignShiftSlot(request.shiftSlotId, link.staffId);
    } catch (err) {
      try {
        await staffAny.assignShiftSlot(request.shiftSlotId, request.offeredByStaffId);
      } catch {
        // best-effort rollback
      }
      const detail = err instanceof StaffAnyApiError ? err.message : (err as Error).message;
      await ctx.reply(
        `Unassigned the original staff member but failed to assign you (${detail}). Attempted to roll back — ` +
          "please check the schedule with a manager.",
      );
      return;
    }

    updateSwapRequest(request.id, {
      status: "claimed",
      claimedByStaffId: link.staffId,
      claimedByTelegramId: fromId,
      claimedByName: link.name,
    });

    await ctx.reply(`Shift reassigned to you. Swap #${request.id} closed.`);

    try {
      await ctx.telegram.sendMessage(
        request.offeredByTelegramId,
        `Your swap offer #${request.id} was taken by ${link.name}.\n${request.shiftSummary}`,
      );
    } catch {
      // offeror may have never started a chat with the bot; ignore
    }
  });

  bot.command("cancelswap", async (ctx) => {
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link } = resolved;
    const mine = listSwapRequests("open").filter((r) => r.offeredByStaffId === link.staffId);
    if (mine.length === 0) {
      await ctx.reply("You have no open swap offers to cancel.");
      return;
    }
    const buttons = mine
      .slice(0, 15)
      .map((r) => [Markup.button.callback(r.shiftSummary.split("\n")[0], `cancelswap:${r.id}`)]);
    await ctx.reply("Pick a swap offer to cancel:", Markup.inlineKeyboard(buttons));
  });

  bot.action(/^cancelswap:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const resolved = requireLink(ctx);
    if (!resolved) return;
    const { link } = resolved;
    const requestId = ctx.match[1];
    const request = getSwapRequest(requestId);
    if (!request || request.status !== "open") {
      await ctx.reply("That swap offer doesn't exist or is no longer open — run /cancelswap again for the current list.");
      return;
    }
    if (request.offeredByStaffId !== link.staffId) {
      await ctx.reply("Only the person who offered a swap can cancel it.");
      return;
    }
    updateSwapRequest(request.id, { status: "cancelled" });
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    await ctx.reply(`Swap #${request.id} cancelled.`);
  });

  return bot;
}
