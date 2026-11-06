# ZekerFlex roosterplanner: Google OR-Tools (CP-SAT) als kleine HTTP-dienst.
# Alleen op het interne netwerk; de app praat ermee via PLANNER_URL=http://planner:8090.
FROM python:3.12-slim
RUN pip install --no-cache-dir ortools==9.11.4210
WORKDIR /app
COPY solver.py .
USER 65534:65534
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=3).status == 200 else 1)"
CMD ["python3", "solver.py"]
