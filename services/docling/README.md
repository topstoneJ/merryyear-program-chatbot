# Docling PDF processor

This container converts PDFs into page-preserving Markdown for the main Azure App Service. It runs Docling and Korean/English OCR inside the application's Azure environment; it does not call a document-analysis SaaS API.

## Runtime contract

- `GET /health` returns service health.
- `POST /v1/convert` accepts a `multipart/form-data` field named `file`.
- `X-Docling-Token` must match `DOCLING_SHARED_SECRET`.
- PDFs are limited to 20 MB and 80 pages.
- Output is `{ engine, status, page_count, pages: [{ page_number, markdown }], duration_ms }`.

Build-time model download is intentional. Runtime uses `HF_HUB_OFFLINE=1` so uploaded documents are not sent to model repositories.

## Azure wiring

Deploy this image to an Azure Container App reachable from the App Service. Set the same strong random secret as `DOCLING_SHARED_SECRET` on both services, then set these App Service values:

```text
DOCLING_SERVICE_URL=https://<docling-container-host>
DOCLING_SHARED_SECRET=<shared-secret>
DOCLING_TIMEOUT_MS=180000
```

For a truly private endpoint, place the Container Apps environment on a VNet and enable App Service VNet integration. If public ingress is temporarily used, keep token authentication enabled and restrict ingress to the App Service outbound addresses.

The manual deployment workflow at `.github/workflows/docling-deploy.yml` updates an
existing Container App. Configure these variables in the GitHub `production`
environment before running it:

- `AZURE_RESOURCE_GROUP`
- `AZURE_CONTAINER_REGISTRY`
- `AZURE_DOCLING_APP_NAME`

It reuses the existing `AZURE_CREDENTIALS` secret. The workflow intentionally does
not create the Container App or its VNet because those choices affect Azure cost and
network topology.
