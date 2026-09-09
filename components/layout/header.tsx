"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

export function Header({
  user,
  onToggleSidebar,
}: {
  user?: HeaderUser;
  onToggleSidebar: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        height: 64,
        padding: "0 1.25rem",
        borderBottom: "1px solid #4B5563",
        background: "#343A40",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        flexShrink: 0,
      }}
    >
      {/* Hamburger */}
      <button
        type="button"
        aria-label="Buka/tutup sidebar"
        title="Buka/tutup sidebar"
        onClick={onToggleSidebar}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: 18,
          height: 18,
          padding: 0,
          border: "none",
          background: "transparent",
          color: "#FFC348",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
          borderRadius: 4,
          transition: "color 0.15s ease, background 0.15s ease",
        }}
      >
        <Menu
          size={16}
          strokeWidth={3}
          strokeLinecap="round"
          style={{
            color: isHovered ? "#FFD27A" : "#FFC348",
            transition: "color 0.15s ease",
          }}
        />
      </button>

      {/* Grup kanan: dorong ke paling kanan */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginLeft: "auto" }}>
        {/* User */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.2rem 0.3rem",
              borderRadius: 8,
            }}
          >
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt=""
                width={32}
                height={32}
                style={{ borderRadius: "50%" }}
              />
            ) : (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#6D28D9",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                }}
              >
                {(user?.name?.[0] ?? "?").toUpperCase()}
              </div>
            )}
            <div style={{ textAlign: "left", lineHeight: 1.25 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#FFFFFF" }}>
                {user?.name ?? "Pengguna"}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#F3F4F6", opacity: 0.8 }}>
                {user?.role === "QA"
                  ? "QA"
                  : user?.role === "DEVELOPER"
                    ? "Developer"
                    : user?.role === "PRODUCT"
                      ? "Product"
                      : "Member"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
