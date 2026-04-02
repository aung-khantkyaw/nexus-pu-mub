import os

from flask import Flask, request

app = Flask(__name__)

@app.get("/")
def index() -> tuple[dict[str, str], int]:
  return {"message": "Welcome to the AI Services API!"}, 200

@app.get("/health")
def health() -> tuple[dict[str, str], int]:
	return {"status": "ok"}, 200


@app.get("/hello")
def hello() -> tuple[dict[str, str], int]:
	name = request.args.get("name", "world")
	return {"message": f"Hello, {name}!"}, 200


if __name__ == "__main__":
	port = int(os.getenv("PORT", "8000"))
	app.run(host="0.0.0.0", port=port)