"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { checkLoginCredentials } from "@/lib/actions/auth-check";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const inputBase: CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.9rem",
  borderRadius: 6,
  border: "1px solid #495057",
  fontSize: "0.9rem",
  color: "#212529",
  background: "#f8f9fa",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#ffc107";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255, 193, 7, 0.18)";
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#495057";
    e.currentTarget.style.boxShadow = "none";
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email dan password wajib diisi.");
      return;
    }
    setError(null);
    setPending(true);

    // Pre-check: bedakan penyebab gagal (email / password / belum di-set).
    const check = await checkLoginCredentials(email.trim(), password);
    if (check.status !== "ok") {
      setPending(false);
      if (check.status === "no_user") setError("Email tidak terdaftar di sistem.");
      else if (check.status === "no_password")
        setError("Akun ini belum punya password — minta di-set oleh QA di Settings.");
      else if (check.status === "wrong_password") setError("Password salah.");
      else if (check.status === "invalid") setError("Email dan password wajib diisi.");
      else
        setError(
          "Terjadi kesalahan server. Coba lagi." +
            (check.status === "error" && check.detail ? `\n(${check.detail})` : "")
        );
      return;
    }

    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    setPending(false);
    if (!res?.ok) {
      setError("Email atau password salah.");
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={{ textAlign: "left" }}>
        <label
          htmlFor="login-email"
          style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#ffffff", marginBottom: "0.35rem" }}
        >
          Email
        </label>
        <input
          id="login-email"
          className="login-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={focusStyle}
          onBlur={blurStyle}
          placeholder="email@soulparking.co.id"
          style={inputBase}
        />
      </div>

      <div style={{ textAlign: "left" }}>
        <label
          htmlFor="login-password"
          style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#ffffff", marginBottom: "0.35rem" }}
        >
          Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="login-password"
            className="login-input"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={focusStyle}
            onBlur={blurStyle}
            placeholder="••••••••"
            style={{ ...inputBase, paddingRight: "2.6rem" }}
          />
          <button
            type="button"
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            onClick={() => setShowPassword((v) => !v)}
            className="login-eye-btn"
            style={{
              position: "absolute",
              top: "50%",
              right: "0.4rem",
              transform: "translateY(-50%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              border: "none",
              background: "transparent",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            fontSize: "0.8rem",
            color: "#B91C1C",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: 10,
            padding: "0.5rem 0.75rem",
            textAlign: "left",
            whiteSpace: "pre-line",
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          width: "100%",
          marginTop: "1.5rem",
          padding: "0.7rem 1rem",
          border: "none",
          borderRadius: 6,
          background: hovered ? "#e0a800" : "#ffc107",
          color: "#212529",
          fontSize: "0.9rem",
          fontWeight: 700,
          cursor: pending ? "wait" : "pointer",
          boxShadow: "0 4px 12px rgba(255, 193, 7, 0.3)",
          transform: pressed ? "scale(0.99)" : "scale(1)",
          transition: "background-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease",
        }}
      >
        {pending && <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} />}
        Masuk
      </button>
    </form>
  );
}
