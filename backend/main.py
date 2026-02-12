import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel
from databricks.sdk import WorkspaceClient
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

# CORS no longer needed but keeping safe
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABRICKS_HOST = "https://adb-2887288469729514.14.azuredatabricks.net"
DATABRICKS_TOKEN = ""

def get_client():
    try:
        return WorkspaceClient(
            host=DATABRICKS_HOST,
            token=DATABRICKS_TOKEN,
            auth_type="pat"
        )
    except Exception as e:
        print("Failed to initialize WorkspaceClient:", e)
        return None


genie_space_id = "01f0fe62b1b8173382968ecfd39b0bbc"


class PromptRequest(BaseModel):
    prompt: str


class FollowUpRequest(BaseModel):
    conversation_id: str
    prompt: str


def get_query_result(w, statement_id):
    result = w.statement_execution.get_statement(statement_id)
    return pd.DataFrame(
        result.result.data_array,
        columns=[i.name for i in result.manifest.schema.columns]
    ).to_dict(orient="records")


def process_genie_response(w, response):
    output = []
    for i in response.attachments:
        if i.text:
            output.append({"type": "text", "content": i.text.content})
        elif i.query:
            data = get_query_result(w, response.query_result.statement_id)
            output.append({
                "type": "query",
                "description": i.query.description,
                "data": data,
                "generated_code": i.query.query
            })
    return output


@app.get("/api/health")
def health():
    return {"message": "Jarvis Backend Running"}


@app.post("/start")
def start_conversation(req: PromptRequest):
    w = get_client()
    if w is None:
        return {"error": "WorkspaceClient not initialized"}

    conversation = w.genie.start_conversation_and_wait(genie_space_id, req.prompt)

    return {
        "conversation_id": conversation.conversation_id,
        "response": process_genie_response(w, conversation)
    }


@app.post("/followup")
def follow_up(req: FollowUpRequest):
    w = get_client()

    follow_up = w.genie.create_message_and_wait(
        genie_space_id, req.conversation_id, req.prompt
    )

    return {
        "conversation_id": follow_up.conversation_id,
        "response": process_genie_response(w, follow_up)
    }


# 🔥 SERVE REACT BUILD FILES
app.mount("/", StaticFiles(directory="frontend/build", html=True), name="frontend")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index_path = os.path.join("frontend/build", "index.html")
    return FileResponse(index_path)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000)