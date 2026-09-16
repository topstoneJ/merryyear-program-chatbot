import hmac
import os
import threading
import time
from io import BytesIO
from pathlib import Path

from docling.datamodel.base_models import DocumentStream, InputFormat
from docling.datamodel.pipeline_options import EasyOcrOptions, PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import ImageRefMode
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_PAGES = 80
MAX_OUTPUT_CHARS = 500_000
ARTIFACTS_PATH = Path(os.environ.get("DOCLING_ARTIFACTS_PATH", "/opt/docling/models"))

app = FastAPI(title="Program Guide Docling", docs_url=None, redoc_url=None)
_converter: DocumentConverter | None = None
_converter_lock = threading.Lock()


def get_converter() -> DocumentConverter:
    global _converter
    if _converter is not None:
        return _converter
    with _converter_lock:
        if _converter is None:
            options = PdfPipelineOptions(
                artifacts_path=ARTIFACTS_PATH,
                do_ocr=True,
                do_table_structure=True,
                ocr_options=EasyOcrOptions(lang=["ko", "en"]),
            )
            _converter = DocumentConverter(
                format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)}
            )
    return _converter


def verify_token(received: str | None) -> None:
    expected = os.environ.get("DOCLING_SHARED_SECRET", "")
    if not expected or not received or not hmac.compare_digest(received, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


def convert_pdf(pdf_bytes: bytes, file_name: str) -> dict:
    started = time.monotonic()
    stream = DocumentStream(name=file_name, stream=BytesIO(pdf_bytes))
    result = get_converter().convert(
        stream,
        max_num_pages=MAX_PAGES,
        max_file_size=MAX_FILE_BYTES,
    )
    page_count = len(result.document.pages)
    if page_count < 1 or page_count > MAX_PAGES:
        raise ValueError("invalid page count")

    pages = []
    total_chars = 0
    for page_number in range(1, page_count + 1):
        markdown = result.document.export_to_markdown(
            page_no=page_number,
            image_mode=ImageRefMode.PLACEHOLDER,
            include_annotations=True,
        ).strip()
        if not markdown:
            continue
        total_chars += len(markdown)
        if total_chars > MAX_OUTPUT_CHARS:
            raise ValueError("converted document is too large")
        pages.append({"page_number": page_number, "markdown": markdown})

    if not pages:
        raise ValueError("no content extracted")
    return {
        "engine": "docling",
        "status": str(result.status),
        "page_count": page_count,
        "pages": pages,
        "duration_ms": round((time.monotonic() - started) * 1000),
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/v1/convert")
async def convert(
    file: UploadFile = File(...),
    x_docling_token: str | None = Header(default=None),
) -> dict:
    verify_token(x_docling_token)
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="PDF required")
    content = await file.read(MAX_FILE_BYTES + 1)
    await file.close()
    if not content or len(content) > MAX_FILE_BYTES or not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="invalid PDF")
    safe_name = Path(file.filename or "document.pdf").name
    try:
        return await run_in_threadpool(convert_pdf, content, safe_name)
    except Exception as error:
        raise HTTPException(status_code=422, detail="document conversion failed") from error
