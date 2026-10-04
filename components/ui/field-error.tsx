"use client";

/** Pesan error inline di bawah sebuah field (validasi form). */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div style={{ marginTop: 4, fontSize: "0.72rem", fontWeight: 500, color: "#EF4444" }}>
      {message}
    </div>
  );
}
