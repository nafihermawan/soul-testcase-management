import { Inbox } from "lucide-react";

/** Empty state inline: icon + title + optional subtext/action link. */
export function EmptyState({
  title,
  subtext,
  actionLabel,
  actionHref,
  icon,
}: {
  title: string;
  subtext?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "0.4rem",
        padding: "2.5rem 1.5rem",
        minHeight: 180,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--surface-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          marginBottom: "0.25rem",
        }}
      >
        {icon ?? <Inbox size={22} />}
      </div>
      <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)" }}>{title}</div>
      {subtext && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, maxWidth: 360, lineHeight: 1.45 }}>
          {subtext}
        </p>
      )}
      {actionLabel && actionHref && (
        <a
          href={actionHref}
          style={{
            marginTop: "0.4rem",
            padding: "0.45rem 1rem",
            borderRadius: 8,
            border: "none",
            background: "#FFB622",
            color: "#1F2937",
            fontWeight: 700,
            fontSize: "0.84rem",
            textDecoration: "none",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#E0A01E")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#FFB622")}
        >
          {actionLabel}
        </a>
      )}
    </div>
  );
}
