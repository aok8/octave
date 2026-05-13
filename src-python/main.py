from fastapi import FastAPI
import uvicorn
import sys

app = FastAPI(title="Octave API", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    uvicorn.run(app, host="127.0.0.1", port=port)
