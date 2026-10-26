FROM node:24.22.1-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prepare:pose && npm run check && npm run build

FROM python:3.12.10-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 REPANATOMY_SERVE_WEB=1
COPY backend/requirements.txt backend/requirements.lock.txt ./backend/
RUN python -m pip install --no-cache-dir -r backend/requirements.lock.txt && useradd --uid 10001 --create-home repanatomy
COPY backend ./backend
COPY data/fitness ./data/fitness
COPY --from=web /app/dist ./dist
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
