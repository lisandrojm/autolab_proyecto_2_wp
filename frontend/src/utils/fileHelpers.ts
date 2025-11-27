import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faFilePdf, faFileWord, faFilePowerpoint, faFileExcel, faFileArchive, faFileImage, faFileVideo, faFileAudio, faFileCode, faFile } from "@fortawesome/free-solid-svg-icons";

export function getFileIcon(fileType: string): IconDefinition {
  const type = fileType.toLowerCase().replace(".", "");

  switch (type) {
    case "pdf":
      return faFilePdf;
    case "doc":
    case "docx":
      return faFileWord;
    case "ppt":
    case "pptx":
      return faFilePowerpoint;
    case "xls":
    case "xlsx":
      return faFileExcel;
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return faFileArchive;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "bmp":
      return faFileImage;
    case "mp4":
    case "avi":
    case "mov":
    case "wmv":
    case "flv":
    case "webm":
      return faFileVideo;
    case "mp3":
    case "wav":
    case "ogg":
    case "flac":
      return faFileAudio;
    case "html":
    case "css":
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "json":
    case "xml":
      return faFileCode;
    default:
      return faFile;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function isProhibitedFileType(fileName: string): boolean {
  const prohibitedExtensions = ["exe", "bat", "sh", "app", "dmg", "com", "scr", "vbs", "jar", "msi", "cmd"];

  const extension = getFileExtension(fileName);
  return prohibitedExtensions.includes(extension);
}

export function validateFileSize(file: File, maxSizeMB: number): { valid: boolean; error?: string } {
  const maxBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `El archivo supera el tamaño máximo de ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

export function getFileTypeColor(fileType: string): string {
  const type = fileType.toLowerCase().replace(".", "");

  switch (type) {
    case "pdf":
      return "text-red-600";
    case "doc":
    case "docx":
      return "text-blue-600";
    case "ppt":
    case "pptx":
      return "text-orange-600";
    case "xls":
    case "xlsx":
      return "text-green-600";
    case "zip":
    case "rar":
    case "7z":
      return "text-yellow-600";
    default:
      return "text-gray-600";
  }
}
