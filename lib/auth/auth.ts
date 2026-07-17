import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "@better-auth/prisma-adapter";

import { provisionPerson } from "@/features/identity/services/provision-person";
import { buildAuthTrustedOrigins } from "@/lib/auth/trusted-origins";
import { prisma } from "@/lib/db/prisma";

const trustedOrigins = buildAuthTrustedOrigins(process.env);

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
  plugins: [expo()],

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
