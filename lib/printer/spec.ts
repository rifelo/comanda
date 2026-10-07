import { z } from "zod";

/**
 * A label as data: what to draw, not pixels. This is what travels when a
 * station without a printer asks the one that has it to print (see
 * pos_print_jobs), so it is validated on the way in. The shapes mirror the
 * renderer inputs in ./label.
 */
const text = (max: number) => z.string().max(max);

export const LabelSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("order"),
    input: z.object({
      name: text(120),
      folio: text(24),
      people: z.array(text(60)).max(30).optional(),
      station: text(80).optional(),
      orgName: text(120).optional(),
    }),
  }),
  z.object({
    kind: z.literal("drink"),
    input: z.object({
      name: text(120),
      spec: z.array(text(60)).max(6).optional(),
      desc: text(600).optional(),
      brand: text(120).optional(),
      customer: text(60).optional(),
    }),
    /** Brand mark drawn small on the label; loaded when the job runs. */
    cupSrc: text(800).nullable().optional(),
  }),
  z.object({ kind: z.literal("message"), text: text(300), handle: text(80).nullable().optional() }),
  z.object({ kind: z.literal("instagram"), handle: text(80), orgName: text(120).optional(), cupSrc: text(800).nullable().optional() }),
  z.object({ kind: z.literal("sticker"), src: text(800) }),
]);
export type LabelSpec = z.infer<typeof LabelSpecSchema>;

/** Most labels one request may relay (a big table: names, cups, phrases). */
export const RELAY_BATCH_MAX = 60;
/** A relayed label older than this is not printed any more. */
export const RELAY_TTL_MS = 5 * 60_000;
