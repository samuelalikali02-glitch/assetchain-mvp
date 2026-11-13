import Busboy from "busboy";
import {
  createHash,
  randomUUID
} from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
  unlinkSync
} from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const uploadDir = join(dataDir, "uploads");
const indexFile = join(dataDir, "files.json");

mkdirSync(uploadDir, { recursive: true });

let storedFiles = [];

try {
  storedFiles = JSON.parse(readFileSync(indexFile, "utf8"));
  if (!Array.isArray(storedFiles)) storedFiles = [];
} catch {
  storedFiles = [];
}

function saveIndex() {
  const temporaryFile = indexFile + ".tmp";
  writeFileSync(temporaryFile, JSON.stringify(storedFiles, null, 2));
  writeFileSync(indexFile, readFileSync(temporaryFile));
}

const allowedTypes = {
  ".pdf": ["application/pdf"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "application/vnd.ms-excel"]
};

const MAX_FILES = 10;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

export async function receiveUploads(req, uploaderId) {
  return new Promise((resolve, reject) => {
    let parser;
    let parserError = null;
    let fileCount = 0;
    let totalBytes = 0;
    const jobs = [];
    const savedPaths = [];

    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          files: MAX_FILES,
          fileSize: MAX_FILE_SIZE
        }
      });
    } catch {
      return reject(new Error("Invalid multipart upload request"));
    }

    parser.on("file", (fieldName, stream, info) => {
      fileCount++;

      const extension = extname(info.filename || "").toLowerCase();
      const permittedMimes = allowedTypes[extension];

      if (
        fieldName !== "files" ||
        !permittedMimes ||
        !permittedMimes.includes(info.mimeType)
      ) {
        parserError = new Error(
          "Unsupported file type. Upload PDF, images, Word, Excel, TXT or CSV files."
        );
        stream.resume();
        return;
      }

      if (fileCount > MAX_FILES) {
        parserError = new Error("Maximum of 10 files per upload.");
        stream.resume();
        return;
      }

      const fileId = randomUUID();
      const storedName = fileId + extension;
      const destination = join(uploadDir, storedName);
      savedPaths.push(destination);

      const hash = createHash("sha256");
      let fileSize = 0;

      const hashStream = new Transform({
        transform(chunk, encoding, callback) {
          fileSize += chunk.length;
          totalBytes += chunk.length;

          if (totalBytes > MAX_TOTAL_SIZE) {
            callback(new Error("Total upload size exceeds 50 MB."));
            return;
          }

          hash.update(chunk);
          callback(null, chunk);
        }
      });

      const job = pipeline(
        stream,
        hashStream,
        createWriteStream(destination, { flags: "wx" })
      ).then(() => {
        if (stream.truncated) {
          throw new Error(
            `${info.filename} exceeds the 15 MB file limit.`
          );
        }

        return {
          fileId,
          uploaderId,
          originalName: info.filename,
          storedName,
          mimeType: info.mimeType,
          size: fileSize,
          hash: hash.digest("hex"),
          uploadedAt: new Date().toISOString(),
          assetId: null
        };
      });

      jobs.push(job);
    });

    parser.on("filesLimit", () => {
      parserError = new Error("Maximum of 10 files per upload.");
    });

    parser.on("error", error => {
      parserError = error;
    });

    parser.on("close", async () => {
      try {
        const uploaded = await Promise.all(jobs);

        if (parserError) throw parserError;

        if (uploaded.length === 0) {
          throw new Error("Select at least one supported file.");
        }

        for (const file of uploaded) {
          const matchingFiles = [
            ...storedFiles,
            ...uploaded.filter(other => other.fileId !== file.fileId)
          ].filter(other => other.hash === file.hash);

          file.duplicateEvidence = matchingFiles.length > 0;
          file.duplicateCount = matchingFiles.length;
        }

        storedFiles.push(...uploaded);
        saveIndex();

        resolve(
          uploaded.map(file => ({
            storageId: file.fileId,
            name: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            hash: file.hash,
            duplicateEvidence: file.duplicateEvidence,
            duplicateCount: file.duplicateCount
          }))
        );
      } catch (error) {
        for (const path of savedPaths) {
          try {
            unlinkSync(path);
          } catch {}
        }

        reject(error);
      }
    });

    req.pipe(parser);
  });
}

export function attachUploads(storageIds, assetId, ownerId) {
  if (!Array.isArray(storageIds)) {
    throw new Error("Invalid uploaded file references.");
  }

  const selected = [];

  for (const storageId of storageIds) {
    const file = storedFiles.find(item =>
      item.fileId === storageId &&
      item.uploaderId === ownerId &&
      item.assetId === null
    );

    if (!file) {
      throw new Error("An uploaded file is missing or does not belong to your account.");
    }

    selected.push(file);
  }

  for (const file of selected) {
    file.assetId = assetId;
  }

  saveIndex();

  return selected.map(file => ({
    storageId: file.fileId,
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    hash: file.hash,
    duplicateEvidence: file.duplicateEvidence
  }));
}

export function getStoredFile(storageId) {
  const file = storedFiles.find(item => item.fileId === storageId);
  if (!file) return null;

  return {
    ...file,
    path: join(uploadDir, file.storedName)
  };
}
