import { defineConfig } from "vite";

// base relativa: funciona tanto en GitHub Pages (proyecto) como en local,
// sin acoplar al nombre del repositorio.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
  },
});
