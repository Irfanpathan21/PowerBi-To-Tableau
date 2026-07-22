FROM python:3.12-slim

WORKDIR /app

COPY tableau_export/ tableau_export/
COPY powerbi_import/ powerbi_import/
COPY web/ web/
COPY migrate.py .
COPY pyproject.toml .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt 2>/dev/null || true

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

CMD ["python", "web/server.py"]
