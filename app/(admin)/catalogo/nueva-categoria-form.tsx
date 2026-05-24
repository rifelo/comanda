"use client";

/**
 * NuevaCategoriaForm — inline create form in the catálogo left rail.
 *
 * Replaces the "+ nueva categoría" link in place (no drawer; the design
 * keeps focus in context — `chats/chat3.md:174-199`). Enter saves, Esc
 * cancels. On success, calls onCreated(id) so the rail can auto-select
 * the newly-created node.
 */
import * as React from "react";
import type { CatalogoCategoryNode } from "@/lib/types";
import { createProductoCategoria } from "./actions";

export function NuevaCategoriaForm({
  categorias,
  onClose,
  onCreated,
}: {
  categorias: CatalogoCategoryNode[];
  onClose: () => void;
  onCreated: (newId: string) => void;
}) {
  // Top-level (root) categorías — the only valid parents per the design.
  const topLevel = React.useMemo(
    () =>
      categorias
        .filter((c) => c.id !== null && c.parent_id === null)
        .map((c) => ({ id: c.id as string, label: c.label })),
    [categorias],
  );

  const [nombre, setNombre] = React.useState("");
  const [padre, setPadre] = React.useState<string>(""); // "" = root
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = nombre.trim();
    if (!trimmed) {
      setError("Requerido");
      return;
    }
    const fd = new FormData();
    fd.set("label", trimmed);
    fd.set("parent_id", padre);
    setError(null);
    startTransition(async () => {
      const r = await createProductoCategoria(null, fd);
      if (!r.ok) {
        setError(r.error ?? "Algo salió mal.");
        return;
      }
      if (r.id) onCreated(r.id);
      onClose();
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      style={{
        margin: "8px 0 0",
        border: "1.5px solid var(--ink)",
        background: "var(--paper)",
        padding: "10px 8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        className="text-muted"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        Nueva categoría
      </div>

      <div>
        <label
          htmlFor="nc-nombre"
          className="text-muted block"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Nombre *
        </label>
        <input
          ref={inputRef}
          id="nc-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Veganos"
          disabled={pending}
          className="block w-full bg-transparent outline-none"
          style={{
            borderBottom: `1.5px solid ${error ? "var(--red)" : "var(--ink)"}`,
            padding: "4px 0",
            marginTop: 2,
            fontSize: 13,
            color: "var(--ink)",
            fontFamily: "inherit",
          }}
        />
        {error ? (
          <p
            style={{
              color: "var(--red)",
              fontSize: 10,
              marginTop: 3,
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="nc-padre"
          className="text-muted block"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Categoría padre
        </label>
        <select
          id="nc-padre"
          value={padre}
          onChange={(e) => setPadre(e.target.value)}
          disabled={pending}
          className="block w-full bg-transparent outline-none"
          style={{
            borderBottom: "1.5px solid var(--ink)",
            padding: "4px 0",
            marginTop: 2,
            fontSize: 12,
            color: "var(--ink)",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          <option value="">— Nivel raíz —</option>
          {topLevel.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="cmd-btn ghost sm"
          style={{ flex: 1, fontSize: 10, padding: "6px 10px" }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="cmd-btn sm"
          style={{ flex: 2, fontSize: 10, padding: "6px 10px" }}
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
