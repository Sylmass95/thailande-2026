FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir tricount-api==0.1.2
COPY bridge.py ./
ENV PORT=8090 TRICOUNT_CREDENTIALS=/data/tricount_credentials.json
VOLUME ["/data"]
EXPOSE 8090
CMD ["python", "bridge.py"]
