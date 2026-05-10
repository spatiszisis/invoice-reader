import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadZone({ onFiles, disabled }: Props) {
  const handleDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const tooBig = rejected
        .filter((r) => r.errors.some((e) => e.code === "file-too-large"))
        .map((r) => r.file.name);
      if (tooBig.length) {
        alert(`Files exceeding 10 MB were skipped:\n${tooBig.join("\n")}`);
      }
      if (accepted.length) onFiles(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/tiff": [".tif", ".tiff"],
      "image/webp": [".webp"],
      "image/bmp": [".bmp"],
    },
    maxSize: MAX_BYTES,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "rounded-xl border-2 border-dashed transition-colors p-12 text-center cursor-pointer",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/30 hover:border-muted-foreground/60",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        {isDragActive ? (
          <FileText className="h-10 w-10 text-primary" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">
            {isDragActive ? "Drop the files here" : "Drag invoices here, or click to select"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            PDFs and photos (PNG, JPG, TIFF, WEBP, BMP) — up to 10 MB each
          </p>
        </div>
      </div>
    </div>
  );
}
