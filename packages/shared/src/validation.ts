import { z } from "zod";

export const emailSchema = z.string().email().max(255);

export const personIdSchema = z.string().uuid();

export const createAccessRequestSchema = z.object({
  personId: personIdSchema,
});

export const reviewAccessRequestSchema = z.object({
  status: z.enum(["approved", "denied"]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const downloadRequestSchema = z.object({
  personId: personIdSchema,
});
