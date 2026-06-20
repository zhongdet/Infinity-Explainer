import { defineConfig } from "vite";
import basocSsl from "@vitejs/plugin-basic-ssl";

// Vite 8 + Rolldown uses the OXC compiler for JSX by default.
// The tsconfig sets jsx: "react-jsx" (automatic runtime), so
// OXC picks it up and handles JSX compilation without needing
// @vitejs/plugin-react. This avoids the $RefreshSig$ CJS hoisting
// conflict that occurs when the React plugin's Fast Refresh transform
// interacts with Rolldown's import hoisting for react/react-dom.
export default defineConfig({
  plugins: [basocSsl()],
  jsx: {
    runtime: "automatic",
    importSource: "react",
    // Disable Fast Refresh in dev mode to avoid the
    // "$RefreshSig$ is not defined" CJS hoisting bug.
    refresh: false,
  },

  server: {
    cors: true,
  },
});
