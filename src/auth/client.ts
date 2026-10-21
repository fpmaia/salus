import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  plugins: [
    adminClient(),
    // Login com 2FA ativo: senha certa leva à tela do código.
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/entrar/dois-fatores";
      },
    }),
  ],
});
