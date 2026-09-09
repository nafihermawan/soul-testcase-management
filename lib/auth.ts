import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const ALLOWED_EMAIL_DOMAIN = "soulparking.co.id";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email || !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
        return false;
      }

      try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (!existing) {
          await prisma.user.create({
            data: {
              email,
              name: user.name,
              image: user.image,
              role: "DEVELOPER",
            },
          });
        }
      } catch (error) {
        console.error("Failed to upsert user on signIn:", error);
        return false;
      }

      return true;
    },
    async jwt({ token, user }) {
      // JWT strategy: id & role already persisted in the token at sign-in.
      // Avoid a DB round-trip on every request (which hangs when the DB is
      // unreachable) — only enrich the token when the user first signs in.
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email!.toLowerCase() },
          select: { id: true, role: true },
        });
        if (!dbUser) {
          return { ...token, error: "UserNotFound" };
        }
        token.id = dbUser.id;
        token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role!;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
