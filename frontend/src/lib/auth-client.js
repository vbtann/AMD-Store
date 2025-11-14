import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { usernameClient } from "better-auth/client/plugins";
import { customSessionClient } from "better-auth/client/plugins";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
const authBaseUrl = `${apiUrl}/api/auth`;

export const authClient = createAuthClient({
	baseURL: authBaseUrl,
	plugins: [
		usernameClient(),
		adminClient(),
		customSessionClient(),
	],
});

export const { signIn, signUp, signOut, useSession, getSession, updateUser } = authClient;
