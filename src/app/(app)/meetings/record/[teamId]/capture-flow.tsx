"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, CardHeader, ErrorState, Field, InfoNote, SuccessNote, Textarea } from "@/components/ui";
import { DISCUSSION_MAX_CHARS } from "@/lib/domain/constants";
import { evaluateGeofence, type GeofenceRules } from "@/lib/geo";
import { submitMeetingAction, type CaptureState } from "./actions";

interface Member {
  studentId: string;
  name: string;
  enrollmentNo: string;
  isLead: boolean;
}

interface Fix {
  latitude: number;
  longitude: number;
  accuracyM: number;
  at: Date;
}

type Step = "location" | "camera" | "details" | "preview" | "done";

export function CaptureFlow({
  teamId,
  teamCode,
  members,
  rules,
}: {
  teamId: string;
  teamCode: string;
  members: Member[];
  rules: GeofenceRules & { name: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("location");
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  const [present, setPresent] = useState<string[]>(members.map((m) => m.studentId));
  const [discussion, setDiscussion] = useState("");
  const [state, setState] = useState<CaptureState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const verdict = fix
    ? evaluateGeofence({ latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM }, rules)
    : null;

  /* ------------------------------------------------------------ location */

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("This device or browser does not expose location services. Use a mobile browser over HTTPS.");
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          at: new Date(position.timestamp),
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setGpsError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access for this site and try again."
            : error.code === error.TIMEOUT
              ? "Could not get a GPS fix in time. Step outside and try again."
              : "Location is unavailable right now. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  /* -------------------------------------------------------------- camera */

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch {
      setCameraError("unsupported");
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPhoto({ blob, url: URL.createObjectURL(blob) });
        stopCamera();
        setStep("details");
      },
      "image/jpeg",
      0.9,
    );
  }, [stopCamera]);

  /* -------------------------------------------------------------- submit */

  const submit = () => {
    if (!fix || !photo) return;
    const formData = new FormData();
    formData.set("teamId", teamId);
    formData.set("discussion", discussion.trim());
    formData.set("latitude", String(fix.latitude));
    formData.set("longitude", String(fix.longitude));
    formData.set("accuracyM", String(fix.accuracyM));
    formData.set("capturedAt", fix.at.toISOString());
    formData.set("deviceInfo", navigator.userAgent.slice(0, 300));
    formData.set("photo", new File([photo.blob], "evidence.jpg", { type: "image/jpeg" }));
    for (const id of present) formData.append("present", id);

    startTransition(async () => {
      const result = await submitMeetingAction(state, formData);
      setState(result);
      if (result.status === "success") {
        setStep("done");
        router.refresh();
      }
    });
  };

  /* --------------------------------------------------------------- views */

  if (step === "done") {
    return (
      <Card>
        <CardBody className="space-y-4">
          <SuccessNote>
            Meeting {state.meetingCode} recorded for {teamCode}. The stamped evidence has been stored and sent
            for approval.
          </SuccessNote>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.push("/meetings")}>View meetings</Button>
            <Button variant="secondary" onClick={() => router.push("/meetings/record")}>
              Record another
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <StepIndicator step={step} />

      {/* ------------------------------------------------------- location */}
      <Card>
        <CardHeader
          title="Location check"
          description={`Campus anchor: ${rules.name} · allowed radius ${Math.round(rules.radiusM)}m`}
        />
        <CardBody className="space-y-3">
          {locating ? (
            <p className="text-[13px] text-[var(--color-muted)]">Checking location…</p>
          ) : gpsError ? (
            <>
              <ErrorState title="Location unavailable" description={gpsError} />
              <Button variant="secondary" onClick={locate}>
                Try again
              </Button>
            </>
          ) : fix && verdict ? (
            <>
              <div className="grid gap-2 text-[13px] sm:grid-cols-2">
                <Row label="GPS" value="detected" tone="success" />
                <Row
                  label="Accuracy"
                  value={`±${Math.round(fix.accuracyM)}m (${verdict.accuracyBand.toLowerCase()})`}
                  tone={verdict.accuracyBand === "GOOD" ? "success" : verdict.accuracyBand === "WARNING" ? "warning" : "danger"}
                />
                <Row
                  label="Campus verification"
                  value={verdict.insideFence ? "inside campus" : `${Math.round(verdict.distanceM)}m away`}
                  tone={verdict.insideFence ? "success" : "danger"}
                />
                <Row label="Captured at" value={fix.at.toLocaleTimeString("en-IN")} tone="neutral" />
              </div>

              {!verdict.allowed ? (
                <ErrorState title="Location verification failed" description={verdict.reason ?? undefined} />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={locate}>
                  Refresh location
                </Button>
                {verdict.allowed && step === "location" ? (
                  <Button
                    onClick={() => {
                      setStep("camera");
                      void startCamera();
                    }}
                  >
                    Continue to camera
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>

      {/* --------------------------------------------------------- camera */}
      {step === "camera" ? (
        <Card>
          <CardHeader
            title="Capture evidence photo"
            description={`${teamCode} · ${members.length} registered members`}
          />
          <CardBody className="space-y-3">
            {cameraError === "unsupported" ? (
              <>
                <InfoNote>
                  Direct camera streaming is not available in this browser. Use the camera button below — on a
                  mobile device it opens the camera directly. Gallery images are rejected by the server-side
                  checks where the browser reports them.
                </InfoNote>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Capture evidence photo"
                  className="block w-full text-[13px]"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setPhoto({ blob: file, url: URL.createObjectURL(file) });
                    setStep("details");
                  }}
                />
              </>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl bg-slate-900">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={capture} disabled={!streaming} className="flex-1">
                    Capture photo
                  </Button>
                  <Button variant="secondary" onClick={() => setStep("location")}>
                    Back
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      {/* -------------------------------------------- attendance + details */}
      {(step === "details" || step === "preview") && photo ? (
        <>
          <Card>
            <CardHeader title="Photo captured" />
            <CardBody className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="Captured meeting evidence preview" className="w-full rounded-xl" />
              <Button
                variant="secondary"
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  setPhoto(null);
                  setStep("camera");
                  void startCamera();
                }}
              >
                Retake
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Attendance" description="Tick the students present at this meeting." />
            <CardBody>
              <ul className="space-y-1">
                {members.map((m) => {
                  const checked = present.includes(m.studentId);
                  return (
                    <li key={m.studentId}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={checked}
                          onChange={(e) =>
                            setPresent((prev) =>
                              e.target.checked ? [...prev, m.studentId] : prev.filter((id) => id !== m.studentId),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{m.name}</span>
                          <span className="block text-[12px] text-[var(--color-muted)]">
                            {m.enrollmentNo}
                            {m.isLead ? " · Team lead" : ""}
                          </span>
                        </span>
                        <Badge tone={checked ? "success" : "neutral"}>{checked ? "Present" : "Absent"}</Badge>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                {present.length}/{members.length} marked present
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Discussion" />
            <CardBody>
              <Field
                label="What was discussed?"
                htmlFor="discussion"
                required
                hint={`${discussion.length}/${DISCUSSION_MAX_CHARS} characters`}
              >
                <Textarea
                  id="discussion"
                  rows={2}
                  maxLength={DISCUSSION_MAX_CHARS}
                  value={discussion}
                  onChange={(e) => setDiscussion(e.target.value)}
                  placeholder="Discussed database architecture and finalised API integration for authentication."
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Evidence preview" description="Location, date and time cannot be edited." />
            <CardBody className="space-y-3">
              <dl className="grid gap-1.5 text-[13px] sm:grid-cols-2">
                <Row label="Team" value={teamCode} tone="neutral" />
                <Row label="Attendance" value={`${present.length}/${members.length}`} tone="neutral" />
                {fix ? (
                  <>
                    <Row label="Latitude" value={fix.latitude.toFixed(6)} tone="neutral" />
                    <Row label="Longitude" value={fix.longitude.toFixed(6)} tone="neutral" />
                    <Row label="Accuracy" value={`±${Math.round(fix.accuracyM)}m`} tone="neutral" />
                    <Row label="Captured" value={fix.at.toLocaleString("en-IN")} tone="neutral" />
                  </>
                ) : null}
              </dl>

              {state.status === "error" ? (
                <ErrorState title="Submission rejected" description={state.message} />
              ) : null}

              <Button
                onClick={submit}
                disabled={pending || !discussion.trim() || !verdict?.allowed}
                className="w-full"
              >
                {pending ? "Submitting…" : "Submit meeting"}
              </Button>
              <p className="text-[12px] text-[var(--color-muted)]">
                The server re-checks your location against the campus geofence before storing the evidence.
              </p>
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-canvas)] px-3 py-2">
      <dt className="text-[12px] uppercase tracking-wide text-[var(--color-muted)]">{label}</dt>
      <dd>
        <Badge tone={tone}>{value}</Badge>
      </dd>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "location", label: "Location" },
    { key: "camera", label: "Camera" },
    { key: "details", label: "Attendance" },
    { key: "preview", label: "Submit" },
  ];
  const index = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2 text-[12px]" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={
              i <= index
                ? "rounded-full bg-[var(--color-brand-600)] px-2.5 py-1 font-medium text-white"
                : "rounded-full bg-slate-100 px-2.5 py-1 text-[var(--color-muted)]"
            }
          >
            {s.label}
          </span>
          {i < steps.length - 1 ? <span className="text-slate-300">→</span> : null}
        </li>
      ))}
    </ol>
  );
}
