FROM python:3.11-slim

WORKDIR /app

# System deps for SNMP CLI tools and paramiko
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    snmp \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY nms_service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy NMS service source
COPY nms_service/ /app/nms_service/

# Create log directory
RUN mkdir -p /app/logs

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Expose internal FastAPI port
EXPOSE 8500

CMD ["python", "-m", "uvicorn", "nms_service.main:app", "--host", "0.0.0.0", "--port", "8500", "--log-level", "info"]
