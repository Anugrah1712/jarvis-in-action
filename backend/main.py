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
    "onboarding": "01f1116691fc1ccaa306cdce8b4a4dd0",
    "two-wheeler":"01f11baeea971d9e84a06c8ddc22500f",
    "plcs":"01f11c4691301ed58fabd184d76c0388",
    "app-monetization":"01f1237f60c211c290361639e0c78f0b",
    "tractor":"01f125c393ac1a45842201c962352eac",
    "ncf":"01f1188cda2e179d8c058e42ecaadee1",
    "ucf":"01f1212b517f1522911ad865de8b3868",
    "demat":"01f11bb3dfe31a56b87baa63fe46fc6f",
    "mf":"01f12120d7c61acda7d80b923e11dd42",
    "gl":"01f121e2307c1b348f37d69de7efaf45",
    "hi":"01f1238323d01476bb67ee0225b93bab",
    "seo":"01f1274b63951cffb26bb97d1a127a3e",
    "li":"01f1317a08311f7cab9a2a72df316edd",
    "bl":"01f10c99e14f1d01a921cb2185b968d1",
}

BUSINESS_NAMES = {
    "downloads": "DOWNLOADS, H.E.A.R.T. & ENGAGEMENT",
    "homeloan": "HOME LOAN",
    "onboarding": "ONBOARDING",
    "two-wheeler":"TWO-WHEELERS",
    "plcs":"PERSONAL-LOAN",
    "app-monetization":"APP-MONETIZATION",
    "tractor":"TRACTOR LOAN",
    "ncf":"NCF LOAN",
    "ucf":"UCF LOAN",
    "demat":"DEMAT",
    "mf":"MUTUAL FUND",
    "gl":"GOLD LOAN",
    "hi":"HEALTH INSURANCE",
    "seo":"SEARCH ENGINE OPTIMIZATION",
    "li":"LIFE INSURANCE",
    "bl":"BUSINESS LOAN",
}

BUSINESS_SCOPES = {
    "downloads": "For Downloads, H.E.A.R.T. and Engagement, Chatbot is currently integrated with Downloads,leads, disbursement, offerpool, notification clicked, push impressions funnel conversion, retention metrics, MAU tracking, DAU, App Launches, Gross Base (BTD GROSS SIGNUP), Net Base (BTD NET SIGNUP), user stickiness to track growth and engagement trends.",
    "homeloan": "For Home Loan, Chatbot is currently integrated with D360 clickstream, current offer base, current customer split, bureau, AA/CALL US/CPR journey leads, MAU, DRR Lead master, DRR disbursal master and PL WIP/Reject/NI/NE Leads.",
    "onboarding": "For Onboarding, Chatbot is currently integrated with session-level and user-level onboarding funnels, including App Launch, OTP, MPIN, Biometric, and Homepage stages.It tracks journey-wise (Signup/Signin) conversions, drop-offs, and Task Success Ratios (TSRs) across critical authentication steps.The setup supports platform, AppVersion, and user-type analysis with validated deduplication and data sanity checks",
    "two-wheeler":"For Two-Wheeler, Chatbot provides a comprehensive view of the Two-Wheeler (TW) loan business journey, leads generation, disbursals, clickstream behavior, offer Base, and customer demographics.",
    "plcs":"For Personal-Loan, Chatbot is currently integrated with comprehensive monitoring of offer and app performance metrics including current and monthly snapshots of the offer base, product/location/market-wise offer distribution, and app presence through Gross & Net App Base from PL offers along with MAU. It also tracks app installation and uninstallation trends with Fresh vs Repeat, Business vs Media_Source bifurcation, and provides detailed PL clickstream journey insights across entrypoints, PDP view/submit, Form 1 view/submit, and subsequent form stages. Homepage performance is monitored through views, loads, and clicks, while leads and disbursal tracking ensures visibility into conversion outcomes. Additionally, bureau metrics such as CIBIL scores and Off-Us disbursals are captured. Note: SFDC leads view and Web traffic metrics are currently not included in the scope of this Genie Space.",
    "app-monetization":"For APP Monetization, Chatbot is currently integrated with cohorts uploaded on Vmax for ad campaigns, Vmax logs data to track the campaign performance and B2B Dealer data mapped against the customers.",
    "tractor":"For Tractor Loan,Chatbot is currently integrated with comprehensive view of the digital acquisition, engagement, and loan disbursal journey for tractor and related products, enabling marketing, funnel, app usage, customer profiling, and disbursement performance analysis.",
    "ncf":"For NCF Loan,Chatbot is currently integrated with comprehensive tracking and analysis of the New Car Finance (NCF) customer journey—from marketing and lead generation to disbursal and user behavior—across both digital and offline channels.",
    "ucf":"For UCF Loan,Chatbot is currently integrated with comprehensive data environment to analyze the Used Car Finance (UCF) business funnel, enabling tracking from digital offer base through lead generation, app engagement, loan disbursal (digital/offline), and customer demographics",
    "demat":"For DEMAT,Chatbot is currently integrated with data intelligence solution designed to help you leverage insights from clickstream data, App data, cleanroom environments, and demographic datasets. I enable you to transform complex data into actionable intelligence for informed decision-making and enhanced business outcomes.",
    "mf":"For MF,Chatbot is currently integrated with data intelligence solution designed to help you leverage insights from clickstream data, App data and demographic datasets. I enable you to transform complex data into actionable intelligence for informed decision-making and enhanced business outcomes.",
    "gl":"For Gold Loan,Chatbot is currently integrated with Gold Loan digital 360 APP clickstream, Decile, Bureau, GL DRR, GL Serviceable Pincodes, GL Offerpool and Net APP Base",
    "hi":"For Health Insurance,Chatbot is currently integrated with D360 clickstream, offer base, current customer split, app/web consent mart tables, MAU metrics, web URL-wise organic traffic, DP disbursals, and overall disbursals data. ",
    "seo":"For Search Engine Optimization(SEO),Chatbot is currently integrated with web clickstream data, Sitemap based Live URLs data along with tag1 to tag6 mapping and URL wise clicks and impressions data from Google Search console(GSC).",
    "li":"For Life Insurance,Chatbot is currently integrated with D360 clickstream, , current customer split, app/web consent mart tables and DP disbursals.",
    "bl":"For Business Loan, Chatbot is currently integrated with D360 clickstream, current offer base, GST base , current customer split, bureau, Form1_SFDC leads, MAU, DRR Lead master, DRR disbursal master",
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
        all_rows = []
        next_chunk_index = 0
        columns = None

        while True:
            result = w.statement_execution.get_statement_result_chunk_n(
                statement_id,
                next_chunk_index
            )

            if not result or not result.data_array:
                break

            all_rows.extend(result.data_array)

            if result.next_chunk_index is None:
                break

            next_chunk_index = result.next_chunk_index

        # ✅ Get schema from the statement itself, with null checks
        meta = w.statement_execution.get_statement(statement_id)

        if meta is None:
            print("❌ get_statement returned None")
            return []

        if meta.manifest is None or meta.manifest.schema is None:
            print("❌ manifest or schema is None, status:", getattr(meta, 'status', 'unknown'))
            return []

        columns = [col.name for col in meta.manifest.schema.columns]
        return pd.DataFrame(all_rows, columns=columns).to_dict(orient="records")

    except Exception as e:
        print("❌ Query result pagination error:", e)
        return []

@app.post("/api/download")
def download_full_data(req: dict):
    w = get_client()
    query = req.get("query")

    if not query:
        raise HTTPException(status_code=400, detail="No query provided")

    try:
        import time
        from databricks.sdk.service.sql import StatementState

        statement = w.statement_execution.execute_statement(
            statement=query,
            warehouse_id="66d48345dafda69f",
            wait_timeout="50s"
        )

        statement_id = statement.statement_id

        # ✅ Poll until the statement is truly SUCCEEDED
        for _ in range(30):  # max ~60s polling
            meta = w.statement_execution.get_statement(statement_id)
            state = meta.status.state if meta and meta.status else None

            if state == StatementState.SUCCEEDED:
                break
            elif state in (StatementState.FAILED, StatementState.CANCELED, StatementState.CLOSED):
                raise HTTPException(status_code=500, detail=f"Query failed with state: {state}")

            time.sleep(2)

        # ✅ Now get schema and rows
        if not meta.manifest or not meta.manifest.schema:
            raise HTTPException(status_code=500, detail="No schema in result")

        columns = [col.name for col in meta.manifest.schema.columns]

        all_rows = []
        chunk_index = 0
        while True:
            chunk = w.statement_execution.get_statement_result_chunk_n(statement_id, chunk_index)
            if not chunk or not chunk.data_array:
                break
            all_rows.extend(chunk.data_array)
            if chunk.next_chunk_index is None:
                break
            chunk_index = chunk.next_chunk_index

        data = pd.DataFrame(all_rows, columns=columns).to_dict(orient="records")
        return {"data": data}

    except HTTPException:
        raise
    except Exception as e:
        print("❌ Download error:", e)
        raise HTTPException(status_code=500, detail=str(e))
    
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
    return {"message": "Chatbot Backend Running"}

# ==============================
# AVAILABLE BUSINESSES
# ==============================

@app.get("/api/businesses")
def get_businesses():
    return [
        {
            "id": key,
            "name": BUSINESS_NAMES.get(key, key),
            "scope": BUSINESS_SCOPES.get(key, "")
        }
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

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index_path = os.path.join("frontend/build", "index.html")
    return FileResponse(index_path)

# ==============================
# RUN SERVER
# ==============================

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
