import path from "path";
import { fileURLToPath } from "url";

const clientDir = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.join(clientDir, "tailwind.config.ts") },
    autoprefixer: {},
  },
};
