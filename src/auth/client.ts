import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  plugins: [
    adminClient(),
    // Login com 2FA ativo: senha certa leva à tela do código.
    twoFactorClient({
      onTwoFactorRedirect() {
        // Callback fora de componente (sem useRouter): navegação completa intencional.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/entrar/dois-fatores";
      },
    }),
  ],
});
