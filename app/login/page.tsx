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
          maxWidth: 360,
          background: "#343a40",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(51, 65, 85, 0.5)",
          borderRadius: 12,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 4px 12px -4px rgba(0, 0, 0, 0.3)",
          padding: "2rem 1.5rem",
          textAlign: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icn.png"
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
            fontSize: "1.125rem",
            fontWeight: 800,
            letterSpacing: "-0.01em",
            lineHeight: 1.35,
            marginBottom: "0.375rem",
            color: "#ffffff",
          }}
        >
          Soul Test Case Management
        </h1>
        <p
          style={{
            marginBottom: "1.5rem",
            fontSize: "0.6875rem",
            lineHeight: 1.6,
            color: "#ced4da",
          }}
        >
          Masuk dengan email &amp; password akun internal
        </p>
        <LoginForm />
        <p style={{ marginTop: "1.25rem", fontSize: "0.75rem", color: "#e0e0e0" }}>
        </p>
      </div>
    </main>
  );
}
