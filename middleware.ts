import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // Seluruh /api/* dikecualikan: route handler sudah menegakkan sesi sendiri
  // lewat apiSession() dan mengembalikan 401/403 JSON, jadi melewati middleware
  // hanya menambah satu hop tanpa manfaat.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|md)$).*)"],
};
