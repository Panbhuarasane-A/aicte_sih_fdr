"""Server-owned assistant scope rules."""

from sqlalchemy.orm import Query, Session

from app.models import (
    Document,
    Institution,
    Instrument,
    PaymentClaim,
    ReleaseRequest,
    User,
)
from .semantic_layer import QuerySpec

_GLOBAL_ROLES = {"admin", "head", "finance", "auditor", "committee"}


def scoped_institution_ids(db: Session, user: User) -> set[str]:
    if user.role in _GLOBAL_ROLES:
        return {row[0] for row in db.query(Institution.id).all()}
    if user.role == "institution":
        return {user.institution_id} if user.institution_id else set()
    query = db.query(Institution.id)
    if user.region_scope:
        query = query.filter(Institution.region == user.region_scope)
    return {row[0] for row in query.all()}


def apply_scope(query: Query, spec: QuerySpec, institution_ids: set[str]) -> Query:
    """Inject a mandatory institution boundary into an ORM query.

    The planner cannot remove or replace this filter because it is applied
    after planner validation by backend code.
    """
    if spec.entity == "institutions":
        return query.filter(Institution.id.in_(institution_ids))
    model = {
        "deposits": Instrument,
        "claims": PaymentClaim,
        "fdrs": Instrument,
        "documents": Document,
        "release_requests": ReleaseRequest,
    }.get(spec.entity)
    if model is None:
        return query
    return query.filter(model.institution_id.in_(institution_ids))
