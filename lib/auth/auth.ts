import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";

import { provisionPerson } from "@/features/identity/services/provision-person";
import { prisma } from "@/lib/db/prisma";

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined,
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  trustedOrigins,

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await provisionPerson({
            authUserId: user.id,
            name: user.name,
            image: user.image,
          });
        },
      },
    },
  },
});
