"use server";

import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan } from "@/lib/auth/rbac";
import { submitMeeting } from "@/lib/services/meetings";
import { DISCUSSION_MAX_CHARS } from "@/lib/domain/constants";
import { rateLimit } from "@/lib/rate-limit";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const schema = z.object({
  teamId: z.string().min(1),
  discussion: z.string().trim().min(1).max(DISCUSSION_MAX_CHARS),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyM: z.coerce.number().min(0).max(100_000),
  capturedAt: z.coerce.date(),
  deviceInfo: z.string().max(300).optional().nullable(),
});

export interface CaptureState {
  status: "idle" | "error" | "success";
  message?: string;
  meetingCode?: string;
}

export async function submitMeetingAction(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "meeting.record");

    const limit = rateLimit(`meeting:${principal.userId}`, 20, 60 * 60_000);
    if (!limit.allowed) {
      return { status: "error", message: "Too many submissions in the last hour. Try again shortly." };
    }

    const parsed = schema.safeParse({
      teamId: formData.get("teamId"),
      discussion: formData.get("discussion"),
      latitude: formData.get("latitude"),
      longitude: formData.get("longitude"),
      accuracyM: formData.get("accuracyM"),
      capturedAt: formData.get("capturedAt"),
      deviceInfo: formData.get("deviceInfo"),
    });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid submission." };
    }

    const photo = formData.get("photo");
    if (!(photo instanceof File) || photo.size === 0) {
      return { status: "error", message: "The captured photo is missing. Retake it and submit again." };
    }
    if (photo.size > MAX_IMAGE_BYTES) {
      return { status: "error", message: "The photo is larger than 8 MB. Retake it." };
    }
    if (!ALLOWED_TYPES.includes(photo.type)) {
      return { status: "error", message: "Only camera images (JPEG/PNG/WebP) are accepted as evidence." };
    }

    const presentStudentIds = formData.getAll("present").map(String).filter(Boolean);
    const image = Buffer.from(await photo.arrayBuffer());

    const meeting = await submitMeeting(principal, {
      teamId: parsed.data.teamId,
      discussion: parsed.data.discussion,
      presentStudentIds,
      capture: {
        image,
        mimeType: photo.type,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        accuracyM: parsed.data.accuracyM,
        capturedAt: parsed.data.capturedAt,
        address: null,
        deviceInfo: parsed.data.deviceInfo ?? null,
      },
    });

    return { status: "success", meetingCode: meeting.code, message: "Meeting evidence submitted." };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong while submitting the evidence.";
    return { status: "error", message };
  }
}
