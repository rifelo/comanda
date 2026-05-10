"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface PhotoCaptureProps {
  shiftInstanceId: string;
  taskId: string;
  taskTitle?: string;
  restaurantId: string;
  onUploaded: (publicUrl: string) => void;
  onClose: () => void;
}

/**
 * Dark camera-viewfinder modal · staff workflow:
 *  - Tap shutter → opens native rear camera (`<input capture="environment">`).
 *  - Pick → preview + confirm uploads to Supabase Storage at
 *    `<restaurantId>/<shiftId>/<taskId>-<random>.jpg` (matches RLS policy).
 */
export function PhotoCapture({
  shiftInstanceId,
  taskId,
  taskTitle,
  restaurantId,
  onUploaded,
  onClose,
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onConfirm() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const random = Math.random().toString(36).slice(2, 10);
      const path = `${restaurantId}/${shiftInstanceId}/${taskId}-${random}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("task-photos")
        .upload(path, file, {
          contentType: file.type || "image/jpeg",
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
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Vista previa"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(45deg, rgba(255,255,255,.04) 0 12px, rgba(255,255,255,.08) 12px 24px)",
            }}
          >
            {/* corner brackets */}
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
                }}
              />
            ))}
            <div
              className="absolute inset-x-0 text-center"
              style={{
                bottom: 70,
                fontSize: 11,
                opacity: 0.7,
                letterSpacing: "0.1em",
              }}
            >
              ENCUADRE LA TAREA
            </div>
          </div>
        )}
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
      <div
        className="flex items-center justify-center gap-7"
        style={{ padding: "12px 0 calc(env(safe-area-inset-bottom) + 32px)" }}
      >
        {preview ? (
          <>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
              }}
              disabled={uploading}
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
              VOLVER A TOMAR
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={uploading}
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                border: "3px solid #fff",
                background: "var(--green)",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                letterSpacing: "0.12em",
              }}
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : "OK"}
            </button>
            <span
              style={{ fontSize: 10, opacity: 0, letterSpacing: "0.18em" }}
              aria-hidden
            >
              VOLVER
            </span>
          </>
        ) : (
          <>
            <span
              style={{ fontSize: 10, opacity: 0.5, letterSpacing: "0.18em" }}
            >
              GALERÍA
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
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
            <span
              style={{ fontSize: 10, opacity: 0.5, letterSpacing: "0.18em" }}
            >
              VOLTEAR
            </span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
