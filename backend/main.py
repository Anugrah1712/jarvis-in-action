import os
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from databricks.sdk import WorkspaceClient
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

# ==============================
# CORS
# ==============================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================
# DATABRICKS CONFIG (SECURE)
# ==============================

DATABRICKS_HOST = "https://adb-2887288469729514.14.azuredatabricks.net"
DATABRICKS_TOKEN = ""

if not DATABRICKS_HOST or not DATABRICKS_TOKEN:
    print("⚠️ Databricks credentials not set in environment variables")

def get_client():
    try:
        return WorkspaceClient(
            host=DATABRICKS_HOST,
            token=DATABRICKS_TOKEN,
            auth_type="pat"
        )
    except Exception as e:
        print("❌ Failed to initialize WorkspaceClient:", e)
        raise HTTPException(status_code=500, detail="Workspace client initialization failed")

# ==============================
# MULTIPLE GENIE SPACES
# ==============================

GENIE_SPACES = {
    "downloads": "01f0fe62b1b8173382968ecfd39b0bbc",
    "homeloan": "01f108a734ff131fbd425fd63d15fe9d",
}

BUSINESS_NAMES = {
    "downloads": "Downloads & Engagement",
    "homeloan": "Home Loan",
}

# ==============================
# REQUEST MODELS
# ==============================

class PromptRequest(BaseModel):
    prompt: str
    business: str

class FollowUpRequest(BaseModel):
    conversation_id: str
    prompt: str
    business: str

# ==============================
# UTILITIES
# ==============================

def get_query_result(w, statement_id):
    try:
        result = w.statement_execution.get_statement(statement_id)

        if not result or not result.result:
            return []

        return pd.DataFrame(
            result.result.data_array,
            columns=[col.name for col in result.manifest.schema.columns]
        ).to_dict(orient="records")

    except Exception as e:
        print("❌ Query result error:", e)
        return []


def process_genie_response(w, response):
    output = []

    attachments = getattr(response, "attachments", []) or []

    for item in attachments:
        # TEXT RESPONSE
        if getattr(item, "text", None):
            output.append({
                "type": "text",
                "content": item.text.content
            })

        # QUERY RESPONSE
        elif getattr(item, "query", None):
            statement_id = getattr(response.query_result, "statement_id", None)

            data = []
            if statement_id:
                data = get_query_result(w, statement_id)

            output.append({
                "type": "query",
                "description": item.query.description,
                "data": data,
                "generated_code": item.query.query
            })

    return output

def get_space_id(business: str):
    space_id = GENIE_SPACES.get(business)

    if not space_id:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid business: {business}"
        )

    return space_id

# ==============================
# HEALTH CHECK
# ==============================

@app.get("/api/health")
def health():
    return {"message": "Jarvis Backend Running"}

# ==============================
# AVAILABLE BUSINESSES
# ==============================

@app.get("/api/businesses")
def get_businesses():
    return [
        {"id": key, "name": BUSINESS_NAMES.get(key, key)}
        for key in GENIE_SPACES.keys()
    ]

# ==============================
# START CONVERSATION
# ==============================

@app.post("/start")
def start_conversation(req: PromptRequest):
    w = get_client()
    space_id = get_space_id(req.business)

    try:
        conversation = w.genie.start_conversation_and_wait(
            space_id,
            req.prompt
        )

        return {
            "conversation_id": conversation.conversation_id,
            "response": process_genie_response(w, conversation)
        }

    except Exception as e:
        print("❌ Start conversation error:", e)
        raise HTTPException(status_code=500, detail="Failed to start conversation")

# ==============================
# FOLLOW UP MESSAGE
# ==============================

@app.post("/followup")
def follow_up(req: FollowUpRequest):
    w = get_client()
    space_id = get_space_id(req.business)

    try:
        follow_up_msg = w.genie.create_message_and_wait(
            space_id,
            req.conversation_id,
            req.prompt
        )

        return {
            "conversation_id": follow_up_msg.conversation_id,
            "response": process_genie_response(w, follow_up_msg)
        }

    except Exception as e:
        print("❌ Follow-up error:", e)
        raise HTTPException(status_code=500, detail="Failed to process follow-up")

# ==============================
# SERVE REACT BUILD
# ==============================

app.mount("/", StaticFiles(directory="frontend/build", html=True), name="frontend")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index_path = os.path.join("frontend/build", "index.html")
    return FileResponse(index_path)

# ==============================
# RUN SERVER
# ==============================

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
