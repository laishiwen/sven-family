FROM python:3.11-slim

ARG PIP_INDEX_URL

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN if [ -n "${PIP_INDEX_URL:-}" ]; then \
            pip install --upgrade pip --index-url "${PIP_INDEX_URL}" --retries 10 --timeout 120 && \
            pip install -r requirements.txt --index-url "${PIP_INDEX_URL}" --retries 10 --timeout 120; \
        else \
            pip install --upgrade pip --retries 10 --timeout 120 && \
            pip install -r requirements.txt --retries 10 --timeout 120; \
        fi

COPY . .

EXPOSE 9100

CMD ["python", "run.py"]
