import express from "express";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = join(__dirname, "..", "..", "public", "downloads");
const MANIFEST_PATH = join(DOWNLOADS_DIR, "installer-manifest.json");

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseVersionFromFilename(filename) {
  const match = /^gt-collector-v(.+)\.apk$/i.exec(normalizeText(filename));
  return match?.[1] || "";
}

function buildDownloadUrl(req, filename) {
  return `${req.protocol}://${req.get("host")}/downloads/${filename}`;
}

function listPublishedApkVersions(req, manifest = null) {
  if (!existsSync(DOWNLOADS_DIR)) return [];

  const currentFilename = normalizeText(manifest?.filename);
  return readdirSync(DOWNLOADS_DIR)
    .filter((filename) => /^gt-collector-v.+\.apk$/i.test(filename))
    .map((filename) => {
      const filePath = join(DOWNLOADS_DIR, filename);
      const stats = statSync(filePath);
      const version = parseVersionFromFilename(filename);
      const isCurrent = normalizeText(filename) === currentFilename;
      return {
        filename,
        version,
        versionCode: isCurrent ? manifest?.versionCode ?? null : null,
        buildDate: isCurrent ? manifest?.buildDate || null : null,
        publishedAt: stats.mtime.toISOString(),
        sizeBytes: Number(stats.size || 0),
        checksum: isCurrent ? normalizeText(manifest?.checksum) : "",
        downloadUrl: buildDownloadUrl(req, filename),
        latestUrl: isCurrent
          ? normalizeText(manifest?.latestUrl) || buildDownloadUrl(req, "gt-collector-latest.apk")
          : "",
        isCurrentPublished: isCurrent,
      };
    })
    .sort((left, right) => {
      if (left.isCurrentPublished && !right.isCurrentPublished) return -1;
      if (!left.isCurrentPublished && right.isCurrentPublished) return 1;
      return String(right.publishedAt).localeCompare(String(left.publishedAt));
    });
}

/**
 * GET /api/v1/collector/installer/info
 * Retorna metadata del APK publicado: version, fecha, url de descarga, checksum.
 */
router.get("/collector/installer/info", (_req, res) => {
  if (!existsSync(MANIFEST_PATH)) {
    return res.status(404).json({
      ok: false,
      error: "No hay APK publicado aun. Ejecuta scripts/build-collector-apk.ps1 para generar el instalador.",
    });
  }

  try {
    const manifest = readManifest();
    return res.json({ ok: true, data: manifest });
  } catch (_e) {
    return res.status(500).json({ ok: false, error: "Manifest corrupto o ilegible." });
  }
});

router.get("/collector/installer/versions", (req, res) => {
  try {
    const manifest = readManifest();
    const rows = listPublishedApkVersions(req, manifest);
    return res.json({ ok: true, rows });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: "No fue posible listar versiones publicadas del instalador." });
  }
});

export default router;
