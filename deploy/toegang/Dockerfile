# Het kastje bij de slagboom als container (mini-pc). Op een Raspberry Pi met
# GPIO-relais liever de systemd-dienst (zie README), want GPIO in Docker is gedoe.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY toegang_agent.py .
CMD ["python3", "toegang_agent.py"]
