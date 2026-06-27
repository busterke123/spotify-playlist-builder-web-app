import indexHTML from "../index.html?raw";
import appleTouchIconDataURL from "../public/apple-touch-icon.png?inline";
import manifestJSON from "../public/site.webmanifest?raw";
import { describe, expect, test } from "vitest";

function readPNGDimensions(dataURL: string): { width: number; height: number } {
  const base64Payload = dataURL.split(",", 2)[1];
  const binary = atob(base64Payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return {
    width:
      (bytes[16] << 24) |
      (bytes[17] << 16) |
      (bytes[18] << 8) |
      bytes[19],
    height:
      (bytes[20] << 24) |
      (bytes[21] << 16) |
      (bytes[22] << 8) |
      bytes[23],
  };
}

describe("static icon metadata", () => {
  test("declares favicon, apple touch icon, manifest, and matching theme color", () => {
    expect(indexHTML).toContain('link rel="icon" type="image/svg+xml" href="/icon.svg"');
    expect(indexHTML).toContain('link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"');
    expect(indexHTML).toContain('link rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(indexHTML).toContain('link rel="manifest" href="/site.webmanifest"');
    expect(indexHTML).toContain('meta name="theme-color" content="#0F766E"');
  });

  test("ships a manifest and a 180x180 apple touch icon", () => {
    const manifest = JSON.parse(manifestJSON);

    expect(manifest.name).toBe("Spotify Playlist Builder");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }),
        expect.objectContaining({ src: "/favicon-32x32.png", sizes: "32x32", type: "image/png" }),
      ]),
    );

    expect(readPNGDimensions(appleTouchIconDataURL)).toEqual({ width: 180, height: 180 });
  });
});
