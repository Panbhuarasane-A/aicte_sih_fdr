import hashlib
import json
from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models import AuditLog

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

def compute_block_hash(
    previous_hash: str,
    timestamp_str: str,
    actor_id: str,
    actor_name: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    before_state: Optional[Any],
    after_state: Optional[Any]
) -> str:
    """
    Computes deterministic SHA-256 hash chaining previous block with current block content.
    """
    payload = {
        "previous_hash": previous_hash,
        "timestamp": timestamp_str,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "actor_role": actor_role,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before_state": before_state,
        "after_state": after_state
    }
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def log_audit(
    db: Session,
    actor_id: str,
    actor_name: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    before_state: Optional[Any] = None,
    after_state: Optional[Any] = None
) -> AuditLog:
    """
    Appends a new immutable, hash-chained record to the audit trail.
    """
    last_log = db.query(AuditLog).order_by(AuditLog.seq.desc()).first()
    prev_hash = last_log.hash if last_log else GENESIS_HASH

    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    current_hash = compute_block_hash(
        previous_hash=prev_hash,
        timestamp_str=now_str,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        before_state=before_state,
        after_state=after_state
    )

    log_entry = AuditLog(
        timestamp=now,
        timestamp_str=now_str,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        before_state=before_state,
        after_state=after_state,
        previous_hash=prev_hash,
        hash=current_hash
    )
    db.add(log_entry)
    db.flush()
    return log_entry

def verify_audit_chain(db: Session) -> dict:
    """
    Verifies that the entire audit trail is untampered and all hash chains match.
    """
    logs = db.query(AuditLog).order_by(AuditLog.seq.asc()).all()
    if not logs:
        return {"total_records": 0, "is_valid": True, "tampered_index": None, "message": "Audit log is empty. Integrity verified."}

    expected_prev = GENESIS_HASH
    for idx, entry in enumerate(logs):
        if entry.previous_hash != expected_prev:
            return {
                "total_records": len(logs),
                "is_valid": False,
                "tampered_index": idx,
                "message": f"Hash chain broken at record #{idx} (ID: {entry.id}). Previous hash mismatch!"
            }

        recalculated = compute_block_hash(
            previous_hash=entry.previous_hash,
            timestamp_str=entry.timestamp_str or (entry.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ") if entry.timestamp else ""),
            actor_id=entry.actor_id,
            actor_name=entry.actor_name,
            actor_role=entry.actor_role,
            action=entry.action,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            before_state=entry.before_state,
            after_state=entry.after_state
        )

        if recalculated != entry.hash:
            return {
                "total_records": len(logs),
                "is_valid": False,
                "tampered_index": idx,
                "message": f"Hash mismatch at record #{idx} (ID: {entry.id}). Data has been tampered with!"
            }

        expected_prev = entry.hash

    return {
        "total_records": len(logs),
        "is_valid": True,
        "tampered_index": None,
        "message": f"Cryptographic integrity verified across all {len(logs)} audit records. No tampering detected."
    }
