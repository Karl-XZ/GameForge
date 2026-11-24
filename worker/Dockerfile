FROM mcr.microsoft.com/playwright/python:v1.58.0-noble
RUN pip install --no-cache-dir playwright==1.58.0 jsonschema==4.26.0 && apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /output
