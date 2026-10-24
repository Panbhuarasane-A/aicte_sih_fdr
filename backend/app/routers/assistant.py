from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import AssistantQueryRequest, AssistantQueryResponse
from app.security import get_current_user
from app.services.assistant_service import run_assistant_query
from app.services.audit_service import log_audit

router = APIRouter(prefix="/assistant", tags=["Natural Language Assistant"])

@router.post("/query", response_model=AssistantQueryResponse)
def query_assistant(
    req: AssistantQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Feature 9: Natural-language assistant
    Plain-language questions (maturing FDRs, unmatched transactions, incomplete release requests, why a payment was flagged).
    Scoped strictly by user role and region. Refuses out-of-scope requests. Links to evidence.
    """
    res = run_assistant_query(db=db, user=current_user, query_text=req.query)

    # Record search query in audit log
    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Assistant Query: '{req.query}' (Intent: {res['intent_matched']}, Denied: {res['access_denied']})",
        entity_type="AssistantQuery",
        entity_id=current_user.id,
        after_state={"query": req.query, "intent": res["intent_matched"], "denied": res["access_denied"]}
    )
    db.commit()

    return res
