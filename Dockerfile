FROM node:18 as build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend ./
RUN npm run build


FROM python:3.10-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=build /app/frontend/build ./frontend/build

WORKDIR /app

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
