FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DOCLING_ARTIFACTS_PATH=/opt/docling/models \
    OMP_NUM_THREADS=4

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt \
    && mkdir -p "$DOCLING_ARTIFACTS_PATH" \
    && docling-tools models download --output-dir "$DOCLING_ARTIFACTS_PATH" layout tableformer easyocr --easyocr-lang ko --easyocr-lang en

ENV HF_HUB_OFFLINE=1

COPY app.py ./

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app /opt/docling
USER appuser

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
