"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface PhotoCaptureProps {
  shiftInstanceId: string;
  taskId: string;
  taskTitle?: string;
  restaurantId: string;
  onUploaded: (publicUrl: string) => void;
  onClose: () => void;
  /**
   * Optional uploader (returns the photo URL). The shared tablet has no
   * browser session, so it uploads through a server action; the staff flow
   * keeps the direct storage upload.
   */
  upload?: (blob: Blob) => Promise<string>;
}

type FacingMode = "environment" | "user";

/**
 * In-app camera modal. Streams `getUserMedia` into a `<video>` viewfinder,
 * captures the current frame to a JPEG via `<canvas>.toBlob`, then uploads to
 * Supabase Storage at `<restaurantId>/<shiftId>/<taskId>-<random>.jpg` (path
 * matches RLS policy on the `task-photos` bucket).
 *
 * Falls back to `<input capture="environment">` (native camera app) when
 * `getUserMedia` is unavailable or the user denies the permission.
 */
export function PhotoCapture({
  shiftInstanceId,
  taskId,
  taskTitle,
  restaurantId,
  onUploaded,
  onClose,
  upload,
}: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start (or restart on flip) the live camera while no preview is held.
  // Note: setStarting/setCameraError were previously called in the effect
  // body, which trips React 19's `set-state-in-effect` rule. They now run
  // inside the async start() closure (i.e. in a callback, not in the
  // effect body itself), so React batches them with the rest of start()'s
  // updates instead of cascading another render up front.
  useEffect(() => {
    if (preview) return;

    let cancelled = false;

    async function start() {
      setStarting(true);
      setCameraError(null);
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("unsupported");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // iOS Safari refuses to autoplay without an explicit play() call.
          await video.play().catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.message : "";
        const isDenied =
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "SecurityError");
        setCameraError(
          isDenied
            ? "Permiso de cámara denegado"
            : name === "unsupported"
              ? "Cámara no disponible en este dispositivo"
              : "No se pudo iniciar la cámara",
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    }
    start();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facingMode, preview, stopStream]);

  // Revoke blob URLs to avoid leaks when the preview changes or modal closes.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function onShutter() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (b) => {
        if (!b) {
          setError("No se pudo capturar la foto");
          return;
        }
        setBlob(b);
        setPreview(URL.createObjectURL(b));
        stopStream();
      },
      "image/jpeg",
      0.85,
    );
  }

  function onRetake() {
    setBlob(null);
    setPreview(null);
    setError(null);
  }

  function onFlip() {
    setFacingMode((f) => (f === "environment" ? "user" : "environment"));
  }

  function onPickFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBlob(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onConfirm() {
    if (!blob) return;
    setUploading(true);
    setError(null);
    try {
      if (upload) {
        onUploaded(await upload(blob));
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const random = Math.random().toString(36).slice(2, 10);
      const path = `${restaurantId}/${shiftInstanceId}/${taskId}-${random}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("task-photos")
        .upload(path, blob, {
          contentType: blob.type || "image/jpeg",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: signed, error: sErr } = await supabase.storage
        .from("task-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      if (sErr || !signed) throw sErr ?? new Error("signed_url_failed");

      onUploaded(signed.signedUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Error al subir foto");
    } finally {
      setUploading(false);
    }
  }

  const liveCameraAvailable = !cameraError;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#0e0c08", color: "#fff", fontFamily: "var(--font-mono)" }}
    >
      {/* top bar */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "calc(env(safe-area-inset-top) + 12px) 16px 12px" }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={uploading}
          style={{
            fontSize: 11,
            opacity: 0.85,
            letterSpacing: "0.08em",
            background: "transparent",
            border: "none",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          ← Cancelar
        </button>
        <span
          style={{
            fontSize: 10,
            color: "var(--red)",
            letterSpacing: "0.18em",
            border: "1px solid currentColor",
            padding: "3px 6px",
          }}
        >
          FOTO REQUERIDA
        </span>
      </div>

      {/* viewfinder */}
      <div
        className="flex-1 relative mx-4 overflow-hidden"
        style={{ background: "#1a1612", borderRadius: 4 }}
      >
        {/* Live video — hidden while preview is showing, but kept mounted only when streaming. */}
        {!preview && liveCameraAvailable ? (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              transform: facingMode === "user" ? "scaleX(-1)" : undefined,
              background: "#1a1612",
            }}
          />
        ) : null}

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Vista previa"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {/* corner brackets / framing guides — over live feed only */}
        {!preview ? (
          <>
            {(["tl", "tr", "bl", "br"] as const).map((c) => (
              <div
                key={c}
                style={{
                  position: "absolute",
                  ...(c[0] === "t" ? { top: 16 } : { bottom: 16 }),
                  ...(c[1] === "l" ? { left: 16 } : { right: 16 }),
                  width: 24,
                  height: 24,
                  borderTop: c[0] === "t" ? "2px solid #fff" : "none",
                  borderBottom: c[0] === "b" ? "2px solid #fff" : "none",
                  borderLeft: c[1] === "l" ? "2px solid #fff" : "none",
                  borderRight: c[1] === "r" ? "2px solid #fff" : "none",
                  pointerEvents: "none",
                }}
              />
            ))}
          </>
        ) : null}

        {/* status overlay: starting / camera error / hint */}
        {!preview && starting && liveCameraAvailable ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(14,12,8,0.65)", fontSize: 11, letterSpacing: "0.12em" }}
          >
            <Loader2 className="h-5 w-5 animate-spin" />
            <div style={{ marginTop: 10, opacity: 0.75 }}>INICIANDO CÁMARA…</div>
          </div>
        ) : null}

        {!preview && cameraError ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-center"
            style={{ padding: "0 32px", gap: 14 }}
          >
            <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--red)" }}>
              CÁMARA NO DISPONIBLE
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.45 }}>{cameraError}</div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                marginTop: 6,
                padding: "10px 18px",
                fontSize: 11,
                letterSpacing: "0.14em",
                border: "1px solid #fff",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ABRIR CÁMARA DEL SISTEMA
            </button>
          </div>
        ) : null}
      </div>

      {/* task label */}
      <div
        className="px-4 pt-3.5 pb-2"
        style={{ borderTop: "1px solid rgba(255,255,255,.1)", marginTop: 12 }}
      >
        <div
          style={{
            fontSize: 10,
            opacity: 0.6,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Tarea
        </div>
        <div style={{ fontSize: 14, marginTop: 2, fontWeight: 500 }}>
          {taskTitle ?? "Tarea"}
        </div>
      </div>

      {error ? (
        <div
          className="text-center"
          style={{
            color: "var(--red)",
            fontSize: 12,
            padding: "0 16px 8px",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* shutter / confirm */}
      {preview ? (
        <div
          className="flex items-center"
          style={{ gap: 10, padding: "12px 16px calc(env(safe-area-inset-bottom) + 32px)" }}
        >
          <button
            type="button"
            onClick={onRetake}
            disabled={uploading}
            style={{
              flex: 1,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontSize: 11,
              padding: "13px 16px",
              borderRadius: 3,
              border: "1.5px solid rgba(255,255,255,.5)",
              background: "transparent",
              color: "rgba(255,255,255,.92)",
              cursor: "pointer",
            }}
          >
            Volver a tomar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={uploading}
            className="inline-flex items-center justify-center"
            style={{
              flex: 1,
              gap: 6,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontSize: 11,
              padding: "13px 16px",
              borderRadius: 3,
              border: "1.5px solid var(--red)",
              background: "var(--red)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Usar foto ✓"}
          </button>
        </div>
      ) : (
        <div
          className="flex items-center justify-center gap-7"
          style={{ padding: "12px 0 calc(env(safe-area-inset-bottom) + 32px)" }}
        >
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                fontSize: 10,
                opacity: 0.7,
                letterSpacing: "0.18em",
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              GALERÍA
            </button>
            <button
              type="button"
              onClick={liveCameraAvailable ? onShutter : () => fileInputRef.current?.click()}
              disabled={liveCameraAvailable && starting}
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: "3px solid #fff",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                opacity: liveCameraAvailable && starting ? 0.5 : 1,
              }}
              aria-label="Tomar foto"
            >
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "var(--red)",
                  display: "block",
                }}
              />
            </button>
            <button
              type="button"
              onClick={onFlip}
              disabled={!liveCameraAvailable || starting}
              style={{
                fontSize: 10,
                opacity: liveCameraAvailable ? 0.7 : 0.3,
                letterSpacing: "0.18em",
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: liveCameraAvailable ? "pointer" : "not-allowed",
              }}
            >
              VOLTEAR
            </button>
          </>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickFromFile}
      />
    </div>
  );
}
