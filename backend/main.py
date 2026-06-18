import os
import io
import time
import math
import requests
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState, Disposition, Format
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
# DATABRICKS CONFIG
# ==============================

DATABRICKS_HOST = "https://adb-2887288469729514.14.azuredatabricks.net"
DATABRICKS_TOKEN = ""

WAREHOUSE_ID = "66d48345dafda69f"

DEFAULT_CATALOG = "bfl_lake"
DEFAULT_SCHEMA  = "bfl_experia"

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
    "ac":"01f143bf85cd1b0782b70b53deb122da",
    "fps":"01f141fb6633190d85f3ae9045e32e37",
    "ub2b":"01f15b20b2981be89a1030db729a01b0",
    "las":"01f15816bc981fb8b06dcb8288ac0775",
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
    "ac":"APPCARD PERSONALISATION",
    "fps":"FPS N1",
    "ub2b":"URBAN - B2B",
    "las":"LOAN AGAINST SECURITIES",
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
    "ac":"For AppCard Personalisation, Chatbot is currently integrated with end-to-end analysis of app card banner personalization, from impression to disbursement. It also includes customer profile attributes such as city, gender, age segment, and CIBIL band",
    "fps":"For FPS N1, Chatbot can answer user-level icon sequence queries, provides sequence reasoning, and analyzes  FPS icon click trends",
    "ub2b":"For Urban B2B,Chatbot is currently integrated with Offer Pool Base, Customer Segmentation and Business Analytics, Chatbot is currently integrated with App Offer Pool Base, customer segment analysis, Organic & In-Organic click and user count tracking, Organic & In-Organic click to Bmall landed event conversion, Urban Business TRUE customer analysis, O2O disbursal tracking by city, state, product and brand, offer pool-wise customer insights, geographic analysis, EMI Card performance, and product-related analytics to monitor customer behavior, engagement, conversion trends, and business performance metrics.",
    "las":"For LAS Analytics, ADB Genie is currently integrated with Clickstream Journey (LAS, LAMF, LAIP), Leads, Disbursement, App Engagement (signup base, active/uninstalled users), funnel conversion (Traffic, PDP View, PDP Clicked, Form 1 Submit, Qualified Lead), entrypoint attribution, entry-to-PDP gap tracking, reverse disbursement footprint, MOM trend analysis, cross-product journey mapping, and offline disbursement identification to track end-to-end customer journey, funnel health, and business conversion trends.",
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
# ✅ FIX 1: Sanitize records — replace NaN/Inf with None so JSON serializes cleanly
# ==============================

def sanitize_records(records: list) -> list:
    """
    Replace float NaN, Infinity, -Infinity with None (JSON null).
    Also converts any remaining non-serializable types to strings.
    """
    sanitized = []
    for row in records:
        clean_row = {}
        for k, v in row.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                clean_row[k] = None
            else:
                clean_row[k] = v
        sanitized.append(clean_row)
    return sanitized


# ==============================
# ✅ FIX 2: DataFrame → records preserving timestamps as strings
# ==============================

def df_to_records(df: pd.DataFrame) -> list:
    """
    Convert all columns to string dtype before calling to_dict so that
    timestamps/dates are never coerced to Python datetime objects.
    Then sanitize for NaN/Inf.
    """
    # Convert object/datetime columns to string, leave numerics as-is
    df_out = df.copy()
    for col in df_out.columns:
        if df_out[col].dtype == "object" or str(df_out[col].dtype).startswith("datetime"):
            df_out[col] = df_out[col].astype(str).replace("NaT", None).replace("nan", None)
    records = df_out.to_dict(orient="records")
    return sanitize_records(records)


# ==============================
# UTILITIES — INLINE (used by chat)
# ==============================

def wait_for_statement(w, statement_id, max_wait_seconds=300):
    terminal_states = {
        StatementState.SUCCEEDED,
        StatementState.FAILED,
        StatementState.CANCELED,
        StatementState.CLOSED
    }
    deadline = time.time() + max_wait_seconds

    while time.time() < deadline:
        meta = w.statement_execution.get_statement(statement_id)
        state = meta.status.state if meta and meta.status else None
        print(f"  ⏳ Statement {statement_id} state: {state}")

        if state == StatementState.SUCCEEDED:
            return meta

        if state in terminal_states:
            error_msg = "Unknown error"
            if meta and meta.status and meta.status.error:
                error_msg = getattr(meta.status.error, "message", str(meta.status.error))
            print(f"  ❌ Statement failed. Databricks error: {error_msg}")
            raise HTTPException(status_code=500, detail=f"Query failed [{state}]: {error_msg}")

        time.sleep(2)

    raise HTTPException(status_code=504, detail="Query timed out waiting for results")


def extract_columns_and_rows(w, meta, statement_id):
    """INLINE disposition — used by chat endpoints (small results)."""
    if not meta.manifest or not meta.manifest.schema or not meta.manifest.schema.columns:
        raise HTTPException(status_code=500, detail="Statement succeeded but schema is missing")

    columns = [col.name for col in meta.manifest.schema.columns]
    print(f"  ✅ Columns resolved: {columns[:5]}{'...' if len(columns) > 5 else ''}")

    all_rows = []
    chunk_index = 0

    while True:
        chunk = w.statement_execution.get_statement_result_chunk_n(statement_id, chunk_index)
        if not chunk or not chunk.data_array:
            print(f"  ℹ️ Chunk {chunk_index} empty — stopping")
            break
        all_rows.extend(chunk.data_array)
        print(f"  📦 Chunk {chunk_index}: {len(chunk.data_array)} rows (total: {len(all_rows)})")
        if chunk.next_chunk_index is None:
            break
        chunk_index = chunk.next_chunk_index

    return columns, all_rows


def get_query_result(w, statement_id):
    """Used by /start and /followup (INLINE, Genie-capped results)."""
    try:
        meta = wait_for_statement(w, statement_id)
        columns, all_rows = extract_columns_and_rows(w, meta, statement_id)
        # ✅ Use df_to_records to preserve timestamps and sanitize NaN
        df = pd.DataFrame(all_rows, columns=columns)
        return df_to_records(df)
    except HTTPException:
        raise
    except Exception as e:
        print("❌ Query result error:", e)
        return []


# ==============================
# UTILITIES — EXTERNAL_LINKS (used by download)
# ==============================

def fetch_all_rows_external_links(w, statement_id, columns):
    """
    Paginates through ALL external link chunks.
    ✅ Reads CSV with dtype=str to preserve timestamps exactly as they appear in Databricks.
    """
    all_dfs = []
    chunk_index = 0
    total_rows = 0

    while True:
        print(f"  🔄 Fetching chunk index {chunk_index} from Databricks...")
        chunk = w.statement_execution.get_statement_result_chunk_n(statement_id, chunk_index)

        if not chunk:
            print(f"  ℹ️ No chunk returned at index {chunk_index} — done")
            break

        ext_links = getattr(chunk, "external_links", None)
        if not ext_links:
            print(f"  ℹ️ Chunk {chunk_index} has no external_links — done")
            break

        next_chunk_index = None

        for link_obj in ext_links:
            url = link_obj.external_link
            print(f"  🌐 Downloading chunk {chunk_index}: {url[:80]}...")

            resp = requests.get(url, timeout=300)
            resp.raise_for_status()

            # ✅ FIX: dtype=str prevents pandas from converting timestamps to datetime
            chunk_df = pd.read_csv(
                io.StringIO(resp.text),
                header=None,
                names=columns,
                dtype=str,          # ✅ keep everything as raw string — no type coercion
                keep_default_na=False,  # ✅ don't convert empty strings to NaN
            )
            all_dfs.append(chunk_df)
            total_rows += len(chunk_df)
            print(f"  📦 Chunk {chunk_index}: {len(chunk_df)} rows (running total: {total_rows})")

            next_chunk_index = getattr(link_obj, "next_chunk_index", None)

        if next_chunk_index is None:
            print(f"  ✅ No more chunks after index {chunk_index} — pagination complete")
            break

        chunk_index = next_chunk_index

    if not all_dfs:
        return []

    full_df = pd.concat(all_dfs, ignore_index=True)
    print(f"  ✅ All chunks assembled: {len(full_df)} total rows")
    return full_df.values.tolist()


# ==============================
# DOWNLOAD ENDPOINT
# ==============================

@app.post("/api/download")
def download_full_data(req: dict):
    """
    Re-executes query with EXTERNAL_LINKS disposition to bypass the 25MB
    INLINE limit. All chunks are fetched and assembled with correct pagination.
    """
    w = get_client()
    query = req.get("query")

    if not query:
        raise HTTPException(status_code=400, detail="No query provided")

    clean_query = query.strip().rstrip(";").strip()
    print(f"📥 /api/download — executing query:\n{clean_query[:300]}...")

    try:
        statement = w.statement_execution.execute_statement(
            statement=clean_query,
            warehouse_id=WAREHOUSE_ID,
            wait_timeout="0s",
            catalog=DEFAULT_CATALOG,
            schema=DEFAULT_SCHEMA,
            disposition=Disposition.EXTERNAL_LINKS,
            format=Format.CSV,
        )

        statement_id = statement.statement_id
        print(f"  🆔 Statement ID: {statement_id}")

        meta = wait_for_statement(w, statement_id, max_wait_seconds=300)

        if not meta.manifest or not meta.manifest.schema or not meta.manifest.schema.columns:
            raise HTTPException(status_code=500, detail="Schema missing after query succeeded")

        columns = [col.name for col in meta.manifest.schema.columns]
        total_row_count = getattr(meta.manifest, "total_row_count", "unknown")
        print(f"  ✅ Schema: {columns[:5]}... | Expected total rows: {total_row_count}")

        all_rows = fetch_all_rows_external_links(w, statement_id, columns)

        # ✅ Build df with str dtype, then sanitize — no NaN/Inf in JSON output
        df = pd.DataFrame(all_rows, columns=columns)
        records = df_to_records(df)

        print(f"✅ Download complete: {len(records)} rows, {len(columns)} columns")
        return {"data": records, "total_rows": len(records)}

    except HTTPException:
        raise
    except Exception as e:
        print("❌ Download error:", e)
        raise HTTPException(status_code=500, detail=str(e))


# ==============================
# PROCESS GENIE RESPONSE
# ==============================

def process_genie_response(w, response):
    output = []
    attachments = getattr(response, "attachments", []) or []

    for item in attachments:
        if getattr(item, "text", None):
            output.append({
                "type": "text",
                "content": item.text.content
            })
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
        raise HTTPException(status_code=400, detail=f"Invalid business: {business}")
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
        conversation = w.genie.start_conversation_and_wait(space_id, req.prompt)
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