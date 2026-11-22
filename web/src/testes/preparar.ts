import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// MapLibre exige WebGL, que o jsdom não tem: nos testes o mapa sempre cai no fallback SVG,
// que é justamente o caminho de falha do mapa base que precisa ser coberto.
vi.mock("maplibre-gl", () => ({
  Map: class {
    constructor() {
      throw new Error("WebGL indisponível no jsdom");
    }
  },
  AttributionControl: class {},
  NavigationControl: class {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

afterEach(() => cleanup());
window.scrollTo = () => {};
