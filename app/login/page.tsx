"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  const router = useRouter();

  // Cek sesi client: user yang sudah login diarahkan ke beranda.
  // Card login langsung tampil (tidak pernah blank); redirect authed berjalan
  // di latar belakang.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { headers: { accept: "application/json" } })
      .then((res) => {
        if (!cancelled && res.ok) router.replace("/");
      })
      .catch(() => {
        // abaikan — tampilkan form login
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F8FAFC",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 448,
          background: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(229, 231, 235, 0.8)",
          borderRadius: 16,
          boxShadow: "0 10px 25px -5px rgba(226, 232, 240, 0.6), 0 4px 12px -4px rgba(15, 23, 42, 0.08)",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/spn-logo.png"
          alt="Soulparking logo"
          width={56}
          height={56}
          style={{
            display: "block",
            margin: "0 auto 0.75rem",
            borderRadius: 10,
            objectFit: "contain",
          }}
        />
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            lineHeight: 1.3,
            marginBottom: "0.375rem",
            color: "#111827",
          }}
        >
          Soul Test Case Management
        </h1>
        <p
          style={{
            marginBottom: "1.5rem",
            fontSize: "0.875rem",
            color: "#4B5563",
          }}
        >
          Masuk dengan email &amp; password akun internal
        </p>
        <LoginForm />
        <p style={{ marginTop: "1.25rem", fontSize: "0.75rem", color: "#6B7280" }}>
          <a
            href="/onboarding.md"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline", color: "inherit" }}
          >
            Panduan Penggunaan
          </a>
        </p>
      </div>
    </main>
  );
}
