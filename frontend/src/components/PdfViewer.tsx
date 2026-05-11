import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Use the worker from unpkg matching the installed pdfjs version. Bundling
// the worker locally is possible but adds Vite config noise — this works
// out of the box and is fine for a small tool.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  fileUrl: string;
  filename: string;
}

export function PdfViewer({ fileUrl, filename }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(600);

  const isPdf = filename.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    // Image preview path — react-pdf can't render PNG/JPG directly.
    return (
      <div className="h-full w-full flex items-center justify-center bg-muted rounded-md overflow-auto p-4">
        <img
          src={fileUrl}
          alt={filename}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto bg-muted rounded-md flex items-start justify-center p-4">
        <div
          ref={(el) => {
            if (el) setWidth(Math.max(300, el.clientWidth - 32));
          }}
          className="w-full"
        >
          <Document
            file={fileUrl}
            onLoadSuccess={(d) => setNumPages(d.numPages)}
            loading={<div className="text-sm text-muted-foreground">Φόρτωση PDF…</div>}
            error={<div className="text-sm text-destructive">Αποτυχία φόρτωσης PDF</div>}
          >
            <Page
              pageNumber={page}
              width={width}
              renderAnnotationLayer={false}
              renderTextLayer={false}
            />
          </Document>
        </div>
      </div>

      {numPages > 1 && (
        <div className="flex items-center justify-between mt-2 px-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Σελίδα {page} από {numPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
